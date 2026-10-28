import type { CarryState } from '../systems/carry';
import type { LevelPhase } from '../systems/levelClock';
import type { MotorMode } from '../systems/PlayerMotor';
import type { ItemSnap, PlayerSnap, Snapshot } from './snapshot';

/**
 * Mã hóa snapshot thành nhị phân gọn để gửi 20 lần/giây:
 * - vị trí lượng tử hóa int16 (0,25 px), góc int8 (~1,4°);
 * - gói "delta" chỉ chứa đồ vật thay đổi so với gói trước gửi cho máy đó, kèm danh sách đồ
 *   đã biến mất; gói "full" chứa tất cả (máy mới vào, và định kỳ để chắc chắn khớp).
 * Kênh truyền tin cậy và giữ thứ tự, nên máy khách luôn có đúng gói gốc của delta.
 * Người chơi, cửa, xe, chủ nhà, đồng hồ ít và nhỏ nên lần nào cũng gửi đủ.
 */

export const SNAP_FULL = 1;
export const SNAP_DELTA = 2;

const POS_SCALE = 4;
const ANGLE_SCALE = 127 / Math.PI;

const MODES: readonly MotorMode[] = ['normal', 'dashing', 'fallen'];
const CARRY: readonly CarryState[] = ['idle', 'immovable', 'dragging', 'lifted'];
const PHASES: readonly LevelPhase[] = ['playing', 'ending', 'done'];

const qPos = (v: number) => Math.max(-32768, Math.min(32767, Math.round(v * POS_SCALE)));
const dqPos = (q: number) => q / POS_SCALE;
const wrapAngle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const qAngle = (a: number) => Math.max(-127, Math.min(127, Math.round(wrapAngle(a) * ANGLE_SCALE)));
const dqAngle = (q: number) => q / ANGLE_SCALE;

/** Đưa snapshot về đúng lưới lượng tử (giá trị máy khách sẽ nhận được). */
export function quantize(s: Snapshot): Snapshot {
  return {
    tick: s.tick >>> 0,
    players: s.players.map((p) => {
      const fa = dqAngle(qAngle(Math.atan2(p.fy, p.fx)));
      return {
        ...p,
        x: dqPos(qPos(p.x)),
        y: dqPos(qPos(p.y)),
        fx: Math.cos(fa),
        fy: Math.sin(fa),
      };
    }),
    items: s.items.map((i) => ({
      ...i,
      x: dqPos(qPos(i.x)),
      y: dqPos(qPos(i.y)),
      a: dqAngle(qAngle(i.a)),
      carriers: Math.min(255, i.carriers),
      dur: Math.max(0, Math.min(65535, Math.round(i.dur))),
    })),
    doors: s.doors.map((a) => dqAngle(qAngle(a))),
    truck: s.truck && {
      ox: dqPos(qPos(s.truck.ox)),
      oy: dqPos(qPos(s.truck.oy)),
      used: Math.min(255, s.truck.used),
      handbrake: s.truck.handbrake,
    },
    landlord: s.landlord && {
      x: dqPos(qPos(s.landlord.x)),
      y: dqPos(qPos(s.landlord.y)),
      sat: Math.max(0, Math.min(255, Math.round(s.landlord.sat))),
    },
    clock: s.clock && { left: Math.max(0, Math.round(s.clock.left)), phase: s.clock.phase },
    required: [...s.required],
  };
}

// ---------- Ghi / đọc byte ----------

class Writer {
  private buf = new ArrayBuffer(1024);
  private view = new DataView(this.buf);
  private pos = 0;

  private ensure(n: number): void {
    if (this.pos + n <= this.buf.byteLength) return;
    const next = new ArrayBuffer(Math.max(this.buf.byteLength * 2, this.pos + n));
    new Uint8Array(next).set(new Uint8Array(this.buf));
    this.buf = next;
    this.view = new DataView(next);
  }

  u8(v: number) {
    this.ensure(1);
    this.view.setUint8(this.pos++, v);
  }
  i8(v: number) {
    this.ensure(1);
    this.view.setInt8(this.pos++, v);
  }
  u16(v: number) {
    this.ensure(2);
    this.view.setUint16(this.pos, v, true);
    this.pos += 2;
  }
  i16(v: number) {
    this.ensure(2);
    this.view.setInt16(this.pos, v, true);
    this.pos += 2;
  }
  u32(v: number) {
    this.ensure(4);
    this.view.setUint32(this.pos, v, true);
    this.pos += 4;
  }
  str(s: string) {
    const bytes = new TextEncoder().encode(s).slice(0, 255);
    this.u8(bytes.length);
    this.ensure(bytes.length);
    new Uint8Array(this.buf, this.pos, bytes.length).set(bytes);
    this.pos += bytes.length;
  }
  done(): ArrayBuffer {
    return this.buf.slice(0, this.pos);
  }
}

