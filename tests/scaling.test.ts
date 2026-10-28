import { describe, expect, it } from 'vitest';
import type { LevelDef } from '../src/data/types';
import { MIN_TIME_SEC, scaleLevel } from '../src/systems/scaling';

const level = {
  id: 'lv_test',
  stars: [500, 900, 1300],
  timeLimitSec: 300,
  truck: { x: 0, y: 0, slots: 20, hasHandbrake: false },
  spawns: [{ item: 'box', x: 200, y: 200, required: true }],
  scaling: {
    basePlayers: 2,
    extraSpawnsPerPlayer: [
      { item: 'box', count: 2 },
      { item: 'plant', count: 1 },
    ],
    timeDeltaPerPlayerSec: -10,
    starsPerExtraPlayer: [100, 200, 300],
    truckSlotsPerPlayer: 3,
  },
} as unknown as LevelDef;
const map = {
  width: 1000,
  height: 800,
  floors: [
    { rect: { x: 0, y: 0, w: 600, h: 800 }, color: 0, outdoor: false },
    { rect: { x: 600, y: 0, w: 400, h: 800 }, color: 0, outdoor: true },
  ],
  walls: [{ x: 290, y: 0, w: 20, h: 800 }],
  doors: [],
};
const items = new Map([
  ['box', { size: { w: 40, h: 40 } }],
  ['plant', { size: { w: 30, h: 30 } }],
]);

describe('Co giãn theo số người', () => {
  it('không vượt số người gốc thì giữ nguyên màn', () => {
    expect(scaleLevel(level, map, 1, items)).toBe(level);
    expect(scaleLevel(level, map, 2, items)).toBe(level);
  });

  it('mỗi người thêm: thêm đồ thưởng, bớt giờ, nâng sao, thêm chỗ xe', () => {
    const s = scaleLevel(level, map, 5, items); // 3 người thêm
    expect(s.spawns.length).toBe(1 + 3 * 3);
    expect(s.spawns.slice(1).every((sp) => !sp.required)).toBe(true);
    expect(s.timeLimitSec).toBe(270);
    expect(s.stars).toEqual([800, 1500, 2200]);
    expect(s.truck.slots).toBe(29);
    expect(level.spawns.length).toBe(1); // không sửa màn gốc
  });

  it('đồ thêm nằm trong nhà, không đè tường, không chồng lên nhau; host và máy khách ra giống hệt', () => {
    const a = scaleLevel(level, map, 8, items);
    expect(scaleLevel(level, map, 8, items)).toEqual(a);
    const extra = a.spawns.slice(1);
    for (const sp of extra) {
      expect(sp.x).toBeLessThan(600);
      expect(sp.x < 290 - 20 || sp.x > 310 + 20).toBe(true);
    }
    for (let i = 0; i < a.spawns.length; i++)
      for (let j = i + 1; j < a.spawns.length; j++) {
        const p = a.spawns[i]!;
        const q = a.spawns[j]!;
        expect(Math.hypot(p.x - q.x, p.y - q.y)).toBeGreaterThan(40);
      }
  });

  it('thời gian không ngắn hơn mức tối thiểu', () => {
    const fast = { ...level, timeLimitSec: 100 } as LevelDef;
    expect(scaleLevel(fast, map, 8, items).timeLimitSec).toBe(MIN_TIME_SEC);
  });
});
