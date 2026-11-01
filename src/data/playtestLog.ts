/**
 * Nhật ký chơi thử (P39): mỗi lần xong một màn ghi một dòng vào localStorage của máy này,
 * xuất ra file JSON trong Cài đặt để gom số liệu cân bằng (thời gian, sao, đồ vỡ… theo số người).
 * Không gửi đi đâu. Lỗi lưu trữ thì bỏ qua.
 */
export const PLAYTEST_KEY = 'beast-movers-playtest-v1';
/** Giữ tối đa chừng này lần chơi gần nhất. */
export const PLAYTEST_MAX = 300;

export interface PlaytestEntry {
  /** Thời điểm (ISO). */
  at: string;
  version: string;
  levelId: string;
  players: number;
  /** Chơi chung máy, host hay máy khách online. */
  mode: 'local' | 'host' | 'client';
  /** Loại điều khiển trên máy này (bàn phím, tay cầm, cảm ứng). */
  inputs: string[];
  passed: boolean;
  stars: number;
  score: number;
  starGoals: number[];
  seconds: number;
  timeLimitSec: number;
  requiredLoaded: number;
  requiredTotal: number;
  broken: number;
  throws: number;
  satisfaction: number;
}

type MaybeStorage = Storage | undefined;
const defaultStorage = (): MaybeStorage => {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
};

export function loadPlaytestLog(storage: MaybeStorage = defaultStorage()): PlaytestEntry[] {
  try {
    const raw = storage?.getItem(PLAYTEST_KEY);
    const list = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(list) ? (list as PlaytestEntry[]) : [];
  } catch {
    return [];
  }
}

export function appendPlaytest(e: PlaytestEntry, storage: MaybeStorage = defaultStorage()): void {
  try {
    const list = [...loadPlaytestLog(storage), e].slice(-PLAYTEST_MAX);
    storage?.setItem(PLAYTEST_KEY, JSON.stringify(list));
  } catch {
    // hết chỗ / bị chặn: bỏ qua
  }
}

/** Tóm tắt theo màn × số người: số lần, tỉ lệ qua màn, sao và thời gian trung bình. */
export function summarize(list: readonly PlaytestEntry[]) {
  const groups = new Map<string, PlaytestEntry[]>();
  for (const e of list) {
    const k = `${e.levelId}@${e.players}`;
    groups.set(k, [...(groups.get(k) ?? []), e]);
  }
  return [...groups.entries()].map(([key, g]) => {
    const avg = (f: (e: PlaytestEntry) => number) =>
      Math.round((g.reduce((s, e) => s + f(e), 0) / g.length) * 10) / 10;
    return {
      key,
      runs: g.length,
      passRate: avg((e) => (e.passed ? 100 : 0)),
      avgStars: avg((e) => e.stars),
      avgSeconds: avg((e) => e.seconds),
      avgBroken: avg((e) => e.broken),
    };
  });
}

/** Tải nhật ký về máy dưới dạng file JSON (kèm bảng tóm tắt). */
export function downloadPlaytestLog(): number {
  const list = loadPlaytestLog();
  const blob = new Blob([JSON.stringify({ summary: summarize(list), runs: list }, null, 2)], {
    type: 'application/json',
  });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `beast-movers-playtest-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  return list.length;
}
