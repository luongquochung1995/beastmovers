import { describe, expect, it } from 'vitest';
import {
  assignTitles,
  computeScore,
  emptyStats,
  type PlayerStats,
  REQUIRED_BONUS,
} from '../src/systems/scoring';

const item = (
  value: number,
  over: Partial<{ repairCost: number; broken: boolean; loaded: boolean }> = {},
) => ({
  value,
  repairCost: 0,
  broken: false,
  loaded: true,
  ...over,
});

describe('computeScore', () => {
  it('cộng đồ lên xe, trừ tiền đền, thưởng hài lòng và đủ đồ bắt buộc', () => {
    const r = computeScore({
      items: [
        item(300),
        item(200, { loaded: false }),
        item(150, { broken: true, repairCost: 120 }),
      ],
      satisfaction: 40,
      satisfactionMultiplier: 5,
      stars: [300, 500, 700],
      passed: true,
    });
    expect(r).toEqual({
      loadedValue: 300,
      repairCosts: 120,
      satisfactionBonus: 200,
      requiredBonus: REQUIRED_BONUS,
      total: 580,
      stars: 2,
    });
  });

  it('thua thì 0 sao, không thưởng; điểm không âm', () => {
    const r = computeScore({
      items: [item(10, { broken: true, repairCost: 500 })],
      satisfaction: 0,
      satisfactionMultiplier: 5,
      stars: [1, 2, 3],
      passed: false,
    });
    expect(r.total).toBe(0);
    expect(r.stars).toBe(0);
    expect(r.requiredBonus).toBe(0);
  });
});

describe('assignTitles', () => {
  const s = (slot: number, over: Partial<PlayerStats>): PlayerStats => ({
    ...emptyStats(slot),
    ...over,
  });

  it('mỗi người một danh hiệu khác nhau theo thành tích', () => {
    const t = assignTitles([
      s(0, { broken: 3, carriedMs: 5000 }),
      s(1, { catsCaught: 1, carriedMs: 2000 }),
      s(2, { carriedMs: 90_000, grabs: 10 }),
      s(3, { carriedMs: 100, grabs: 1 }),
    ]);
    expect(t.get(0)).toBe('clumsy');
    expect(t.get(1)).toBe('catWhisperer');
    expect(t.get(2)).toBe('backbone');
    expect(t.get(3)).toBe('spectator');
  });

  it('chơi một mình thì không có "kẻ đứng nhìn"', () => {
    expect(assignTitles([s(0, {})]).get(0)).toBe('mover');
    expect(assignTitles([s(0, { carriedMs: 10 })]).get(0)).toBe('backbone');
  });

  it('người còn lại nhận danh hiệu chung', () => {
    const t = assignTitles([
      s(0, { throws: 5, carriedMs: 10 }),
      s(1, { carriedMs: 999 }),
      s(2, { carriedMs: 5 }),
      s(3, {}),
    ]);
    expect(t.get(0)).toBe('thrower');
    expect(t.get(1)).toBe('backbone');
    expect(new Set(t.values()).size).toBe(4);
  });
});