class Reader {
  private readonly view: DataView;
  private pos = 0;
  constructor(private readonly bytes: Uint8Array) {
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }
  u8() {
    return this.view.getUint8(this.pos++);
  }
  i8() {
    return this.view.getInt8(this.pos++);
  }
  u16() {
    const v = this.view.getUint16(this.pos, true);
    this.pos += 2;
    return v;
  }
  i16() {
    const v = this.view.getInt16(this.pos, true);
    this.pos += 2;
    return v;
  }
  u32() {
    const v = this.view.getUint32(this.pos, true);
    this.pos += 4;
    return v;
  }
  str() {
    const n = this.u8();
    const s = new TextDecoder().decode(this.bytes.subarray(this.pos, this.pos + n));
    this.pos += n;
    return s;
  }
}

// ---------- Món đồ ----------

/** Các nhóm trường của một món đồ, đánh dấu bằng bit để chỉ gửi nhóm thay đổi. */
const F_POSE = 1;
const F_STATE = 2;
const F_EXTRA = 4;
/** Món mới (máy khách chưa có): kèm số thứ tự loại đồ trong items.json. */
const F_NEW = 8;

const poseChanged = (a: ItemSnap, b: ItemSnap) => a.x !== b.x || a.y !== b.y || a.a !== b.a;
const stateChanged = (a: ItemSnap, b: ItemSnap) =>
  a.cs !== b.cs ||
  a.carriers !== b.carriers ||
  a.dur !== b.dur ||
  a.broken !== b.broken ||
  a.hidden !== b.hidden ||
  a.loaded !== b.loaded;
const extraChanged = (a: ItemSnap, b: ItemSnap) => a.icon !== b.icon || a.box !== b.box;

function writeItem(w: Writer, i: ItemSnap, mask: number, defIndex: ReadonlyMap<string, number>) {
  w.u16(i.u);
  w.u8(mask);
  if (mask & F_NEW) w.u16(defIndex.get(i.d) ?? 0);
  if (mask & F_POSE) {
    w.i16(qPos(i.x));
    w.i16(qPos(i.y));
    w.i8(qAngle(i.a));
  }
  if (mask & F_STATE) {
    w.u8(CARRY.indexOf(i.cs) | (i.broken ? 4 : 0) | (i.hidden ? 8 : 0) | (i.loaded ? 16 : 0));
    w.u8(i.carriers);
    w.u16(i.dur);
  }
  if (mask & F_EXTRA) {
    w.str(i.icon ?? '');
    w.u8(i.icon === null ? 0 : 1);
    w.i16(i.box);
  }
}

function readItem(r: Reader, prev: ReadonlyMap<number, ItemSnap>, defIds: readonly string[]) {
  const u = r.u16();
  const mask = r.u8();
  const base: ItemSnap = prev.get(u) ?? {
    u,
    d: '',
    x: 0,
    y: 0,
    a: 0,
    cs: 'idle',
    carriers: 0,
    dur: 0,
    broken: false,
    hidden: false,
    loaded: false,
    icon: null,
    box: -1,
  };
  const it: ItemSnap = { ...base };
  if (mask & F_NEW) it.d = defIds[r.u16()] ?? '';
  if (mask & F_POSE) {
    it.x = dqPos(r.i16());
    it.y = dqPos(r.i16());
    it.a = dqAngle(r.i8());
  }
  if (mask & F_STATE) {
    const flags = r.u8();
    it.cs = CARRY[flags & 3]!;
    it.broken = (flags & 4) !== 0;
    it.hidden = (flags & 8) !== 0;
    it.loaded = (flags & 16) !== 0;
    it.carriers = r.u8();
    it.dur = r.u16();
  }
  if (mask & F_EXTRA) {
    const icon = r.str();
    it.icon = r.u8() ? icon : null;
    it.box = r.i16();
  }
  return it;
}

// ---------- Cả gói ----------

/**
 * Mã hóa `snap` (đã lượng tử bằng `quantize`). `base` là gói trước đã gửi cho máy đó
 * (cũng đã lượng tử); `null` thì gửi đủ.
 */
