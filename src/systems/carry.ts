import type { LiftRule } from '../data/types';
import { add, angularToLinear, cross, dot, length, scale, sub, type Vec } from './geometry';

/**
 * Bộ điều khiển khiêng đồ (thuần, không phụ thuộc Phaser).
 *
 * Mỗi người nắm một điểm `r` (so với tâm món đồ) và đẩy theo hướng `move`.
 * Món đồ chọn vận tốc thẳng `v` và vận tốc góc `w` sao cho vận tốc tại các điểm nắm
 * gần với mong muốn của từng người nhất (bình phương tối thiểu):
 * - Mọi người cùng hướng → đồ đi thẳng.
 * - Hai đầu kéo ngược chiều dọc theo đồ → triệt tiêu, đứng im.
 * - Hai đầu đẩy ngược chiều vuông góc → đồ xoay.
 */

export type CarryState = 'idle' | 'immovable' | 'dragging' | 'lifted';

export interface Carrier {
  /** Điểm nắm so với tâm món đồ (đã xoay theo món đồ). */
  r: Vec;
  /** Hướng đẩy của người nắm, độ dài 0..1. */
  move: Vec;
}

export interface CarryInput {
  liftRule: LiftRule;
  required: number;
  massKg: number;
  carriers: readonly Carrier[];
  walkSpeed: number;
}

export interface CarryResult {
  state: CarryState;
  /** Vận tốc mong muốn tại tâm món đồ (px/bước). */
  velocity: Vec;
  /** Vận tốc góc mong muốn (rad/bước). */
  angularVelocity: number;
  /** Đang kéo lê đồ thiếu người (cào sàn, trừ độ bền). */
  scraping: boolean;
  /** Tốc độ tối đa sau khi tính khối lượng và số người. */
  speed: number;
}

/** Vận tốc góc tối đa, tránh đồ quay như chong chóng. */
export const MAX_ANGULAR = 0.06;
/** Một người cầm đồ thì đồ chỉ hơi đung đưa, không xoay mạnh. */
const SOLO_SWING = 0.3;

export function carryState(rule: LiftRule, carriers: number, required: number): CarryState {
  if (carriers === 0) return rule === 'strict' ? 'immovable' : 'idle';
  if (carriers >= required) return 'lifted';
  return rule === 'strict' ? 'immovable' : 'dragging';
}

/** Hệ số tốc độ theo khối lượng mỗi người phải gánh: nhẹ thì đi gần như bình thường, nặng thì chậm. */
export function loadFactor(massKg: number, carriers: number): number {
  const perPerson = massKg / Math.max(1, carriers);
  return Math.min(1, Math.max(0.4, 1.15 - perPerson / 100));
}

export function computeCarry(input: CarryInput): CarryResult {
  const { carriers, required, liftRule } = input;
  const n = carriers.length;
  const state = carryState(liftRule, n, required);
  const still: CarryResult = {
    state,
    velocity: { x: 0, y: 0 },
    angularVelocity: 0,
    scraping: false,
    speed: 0,
  };
  if (state === 'idle' || state === 'immovable') return still;

  let staffing = 1;
  if (state === 'dragging') {
    staffing = liftRule === 'drag' ? 0.3 * (n / required) : 0.4 + 0.6 * (n / required);
  }
  const speed = input.walkSpeed * loadFactor(input.massKg, n) * staffing;
  const wants = carriers.map((c) => scale(c.move, speed));

  // Bình phương tối thiểu quanh trọng tâm các điểm nắm.
  const c = scale(
    carriers.reduce((s, k) => add(s, k.r), { x: 0, y: 0 }),
    1 / n,
  );
  const meanWant = scale(
    wants.reduce((s, u) => add(s, u), { x: 0, y: 0 }),
    1 / n,
  );
  let num = 0;
  let den = 0;
  carriers.forEach((k, i) => {
    const rr = sub(k.r, c);
    num += cross(rr, sub(wants[i]!, meanWant));
    den += dot(rr, rr);
  });
  let w: number;
  let v: Vec;
  if (den > 1e-6) {
    w = Math.max(-MAX_ANGULAR, Math.min(MAX_ANGULAR, num / den));
    // Trọng tâm các điểm nắm đi với meanWant; tâm món đồ lệch c nên trừ phần do quay.
    v = sub(meanWant, angularToLinear(w, c));
  } else {
    // Một người (hoặc mọi người nắm cùng một chỗ): đồ đi theo người, chỉ đung đưa nhẹ.
    const r = carriers[0]!.r;
    const rr = dot(r, r);
    w = rr > 1e-6 ? (SOLO_SWING * cross(r, meanWant)) / rr : 0;
    w = Math.max(-MAX_ANGULAR, Math.min(MAX_ANGULAR, w));
    v = meanWant;
  }
  const len = length(v);
  if (len > speed) v = scale(v, speed / len);

  const moving = length(meanWant) > 0.05 || Math.abs(w) > 0.002;
  return {
    state,
    velocity: v,
    angularVelocity: w,
    scraping: state === 'dragging' && liftRule === 'drag' && moving,
    speed,
  };
}

/** Vận tốc của điểm nắm `r` khi món đồ có vận tốc `v` và vận tốc góc `w`. */
export const pointVelocity = (v: Vec, w: number, r: Vec): Vec => add(v, angularToLinear(w, r));
