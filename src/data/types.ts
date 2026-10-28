import { TUTORIAL_TRIGGERS } from '../systems/tutorial';
import { LOCALES, type Locale } from './i18n';
import {
  arr,
  bool,
  type CheckContext,
  type Infer,
  int,
  nullable,
  num,
  obj,
  oneOf,
  optional,
  record,
  report,
  type Schema,
  str,
  vec2,
} from './schema';

/** Tên song ngữ ghi thẳng trong data: `{ "en": "Fridge", "vi": "Tủ lạnh" }`. */
export type LocalizedName = Record<Locale, string>;

export function localized(): Schema<LocalizedName> {
  return {
    check(v, path, ctx: CheckContext) {
      if (typeof v !== 'object' || v === null || Array.isArray(v))
        return report(ctx, path, 'type', { expected: 'object {en, vi}', actual: typeof v });
      const rec = v as Record<string, unknown>;
      let ok = true;
      for (const locale of LOCALES) {
        const text = rec[locale];
        if (typeof text !== 'string' || text.trim() === '')
          ok = report(ctx, `${path}.${locale}`, 'missingTranslation', { locale });
      }
      for (const key of Object.keys(rec)) {
        if (!(LOCALES as readonly string[]).includes(key))
          ok = report(ctx, `${path}.${key}`, 'unknownField', { field: key });
      }
      return ok;
    },
  };
}

/** Hành vi của đồ vật: tên (`"slippery"`) hoặc object có tham số (`{ "type": "spawnOnImpact", … }`). */
export type BehaviorRef = string | ({ type: string } & Record<string, unknown>);

function behaviorRef(): Schema<BehaviorRef> {
  const name = str({ minLen: 1 });
  return {
    check(v, path, ctx) {
      if (typeof v === 'string') return name.check(v, path, ctx);
      if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
        return name.check((v as { type?: unknown }).type, `${path}.type`, ctx);
      }
      return report(ctx, path, 'type', { expected: 'string | object', actual: typeof v });
    },
  };
}

