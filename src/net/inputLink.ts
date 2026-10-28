import type { SimSlot, SlotSource } from '../sim/SimSlot';
import { EMPTY_FRAME, type InputFrame } from '../systems/input/InputFrame';
import type { InputManager } from '../systems/input/InputManager';
import type { Payload, PeerId, Transport } from './Transport';

/**
 * Đường input qua mạng: máy khách xin ô người chơi và gửi phím bấm; host gom lại thành
 * các ô toàn cục (0..7) cho mô phỏng. Chơi chung máy ở chế độ loopback cũng đi qua đây.
 */

/**
 * Máy khách → host. `f`: [ô trên máy khách, mx, my, nút đang giữ, nút vừa nhấn].
 * "Vừa nhấn" gửi riêng để host không bỏ lỡ cú bấm khi gói "thả" và gói "nhấn lại" tới dồn.
 */
export type InputClientMsg =
  | { t: 'join'; local: number }
  | { t: 'leave'; local: number }
  | { t: 'in'; seq: number; f: [number, number, number, number, number][] };

/** Host → máy khách. */
export type InputHostMsg =
  { t: 'slot'; local: number; slot: number } | { t: 'full'; local: number };

const isMsg = (d: Payload): d is { t: string } =>
  typeof d === 'object' && d !== null && typeof (d as { t?: unknown }).t === 'string';

interface NetSlot extends SimSlot {
  owner: PeerId;
  local: number;
}

/** Host: gom input từ các máy thành các ô người chơi toàn cục. */
export class HostInputHub implements SlotSource {
  readonly slots: (NetSlot | null)[];
  /** Gói input mới nhất của từng ô. */
  private readonly latest = new Map<number, InputFrame>();
  /**
   * Nút vừa nhấn kể từ lần mô phỏng đọc trước. Mạng dao động có thể đưa nhiều gói tới cùng
   * lúc (nhấn, thả, nhấn lại): gộp lại để không cú bấm nào bị gói sau ghi đè mất.
   */
  private readonly pressedSincePoll = new Map<number, number>();
  private readonly pendingJoins: { peer: PeerId; local: number }[] = [];
  private readonly lastSeq = new Map<PeerId, number>();

  constructor(
    private readonly transport: Transport,
    maxPlayers: number,
  ) {
    this.slots = Array.from({ length: maxPlayers }, () => null);
    transport.onMessage((d, from) => this.handle(d, from));
    transport.onPeerLeave((peer) => {
      for (const s of this.slots) {
        if (s?.owner === peer) {
          s.connected = false;
          this.latest.delete(s.index);
        }
      }
    });
  }

  /**
   * Giữ sẵn ô `slot` cho người chơi `local` trên máy `peer` (online: thứ tự đã chốt ở lobby).
   * Ô chưa có input cho tới khi máy đó xin vào (`join`).
   */
  reserve(peer: PeerId, local: number, slot: number): void {
    this.slots[slot] = {
      index: slot,
      owner: peer,
      local,
      prev: { ...EMPTY_FRAME },
      cur: { ...EMPTY_FRAME },
      connected: false,
    };
  }

  /** Ô của người chơi `local` trên máy `peer`. */
  slotOf(peer: PeerId, local: number): NetSlot | undefined {
    return this.slots.find((s): s is NetSlot => s?.owner === peer && s.local === local);
  }

  private handle(d: Payload, from: PeerId): void {
    if (!isMsg(d)) return;
    const m = d as InputClientMsg;
    if (m.t === 'join') {
      const existing = this.slotOf(from, m.local);
      if (existing) {
        existing.connected = true;
        this.transport.send(
          { t: 'slot', local: m.local, slot: existing.index } satisfies InputHostMsg,
          from,
        );
      } else if (!this.pendingJoins.some((j) => j.peer === from && j.local === m.local)) {
        this.pendingJoins.push({ peer: from, local: m.local });
      }
    } else if (m.t === 'in') {
      // Gói cũ hơn gói đã nhận thì bỏ (phòng khi đổi kênh truyền).
      if (m.seq <= (this.lastSeq.get(from) ?? -1)) return;
      this.lastSeq.set(from, m.seq);
      for (const [local, mx, my, buttons, pressed] of m.f) {
        const s = this.slotOf(from, local);
        if (!s) continue;
        this.latest.set(s.index, { mx, my, buttons });
        this.pressedSincePoll.set(s.index, (this.pressedSincePoll.get(s.index) ?? 0) | pressed);
      }
    } else if (m.t === 'leave') {
      const s = this.slotOf(from, m.local);
      if (s) s.connected = false;
    }
  }

