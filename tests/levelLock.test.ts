import { describe, expect, it } from 'vitest';
import { isOpen, levelLock } from '../src/systems/levelLock';

const level = (minPlayers: number, unlockStars = 0, maxPlayers = 8) => ({
  minPlayers,
  maxPlayers,
  unlockStars,
});

describe('Khóa màn theo người và sao', () => {
  it('phòng 4 người: màn 🟠 (6) và 🔴 (8) khóa vì thiếu người; đủ 8 thì mở', () => {
    expect(levelLock(level(6), 4, 99).needPlayers).toBe(2);
    expect(levelLock(level(8), 4, 99).needPlayers).toBe(4);
    expect(isOpen(levelLock(level(4), 4, 99))).toBe(true);
    expect(isOpen(levelLock(level(8), 8, 99))).toBe(true);
  });

  it('thiếu sao và thiếu người là hai điều kiện độc lập', () => {
    expect(levelLock(level(8, 30), 8, 12)).toEqual({
      needPlayers: 0,
      extraPlayers: 0,
      needStars: 30,
    });
    expect(levelLock(level(8, 30), 4, 30)).toEqual({
      needPlayers: 4,
      extraPlayers: 0,
      needStars: 0,
    });
    expect(levelLock(level(8, 30), 4, 0)).toEqual({
      needPlayers: 4,
      extraPlayers: 0,
      needStars: 30,
    });
  });

  it('quá số người tối đa của màn cũng bị khóa', () => {
    expect(levelLock(level(1, 0, 4), 6, 0).extraPlayers).toBe(2);
  });
});
