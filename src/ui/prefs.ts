import { setMasterVolume } from '../audio/mixer';
import { getLocale, nextLocale, setLocale } from '../data/i18n';
import { loadSettings, saveSettings, volumeOf } from '../data/settings';
import { applyKeyBindings } from '../systems/input/keyboard';

/** Áp cài đặt đã lưu lúc khởi động (âm lượng, phím). Ngôn ngữ do BootScene tự chọn. */
export function applySavedSettings(): void {
  const s = loadSettings();
  setMasterVolume(volumeOf(s));
  applyKeyBindings(s.keys);
}

/** Đổi sang ngôn ngữ kế tiếp và lưu lại. */
export function switchLanguage(): void {
  const locale = nextLocale(getLocale());
  setLocale(locale);
  saveSettings({ language: locale });
  document.documentElement.lang = locale;
}

/** Âm lượng theo nấc 10%. */
export function stepVolume(dir: -1 | 1): number {
  const v = Math.round(Math.max(0, Math.min(1, volumeOf(loadSettings()) + dir * 0.1)) * 10) / 10;
  saveSettings({ volume: v });
  setMasterVolume(v);
  return v;
}

export function isFullscreen(): boolean {
  return document.fullscreenElement !== null && document.fullscreenElement !== undefined;
}

/**
 * Bật/tắt toàn màn hình. Trình duyệt chỉ cho bật khi đang xử lý phím/chuột của người dùng
 * (không bật được bằng tay cầm): trả về false nếu bị từ chối.
 */
export async function toggleFullscreen(): Promise<boolean> {
  try {
    if (isFullscreen()) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
    return true;
  } catch {
    return false;
  }
}
