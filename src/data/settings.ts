/**
 * Dữ liệu lưu trong localStorage (key `beast-movers-save-v1`): hồ sơ người chơi, sao từng màn,
 * cài đặt. Mọi lần đọc/ghi đều bọc try/catch: trình duyệt chặn lưu trữ (chế độ ẩn danh, bị tắt,
 * hết chỗ) thì game vẫn chạy bình thường, chỉ là không nhớ gì cho lần sau.
 *
 * `version` tăng khi đổi cấu trúc; `migrate()` nâng dữ liệu cũ lên bản hiện tại.
 */
import type { KeyBindings } from '../systems/input/keyboard';

export const SAVE_KEY = 'beast-movers-save-v1';
export const SAVE_VERSION = 2;

export interface Settings {
  language?: string;
  /** Rung màn hình khi đồ rơi mạnh (mặc định bật). */
  screenShake?: boolean;
  /** Âm lượng chung 0..1 (mặc định 0,8). */
  volume?: number;
  /** Phím đã đổi, mỗi phần tử là một bố cục (P1, P2); bỏ trống = mặc định. */
  keys?: KeyBindings;
}

export interface Profile {
  /** Tên hiện trong lobby online. */
  name?: string;
  /** Màu nhân vật (chỉ số trong PLAYER_STYLES). */
  color?: number;
  /** Mũ (chỉ số trong HATS). */
  hat?: number;
}

export interface LevelProgress {
  stars: number;
  bestScore: number;
  /** Số người chơi ở lần đạt điểm cao nhất. */
  bestPlayerCount: number;
}

export interface SaveData {
  version: typeof SAVE_VERSION;
  profile: Profile;
  levels: Record<string, LevelProgress>;
  settings: Settings;
}

export const DEFAULT_VOLUME = 0.8;

function emptySave(): SaveData {
  return { version: SAVE_VERSION, profile: {}, levels: {}, settings: {} };
}

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const intIn = (v: unknown, min: number, max: number): number | undefined =>
  typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max ? v : undefined;

/**
 * Nâng dữ liệu cũ lên bản hiện tại và bỏ các giá trị sai kiểu (người dùng sửa tay, bản lỗi).
 * - Bản 1 (P05–P26): chỉ có `settings`, tên người chơi nằm ở `settings.playerName`.
 */
export function migrate(raw: unknown): SaveData {
  const out = emptySave();
  if (!isObj(raw)) return out;
  const version = typeof raw.version === 'number' ? raw.version : 1;
  if (version > SAVE_VERSION) return out; // bản mới hơn game: không đoán, dùng mặc định
  const settings = isObj(raw.settings) ? raw.settings : {};
  const profile = isObj(raw.profile) ? raw.profile : {};
  if (version < 2 && typeof settings.playerName === 'string') profile.name = settings.playerName;

  if (typeof settings.language === 'string') out.settings.language = settings.language;
  if (typeof settings.screenShake === 'boolean') out.settings.screenShake = settings.screenShake;
  if (typeof settings.volume === 'number' && settings.volume >= 0 && settings.volume <= 1)
    out.settings.volume = settings.volume;
  if (Array.isArray(settings.keys)) {
    out.settings.keys = settings.keys.map((layout) => {
      const clean: Record<string, string> = {};
      if (isObj(layout))
        for (const [action, code] of Object.entries(layout))
          if (typeof code === 'string' && code) clean[action] = code;
      return clean;
    });
  }

  if (typeof profile.name === 'string' && profile.name.trim()) out.profile.name = profile.name;
  const color = intIn(profile.color, 0, 7);
  if (color !== undefined) out.profile.color = color;
  const hat = intIn(profile.hat, 0, 99);
  if (hat !== undefined) out.profile.hat = hat;

  if (isObj(raw.levels)) {
    for (const [id, lv] of Object.entries(raw.levels)) {
      if (!isObj(lv)) continue;
      const stars = intIn(lv.stars, 0, 3);
      if (stars === undefined) continue;
      out.levels[id] = {
        stars,
        bestScore: typeof lv.bestScore === 'number' ? lv.bestScore : 0,
        bestPlayerCount: intIn(lv.bestPlayerCount, 1, 8) ?? 1,
      };
    }
  }
  return out;
}

type MaybeStorage = Storage | undefined;
const defaultStorage = (): MaybeStorage => {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined; // truy cập localStorage cũng có thể ném lỗi (cookie bị chặn)
  }
};

export function loadSave(storage: MaybeStorage = defaultStorage()): SaveData {
  try {
    const raw = storage?.getItem(SAVE_KEY);
    return raw ? migrate(JSON.parse(raw)) : emptySave();
  } catch {
    return emptySave();
  }
}

/** Ghi lại toàn bộ. Trả về false nếu trình duyệt không cho lưu. */
export function writeSave(data: SaveData, storage: MaybeStorage = defaultStorage()): boolean {
  try {
    if (!storage) return false;
    storage.setItem(SAVE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

/** Đọc - sửa - ghi. */
function update(fn: (data: SaveData) => void, storage: MaybeStorage = defaultStorage()): boolean {
  const data = loadSave(storage);
  fn(data);
  return writeSave(data, storage);
}

export function loadSettings(storage: MaybeStorage = defaultStorage()): Settings {
  return loadSave(storage).settings;
}

export function saveSettings(patch: Settings, storage: MaybeStorage = defaultStorage()): void {
  update((d) => Object.assign(d.settings, patch), storage);
}

export function loadProfile(storage: MaybeStorage = defaultStorage()): Profile {
  return loadSave(storage).profile;
}

export function saveProfile(patch: Profile, storage: MaybeStorage = defaultStorage()): void {
  update((d) => Object.assign(d.profile, patch), storage);
}

export function volumeOf(settings: Settings): number {
  return settings.volume ?? DEFAULT_VOLUME;
}

/** Ghi kết quả một màn: giữ số sao và điểm cao nhất. */
export function recordLevelResult(
  levelId: string,
  result: { stars: number; score: number; players: number },
  storage: MaybeStorage = defaultStorage(),
): void {
  update((d) => {
    const old = d.levels[levelId];
    const better = !old || result.score > old.bestScore;
    d.levels[levelId] = {
      stars: Math.max(old?.stars ?? 0, result.stars),
      bestScore: better ? result.score : old.bestScore,
      bestPlayerCount: better ? result.players : old.bestPlayerCount,
    };
  }, storage);
}

export function totalStars(levels: Record<string, LevelProgress>): number {
  return Object.values(levels).reduce((sum, l) => sum + l.stars, 0);
}

/** Xóa tiến trình (sao, điểm, hồ sơ); giữ cài đặt. */
export function clearProgress(storage: MaybeStorage = defaultStorage()): void {
  update((d) => {
    d.levels = {};
    d.profile = {};
  }, storage);
}
