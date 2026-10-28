/**
 * Tên hành vi đồ vật dùng được trong `items.json`. Cài đặt nằm trong registry (P10);
 * danh sách này để validate data mà không cần tải Phaser.
 */
export const BEHAVIOR_NAMES = [
  // Hành vi chung, có tham số
  'spawnOnImpact',
  'spillZone',
  // Tên đặt sẵn (preset) dùng trong plan
  'slippery',
  'doorPopsOpen',
  'spillSoil',
  'spillWater',
  'escapeFish',
  'flop',
  'treadmillBelt',
  'ballsRoll',
  'weightsRoll',
  'dropOnRelease',
  'boxBottomTear',
  'shatterDebris',
  'keysSoundOnHit',
  // Mèo (P11)
  'fleeAI',
  'scratchDrop',
  'escapeBox',
] as const;

export type BehaviorName = (typeof BEHAVIOR_NAMES)[number];

export const KNOWN_BEHAVIORS: ReadonlySet<string> = new Set(BEHAVIOR_NAMES);
