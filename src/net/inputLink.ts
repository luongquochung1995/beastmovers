import type { SimSlot, SlotSource } from '../sim/SimSlot';
import { EMPTY_FRAME, type InputFrame } from '../systems/input/InputFrame';
import type { InputManager } from '../systems/input/InputManager';
import type { Payload, PeerId, Transport } from './Transport';

/**
 * Đường input qua mạng: máy khách xin ô người chơi và gửi phím bấm; host gom lại thành
 * các ô toàn cục (0..7) cho mô phỏng. Chơi chung máy ở chế độ loopback cũng đi qua đây.
 */

/**
 * Máy khách → host. Gửi đủ input của từng bước logic (không chỉ bước cuối) để host chạy
 * đúng từng bước như máy khách đã bấm, cú bấm nhanh không bị lọt, và máy khách biết chính
 * xác host đã chạy tới bước nào (để dự đoán).
 * `f`: [ô trên máy khách, số thứ tự bước của khung đầu, mx, my, nút, mx, my, nút…].
 */
export type InputClientMsg =
  | { t: 'join'; local: number }
  | { t: 'leave'; local: number }
  | { t: 'in'; f: [number, number, ...number[]][] };

/** Host → máy khách. */
export type InputHostMsg =
  { t: 'slot'; local: number; slot: number } | { t: 'full'; local: number };

const isMsg = (d: Payload): d is { t: string } =>
  typeof d === 'object' && d !== null && typeof (d as { t?: unknown }).t === 'string';

interface NetSlot extends SimSlot {
  owner: PeerId;
  local: number;
}

/**
 * Hàng chờ input (đệm chống dao động mạng): gói tới dồn thì chờ, mỗi bước dùng một khung.
 * Dài quá mức này (máy khách gửi nhanh hơn host chạy) thì bỏ bớt khung cũ, giữ lại cú bấm.
 */
const MAX_QUEUE = 30;
/**
 * Hàng chờ không lúc nào ngắn hơn mức này trong suốt `TRIM_WINDOW` bước thì bỏ phần dư,
 * để độ trễ không đứng ở mức cao sau một lần mạng dồn gói (gói mất phải gửi lại, các gói
 * sau phải chờ). Dự đoán ở máy khách lệch một chút và được kéo về mượt.
 */
const STANDING_QUEUE = 2;
const TRIM_WINDOW = 10;

interface QueuedFrame {
  seq: number;
  frame: InputFrame;
}

/** Host: gom input từ các máy thành các ô người chơi toàn cục. */
export class HostInputHub implements SlotSource {
  readonly slots: (NetSlot | null)[];
  /** Khung input đang chờ của từng ô (mỗi bước mô phỏng dùng một khung). */
  private readonly queues = new Map<number, QueuedFrame[]>();
  /** Khung dùng gần nhất (hết hàng chờ thì dùng lại khung này). */
  private readonly last = new Map<number, InputFrame>();
  private readonly pendingJoins: { peer: PeerId; local: number }[] = [];
  /** Độ dài ngắn nhất của hàng chờ trong cửa sổ hiện tại, và số bước đã đếm. */
  private readonly queueMin = new Map<number, { min: number; n: number }>();
  /** Ô → số thứ tự bước input mới nhất đã dùng (máy khách dự đoán phần sau). */
  private readonly applied = new Map<number, number>();
  private readonly joinCbs: ((peer: PeerId) => void)[] = [];

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
          this.queues.delete(s.index);
          this.last.delete(s.index);
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

  /** Một máy vừa xin ô (đã vào màn chơi, sẵn sàng nhận snapshot). */
  onJoin(cb: (peer: PeerId) => void): void {
    this.joinCbs.push(cb);
  }

  /** Số thứ tự bước input cuối cùng đã dùng cho ô `slot`. */
  ackOf(slot: number): number {
    return this.applied.get(slot) ?? 0;
  }

  /** Ô của người chơi `local` trên máy `peer`. */
  slotOf(peer: PeerId, local: number): NetSlot | undefined {
    return this.slots.find((s): s is NetSlot => s?.owner === peer && s.local === local);
  }