export function encodeSnapshot(
  snap: Snapshot,
  base: Snapshot | null,
  defIndex: ReadonlyMap<string, number>,
): ArrayBuffer {
  const w = new Writer();
  w.u8(base ? SNAP_DELTA : SNAP_FULL);
  w.u32(snap.tick);

  const c = snap.clock;
  w.u8(c ? 1 : 0);
  if (c) {
    w.u32(c.left);
    w.u8(PHASES.indexOf(c.phase));
  }
  const l = snap.landlord;
  w.u8(l ? 1 : 0);
  if (l) {
    w.i16(qPos(l.x));
    w.i16(qPos(l.y));
    w.u8(l.sat);
  }
  const t = snap.truck;
  w.u8(t ? 1 : 0);
  if (t) {
    w.i16(qPos(t.ox));
    w.i16(qPos(t.oy));
    w.u8(t.used);
    w.u8(t.handbrake ? 1 : 0);
  }
  w.u8(snap.doors.length);
  for (const a of snap.doors) w.i8(qAngle(a));
  w.u8(snap.required.length);
  for (const u of snap.required) w.u16(u);

  w.u8(snap.players.length);
  for (const p of snap.players) {
    w.u8(p.s);
    w.i16(qPos(p.x));
    w.i16(qPos(p.y));
    w.i8(qAngle(Math.atan2(p.fy, p.fx)));
    w.u8(MODES.indexOf(p.mode) | (p.run ? 4 : 0));
    w.i16(p.hold);
  }

  const prev = new Map((base?.items ?? []).map((i) => [i.u, i] as const));
  const changed: [ItemSnap, number][] = [];
  for (const i of snap.items) {
    const b = prev.get(i.u);
    const mask = !b
      ? F_NEW | F_POSE | F_STATE | F_EXTRA
      : (poseChanged(i, b) ? F_POSE : 0) |
        (stateChanged(i, b) ? F_STATE : 0) |
        (extraChanged(i, b) ? F_EXTRA : 0);
    if (mask) changed.push([i, mask]);
  }
  w.u16(changed.length);
  for (const [i, mask] of changed) writeItem(w, i, mask, defIndex);

  if (base) {
    const now = new Set(snap.items.map((i) => i.u));
    const removed = base.items.filter((i) => !now.has(i.u));
    w.u16(removed.length);
    for (const i of removed) w.u16(i.u);
  }
  return w.done();
}

export function snapshotKind(data: ArrayBuffer | Uint8Array): number {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  return bytes[0] ?? 0;
}

/**
 * Giải mã một gói. Gói delta cần `prev` là snapshot đã giải mã ngay trước đó;
 * trả `null` nếu là delta mà chưa có gói gốc (chờ gói full kế tiếp).
 */
export function decodeSnapshot(
  data: ArrayBuffer | Uint8Array,
  prev: Snapshot | null,
  defIds: readonly string[],
): Snapshot | null {
  const r = new Reader(data instanceof Uint8Array ? data : new Uint8Array(data));
  const kind = r.u8();
  if (kind === SNAP_DELTA && !prev) return null;
  const tick = r.u32();
  const clock = r.u8() ? { left: r.u32(), phase: PHASES[r.u8()] ?? 'playing' } : null;
  const landlord = r.u8() ? { x: dqPos(r.i16()), y: dqPos(r.i16()), sat: r.u8() } : null;
  const truck = r.u8()
    ? { ox: dqPos(r.i16()), oy: dqPos(r.i16()), used: r.u8(), handbrake: r.u8() === 1 }
    : null;
  const doors = Array.from({ length: r.u8() }, () => dqAngle(r.i8()));
  const required = Array.from({ length: r.u8() }, () => r.u16());

  const players: PlayerSnap[] = Array.from({ length: r.u8() }, () => {
    const s = r.u8();
    const x = dqPos(r.i16());
    const y = dqPos(r.i16());
    const fa = dqAngle(r.i8());
    const flags = r.u8();
    return {
      s,
      x,
      y,
      fx: Math.cos(fa),
      fy: Math.sin(fa),
      mode: MODES[flags & 3] ?? 'normal',
      run: (flags & 4) !== 0,
      hold: r.i16(),
    };
  });

  const base = new Map(
    kind === SNAP_DELTA ? (prev?.items ?? []).map((i) => [i.u, i] as const) : [],
  );
  const n = r.u16();
  for (let k = 0; k < n; k++) {
    const it = readItem(r, base, defIds);
    base.set(it.u, it);
  }
  if (kind === SNAP_DELTA) {
    const removed = r.u16();
    for (let k = 0; k < removed; k++) base.delete(r.u16());
  }
  return {
    tick,
    players,
    items: [...base.values()],
    doors,
    truck,
    landlord,
    clock,
    required,
  };
}
