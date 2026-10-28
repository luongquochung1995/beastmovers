/**
 * Cài đặt lưu trong localStorage. Mọi lần đọc/ghi đều bọc try/catch:
 * trình duyệt chặn lưu trữ (chế độ ẩn danh, bị tắt) thì game vẫn chạy bình thường.
 * Lưu tiến trình đầy đủ (sao, màn đã mở) sẽ làm ở P29.
 */
export const SAVE_KEY = 'beast-movers-save-v1';

export interface Settings {
  language?: string;
  /** Rung màn hình khi đồ rơi mạnh (mặc định bật). */
  screenShake?: boolean;
}

interface SaveData {
  version: 1;
  settings: Settings;
}

export function loadSettings(storage: Storage | undefined = globalThis.localStorage): Settings {
  try {
    const raw = storage?.getItem(SAVE_KEY);
    if (!raw) return {};
    const data = JSON.parse(raw) as Partial<SaveData>;
    return typeof data.settings === 'object' && data.settings !== null ? data.settings : {};
  } catch {
    return {};
  }
}

export function saveSettings(
  patch: Settings,
  storage: Storage | undefined = globalThis.localStorage,
): void {
  try {
    const data: SaveData = { version: 1, settings: { ...loadSettings(storage), ...patch } };
    storage?.setItem(SAVE_KEY, JSON.stringify(data));
  } catch {
    // Không lưu được thì thôi, lần sau dùng mặc định.
  }
}
