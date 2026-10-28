import type { LevelDef } from '../data/types';

/** Biểu tượng từng cấp màn, theo thứ tự trong `TIERS`. */
export const TIER_ICONS: Record<LevelDef['tier'], string> = {
  solo: '🟢',
  duo: '🔵',
  team: '🟣',
  squad: '🟠',
  full: '🔴',
};

/**
 * Lý do một màn chưa chơi được. Hai điều kiện độc lập: đủ sao mà thiếu người vẫn chưa chơi
 * được, và ngược lại. Mọi giá trị 0 = không bị khóa vì lý do đó.
 */
export interface LevelLock {
  /** Cần thêm bao nhiêu người. */
  needPlayers: number;
  /** Thừa bao nhiêu người so với `maxPlayers`. */
  extraPlayers: number;
  /** Tổng sao cần có (`unlockStars`), 0 nếu đã đủ. */
  needStars: number;
}

export function levelLock(
  level: Pick<LevelDef, 'minPlayers' | 'maxPlayers' | 'unlockStars'>,
  players: number,
  stars: number,
): LevelLock {
  return {
    needPlayers: Math.max(0, level.minPlayers - players),
    extraPlayers: Math.max(0, players - level.maxPlayers),
    needStars: stars >= level.unlockStars ? 0 : level.unlockStars,
  };
}

export function isOpen(lock: LevelLock): boolean {
  return lock.needPlayers === 0 && lock.extraPlayers === 0 && lock.needStars === 0;
}
