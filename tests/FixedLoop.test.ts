import { describe, expect, it } from 'vitest';
import { FixedLoop } from '../src/systems/FixedLoop';

function runFor(loop: FixedLoop, seconds: number, renderHz: number): number {
  let steps = 0;
  const frames = Math.round(seconds * renderHz);
  for (let i = 0; i < frames; i++) {
    loop.advance(1000 / renderHz, () => steps++);
  }
  return steps;
}

describe('FixedLoop', () => {
  it.each([30, 60, 75, 120, 144, 240])('chạy đúng 60 bước/giây khi màn hình %i Hz', (hz) => {
    const steps = runFor(new FixedLoop(60), 10, hz);
    expect(Math.abs(steps - 600)).toBeLessThanOrEqual(1);
  });

  it('truyền đúng độ dài bước cố định', () => {
    const loop = new FixedLoop(60);
    const seen = new Set<number>();
    loop.advance(100, (dt) => seen.add(dt));
    expect([...seen]).toEqual([1000 / 60]);
  });

  it('giới hạn số bước khi máy bị khựng và bỏ thời gian thừa', () => {
    const loop = new FixedLoop(60, 5);
    expect(loop.advance(2000, () => {})).toBe(5);
    expect(loop.alpha).toBe(0);
  });

  it('bỏ qua delta âm', () => {
    const loop = new FixedLoop(60);
    expect(loop.advance(-50, () => {})).toBe(0);
  });

  it('alpha nằm trong khoảng 0..1', () => {
    const loop = new FixedLoop(60);
    loop.advance(25, () => {});
    expect(loop.alpha).toBeGreaterThanOrEqual(0);
    expect(loop.alpha).toBeLessThan(1);
  });
});
