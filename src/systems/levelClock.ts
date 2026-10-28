/**
 * Đồng hồ màn chơi (thuần): đếm ngược → hết giờ (khóa điều khiển, xe chạy đi) → xong.
 */
export type LevelPhase = 'playing' | 'ending' | 'done';
export type ClockEvent = 'timeLow' | 'timeUp' | 'done';

/** Còn bao nhiêu thì báo "sắp hết giờ". */
export const TIME_LOW_MS = 60_000;
/** Thời gian cảnh xe chạy đi sau khi hết giờ. */
export const ENDING_MS = 3_000;

export interface ClockState {
  phase: LevelPhase;
  timeLeftMs: number;
  endingMs: number;
  timeLowSent: boolean;
}

export function createClock(limitSec: number): ClockState {
  return { phase: 'playing', timeLeftMs: limitSec * 1000, endingMs: 0, timeLowSent: false };
}

export function tickClock(
  state: ClockState,
  dtMs: number,
): { state: ClockState; events: ClockEvent[] } {
  const s = { ...state };
  const events: ClockEvent[] = [];
  if (s.phase === 'playing') {
    s.timeLeftMs = Math.max(0, s.timeLeftMs - dtMs);
    if (!s.timeLowSent && s.timeLeftMs <= TIME_LOW_MS) {
      s.timeLowSent = true;
      events.push('timeLow');
    }
    if (s.timeLeftMs === 0) {
      s.phase = 'ending';
      events.push('timeUp');
    }
  } else if (s.phase === 'ending') {
    s.endingMs += dtMs;
    if (s.endingMs >= ENDING_MS) {
      s.phase = 'done';
      events.push('done');
    }
  }
  return { state: s, events };
}

/** Kết thúc sớm (cả đội bấm xong / Esc): chuyển ngay sang cảnh xe chạy. */
export function finishNow(state: ClockState): ClockState {
  return state.phase === 'playing' ? { ...state, phase: 'ending', endingMs: 0 } : state;
}

/** "m:ss" cho HUD. */
export function formatClock(ms: number): string {
  const total = Math.ceil(ms / 1000);
  const m = Math.floor(total / 60);
  const sec = total % 60;
  return `${m}:${sec.toString().padStart(2, '0')}`;
}