  poll(allowJoin: boolean): SimSlot[] {
    for (const s of this.slots) {
      if (!s) continue;
      const pressed = this.pressedSincePoll.get(s.index) ?? 0;
      // Nút vừa nhấn lại trong khi lần đọc trước vẫn thấy đang giữ: coi như đã thả ở giữa.
      s.prev = { ...s.cur, buttons: s.cur.buttons & ~pressed };
      const last = this.latest.get(s.index);
      s.cur =
        s.connected && last ? { ...last, buttons: last.buttons | pressed } : { ...EMPTY_FRAME };
      this.pressedSincePoll.set(s.index, 0);
    }
    const joined: SimSlot[] = [];
    while (this.pendingJoins.length > 0) {
      const { peer, local } = this.pendingJoins.shift()!;
      const index = this.slots.indexOf(null);
      if (!allowJoin || index < 0) {
        this.transport.send({ t: 'full', local } satisfies InputHostMsg, peer);
        continue;
      }
      const slot: NetSlot = {
        index,
        owner: peer,
        local,
        prev: { ...EMPTY_FRAME },
        cur: { ...EMPTY_FRAME },
        connected: true,
      };
      this.slots[index] = slot;
      joined.push(slot);
      this.transport.send({ t: 'slot', local, slot: index } satisfies InputHostMsg, peer);
    }
    return joined;
  }

  destroy(): void {}
}

/** Máy khách: xin ô cho từng người chơi trên máy và gửi phím bấm định kỳ. */
export class ClientInputSender {
  /** Ô trên máy này → ô toàn cục host đã cấp. */
  readonly assigned = new Map<number, number>();
  private readonly requested = new Set<number>();
  /** Nút vừa nhấn kể từ lần gửi trước (để cú bấm nhanh không bị lọt giữa hai lần gửi). */
  private readonly pressedSince = new Map<number, number>();
  private sinceSendMs = 0;
  private seq = 0;

  constructor(
    private readonly transport: Transport,
    private readonly hostId: PeerId,
    private readonly inputs: InputManager,
    private readonly sendHz: number,
  ) {
    transport.onMessage((d, from) => {
      if (from !== hostId || !isMsg(d)) return;
      const m = d as InputHostMsg;
      if (m.t === 'slot') this.assigned.set(m.local, m.slot);
      else if (m.t === 'full') this.requested.delete(m.local);
    });
  }

  /** Gọi mỗi bước logic. */
  tick(dtMs: number, allowJoin: boolean): void {
    this.inputs.poll(allowJoin);
    for (const s of this.inputs.slots) {
      if (!s) continue;
      if (!this.assigned.has(s.index) && !this.requested.has(s.index)) {
        this.requested.add(s.index);
        this.transport.send({ t: 'join', local: s.index } satisfies InputClientMsg, this.hostId);
      }
      const edges = s.cur.buttons & ~s.prev.buttons;
      this.pressedSince.set(s.index, (this.pressedSince.get(s.index) ?? 0) | edges);
    }
    this.sinceSendMs += dtMs;
    if (this.sinceSendMs < 1000 / this.sendHz) return;
    this.sinceSendMs = 0;
    const f: [number, number, number, number, number][] = [];
    for (const s of this.inputs.slots) {
      if (!s || !this.assigned.has(s.index)) continue;
      const cur = s.connected ? s.cur : EMPTY_FRAME;
      const pressed = s.connected ? (this.pressedSince.get(s.index) ?? 0) : 0;
      f.push([s.index, cur.mx, cur.my, cur.buttons, pressed]);
      this.pressedSince.set(s.index, 0);
    }
    if (f.length > 0)
      this.transport.send({ t: 'in', seq: this.seq++, f } satisfies InputClientMsg, this.hostId);
  }
}

/** Chơi chung máy không qua mạng: dùng thẳng các ô của InputManager. */
export class LocalSlotSource implements SlotSource {
  constructor(private readonly inputs: InputManager) {}

  get slots(): readonly (SimSlot | null)[] {
    return this.inputs.slots;
  }

  poll(allowJoin: boolean): SimSlot[] {
    return this.inputs.poll(allowJoin);
  }

  destroy(): void {}
}

/**
 * Host online: người chơi trên máy host lấy input thẳng từ InputManager, người chơi máy
 * khác lấy từ `HostInputHub`; ô toàn cục theo thứ tự đã chốt ở lobby. Không nhận người mới
 * giữa màn (vào lại sau khi rớt mạng: P25).
 */
export class OnlineHostSlots implements SlotSource {
  readonly slots: (SimSlot | null)[];

  constructor(
    private readonly inputs: InputManager,
    private readonly hub: HostInputHub,
    /** Ô trên máy host → ô toàn cục. */
    private readonly localToGlobal: ReadonlyMap<number, number>,
  ) {
    this.slots = Array.from({ length: hub.slots.length }, () => null);
  }

  poll(): SimSlot[] {
    this.inputs.poll(false);
    this.hub.poll(false);
    for (let i = 0; i < this.slots.length; i++) this.slots[i] = this.hub.slots[i] ?? null;
    for (const [local, global] of this.localToGlobal) {
      const s = this.inputs.slots[local];
      this.slots[global] = s
        ? { index: global, prev: s.prev, cur: s.cur, connected: s.connected }
        : null;
    }
    return [];
  }

  destroy(): void {
    this.hub.destroy();
  }
}
