/** Phép tính vector 2D dùng chung (thuần, không phụ thuộc Phaser). */
export interface Vec {
  x: number;
  y: number;
}

export const vec = (x = 0, y = 0): Vec => ({ x, y });
export const add = (a: Vec, b: Vec): Vec => ({ x: a.x + b.x, y: a.y + b.y });
export const sub = (a: Vec, b: Vec): Vec => ({ x: a.x - b.x, y: a.y - b.y });
export const scale = (a: Vec, s: number): Vec => ({ x: a.x * s, y: a.y * s });
export const dot = (a: Vec, b: Vec): number => a.x * b.x + a.y * b.y;
/** Tích có hướng 2D (thành phần z). */
export const cross = (a: Vec, b: Vec): number => a.x * b.y - a.y * b.x;
export const length = (a: Vec): number => Math.hypot(a.x, a.y);
export const dist = (a: Vec, b: Vec): number => Math.hypot(a.x - b.x, a.y - b.y);
export const lerpVec = (a: Vec, b: Vec, t: number): Vec => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
});

export function normalize(a: Vec): Vec {
  const len = length(a);
  return len > 1e-9 ? { x: a.x / len, y: a.y / len } : { x: 0, y: 0 };
}

export function rotate(a: Vec, angle: number): Vec {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return { x: a.x * c - a.y * s, y: a.x * s + a.y * c };
}

/** Vận tốc của một điểm cách tâm `r` trên vật đang quay với vận tốc góc `w`: ω × r. */
export const angularToLinear = (w: number, r: Vec): Vec => ({ x: -w * r.y, y: w * r.x });

export function closestPointOnSegment(p: Vec, a: Vec, b: Vec): Vec {
  const ab = sub(b, a);
  const lenSq = dot(ab, ab);
  if (lenSq === 0) return a;
  const t = Math.max(0, Math.min(1, dot(sub(p, a), ab) / lenSq));
  return add(a, scale(ab, t));
}

/** Điểm gần `p` nhất trên viền đa giác (các đỉnh theo thứ tự). */
export function closestPointOnPolygon(p: Vec, vertices: readonly Vec[]): Vec {
  let best = vertices[0]!;
  let bestD = Infinity;
  for (let i = 0; i < vertices.length; i++) {
    const q = closestPointOnSegment(p, vertices[i]!, vertices[(i + 1) % vertices.length]!);
    const d = dist(p, q);
    if (d < bestD) {
      bestD = d;
      best = q;
    }
  }
  return best;
}

/** Điểm có nằm trong đa giác lồi không (đỉnh theo thứ tự bất kỳ chiều). */
export function pointInConvexPolygon(p: Vec, vertices: readonly Vec[]): boolean {
  let sign = 0;
  for (let i = 0; i < vertices.length; i++) {
    const a = vertices[i]!;
    const b = vertices[(i + 1) % vertices.length]!;
    const c = cross(sub(b, a), sub(p, a));
    if (c !== 0) {
      if (sign === 0) sign = Math.sign(c);
      else if (Math.sign(c) !== sign) return false;
    }
  }
  return true;
}
