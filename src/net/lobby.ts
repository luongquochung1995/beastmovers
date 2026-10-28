import type { InputSourceKind } from '../systems/input/InputManager';
import type { RoomSession } from './session';
import type { Payload, PeerId } from './Transport';

/** Mũ chọn trong lobby (ô đầu = không đội mũ). */
export const HATS = ['', '🎩', '🧢', '👒', '⛑️', '🎓', '👑', '🪖', '🎀'] as const;
export const NAME_MAX = 12;
/** Tên mặc định (chọn ngẫu nhiên) theo ngôn ngữ. */
export const DEFAULT_NAMES = {
  en: ['Bear', 'Moose', 'Otter', 'Badger', 'Yak', 'Walrus', 'Hippo', 'Panda', 'Rhino', 'Bison'],
  vi: ['Gấu', 'Nai', 'Rái Cá', 'Lửng', 'Bò Rừng', 'Hải Mã', 'Hà Mã', 'Gấu Trúc', 'Tê Giác', 'Trâu'],
} as const;
/** Số màu nhân vật (xem PLAYER_STYLES). */
export const COLOR_COUNT = 8;

/** Một người chơi trên một máy, do máy đó khai báo. */
export interface LocalSeat {
  local: number;
  source: InputSourceKind;
  name: string;
  /** Màu / mũ muốn dùng (đã lưu từ lần trước); host chỉ nhận nếu màu chưa ai dùng. */
  color?: number | undefined;
  hat?: number | undefined;
}

/** Một ô trong lobby. Thứ tự trong `LobbyState.seats` = số thứ tự người chơi khi vào màn. */
export interface LobbySeat extends LocalSeat {
  peer: PeerId;
  color: number;
  hat: number;
}

export interface LobbyState {
  hostId: PeerId;
  seats: LobbySeat[];
  /** Các máy khách đã bấm Sẵn sàng (host luôn sẵn sàng). */
  ready: PeerId[];
  levelId: string;
}

export interface LookPatch {
  name?: string;
  color?: number;
  hat?: number;
}

export type LobbyMsg =
  | { t: 'lb.seats'; seats: LocalSeat[] }
  | { t: 'lb.look'; local: number; patch: LookPatch }
  | { t: 'lb.ready'; ready: boolean }
  | { t: 'lb.state'; state: LobbyState }
  | { t: 'lb.kick' }
  | { t: 'lb.start'; state: LobbyState };

export function isLobbyMsg(data: Payload): data is LobbyMsg {
  const t = (data as { t?: unknown } | null)?.t;
  return typeof t === 'string' && t.startsWith('lb.');
}

export type StartBlock = 'notReady' | 'tooFew' | 'tooMany' | null;

export function cleanName(name: string): string {
  return [...name.replace(/[\p{C}]/gu, '').trim()].slice(0, NAME_MAX).join('');
}

/** Tên không trùng người khác: trùng thì thêm số ("Gấu 2"). */
export function uniqueName(name: string, taken: readonly string[]): string {
  if (!taken.includes(name)) return name;
  for (let n = 2; ; n++) {
    const suffix = ` ${n}`;
    const base = [...name].slice(0, NAME_MAX - suffix.length).join('');
    if (!taken.includes(base + suffix)) return base + suffix;
  }
}

/** Màu trống tiếp theo sau `from` (đi vòng), bỏ qua màu người khác đang dùng. */
export function nextFreeColor(seats: readonly LobbySeat[], from: number, self?: LobbySeat): number {
  const used = new Set(seats.filter((s) => s !== self).map((s) => s.color));
  for (let k = 1; k <= COLOR_COUNT; k++) {
    const c = (from + k) % COLOR_COUNT;
    if (!used.has(c)) return c;
  }
  return from;
}

function preferredColor(seats: readonly LobbySeat[], wanted: number | undefined): number {
  const valid = Number.isInteger(wanted) && wanted! >= 0 && wanted! < COLOR_COUNT;
  if (valid && !seats.some((s) => s.color === wanted)) return wanted!;
  return nextFreeColor(seats, COLOR_COUNT - 1);
}

