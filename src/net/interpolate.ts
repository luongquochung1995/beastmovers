import type { ItemSnap, PlayerSnap, Snapshot } from './snapshot';

/** Nhảy xa hơn mức này giữa hai snapshot (dịch chuyển, rơi khỏi xe…) thì không nội suy. */
const TELEPORT_PX = 120;

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Nội suy góc theo đường ngắn nhất. */
export function lerpAngle(a: number, b: number, t: number): number {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

const lerpPos = (a: { x: number; y: number }, b: { x: number; y: number }, t: number) =>
  Math.hypot(b.x - a.x, b.y - a.y) > TELEPORT_PX
    ? { x: b.x, y: b.y }
    : { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) };

function lerpPlayer(a: PlayerSnap | undefined, b: PlayerSnap, t: number): PlayerSnap {
  if (!a) return b;
  const fa = lerpAngle(Math.atan2(a.fy, a.fx), Math.atan2(b.fy, b.fx), t);
  return {
    ...b,
    ...lerpPos(a, b, t),
    fx: Math.cos(fa),
    fy: Math.sin(fa),
    vx: lerp(a.vx, b.vx, t),
    vy: lerp(a.vy, b.vy, t),
  };
}

function lerpItem(a: ItemSnap | undefined, b: ItemSnap, t: number): ItemSnap {
  if (!a || a.hidden !== b.hidden) return b;
  return { ...b, ...lerpPos(a, b, t), a: lerpAngle(a.a, b.a, t) };
}

/**
 * Trạng thái ở giữa hai snapshot (`t` = 0 → `a`, 1 → `b`). Vị trí, góc được nội suy;
 * những thứ rời rạc (ai đang nắm gì, độ bền, món đồ nào còn) lấy theo `b`.
 */
export function interpolateSnapshots(a: Snapshot, b: Snapshot, t: number): Snapshot {
  if (t >= 1) return b;
  if (t <= 0) t = 0;
  const pa = new Map(a.players.map((p) => [p.s, p] as const));
  const ia = new Map(a.items.map((i) => [i.u, i] as const));
  return {
    ...b,
    players: b.players.map((p) => lerpPlayer(pa.get(p.s), p, t)),
    items: b.items.map((i) => lerpItem(ia.get(i.u), i, t)),
    doors: b.doors.map((d, k) => lerpAngle(a.doors[k] ?? d, d, t)),
    truck: b.truck && a.truck && { ...b.truck, ...lerpTruck(a.truck, b.truck, t) },
    landlord: b.landlord && a.landlord && { ...b.landlord, ...lerpPos(a.landlord, b.landlord, t) },
    clock: b.clock && a.clock && { ...b.clock, left: lerp(a.clock.left, b.clock.left, t) },
  };
}

function lerpTruck(a: { ox: number; oy: number }, b: { ox: number; oy: number }, t: number) {
  return { ox: lerp(a.ox, b.ox, t), oy: lerp(a.oy, b.oy, t) };
}

/**
 * Bộ đệm snapshot của máy khách: vẽ thế giới chậm hơn snapshot mới nhất khoảng `delayMs`
 * để luôn có hai snapshot kẹp hai bên thời điểm vẽ (mạng dao động không làm vật thể giật).
 * Thời điểm vẽ (theo giờ của host, suy từ số bước logic) chạy theo đồng hồ máy này nhưng
 * nhanh/chậm hơn chút để giữ khoảng cách tới snapshot mới nhất ≈ `delayMs` — không cần biết
 * đồng hồ hai máy lệch nhau bao nhiêu, và vẫn đúng khi host chạy chậm hơn thời gian thực.
 */
export class SnapshotBuffer {
  private readonly items: { time: number; snap: Snapshot }[] = [];
  private renderTime: number | null = null;
  private lastNow: number | null = null;
  /** Khoảng cách trung bình từ thời điểm vẽ tới snapshot mới nhất. */
  private leadAvg = 0;
  /** Số khung hình phải dùng snapshot mới nhất vì chưa có gói sau (để đo). */
  starved = 0;
  /** Số lần phải nhảy thời điểm vẽ (mất gói lâu, host khựng…). */
  resyncs = 0;

  constructor(
    private readonly tickMs: number,
    private readonly delayMs: number,
  ) {}

  push(snap: Snapshot, _nowMs: number): void {
    const time = snap.tick * this.tickMs;
    const last = this.items[this.items.length - 1];
    if (last && time <= last.time) return;
    this.items.push({ time, snap });
    // Giữ khoảng 1 giây.
    while (this.items.length > 2 && this.items[1]!.time < time - 1000) this.items.shift();
  }

  get latest(): Snapshot | null {
    return this.items[this.items.length - 1]?.snap ?? null;
  }

  get size(): number {
    return this.items.length;
  }

  /** Trạng thái để vẽ ở thời điểm `nowMs` (đồng hồ máy này), gọi mỗi khung hình. */
  sample(nowMs: number): Snapshot | null {
    const newest = this.items[this.items.length - 1];
    if (!newest) return null;
    const target = this.delayMs;
    if (this.renderTime === null || this.lastNow === null) {
      this.renderTime = newest.time - target;
      this.leadAvg = target;
    } else {
      const dt = Math.max(0, nowMs - this.lastNow);
      const lead = newest.time - this.renderTime;
      this.leadAvg += (lead - this.leadAvg) * Math.min(1, dt / 300);
      if (Math.abs(lead - target) > Math.max(500, target * 4)) {
        this.renderTime = newest.time - target;
        this.leadAvg = target;
        this.resyncs++;
      } else {
        const rate = 1 + Math.max(-0.6, Math.min(0.6, (this.leadAvg - target) / target));
        this.renderTime += dt * rate;
      }
    }
    this.lastNow = nowMs;
    const at = this.renderTime;
    const first = this.items[0]!;
    if (at <= first.time) return first.snap;
    for (let k = 1; k < this.items.length; k++) {
      const b = this.items[k]!;
      if (at <= b.time) {
        const a = this.items[k - 1]!;
        return interpolateSnapshots(a.snap, b.snap, (at - a.time) / (b.time - a.time));
      }
    }
    this.starved++;
    return newest.snap;
  }
}
