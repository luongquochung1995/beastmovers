import type { DialogueEvent } from '../data/types';

/**
 * Chọn câu thoại cho chủ nhà (thuần). Trả về số thứ tự câu, không phải chữ: mỗi máy tự hiện
 * câu đó bằng ngôn ngữ của mình (khi chơi online chỉ cần gửi sự kiện + số thứ tự).
 *
 * - Mỗi loại sự kiện có thời gian chờ riêng (`cooldownSec`, mặc định `default`).
 * - Giữa hai câu bất kỳ cách nhau ít nhất `MIN_GAP_MS` (trừ các sự kiện quan trọng).
 * - Một câu không được nói quá `MAX_REPEATS` lần trong `REPEAT_WINDOW_MS`; hết câu thì im lặng.
 * - Ưu tiên câu lâu chưa nói nhất.
 */
export const MIN_GAP_MS = 1500;
export const MAX_REPEATS = 2;
export const REPEAT_WINDOW_MS = 5 * 60_000;

/** Sự kiện luôn được nói (bỏ qua khoảng cách tối thiểu giữa hai câu). */
const PRIORITY: ReadonlySet<DialogueEvent> = new Set([
  'levelStart',
  'levelEnd',
  'timeLow',
  'changeMind',
]);

export class DialogueDirector {
  private readonly lastEventAt = new Map<DialogueEvent, number>();
  private readonly uses = new Map<string, number[]>();
  private lastAnyAt = -Infinity;

  constructor(
    /** Số câu có cho mỗi sự kiện. */
    private readonly lineCounts: Partial<Record<DialogueEvent, number>>,
    private readonly cooldownSec: Record<string, number>,
    private readonly random: () => number = Math.random,
  ) {}

  private cooldownMs(event: DialogueEvent): number {
    return (this.cooldownSec[event] ?? this.cooldownSec.default ?? 4) * 1000;
  }

  /** Số lần câu (event, i) đã được nói trong cửa sổ thời gian gần nhất. */
  usesOf(event: DialogueEvent, index: number, nowMs: number): number[] {
    const key = `${event}#${index}`;
    const recent = (this.uses.get(key) ?? []).filter((t) => nowMs - t < REPEAT_WINDOW_MS);
    this.uses.set(key, recent);
    return recent;
  }

  /** Chọn câu cho sự kiện, hoặc null nếu chưa nên nói. */
  pick(event: DialogueEvent, nowMs: number): number | null {
    const count = this.lineCounts[event] ?? 0;
    if (count === 0) return null;
    const last = this.lastEventAt.get(event) ?? -Infinity;
    if (nowMs - last < this.cooldownMs(event)) return null;
    if (!PRIORITY.has(event) && nowMs - this.lastAnyAt < MIN_GAP_MS) return null;

    let best: number[] = [];
    let bestLast = Infinity;
    for (let i = 0; i < count; i++) {
      const used = this.usesOf(event, i, nowMs);
      if (used.length >= MAX_REPEATS) continue;
      const lastUse = used.length ? used[used.length - 1]! : -Infinity;
      if (lastUse < bestLast) {
        bestLast = lastUse;
        best = [i];
      } else if (lastUse === bestLast) {
        best.push(i);
      }
    }
    if (best.length === 0) return null;
    const index = best[Math.floor(this.random() * best.length)]!;
    this.uses.get(`${event}#${index}`)!.push(nowMs);
    this.lastEventAt.set(event, nowMs);
    this.lastAnyAt = nowMs;
    return index;
  }
}

/** Độ hài lòng sau một sự kiện (kẹp 0..100). Đồ "yêu thích" của chủ nhà tính gấp đôi. */
export function applySatisfaction(current: number, delta: number, favorite = false): number {
  const d = favorite ? delta * 2 : delta;
  return Math.max(0, Math.min(100, current + d));
}

/** Mặt chủ nhà theo độ hài lòng. */
export function moodFace(satisfaction: number): string {
  if (satisfaction < 20) return '😡';
  if (satisfaction < 40) return '😠';
  if (satisfaction < 60) return '😐';
  if (satisfaction < 80) return '🙂';
  return '😊';
}