  private handle(d: Payload, from: PeerId): void {
    if (!isMsg(d)) return;
    const m = d as InputClientMsg;
    if (m.t === 'join') {
      for (const cb of this.joinCbs) cb(from);
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
      for (const [local, first, ...flat] of m.f) {
        const s = this.slotOf(from, local);
        if (!s) continue;
        let q = this.queues.get(s.index);
        if (!q) this.queues.set(s.index, (q = []));
        const newest = q[q.length - 1]?.seq ?? this.applied.get(s.index) ?? -1;
        for (let k = 0; k * 3 + 2 < flat.length; k++) {
          const seq = first + k;
          // Khung đã có (gửi lại, đổi kênh truyền) thì bỏ.
          if (seq <= newest) continue;
          q.push({
            seq,
            frame: { mx: flat[k * 3]!, my: flat[k * 3 + 1]!, buttons: flat[k * 3 + 2]! },
          });
        }
      }
    } else if (m.t === 'leave') {
      const s = this.slotOf(from, m.local);
      if (s) s.connected = false;
    }
  }

  poll(allowJoin: boolean): SimSlot[] {
    for (const s of this.slots) {
      if (!s) continue;
      s.prev = s.cur;
      const q = this.queues.get(s.index) ?? [];
      // Hàng chờ quá dài: bỏ khung cũ nhưng giữ các cú bấm trong đó.
      let held = s.prev.buttons;
      let pressed = 0;
      const drop = () => {
        const b = q.shift()!.frame.buttons;
        pressed |= b & ~held;
        held = b;
      };
      while (q.length > MAX_QUEUE) drop();
      const w = this.queueMin.get(s.index) ?? { min: Infinity, n: 0 };
      w.min = Math.min(w.min, q.length);
      if (++w.n >= TRIM_WINDOW) {
        for (let k = STANDING_QUEUE; k < w.min; k++) drop();
        w.min = Infinity;
        w.n = 0;
      }
      this.queueMin.set(s.index, w);
      const next = q.shift();
      if (next) {
        this.last.set(s.index, next.frame);
        this.applied.set(s.index, next.seq);
      }
      const frame = this.last.get(s.index);
      s.cur =
        s.connected && frame ? { ...frame, buttons: frame.buttons | pressed } : { ...EMPTY_FRAME };
      // Có cú bấm trong khung bị bỏ mà bước trước vẫn đang giữ nút: coi như đã thả ở giữa.
      if (pressed) s.prev = { ...s.prev, buttons: s.prev.buttons & ~pressed };
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

/** Máy khách: xin ô cho từng người chơi trên máy và gửi input của từng bước định kỳ. */
export class ClientInputSender {
  /** Ô trên máy này → ô toàn cục host đã cấp. */
  readonly assigned = new Map<number, number>();
  private readonly requested = new Set<number>();
  /** Khung input chưa gửi của từng ô (mx, my, nút nối tiếp nhau) và số thứ tự khung đầu. */
  private readonly pending = new Map<number, { from: number; frames: number[] }>();
  private sinceSendMs = 0;
  /** Số thứ tự của bước logic vừa chạy (gửi kèm input; dùng cho dự đoán). */
  tickSeq = -1;

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
    this.tickSeq++;
    let any = false;
    for (const s of this.inputs.slots) {
      if (!s) continue;
      if (!this.assigned.has(s.index)) {
        if (!this.requested.has(s.index)) {
          this.requested.add(s.index);
          this.transport.send({ t: 'join', local: s.index } satisfies InputClientMsg, this.hostId);
        }
        continue;
      }
      const cur = s.connected ? s.cur : EMPTY_FRAME;
      let buf = this.pending.get(s.index);
      if (!buf) this.pending.set(s.index, (buf = { from: 0, frames: [] }));
      if (buf.frames.length === 0) buf.from = this.tickSeq;
      buf.frames.push(cur.mx, cur.my, cur.buttons);
      any = true;
    }
    if (!any) return;
    this.sinceSendMs += dtMs;
    if (this.sinceSendMs < 1000 / this.sendHz) return;
    this.sinceSendMs = 0;
    const f: [number, number, ...number[]][] = [];
    for (const [local, buf] of this.pending) {
      if (buf.frames.length) f.push([local, buf.from, ...buf.frames]);
      buf.frames = [];
    }
    if (f.length > 0) this.transport.send({ t: 'in', f } satisfies InputClientMsg, this.hostId);
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
    readonly hub: HostInputHub,
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
