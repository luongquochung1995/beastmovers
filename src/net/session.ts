import {
  type Payload,
  type PeerId,
  realScheduler,
  type Scheduler,
  type Transport,
} from './Transport';

/** Thông tin máy này mang theo khi bắt tay. */
export interface SessionInfo {
  version: string;
  dataHash: string;
  /** Tổng số người tối đa của cả phòng (tính cả người chơi chung máy). */
  maxPlayers: number;
}

export type RejectReason = 'version' | 'data' | 'full' | 'kicked' | 'started';

export interface Member {
  id: PeerId;
  /** Số người chơi trên máy đó. */
  seats: number;
}

export type SessionMsg =
  | { t: 'hello'; version: string; dataHash: string; seats: number }
  | { t: 'welcome'; members: Member[] }
  | { t: 'roster'; members: Member[] }
  | { t: 'reject'; reason: RejectReason; version: string; dataHash: string }
  /** Rời phòng chủ động (khác với rớt mạng). */
  | { t: 'bye' };

export type SessionState =
  /** Máy khách đang chờ host trả lời. */
  | { kind: 'connecting' }
  /** Đã ở trong phòng (host luôn ở trạng thái này). */
  | { kind: 'joined' }
  | { kind: 'rejected'; reason: RejectReason; hostVersion: string; hostDataHash: string }
  /** Hết giờ chờ mà không thấy host (mã sai, phòng đã đóng, hoặc không kết nối được). */
  | { kind: 'noHost' }
  /** Mất kết nối tới host, đang chờ vào lại (tối đa `reconnectGraceMs`). */
  | { kind: 'reconnecting' }
  /** Host rời phòng (thoát hẳn, hoặc mất kết nối quá lâu). */
  | { kind: 'hostLeft'; quit: boolean };

const SESSION_TYPES = new Set(['hello', 'welcome', 'roster', 'reject', 'bye']);

export function isSessionMsg(data: Payload): data is SessionMsg {
  return (
    typeof data === 'object' &&
    data !== null &&
    SESSION_TYPES.has((data as { t?: unknown }).t as string)
  );
}

/** Thời gian máy khách chờ host trả lời trước khi báo "không tìm thấy phòng". */
export const JOIN_TIMEOUT_MS = 20_000;

/**
 * Bắt tay khi vào phòng, chạy trên một `Transport`:
 * máy khách gửi `hello` (phiên bản game, hash data, số người trên máy); host kiểm tra
 * và trả `welcome` hoặc `reject`. Host giữ danh sách thành viên và giới hạn tổng số người.
 */
export class RoomSession {
  state: SessionState;
  hostId: PeerId | null;
  members: Member[] = [];
  private readonly changeCbs: (() => void)[] = [];
  private readonly accepted = new Map<PeerId, number>();
  /** Máy đã bị host đuổi: chào lại cũng bị từ chối. */
  private readonly banned = new Set<PeerId>();
  /** Host: đang chơi thì chỉ nhận lại những máy có trong danh sách lúc bắt đầu. */
  private lockedTo: Set<PeerId> | null = null;
  private closed = false;
  /** Số lần đã vào lại sau khi mất kết nối (máy khách). */
  rejoins = 0;
  /** Thời gian chờ vào lại sau khi mất kết nối. */
  reconnectGraceMs = 30_000;

