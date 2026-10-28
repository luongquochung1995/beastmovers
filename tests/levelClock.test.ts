import { describe, expect, it } from 'vitest';
import {
  createClock,
  ENDING_MS,
  finishNow,
  formatClock,
  tickClock,
} from '../src/systems/levelClock';

describe('levelClock', () => {
  it('báo sắp hết giờ đúng một lần khi còn 60s', () => {
    let s = createClock(61);
    let r = tickClock(s, 500);
    expect(r.events).toEqual([]);
    s = r.state;
    r = tickClock(s, 600);
    expect(r.events).toEqual(['timeLow']);
    r = tickClock(r.state, 1000);
    expect(r.events).toEqual([]);
  });

  it('hết giờ → cảnh kết → xong', () => {
    let r = tickClock(createClock(1), 1000);
    expect(r.events).toContain('timeUp');
    expect(r.state.phase).toBe('ending');
    r = tickClock(r.state, ENDING_MS - 1);
    expect(r.state.phase).toBe('ending');
    r = tickClock(r.state, 1);
    expect(r.events).toEqual(['done']);
    expect(r.state.phase).toBe('done');
  });

  it('kết thúc sớm', () => {
    const s = finishNow(createClock(300));
    expect(s.phase).toBe('ending');
    expect(finishNow({ ...s, phase: 'done' }).phase).toBe('done');
  });

  it('định dạng m:ss, làm tròn lên', () => {
    expect(formatClock(300_000)).toBe('5:00');
    expect(formatClock(59_001)).toBe('1:00');
    expect(formatClock(9_500)).toBe('0:10');
    expect(formatClock(0)).toBe('0:00');
  });
});
