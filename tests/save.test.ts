import { describe, expect, it } from 'vitest';
import {
  clearProgress,
  loadProfile,
  loadSave,
  loadSettings,
  migrate,
  recordLevelResult,
  SAVE_KEY,
  SAVE_VERSION,
  saveProfile,
  saveSettings,
  totalStars,
} from '../src/data/settings';

function memoryStorage(): Storage {
  const m = new Map<string, string>();
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, v),
    removeItem: (k) => void m.delete(k),
    clear: () => m.clear(),
    key: () => null,
    get length() {
      return m.size;
    },
  };
}

describe('Lưu tiến trình', () => {
  it('nâng dữ liệu bản 1 (tên nằm trong settings) lên bản hiện tại', () => {
    const s = memoryStorage();
    s.setItem(
      SAVE_KEY,
      JSON.stringify({
        version: 1,
        settings: { language: 'vi', screenShake: false, playerName: 'Hà' },
      }),
    );
    const d = loadSave(s);
    expect(d.version).toBe(SAVE_VERSION);
    expect(d.profile.name).toBe('Hà');
    expect(d.settings).toEqual({ language: 'vi', screenShake: false });
    expect(d.levels).toEqual({});
  });

  it('bỏ giá trị sai kiểu, giữ phần đúng', () => {
    const d = migrate({
      version: 2,
      profile: { name: 42, color: 3, hat: -1 },
      levels: { a: { stars: 2, bestScore: 900, bestPlayerCount: 4 }, b: { stars: 7 }, c: 'x' },
      settings: { volume: 3, keys: [{ up: 'KeyI', down: 5 }, null] },
    });
    expect(d.profile).toEqual({ color: 3 });
    expect(d.levels).toEqual({ a: { stars: 2, bestScore: 900, bestPlayerCount: 4 } });
    expect(d.settings).toEqual({ keys: [{ up: 'KeyI' }, {}] });
  });

  it('dữ liệu của bản game mới hơn thì dùng mặc định', () => {
    expect(migrate({ version: 99, profile: { name: 'X' } }).profile).toEqual({});
  });

  it('ghi kết quả: giữ số sao và điểm cao nhất', () => {
    const s = memoryStorage();
    recordLevelResult('lv1', { stars: 2, score: 900, players: 2 }, s);
    recordLevelResult('lv1', { stars: 1, score: 950, players: 4 }, s);
    recordLevelResult('lv1', { stars: 0, score: 100, players: 1 }, s);
    recordLevelResult('lv2', { stars: 3, score: 2000, players: 8 }, s);
    const d = loadSave(s);
    expect(d.levels.lv1).toEqual({ stars: 2, bestScore: 950, bestPlayerCount: 4 });
    expect(totalStars(d.levels)).toBe(5);
  });

  it('hồ sơ, cài đặt và tiến trình nằm chung một chỗ; xóa tiến trình giữ cài đặt', () => {
    const s = memoryStorage();
    saveSettings({ volume: 0.3, language: 'en' }, s);
    saveProfile({ name: 'Gấu', color: 5, hat: 2 }, s);
    recordLevelResult('lv1', { stars: 3, score: 1500, players: 1 }, s);
    expect(loadProfile(s)).toEqual({ name: 'Gấu', color: 5, hat: 2 });
    clearProgress(s);
    expect(loadSave(s).levels).toEqual({});
    expect(loadProfile(s)).toEqual({});
    expect(loadSettings(s)).toEqual({ volume: 0.3, language: 'en' });
  });

  it('trình duyệt chặn lưu trữ thì không ném lỗi', () => {
    const blocked = {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {
        throw new Error('QuotaExceeded');
      },
    } as unknown as Storage;
    expect(() =>
      recordLevelResult('lv1', { stars: 1, score: 1, players: 1 }, blocked),
    ).not.toThrow();
    expect(loadSave(blocked).levels).toEqual({});
  });
});
