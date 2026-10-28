import { add, dist, length, normalize, scale, sub, type Vec } from './geometry';

/**
 * "Não" của mèo (thuần, không phụ thuộc Phaser).
 * - wander: đi lang thang chậm, thỉnh thoảng đổi hướng.
 * - flee: có người lại gần → chạy ra xa, lạng sang hai bên cho khó bắt.
 * - hide: chạy tới chỗ nấp an toàn hơn rồi nằm im, người tới sát mới chạy tiếp.
 * - stunned: bị lao trúng → choáng, đứng im một lúc (dễ bắt).
 * Mèo đang bị bế hoặc đang trong lồng thì World không gọi tới đây.
 */
export type CatMode = 'wander' | 'flee' | 'hide' | 'stunned';

export interface CatParams {
  /** Tốc độ chạy trốn (px/bước). */
  speed: number;
  /** Người trong bán kính này thì chạy. */
  fleeRadius: number;
  wanderSpeed: number;
  /** Đang nấp: người tới gần hơn mức này mới bỏ chạy. */
  hideAlertRadius: number;
  /** Chỉ chạy tới chỗ nấp trong khoảng cách này. */
  hideSearchRadius: number;
  stunMs: number;
  /** Xác suất né được một cú lao (quyết định một lần cho mỗi cú lao). */
  dodgeChance: number;
}

export const DEFAULT_CAT: Omit<CatParams, 'speed' | 'fleeRadius'> = {
  wanderSpeed: 1.1,
  hideAlertRadius: 120,
  hideSearchRadius: 320,
  stunMs: 1200,
  dodgeChance: 0.75,
};

/** Thấy người lao tới trong bán kính này thì tính chuyện né. */
const DODGE_RADIUS = 150;

export interface CatState {
  mode: CatMode;
  modeMs: number;
  wanderDir: Vec;
  wanderLeftMs: number;
  hideTarget: Vec | null;
  /** Pha lạng ngang khi chạy trốn. */
  jukePhase: number;
  /** Các cú lao đã xét (theo id người lao) và kết quả: true = né được. */
  dodges: Record<number, boolean>;
}

export interface Dasher {
  id: number;
  pos: Vec;
  /** Hướng lao (độ dài 1). */
  dir: Vec;
}

export interface CatSenses {
  pos: Vec;
  /** Vị trí những người đang đứng (người đang ngã không đáng sợ). */
  threats: readonly Vec[];
  hideSpots: readonly Vec[];
  /** Có được nấp không (`ai.hideSpots` trong data). */
  canHide: boolean;
  /** Người đang lao. */
  dashers?: readonly Dasher[];
}

export function createCatState(): CatState {
  return {
    mode: 'wander',
    modeMs: 0,
    wanderDir: { x: 1, y: 0 },
    wanderLeftMs: 0,
    hideTarget: null,
    jukePhase: 0,
    dodges: {},
  };
}

export function stunCat(state: CatState): CatState {
  return { ...state, mode: 'stunned', modeMs: 0, hideTarget: null };
}

function nearestThreat(pos: Vec, threats: readonly Vec[]): number {
  return threats.reduce((m, t) => Math.min(m, dist(pos, t)), Infinity);
}

/** Hướng chạy xa mọi người (người càng gần càng đáng sợ). */
export function fleeDirection(pos: Vec, threats: readonly Vec[]): Vec {
  let d = { x: 0, y: 0 };
  for (const t of threats) {
    const away = sub(pos, t);
    const len = Math.max(1, length(away));
    d = add(d, scale(away, 1 / (len * len)));
  }
  return normalize(d);
}

/** Chỗ nấp tốt nhất: trong tầm chạy, và mọi người ở xa chỗ đó hơn là ở xa mèo bây giờ. */
export function pickHideSpot(
  pos: Vec,
  threats: readonly Vec[],
  spots: readonly Vec[],
  searchRadius: number,
): Vec | null {
  const now = nearestThreat(pos, threats);
  let best: Vec | null = null;
  let bestScore = -Infinity;
  for (const s of spots) {
    const d = dist(pos, s);
    if (d > searchRadius || d < 5) continue;
    const safety = nearestThreat(s, threats);
    if (safety <= now) continue;
    // Không chạy xuyên qua người: người phải ở xa đường chạy hơn mèo.
    const score = safety - d * 0.5;
    if (score > bestScore) {
      bestScore = score;
      best = s;
    }
  }
  return best;
}

