import { describe, expect, it } from 'vitest';
import type { ItemDef } from '../src/data/types';
import {
  applyDamage,
  applyImpact,
  breakThreshold,
  DAMAGE_COOLDOWN_MS,
  type DamageState,
  dropImpact,
  impactSpeed,
  tickCooldown,
} from '../src/systems/damage';

const fresh = (durability: number): DamageState => ({ durability, broken: false, cooldownMs: 0 });

describe('damage', () => {
  it('va dưới ngưỡng thì không sao', () => {
    expect(applyImpact(fresh(3), 3.9, 4).damaged).toBe(false);
  });

  it('gương độ bền 3: ba cú va mạnh thì vỡ', () => {
    let s = fresh(3);
    const results: boolean[] = [];
    for (let i = 0; i < 3; i++) {
      const r = applyImpact(s, 11, 4);
      expect(r.damaged).toBe(true);
      results.push(r.broke);
      s = tickCooldown(r.state, DAMAGE_COOLDOWN_MS);
    }
    expect(results).toEqual([false, false, true]);
    expect(s.broken).toBe(true);
  });

  it('một cú va có nhiều điểm chạm chỉ tính một lần', () => {
    const first = applyImpact(fresh(3), 10, 4);
    const second = applyImpact(first.state, 10, 4);
    expect(second.damaged).toBe(false);
    expect(second.state.durability).toBe(2);
  });

  it('đã vỡ thì không trừ nữa', () => {
    expect(applyDamage({ durability: 0, broken: true, cooldownMs: 0 }, 1).damaged).toBe(false);
  });

  it('tốc độ va chỉ tính theo pháp tuyến', () => {
    expect(impactSpeed({ x: 10, y: 3 }, { x: 0, y: 0 }, { x: 1, y: 0 })).toBe(10);
    expect(impactSpeed({ x: 0, y: 5 }, { x: 0, y: 0 }, { x: 1, y: 0 })).toBe(0);
  });

  it('ngưỡng mặc định theo dễ vỡ, rơi đồ nặng mạnh hơn', () => {
    expect(breakThreshold({ fragile: true } as ItemDef)).toBe(4);
    expect(breakThreshold({ breakImpulse: 9 } as ItemDef)).toBe(9);
    expect(dropImpact(500)).toBeGreaterThan(dropImpact(250));
  });
});
