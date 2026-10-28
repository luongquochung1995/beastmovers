/**
 * Đa ngôn ngữ. Chữ hiển thị nằm trong `public/data/i18n/<locale>.json` (khóa phẳng),
 * tham số viết dạng `{ten}`. Thiếu khóa ở ngôn ngữ hiện tại thì lấy tiếng Anh, thiếu nữa thì hiện chính khóa.
 */
export const LOCALES = ['en', 'vi'] as const;
export type Locale = (typeof LOCALES)[number];
export const FALLBACK_LOCALE: Locale = 'en';

export type Dictionary = Record<string, string>;
/** Chữ cần dịch, để phần logic không phải biết ngôn ngữ đang dùng. */
export interface LocalizedText {
  key: string;
  params?: TextParams;
}

/** Tham số có thể là một chữ cần dịch khác, vd. tên bố cục phím trong "Bàn phím ({layout})". */
export type TextParams = Record<string, string | number | LocalizedText>;

const dictionaries: Partial<Record<Locale, Dictionary>> = {};
let current: Locale = FALLBACK_LOCALE;

export function i18nPath(locale: Locale): string {
  return `data/i18n/${locale}.json`;
}

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}

export function setDictionary(locale: Locale, dict: Dictionary): void {
  dictionaries[locale] = dict;
}

export function setLocale(locale: Locale): void {
  current = locale;
}

export function getLocale(): Locale {
  return current;
}

export function nextLocale(locale: Locale = current): Locale {
  return LOCALES[(LOCALES.indexOf(locale) + 1) % LOCALES.length]!;
}

export function format(template: string, params?: TextParams): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (m, name: string) => {
    const value = params[name];
    if (value === undefined) return m;
    return typeof value === 'object' ? tText(value) : String(value);
  });
}

export function t(key: string, params?: TextParams): string {
  const template = dictionaries[current]?.[key] ?? dictionaries[FALLBACK_LOCALE]?.[key] ?? key;
  return format(template, params);
}

export function tText(text: LocalizedText): string {
  return t(text.key, text.params);
}

/** Chọn ngôn ngữ: `?lang=` trên URL → lựa chọn đã lưu → ngôn ngữ trình duyệt → tiếng Anh. */
export function detectLocale(options: {
  urlLang?: string | null;
  saved?: string | null;
  browserLanguages?: readonly string[];
}): Locale {
  if (isLocale(options.urlLang)) return options.urlLang;
  if (isLocale(options.saved)) return options.saved;
  for (const lang of options.browserLanguages ?? []) {
    const base = lang.toLowerCase().split('-')[0];
    if (isLocale(base)) return base;
  }
  return FALLBACK_LOCALE;
}