const ID = str({ pattern: /^[a-z][a-z0-9_]*$/, patternName: 'snake_case' });
const COLOR = str({ pattern: /^#[0-9a-fA-F]{6}$/, patternName: '#rrggbb' });

// ---------- config.json ----------

export const DIALOGUE_EVENTS = [
  'levelStart',
  'itemBroken',
  'itemDropped',
  'wallHit',
  'itemLoaded',
  'catEscaped',
  'timeLow',
  'levelEnd',
  'bigLiftStart',
  'bigLiftFail',
  /** Chủ nhà đổi ý (modifier `landlordChangesMind`). */
  'changeMind',
] as const;
export type DialogueEvent = (typeof DIALOGUE_EVENTS)[number];

export const configSchema = obj({
  maxPlayers: int({ min: 1, max: 8 }),
  maxLocalPlayers: int({ min: 1, max: 4 }),
  logicHz: int({ min: 10, max: 240 }),
  runTripChance: num({ min: 0, max: 1 }),
  throwSpeed: num({ min: 0 }),
  grabRange: num({ min: 0 }),
  net: obj({
    transport: str({ minLen: 1 }),
    fallbackTransport: str({ minLen: 1 }),
    appId: str({ minLen: 1 }),
    /** STUN/TURN cho WebRTC. TURN cần `username` + `credential`. */
    iceServers: arr(
      obj({
        urls: str({ minLen: 1 }),
        username: optional(str()),
        credential: optional(str()),
      }),
    ),
    /** Relay nostr để Trystero tìm nhau; bỏ trống thì dùng danh sách mặc định của Trystero. */
    relayUrls: optional(arr(str({ minLen: 1 }))),
    /** Máy chủ PeerJS (kênh dự phòng); bỏ trống thì dùng máy chủ công cộng của PeerJS. */
    peerServer: optional(
      obj({ host: str({ minLen: 1 }), port: int({ min: 1 }), path: str(), secure: bool() }),
    ),
    inputHz: int({ min: 1 }),
    snapshotHz: int({ min: 1 }),
    interpolationDelayMs: num({ min: 0 }),
    reconnectGraceSec: num({ min: 0 }),
  }),
  dialogue: obj({
    cooldownSec: record(num({ min: 0 }), oneOf(['default', ...DIALOGUE_EVENTS] as const)),
  }),
  debug: bool(),
});
export type GameConfig = Infer<typeof configSchema>;

// ---------- items.json ----------

export const ITEM_SHAPES = ['rect', 'circle'] as const;
export const LIFT_RULES = ['free', 'drag', 'strict'] as const;
export type LiftRule = (typeof LIFT_RULES)[number];

export const itemSchema = obj({
  id: ID,
  name: localized(),
  sprite: optional(str({ minLen: 1 })),
  /** Emoji vẽ trên hình tạm khi chưa có sprite. */
  icon: optional(str({ minLen: 1 })),
  color: optional(COLOR),
  shape: optional(oneOf(ITEM_SHAPES)),
  /** Hình tròn thì `w` là đường kính. */
  size: obj({ w: num({ min: 4 }), h: num({ min: 4 }) }),
  /** Khối lượng (kg). */
  mass: num({ min: 0.1 }),
  /** Ma sát với sàn, 0 (trơn như băng) .. 1 (rất khó đẩy). */
  friction: num({ min: 0, max: 1 }),
  restitution: optional(num({ min: 0, max: 1 })),
  requiredGrabbers: int({ min: 1, max: 8 }),
  liftRule: oneOf(LIFT_RULES),
  /** Điểm nắm theo tọa độ của món đồ (tâm là 0,0). Bỏ trống thì tự sinh quanh viền. */
  grabPoints: optional(arr(vec2(), { min: 1, max: 8 })),
  value: int({ min: 0 }),
  fragile: optional(bool()),
  durability: int({ min: 1 }),
  /** Tốc độ va chạm tối thiểu (px/bước) để bị trừ độ bền. */
  breakImpulse: optional(num({ min: 0 })),
  repairCost: int({ min: 0 }),
  behaviors: optional(arr(behaviorRef())),
  truckSlots: int({ min: 1 }),
  throwable: optional(bool()),
  ai: optional(
    obj({
      speed: num({ min: 0 }),
      fleeRadius: num({ min: 0 }),
      hideSpots: optional(bool()),
      /** Xác suất né một cú lao (0..1). */
      dodgeChance: optional(num({ min: 0, max: 1 })),
    }),
  ),
  /** Đồ chứa được mèo (thùng, lồng). */
  container: optional(obj({ escapeChancePerSec: num({ min: 0, max: 1 }) })),
});
export type ItemDef = Infer<typeof itemSchema>;

// ---------- levels.json ----------

export const TIERS = ['solo', 'duo', 'team', 'squad', 'full'] as const;
export const MODIFIERS = ['rain', 'slope', 'stairs', 'landlordChangesMind', 'paparazzi'] as const;

const starsSchema = arr(num({ min: 0 }), { min: 3, max: 3 });
export const TRUCK_FACINGS = ['left', 'right', 'up', 'down'] as const;
export type TruckFacing = (typeof TRUCK_FACINGS)[number];

export const levelSchema = obj({
  id: ID,
  name: localized(),
  tier: oneOf(TIERS),
  minPlayers: int({ min: 1, max: 8 }),
  maxPlayers: int({ min: 1, max: 8 }),
  recommendedPlayers: int({ min: 1, max: 8 }),
  unlockStars: int({ min: 0 }),
  timeLimitSec: num({ min: 1 }),
  map: str({ minLen: 1 }),
  landlord: ID,
  /** `x`, `y` là tâm thùng xe; `facing` là phía cửa thùng (mặc định quay sang trái). */
  truck: obj({
    x: num(),
    y: num(),
    slots: int({ min: 1 }),
    hasHandbrake: bool(),
    facing: optional(oneOf(TRUCK_FACINGS)),
  }),
  spawns: arr(obj({ item: ID, x: num(), y: num(), required: bool(), angle: optional(num()) }), {
    min: 1,
  }),
  playerSpawns: arr(vec2(), { min: 1 }),
  modifiers: arr(oneOf(MODIFIERS)),
  stars: starsSchema,
  satisfactionMultiplier: num({ min: 0 }),
  /** Hướng dẫn từng bước (khóa i18n + việc cần làm để sang bước kế). */
  tutorial: optional(
    arr(obj({ text: str({ minLen: 1 }), until: oneOf(TUTORIAL_TRIGGERS) }), { min: 1 }),
  ),
  scaling: nullable(
    obj({
      basePlayers: int({ min: 1, max: 8 }),
      extraSpawnsPerPlayer: arr(obj({ item: ID, count: int({ min: 1 }) })),
      timeDeltaPerPlayerSec: num(),
      starsPerExtraPlayer: starsSchema,
      truckSlotsPerPlayer: int({ min: 0 }),
    }),
  ),
});
export type LevelDef = Infer<typeof levelSchema>;

// ---------- landlords.json ----------

export const landlordSchema = obj({
  id: ID,
  name: localized(),
  sprite: optional(str({ minLen: 1 })),
  /** Emoji vẽ trên hình tạm khi chưa có sprite. */
  icon: optional(str({ minLen: 1 })),
  color: optional(COLOR),
  voicePitch: num({ min: 0.1, max: 4 }),
  startSatisfaction: num({ min: 0, max: 100 }),
  sensitivity: record(num(), oneOf(DIALOGUE_EVENTS)),
  favoriteItems: arr(ID),
  linesKey: str({ minLen: 1 }),
});
export type LandlordDef = Infer<typeof landlordSchema>;

// ---------- lines.<locale>.json ----------

/** `{ [linesKey]: { [sự kiện]: [câu 0, câu 1, …] } }`; câu thứ i ở mọi ngôn ngữ là cùng một câu. */
export const linesSchema = record(
  record(arr(str({ minLen: 1 }), { min: 1 }), oneOf(DIALOGUE_EVENTS)),
);
export type LinesFile = Infer<typeof linesSchema>;

// ---------- i18n/<locale>.json ----------

export const dictionarySchema = record(str());
