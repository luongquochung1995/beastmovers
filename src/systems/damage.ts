import type { ItemDef } from '../data/types';
import { dot, sub, type Vec } from './geometry';

/** Ngưỡng tốc độ va chạm mặc định (px/bước) nếu data không ghi `breakImpulse`. */
export const DEFAULT_BREAK_FRAGILE = 4;
export const DEFAULT_BREAK_NORMAL = 7;
/** Một món đồ không bị trừ độ bền hai lần trong khoảng này (một cú va có nhiều điểm chạm). */
export const DAMAGE_COOLDOWN_MS = 250;
/** Va vào tường nhanh hơn mức này thì tính là "đập tường" (chủ nhà chê). */
export const WALL_HIT_SPEED = 3;

export function breakThreshold(def: ItemDef): number {
  return def.breakImpulse ?? (def.fragile ? DEFAULT_BREAK_FRAGILE : DEFAULT_BREAK_NORMAL);
}

/** Tốc độ va theo phương pháp tuyến (bỏ phần trượt dọc bề mặt). */
export function impactSpeed(velA: Vec, velB: Vec, normal: Vec): number {
  return Math.abs(dot(sub(velA, velB), normal));
}

/**
 * Đồ đang khiêng bị rơi: coi như một cú va có tốc độ tăng theo khối lượng
 * (đồ càng nặng rơi càng mạnh). Piano 250 kg ≈ 6,5; grand piano 500 kg ≈ 9.
 */
export function dropImpact(massKg: number): number {
  return 4 + massKg / 100;
}

export interface DamageState {
  durability: number;
  broken: boolean;
  /** Còn bao lâu nữa mới nhận sát thương tiếp (ms). */
  cooldownMs: number;
}

export interface DamageResult {
  state: DamageState;
  damaged: boolean;
  broke: boolean;
}

/** Một cú va: vượt ngưỡng thì trừ 1 độ bền; về 0 thì vỡ. */
export function applyImpact(state: DamageState, speed: number, threshold: number): DamageResult {
  if (state.broken || state.cooldownMs > 0 || speed < threshold) {
    return { state, damaged: false, broke: false };
  }
  return applyDamage(state, 1);
}

/** Trừ thẳng độ bền (kéo lê cào sàn, rơi…). */
export function applyDamage(state: DamageState, amount: number): DamageResult {
  if (state.broken || amount <= 0) return { state, damaged: false, broke: false };
  const durability = Math.max(0, state.durability - amount);
  const broke = durability === 0;
  return {
    state: { durability, broken: broke, cooldownMs: DAMAGE_COOLDOWN_MS },
    damaged: true,
    broke,
  };
}

export function tickCooldown(state: DamageState, dtMs: number): DamageState {
  return state.cooldownMs > 0
    ? { ...state, cooldownMs: Math.max(0, state.cooldownMs - dtMs) }
    : state;
}