const validHat = (hat: number | undefined): hat is number =>
  hat !== undefined && Number.isInteger(hat) && hat >= 0 && hat < HATS.length;

/**
 * Lobby online, host quyết định mọi thứ: máy khách gửi yêu cầu (người chơi trên máy,
 * đổi tên/màu/mũ, sẵn sàng), host kiểm tra (màu không trùng, tổng ≤ 8 người) rồi gửi
 * trạng thái mới cho mọi máy. Host chọn màn, đuổi người, bắt đầu.
 */
export class Lobby {
  state: LobbyState;
  kicked = false;
  /** Host đã bấm Bắt đầu: trạng thái lúc bắt đầu (thứ tự ô = số thứ tự người chơi). */
  started: LobbyState | null = null;
  private readonly changeCbs: (() => void)[] = [];
  private readonly selfId: PeerId;

  constructor(
    readonly session: RoomSession,
    levelId: string,
    private readonly maxPlayers: number,
  ) {
    this.selfId = session.transport.selfId;
    this.state = { hostId: session.hostId ?? '', seats: [], ready: [], levelId };
    session.transport.onMessage((data, from) => {
      if (isLobbyMsg(data)) this.receive(data, from);
    });
    // Host: có máy vào/ra thì cập nhật và gửi trạng thái (máy mới vào cần trạng thái đầu tiên).
    if (this.isHost) session.onChange(() => this.syncMembers());
  }

  get isHost(): boolean {
    return this.session.isHost;
  }

  onChange(cb: () => void): void {
    this.changeCbs.push(cb);
  }

  /** Người chơi trên máy này (gọi khi có người chơi chung máy vào). */
  setLocalSeats(seats: LocalSeat[]): void {
    if (this.isHost) this.applySeats(this.selfId, seats);
    else this.send({ t: 'lb.seats', seats });
  }

  setLook(local: number, patch: LookPatch): void {
    if (this.isHost) this.applyLook(this.selfId, local, patch);
    else this.send({ t: 'lb.look', local, patch });
  }

  setReady(ready: boolean): void {
    if (!this.isHost) this.send({ t: 'lb.ready', ready });
  }

  isReady(peer: PeerId): boolean {
    return peer === this.state.hostId || this.state.ready.includes(peer);
  }

  /** Ô của người chơi trên máy này. */
  mySeats(): LobbySeat[] {
    return this.state.seats.filter((s) => s.peer === this.selfId);
  }

  // ---- Chỉ host ----

  setLevel(levelId: string): void {
    if (!this.isHost || this.state.levelId === levelId) return;
    this.state.levelId = levelId;
    this.changed();
  }

  kick(peer: PeerId): void {
    if (!this.isHost || peer === this.selfId) return;
    this.send({ t: 'lb.kick' }, peer);
    this.session.remove(peer);
    this.removePeer(peer);
  }

  /** Lý do chưa bắt đầu được, hoặc `null` nếu bắt đầu được. */
  startBlock(minPlayers: number, maxPlayers: number): StartBlock {
    const n = this.state.seats.length;
    if (n < minPlayers) return 'tooFew';
    if (n > maxPlayers) return 'tooMany';
    const peers = new Set(this.state.seats.map((s) => s.peer));
    for (const p of peers) if (!this.isReady(p)) return 'notReady';
    return null;
  }

  start(): void {
    if (!this.isHost || this.started) return;
    this.started = structuredClone(this.state);
    this.send({ t: 'lb.start', state: this.started });
    this.emit();
  }

  // ---- Xử lý tin ----