  constructor(
    readonly transport: Transport,
    readonly role: 'host' | 'client',
    private readonly info: SessionInfo,
    /** Số người chơi trên máy này. */
    private localSeats: number,
    private readonly scheduler: Scheduler = realScheduler,
    joinTimeoutMs = JOIN_TIMEOUT_MS,
  ) {
    this.hostId = role === 'host' ? transport.selfId : null;
    this.state = role === 'host' ? { kind: 'joined' } : { kind: 'connecting' };
    transport.onMessage((data, from) => {
      if (isSessionMsg(data)) this.receive(data, from);
    });
    transport.onPeerJoin((peer) => this.peerJoined(peer));
    transport.onPeerLeave((peer) => this.peerLeft(peer));
    // Đóng tab: chào tạm biệt rồi đóng kênh (kênh truyền không tự đóng khi đóng tab).
    if (typeof window !== 'undefined') window.addEventListener('pagehide', this.onPageHide);
    if (role === 'host') this.rebuildMembers();
    else {
      for (const peer of transport.peers()) this.peerJoined(peer);
      scheduler.setTimeout(() => {
        if (!this.closed && this.state.kind === 'connecting') this.setState({ kind: 'noHost' });
      }, joinTimeoutMs);
    }
  }

  get isHost(): boolean {
    return this.role === 'host';
  }

  /** Tổng số người chơi trong phòng (mọi máy). */
  get totalSeats(): number {
    return this.members.reduce((n, m) => n + m.seats, 0);
  }

  onChange(cb: () => void): void {
    this.changeCbs.push(cb);
  }

  /** Đổi số người chơi trên máy này (host cập nhật danh sách ngay; máy khách báo qua lobby). */
  setLocalSeats(n: number): void {
    this.localSeats = n;
    if (this.isHost) this.rosterChanged();
  }

  /** Host: một máy đã được nhận vào phòng chưa. */
  isMember(peer: PeerId): boolean {
    return peer === this.transport.selfId || this.accepted.has(peer);
  }

  /** Số người chơi trên một máy (0 nếu không ở trong phòng). */
  seatsOf(peer: PeerId): number {
    return this.members.find((m) => m.id === peer)?.seats ?? 0;
  }

  /** Host: cập nhật số người chơi của một máy khách (lobby báo khi có người chơi chung máy vào/ra). */
  setPeerSeats(peer: PeerId, n: number): void {
    if (!this.isHost || !this.accepted.has(peer) || this.accepted.get(peer) === n) return;
    this.accepted.set(peer, n);
    this.rosterChanged();
  }

  /** Host: bắt đầu chơi; từ giờ chỉ những máy này được vào (lại). */
  lock(peers: Iterable<PeerId>): void {
    this.lockedTo = new Set(peers);
  }

  /** Host: đuổi một máy (máy đó được lobby báo; từ giờ host bỏ qua tin của nó). */
  remove(peer: PeerId): void {
    if (!this.isHost) return;
    this.banned.add(peer);
    if (this.accepted.delete(peer)) this.rosterChanged();
  }

  private peerJoined(peer: PeerId): void {
    if (this.role !== 'client') return;
    const k = this.state.kind;
    if (k !== 'connecting' && k !== 'noHost' && k !== 'reconnecting') return;
    // Đang chờ vào lại: chỉ chào host cũ.
    if (k === 'reconnecting' && peer !== this.hostId) return;
    // Chưa biết ai là host: chào mọi máy, chỉ host trả lời.
    const hello: SessionMsg = {
      t: 'hello',
      version: this.info.version,
      dataHash: this.info.dataHash,
      seats: this.localSeats,
    };
    this.transport.send(hello, peer);
  }

  private peerLeft(peer: PeerId): void {
    if (this.isHost) {
      if (this.accepted.delete(peer)) this.rosterChanged();
    } else if (peer === this.hostId && this.state.kind === 'joined') {
      // Rớt mạng (không có lời chào tạm biệt): chờ vào lại một lúc.
      this.setState({ kind: 'reconnecting' });
      const at = this.rejoins;
      this.scheduler.setTimeout(() => {
        if (!this.closed && this.state.kind === 'reconnecting' && this.rejoins === at) {
          this.setState({ kind: 'hostLeft', quit: false });
        }
      }, this.reconnectGraceMs);
    }
  }

