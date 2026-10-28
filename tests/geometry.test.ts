import { describe, expect, it } from 'vitest';
import type { ItemDef } from '../src/data/types';
import {
  angularToLinear,
  closestPointOnPolygon,
  pointInConvexPolygon,
  rotate,
} from '../src/systems/geometry';
import { resolveGrabPoints } from '../src/systems/grabPoints';

const square = [
  { x: -10, y: -10 },
  { x: 10, y: -10 },
  { x: 10, y: 10 },
  { x: -10, y: 10 },
];

describe('geometry', () => {
  it('điểm gần nhất trên viền', () => {
    expect(closestPointOnPolygon({ x: 30, y: 0 }, square)).toEqual({ x: 10, y: 0 });
    expect(closestPointOnPolygon({ x: 30, y: 30 }, square)).toEqual({ x: 10, y: 10 });
  });

  it('điểm trong đa giác', () => {
    expect(pointInConvexPolygon({ x: 0, y: 0 }, square)).toBe(true);
    expect(pointInConvexPolygon({ x: 11, y: 0 }, square)).toBe(false);
  });

  it('xoay 90 độ', () => {
    const r = rotate({ x: 1, y: 0 }, Math.PI / 2);
    expect(r.x).toBeCloseTo(0);
    expect(r.y).toBeCloseTo(1);
  });

  it('ω × r', () => {
    expect(angularToLinear(1, { x: 1, y: 0 })).toEqual({ x: -0, y: 1 });
  });
});

const def = (over: Partial<ItemDef>): ItemDef =>
  ({
    id: 't',
    name: { en: 't', vi: 't' },
    size: { w: 100, h: 40 },
    mass: 1,
    friction: 0.3,
    requiredGrabbers: 1,
    liftRule: 'free',
    value: 0,
    durability: 1,
    repairCost: 0,
    truckSlots: 1,
    ...over,
  }) as ItemDef;

describe('resolveGrabPoints', () => {
  it('dùng điểm trong data nếu có', () => {
    expect(resolveGrabPoints(def({ grabPoints: [[1, 2]] }))).toEqual([{ x: 1, y: 2 }]);
  });

  it('đồ 1 người: giữa 4 cạnh', () => {
    expect(resolveGrabPoints(def({}))).toHaveLength(4);
  });

  it('đồ nhiều người: đủ số điểm, chia hai cạnh dài', () => {
    for (const n of [2, 3, 4, 6, 8]) {
      const pts = resolveGrabPoints(def({ requiredGrabbers: n }));
      expect(pts.length).toBeGreaterThanOrEqual(n);
      expect(pts.every((p) => Math.abs(p.y) === 20)).toBe(true);
    }
  });

  it('hình tròn: chia đều quanh viền', () => {
    const pts = resolveGrabPoints(def({ shape: 'circle', size: { w: 30, h: 30 } }));
    expect(pts).toHaveLength(4);
    for (const p of pts) expect(Math.hypot(p.x, p.y)).toBeCloseTo(15);
  });
});
