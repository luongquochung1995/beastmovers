import { describe, expect, it } from 'vitest';
import {
  applySatisfaction,
  DialogueDirector,
  MAX_REPEATS,
  MIN_GAP_MS,
  moodFace,
} from '../src/systems/dialogue';

const counts = { itemBroken: 5, wallHit: 5, levelStart: 2, timeLow: 1 };

describe('DialogueDirector', () => {
  it('chờ hết cooldown mới nói tiếp cùng loại', () => {
    const d = new DialogueDirector(counts, { default: 4, itemBroken: 2 }, () => 0);
    expect(d.pick('itemBroken', 0)).not.toBeNull();
    expect(d.pick('itemBroken', 1999)).toBeNull();
    expect(d.pick('itemBroken', 2000)).not.toBeNull();
  });

  it('hai câu bất kỳ cách nhau tối thiểu, trừ sự kiện quan trọng', () => {
    const d = new DialogueDirector(counts, { default: 0 }, () => 0);
    expect(d.pick('itemBroken', 0)).not.toBeNull();
    expect(d.pick('wallHit', MIN_GAP_MS - 1)).toBeNull();
    expect(d.pick('timeLow', MIN_GAP_MS - 1)).not.toBeNull();
  });

  it('xoay vòng: ưu tiên câu chưa nói', () => {
    const d = new DialogueDirector(counts, { default: 0 }, () => 0);
    const seen = new Set<number>();
    for (let k = 0; k < 5; k++) seen.add(d.pick('itemBroken', k * 10_000)!);
    expect(seen.size).toBe(5);
  });

  it('5 phút liên tục có sự kiện: không câu nào quá 2 lần, hết câu thì im lặng', () => {
    const d = new DialogueDirector(counts, { default: 0 }, Math.random);
    const said = new Map<number, number>();
    let silent = 0;
    for (let t = 0; t < 5 * 60_000; t += 2000) {
      const i = d.pick('itemBroken', t);
      if (i === null) silent++;
      else said.set(i, (said.get(i) ?? 0) + 1);
    }
    expect(Math.max(...said.values())).toBeLessThanOrEqual(MAX_REPEATS);
    expect([...said.values()].reduce((a, b) => a + b, 0)).toBe(5 * MAX_REPEATS);
    expect(silent).toBeGreaterThan(0);
  });

  it('sự kiện không có câu thì im', () => {
    expect(new DialogueDirector(counts, { default: 0 }).pick('catEscaped', 0)).toBeNull();
  });
});

describe('độ hài lòng', () => {
  it('kẹp 0..100, đồ yêu thích gấp đôi', () => {
    expect(applySatisfaction(50, -15)).toBe(35);
    expect(applySatisfaction(50, -15, true)).toBe(20);
    expect(applySatisfaction(5, -15)).toBe(0);
    expect(applySatisfaction(99, 5)).toBe(100);
  });
  it('mặt theo mức hài lòng', () => {
    expect(moodFace(10)).toBe('😡');
    expect(moodFace(50)).toBe('😐');
    expect(moodFace(90)).toBe('😊');
  });
});