  private receive(msg: SessionMsg, from: PeerId): void {
    if (this.closed) return;
    if (this.isHost) {
      if (msg.t === 'hello') this.handleHello(msg, from);
      else if (msg.t === 'bye' && this.accepted.delete(from)) this.rosterChanged();
      return;
    }
    switch (msg.t) {
      case 'welcome': {
        // Host trả lời muộn (sau khi đã báo không tìm thấy) vẫn cho vào.
        const k = this.state.kind;
        if (k !== 'connecting' && k !== 'noHost' && k !== 'reconnecting') return;
        if (k === 'reconnecting') this.rejoins++;
        this.hostId = from;
        this.members = msg.members;
        this.setState({ kind: 'joined' });
        break;
      }
      case 'bye':
        if (from === this.hostId) this.setState({ kind: 'hostLeft', quit: true });
        break;
      case 'roster':
        if (from !== this.hostId) return;
        this.members = msg.members;
        this.emit();
        break;
      case 'reject':
        if (this.state.kind !== 'connecting') return;
        this.hostId = from;
        this.setState({
          kind: 'rejected',
          reason: msg.reason,
          hostVersion: msg.version,
          hostDataHash: msg.dataHash,
        });
        break;
      case 'hello':
        break;
    }
  }

  private handleHello(msg: Extract<SessionMsg, { t: 'hello' }>, from: PeerId): void {
    const reason = this.checkHello(msg, from);
    if (reason) {
      const reject: SessionMsg = {
        t: 'reject',
        reason,
        version: this.info.version,
        dataHash: this.info.dataHash,
      };
      this.transport.send(reject, from);
      return;
    }
    this.accepted.set(from, Math.min(Math.max(1, Math.floor(msg.seats)), this.freeSeatsFor(from)));
    this.rebuildMembers();
    this.transport.send({ t: 'welcome', members: this.members } satisfies SessionMsg, from);
    this.broadcastRoster(from);
    this.emit();
  }

  private checkHello(msg: Extract<SessionMsg, { t: 'hello' }>, from: PeerId): RejectReason | null {
    if (this.banned.has(from)) return 'kicked';
    if (this.lockedTo && !this.lockedTo.has(from)) return 'started';
    if (msg.version !== this.info.version) return 'version';
    if (msg.dataHash !== this.info.dataHash) return 'data';
    // Còn ít nhất một chỗ thì cho vào; người chơi chung máy thừa ra sẽ không có ô (xem lobby).
    if (this.freeSeatsFor(from) < 1) return 'full';
    return null;
  }

  private freeSeatsFor(peer: PeerId): number {
    return this.info.maxPlayers - (this.totalSeats - (this.accepted.get(peer) ?? 0));
  }

  private rosterChanged(): void {
    this.rebuildMembers();
    this.broadcastRoster();
    this.emit();
  }

  private broadcastRoster(except?: PeerId): void {
    const roster: SessionMsg = { t: 'roster', members: this.members };
    for (const peer of this.accepted.keys()) if (peer !== except) this.transport.send(roster, peer);
  }

  private rebuildMembers(): void {
    this.members = [
      { id: this.transport.selfId, seats: this.localSeats },
      ...[...this.accepted].map(([id, seats]) => ({ id, seats })),
    ];
  }

  private setState(s: SessionState): void {
    this.state = s;
    this.emit();
  }

  private emit(): void {
    for (const cb of this.changeCbs) cb();
  }

  private readonly onPageHide = () => this.close(true);

  /**
   * Rời phòng: báo cho các máy khác (để họ biết là thoát chứ không phải rớt mạng).
   * `now`: đóng kênh ngay (đang đóng tab, hẹn giờ sẽ không chạy nữa).
   */
  close(now = false): void {
    if (this.closed) return;
    this.closed = true;
    if (typeof window !== 'undefined') window.removeEventListener('pagehide', this.onPageHide);
    this.transport.send({ t: 'bye' } satisfies SessionMsg);
    // Bình thường đợi chút cho gói tạm biệt đi hết rồi mới đóng kênh.
    if (now) this.transport.close();
    else this.scheduler.setTimeout(() => this.transport.close(), 200);
  }
}