export function stepCat(
  state: CatState,
  senses: CatSenses,
  dtMs: number,
  params: CatParams,
  random: () => number,
): { state: CatState; velocity: Vec } {
  const s: CatState = { ...state, modeMs: state.modeMs + dtMs };
  const still = { x: 0, y: 0 };
  const threat = nearestThreat(senses.pos, senses.threats);

  if (s.mode === 'stunned') {
    if (s.modeMs < params.stunMs) return { state: s, velocity: still };
    s.mode = 'flee';
    s.modeMs = 0;
  }

  // Né cú lao: người đang lao về phía mèo → lạng vuông góc với hướng lao (có lúc không kịp).
  const dodges: Record<number, boolean> = {};
  let dodge: Vec | null = null;
  for (const d of senses.dashers ?? []) {
    const toCat = sub(senses.pos, d.pos);
    const ahead = toCat.x * d.dir.x + toCat.y * d.dir.y;
    if (length(toCat) > DODGE_RADIUS || ahead <= 0) continue;
    const ok = s.dodges[d.id] ?? random() < params.dodgeChance;
    dodges[d.id] = ok;
    if (ok && !dodge) {
      // Né sang phía mèo đang lệch so với đường lao.
      const side = { x: -d.dir.y, y: d.dir.x };
      const sign = toCat.x * side.x + toCat.y * side.y >= 0 ? 1 : -1;
      dodge = scale(side, sign);
    }
  }
  s.dodges = dodges;
  if (dodge) {
    s.hideTarget = null;
    if (s.mode === 'hide') s.mode = 'flee';
    return { state: s, velocity: scale(dodge, params.speed * 1.3) };
  }

  if (s.mode === 'hide' && s.hideTarget) {
    const d = dist(senses.pos, s.hideTarget);
    if (threat < params.hideAlertRadius) {
      s.mode = 'flee';
      s.modeMs = 0;
      s.hideTarget = null;
    } else if (d > 6) {
      const dir = normalize(sub(s.hideTarget, senses.pos));
      return { state: s, velocity: scale(dir, params.speed) };
    } else {
      // Đã tới chỗ nấp: nằm im.
      return { state: s, velocity: still };
    }
  }

  if (threat < params.fleeRadius) {
    if (senses.canHide) {
      const spot = pickHideSpot(
        senses.pos,
        senses.threats,
        senses.hideSpots,
        params.hideSearchRadius,
      );
      if (spot) {
        s.mode = 'hide';
        s.modeMs = 0;
        s.hideTarget = spot;
        return { state: s, velocity: scale(normalize(sub(spot, senses.pos)), params.speed) };
      }
    }
    if (s.mode !== 'flee') {
      s.mode = 'flee';
      s.modeMs = 0;
    }
    s.jukePhase += dtMs * 0.012;
    const away = fleeDirection(senses.pos, senses.threats);
    const side = { x: -away.y, y: away.x };
    const juke = Math.sin(s.jukePhase) * 0.6;
    return { state: s, velocity: scale(normalize(add(away, scale(side, juke))), params.speed) };
  }

  // Không ai ở gần: lang thang.
  if (s.mode !== 'wander') {
    s.mode = 'wander';
    s.modeMs = 0;
    s.wanderLeftMs = 0;
  }
  s.wanderLeftMs -= dtMs;
  if (s.wanderLeftMs <= 0) {
    const a = random() * Math.PI * 2;
    s.wanderDir = { x: Math.cos(a), y: Math.sin(a) };
    s.wanderLeftMs = 1000 + random() * 1500;
  }
  // Một phần ba thời gian ngồi liếm lông.
  const resting = s.wanderLeftMs % 2500 < 800;
  return { state: s, velocity: resting ? still : scale(s.wanderDir, params.wanderSpeed) };
}
