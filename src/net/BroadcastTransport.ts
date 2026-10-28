import { emptyStats, type Payload, type PeerId, payloadSize, type Transport } from './Transport';

type Wire =
  | { k: 'hello'; from: PeerId }
  | { k: 'here'; from: PeerId; to: PeerId }
  | { k: 'beat'; from: PeerId }
  | { k: 'bye'; from: PeerId }
  | { k: 'msg'; from: PeerId; to?: PeerId; data: Payload };

const HEARTBEAT_MS = 1000;
/** Không nghe thấy tab kia trong khoảng này thì coi như tab đã đóng. */
const PEER_TIMEOUT_MS = 4000;

/**
 * Kênh truyền giữa các tab cùng trình duyệt qua `BroadcastChannel`. Dùng để thử nhiều
 * người chơi online trên một máy mà không cần mạng (`?transport=broadcast`).
 */
export class BroadcastTransport implements Transport {
  readonly selfId: PeerId;
  readonly stats = emptyStats();
  private readonly channel: BroadcastChannel;
  private readonly lastSeen = new Map<PeerId, number>();
  private readonly messageCbs: ((data: Payload, from: PeerId) => void)[] = [];
  private readonly joinCbs: ((peer: PeerId) => void)[] = [];
  private readonly leaveCbs: ((peer: PeerId) => void)[] = [];
  private readonly timer: ReturnType<typeof setInterval>;
  private closed = false;
  /** Giả lập mất mạng (kiểm thử): không gửi, không nhận; máy khác tự thấy máy này "rời đi". */
  private offline = false;

  constructor(room: string, selfId: PeerId = crypto.randomUUID().slice(0, 8)) {
    this.selfId = selfId;
    this.channel = new BroadcastChannel(`beast-movers:${room}`);
    this.channel.onmessage = (e: MessageEvent<Wire>) => this.receive(e.data);
    this.post({ k: 'hello', from: selfId });
    this.timer = setInterval(() => this.heartbeat(), HEARTBEAT_MS);
  }

  send(data: Payload, to?: PeerId): void {
    if (this.closed) return;
    const n = to === undefined ? this.lastSeen.size : this.lastSeen.has(to) ? 1 : 0;
    if (n === 0) return;
    this.stats.sentMessages += n;
    this.stats.sentBytes += payloadSize(data) * n;
    this.post(
      to === undefined
        ? { k: 'msg', from: this.selfId, data }
        : { k: 'msg', from: this.selfId, to, data },
    );
  }

  onMessage(cb: (data: Payload, from: PeerId) => void): void {
    this.messageCbs.push(cb);
  }

  onPeerJoin(cb: (peer: PeerId) => void): void {
    this.joinCbs.push(cb);
  }

  onPeerLeave(cb: (peer: PeerId) => void): void {
    this.leaveCbs.push(cb);
  }

  peers(): PeerId[] {
    return [...this.lastSeen.keys()];
  }

  /** Giả lập tắt/bật Wi-Fi (kiểm thử rớt mạng). */
  setOffline(offline: boolean): void {
    if (this.offline === offline) return;
    this.offline = offline;
    if (!offline) this.post({ k: 'hello', from: this.selfId });
  }

  close(): void {
    if (this.closed) return;
    this.post({ k: 'bye', from: this.selfId });
    this.closed = true;
    clearInterval(this.timer);
    this.channel.close();
  }

  private post(w: Wire): void {
    if (!this.closed && !this.offline) this.channel.postMessage(w);
  }

  private receive(w: Wire): void {
    if (this.closed || this.offline || w.from === this.selfId) return;
    switch (w.k) {
      case 'hello':
        this.post({ k: 'here', from: this.selfId, to: w.from });
        this.seen(w.from);
        break;
      case 'here':
        if (w.to === this.selfId) this.seen(w.from);
        break;
      case 'beat':
        this.seen(w.from);
        break;
      case 'bye':
        this.drop(w.from);
        break;
      case 'msg':
        if (w.to !== undefined && w.to !== this.selfId) return;
        // Gói tới trước lời chào (tab kia vừa mở) thì coi như đã gặp.
        this.seen(w.from);
        this.stats.recvMessages++;
        this.stats.recvBytes += payloadSize(w.data);
        for (const cb of this.messageCbs) cb(w.data, w.from);
        break;
    }
  }

  private seen(peer: PeerId): void {
    const known = this.lastSeen.has(peer);
    this.lastSeen.set(peer, performance.now());
    if (!known) for (const cb of this.joinCbs) cb(peer);
  }

  private drop(peer: PeerId): void {
    if (!this.lastSeen.delete(peer)) return;
    for (const cb of this.leaveCbs) cb(peer);
  }

  private heartbeat(): void {
    this.post({ k: 'beat', from: this.selfId });
    const now = performance.now();
    for (const [peer, t] of this.lastSeen) if (now - t > PEER_TIMEOUT_MS) this.drop(peer);
  }
}
