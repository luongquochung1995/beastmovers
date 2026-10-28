import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  detectLocale,
  type Dictionary,
  format,
  LOCALES,
  nextLocale,
  setDictionary,
  setLocale,
  t,
} from '../src/data/i18n';
import { loadSettings, SAVE_KEY, saveSettings } from '../src/data/settings';

const ROOT = join(__dirname, '..');
const dict = (locale: string): Dictionary =>
  JSON.parse(readFileSync(join(ROOT, 'public/data/i18n', `${locale}.json`), 'utf8')) as Dictionary;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? sourceFiles(path) : path.endsWith('.ts') ? [path] : [];
  });
}

describe('File ngôn ngữ', () => {
  const en = dict('en');

  it.each(LOCALES)('%s có đúng bộ khóa như tiếng Anh', (locale) => {
    expect(Object.keys(dict(locale)).sort()).toEqual(Object.keys(en).sort());
  });

  it.each(LOCALES)('%s có cùng tham số {…} với tiếng Anh ở mọi khóa', (locale) => {
    const params = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    const d = dict(locale);
    for (const key of Object.keys(en)) expect(params(d[key]!), key).toEqual(params(en[key]!));
  });

  it('mọi khóa dùng trong code đều có trong file ngôn ngữ', () => {
    const used = new Set<string>();
    for (const file of sourceFiles(join(ROOT, 'src'))) {
      const code = readFileSync(file, 'utf8');
      // Khóa dịch luôn có dạng "nhom.ten".
      for (const m of code.matchAll(/\b(?:t\(|key: |nameKey: )'(\w+\.[\w.]+)'/g)) used.add(m[1]!);
      for (const m of code.matchAll(/\['\w+', '(\w+\.[\w.]+)'\]/g)) used.add(m[1]!);
    }
    expect(used.size).toBeGreaterThan(20);
    const missing = [...used].filter((k) => !(k in en));
    expect(missing).toEqual([]);
  });
});

describe('t()', () => {
  beforeEach(() => {
    setDictionary('en', {
      hello: 'Hello {name}',
      onlyEn: 'English only',
      kb: 'Keyboard ({layout})',
      arrows: 'Arrows',
    });
    setDictionary('vi', { hello: 'Xin chào {name}', kb: 'Bàn phím ({layout})', arrows: 'Mũi tên' });
    setLocale('vi');
  });

  it('dịch theo ngôn ngữ hiện tại và điền tham số', () => {
    expect(t('hello', { name: 'Hùng' })).toBe('Xin chào Hùng');
    setLocale('en');
    expect(t('hello', { name: 'Hung' })).toBe('Hello Hung');
  });

  it('thiếu khóa thì dùng tiếng Anh, thiếu nữa thì hiện khóa', () => {
    expect(t('onlyEn')).toBe('English only');
    expect(t('nope')).toBe('nope');
  });

  it('tham số lồng là chữ cần dịch', () => {
    expect(t('kb', { layout: { key: 'arrows' } })).toBe('Bàn phím (Mũi tên)');
  });

  it('giữ nguyên {x} khi thiếu tham số', () => {
    expect(format('a {x} b', {})).toBe('a {x} b');
  });

  it('nextLocale xoay vòng', () => {
    expect(nextLocale('en')).toBe('vi');
    expect(nextLocale('vi')).toBe('en');
  });
});

describe('detectLocale', () => {
  it('ưu tiên URL, rồi lựa chọn đã lưu, rồi trình duyệt', () => {
    expect(detectLocale({ urlLang: 'vi', saved: 'en', browserLanguages: ['en'] })).toBe('vi');
    expect(detectLocale({ saved: 'vi', browserLanguages: ['en-US'] })).toBe('vi');
    expect(detectLocale({ browserLanguages: ['vi-VN', 'en'] })).toBe('vi');
    expect(detectLocale({ browserLanguages: ['fr-FR', 'en-GB'] })).toBe('en');
  });

  it('giá trị lạ thì về tiếng Anh', () => {
    expect(detectLocale({ urlLang: 'xx', saved: '??', browserLanguages: ['ja'] })).toBe('en');
  });
});

describe('Lưu cài đặt', () => {
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

  it('lưu rồi đọc lại ngôn ngữ', () => {
    const s = memoryStorage();
    saveSettings({ language: 'vi' }, s);
    expect(loadSettings(s).language).toBe('vi');
  });

  it('dữ liệu hỏng thì trả về mặc định', () => {
    const s = memoryStorage();
    s.setItem(SAVE_KEY, '{oops');
    expect(loadSettings(s)).toEqual({});
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
    expect(loadSettings(blocked)).toEqual({});
    expect(() => saveSettings({ language: 'en' }, blocked)).not.toThrow();
  });
});