  private receive(msg: LobbyMsg, from: PeerId): void {
    if (this.isHost) {
      if (!this.session.isMember(from)) return;
      switch (msg.t) {
        case 'lb.seats':
          this.applySeats(from, msg.seats);
          break;
        case 'lb.look':
          this.applyLook(from, msg.local, msg.patch);
          break;
        case 'lb.ready': {
          const ready = this.state.ready.filter((p) => p !== from);
          if (msg.ready) ready.push(from);
          this.state.ready = ready;
          this.changed();
          break;
        }
        default:
          break;
      }
      return;
    }
    if (from !== this.session.hostId) return;
    switch (msg.t) {
      case 'lb.state':
        this.state = msg.state;
        this.emit();
        break;
      case 'lb.kick':
        this.kicked = true;
        this.emit();
        break;
      case 'lb.start':
        this.state = msg.state;
        this.started = msg.state;
        this.emit();
        break;
      default:
        break;
    }
  }

  private applySeats(peer: PeerId, seats: LocalSeat[]): void {
    const others = this.state.seats.filter((s) => s.peer !== peer);
    const old = new Map(
      this.state.seats.filter((s) => s.peer === peer).map((s) => [s.local, s] as const),
    );
    const room = Math.max(0, this.maxPlayers - others.length);
    const mine: LobbySeat[] = [];
    for (const seat of seats.slice(0, room)) {
      const prev = old.get(seat.local);
      const all = [...others, ...mine];
      mine.push({
        peer,
        local: seat.local,
        source: seat.source,
        name: uniqueName(
          cleanName(seat.name) || prev?.name || `P${all.length + 1}`,
          all.map((s) => s.name),
        ),
        color: prev?.color ?? preferredColor(all, seat.color),
        hat: prev?.hat ?? (validHat(seat.hat) ? seat.hat : 0),
      });
    }
    // Giữ thứ tự: máy cũ giữ chỗ, người mới thêm vào cuối.
    const firstIdx = this.state.seats.findIndex((s) => s.peer === peer);
    const merged = [...others];
    merged.splice(firstIdx < 0 ? merged.length : firstIdx, 0, ...mine);
    this.state.seats = merged;
    if (peer === this.selfId) this.session.setLocalSeats(mine.length);
    else this.session.setPeerSeats(peer, mine.length);
    this.changed();
  }

  private applyLook(peer: PeerId, local: number, patch: LookPatch): void {
    const seat = this.state.seats.find((s) => s.peer === peer && s.local === local);
    if (!seat) return;
    if (patch.name !== undefined) {
      const name = cleanName(patch.name);
      const taken = this.state.seats.filter((s) => s !== seat).map((s) => s.name);
      if (name) seat.name = uniqueName(name, taken);
    }
    if (
      patch.color !== undefined &&
      Number.isInteger(patch.color) &&
      patch.color >= 0 &&
      patch.color < COLOR_COUNT &&
      !this.state.seats.some((s) => s !== seat && s.color === patch.color)
    ) {
      seat.color = patch.color;
    }
    if (validHat(patch.hat)) seat.hat = patch.hat;
    this.changed();
  }

  private syncMembers(): void {
    const alive = new Set(this.session.members.map((m) => m.id));
    this.state.seats = this.state.seats.filter((s) => alive.has(s.peer));
    this.state.ready = this.state.ready.filter((p) => alive.has(p));
    this.changed();
  }

  private removePeer(peer: PeerId): void {
    this.state.seats = this.state.seats.filter((s) => s.peer !== peer);
    this.state.ready = this.state.ready.filter((p) => p !== peer);
    this.changed();
  }

  private changed(): void {
    if (this.isHost) this.send({ t: 'lb.state', state: this.state });
    this.emit();
  }

  private send(msg: LobbyMsg, to?: PeerId): void {
    if (this.isHost && to === undefined) {
      for (const m of this.session.members) {
        if (m.id !== this.selfId) this.session.transport.send(msg, m.id);
      }
    } else {
      this.session.transport.send(msg, to ?? this.session.hostId ?? undefined);
    }
  }

  private emit(): void {
    for (const cb of this.changeCbs) cb();
  }
}
