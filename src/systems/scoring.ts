/**
 * Tính điểm, sao và danh hiệu cuối màn (thuần).
 *
 * Điểm = Σ giá trị đồ lên xe (đồ vỡ không tính) − Σ tiền đền đồ hỏng
 *      + độ hài lòng × hệ số màn + thưởng nếu đủ đồ bắt buộc.
 */
export const REQUIRED_BONUS = 200;

export interface ScoreItem {
  value: number;
  repairCost: number;
  broken: boolean;
  loaded: boolean;
}

export interface ScoreInput {
  items: readonly ScoreItem[];
  satisfaction: number;
  satisfactionMultiplier: number;
  /** Mốc điểm cho 1, 2, 3 sao. */
  stars: readonly number[];
  passed: boolean;
}

export interface ScoreBreakdown {
  loadedValue: number;
  repairCosts: number;
  satisfactionBonus: number;
  requiredBonus: number;
  total: number;
  stars: number;
}

export function computeScore(input: ScoreInput): ScoreBreakdown {
  const loadedValue = input.items
    .filter((i) => i.loaded && !i.broken)
    .reduce((s, i) => s + i.value, 0);
  const repairCosts = input.items.filter((i) => i.broken).reduce((s, i) => s + i.repairCost, 0);
  const satisfactionBonus = Math.round(input.satisfaction * input.satisfactionMultiplier);
  const requiredBonus = input.passed ? REQUIRED_BONUS : 0;
  const total = Math.max(0, loadedValue - repairCosts + satisfactionBonus + requiredBonus);
  const stars = input.passed ? input.stars.filter((s) => total >= s).length : 0;
  return { loadedValue, repairCosts, satisfactionBonus, requiredBonus, total, stars };
}

// ---------- Danh hiệu ----------

export interface PlayerStats {
  slot: number;
  /** Tổng thời gian đang nắm/khiêng đồ (ms). */
  carriedMs: number;
  grabs: number;
  throws: number;
  /** Số món vỡ mà người này là người chạm cuối. */
  broken: number;
  /** Số món đưa lên xe có góp tay. */
  loaded: number;
  catsCaught: number;
  /** Số lần buông tay làm rơi đồ đang khiêng chung. */
  letGo: number;
}

export function emptyStats(slot: number): PlayerStats {
  return { slot, carriedMs: 0, grabs: 0, throws: 0, broken: 0, loaded: 0, catsCaught: 0, letGo: 0 };
}

export type TitleKey =
  'clumsy' | 'catWhisperer' | 'firstToLetGo' | 'thrower' | 'backbone' | 'spectator' | 'mover';

interface TitleRule {
  key: TitleKey;
  /** Điểm để so ai xứng đáng nhất; null = không đủ điều kiện. */
  score(s: PlayerStats, all: readonly PlayerStats[]): number | null;
}

/** Thứ tự ưu tiên: danh hiệu "đặc sắc" trước, danh hiệu chung sau. */
const RULES: TitleRule[] = [
  { key: 'clumsy', score: (s) => (s.broken >= 1 ? s.broken : null) },
  { key: 'catWhisperer', score: (s) => (s.catsCaught >= 1 ? s.catsCaught : null) },
  { key: 'firstToLetGo', score: (s) => (s.letGo >= 1 ? s.letGo : null) },
  { key: 'thrower', score: (s) => (s.throws >= 2 ? s.throws : null) },
  { key: 'backbone', score: (s) => (s.carriedMs > 0 ? s.carriedMs : null) },
  {
    key: 'spectator',
    // Chỉ khi chơi nhiều người: người ít động tay nhất.
    score: (s, all) => (all.length >= 2 ? -(s.carriedMs + s.grabs * 1000) : null),
  },
];

/** Mỗi người một danh hiệu; ai không hợp danh hiệu nào thì là "Dân chuyên nghiệp". */
export function assignTitles(stats: readonly PlayerStats[]): Map<number, TitleKey> {
  const out = new Map<number, TitleKey>();
  for (const rule of RULES) {
    let best: PlayerStats | null = null;
    let bestScore = -Infinity;
    for (const s of stats) {
      if (out.has(s.slot)) continue;
      const sc = rule.score(s, stats);
      if (sc !== null && sc > bestScore) {
        bestScore = sc;
        best = s;
      }
    }
    if (best) out.set(best.slot, rule.key);
  }
  for (const s of stats) if (!out.has(s.slot)) out.set(s.slot, 'mover');
  return out;
}
