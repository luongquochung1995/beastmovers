import { describe, expect, it } from 'vitest';
import {
  appendPlaytest,
  loadPlaytestLog,
  PLAYTEST_MAX,
  type PlaytestEntry,
  summarize,
} from '../src/data/playtestLog';

function memoryStorage(): Storage {
  const m = new Map<string, string>();
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, v),
    removeItem: (k) => void m.delete(k),
    clear: () => m.clear(),
    key: () => null,
    get length() {
      return m.size;
    },
  };
}

const run = (levelId: string, players: number, passed: boolean, stars: number, seconds: number) =>
  ({
    at: '2026-11-01T00:00:00Z',
    version: '0.1.0',
    levelId,
    players,
    mode: 'local',
    inputs: ['keyboard'],
    passed,
    stars,
    score: 1000,
    starGoals: [500, 900, 1300],
    seconds,
    timeLimitSec: 300,
    requiredLoaded: passed ? 3 : 1,
    requiredTotal: 3,
    broken: 1,
    throws: 2,
    satisfaction: 50,
  }) satisfies PlaytestEntry;

describe('Nhật ký chơi thử', () => {
  it('ghi thêm, giữ số lần gần nhất, tóm tắt theo màn × số người', () => {
    const s = memoryStorage();
    appendPlaytest(run('lv01', 1, true, 2, 200), s);
    appendPlaytest(run('lv01', 1, false, 0, 300), s);
    appendPlaytest(run('lv01', 4, true, 3, 150), s);
    expect(loadPlaytestLog(s)).toHaveLength(3);
    expect(summarize(loadPlaytestLog(s))).toEqual([
      { key: 'lv01@1', runs: 2, passRate: 50, avgStars: 1, avgSeconds: 250, avgBroken: 1 },
      { key: 'lv01@4', runs: 1, passRate: 100, avgStars: 3, avgSeconds: 150, avgBroken: 1 },
    ]);
    for (let i = 0; i < PLAYTEST_MAX + 5; i++) appendPlaytest(run('lv02', 2, true, 1, i), s);
    expect(loadPlaytestLog(s)).toHaveLength(PLAYTEST_MAX);
    expect(loadPlaytestLog(s).at(-1)!.seconds).toBe(PLAYTEST_MAX + 4);
  });

  it('trình duyệt chặn lưu trữ thì không ném lỗi', () => {
    const blocked = {
      getItem: () => {
        throw new Error('no');
      },
      setItem: () => {
        throw new Error('no');
      },
    } as unknown as Storage;
    expect(() => appendPlaytest(run('lv01', 1, true, 1, 1), blocked)).not.toThrow();
    expect(loadPlaytestLog(blocked)).toEqual([]);
  });
});
