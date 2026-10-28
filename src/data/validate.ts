import { type Dictionary, LOCALES, type Locale } from './i18n';
import { insideMap, type MapLayout, mapSchema, parseMap } from './map';
import { type CheckContext, type Issue, report, type Schema, validateFile } from './schema';
import {
  configSchema,
  dictionarySchema,
  type GameConfig,
  type ItemDef,
  itemSchema,
  type LandlordDef,
  landlordSchema,
  type LevelDef,
  levelSchema,
  type LinesFile,
  linesSchema,
} from './types';

/** Tên các file data, theo đường dẫn tương đối trong `public/data/`. */
export const DATA_FILES = {
  config: 'config.json',
  items: 'items.json',
  levels: 'levels.json',
  landlords: 'landlords.json',
  lines: (l: Locale) => `lines.${l}.json`,
  i18n: (l: Locale) => `i18n/${l}.json`,
} as const;

export function allDataFiles(): string[] {
  return [
    DATA_FILES.config,
    DATA_FILES.items,
    DATA_FILES.levels,
    DATA_FILES.landlords,
    ...LOCALES.map(DATA_FILES.lines),
    ...LOCALES.map(DATA_FILES.i18n),
  ];
}

export interface GameData {
  config: GameConfig;
  items: ItemDef[];
  itemById: ReadonlyMap<string, ItemDef>;
  levels: LevelDef[];
  landlords: LandlordDef[];
  lines: Record<Locale, LinesFile>;
  i18n: Record<Locale, Dictionary>;
  /** Bố cục bản đồ theo đường dẫn file (vd. `maps/studio.json`). */
  maps: Record<string, MapLayout>;
}

/** Đường dẫn bản đồ hợp lệ: chỉ cho phép file trong thư mục `maps/`. */
const MAP_PATH = /^maps\/[\w-]+\.json$/;

/** Danh sách file bản đồ mà `levels.json` (chưa kiểm tra) nhắc tới, để loader đọc thêm. */
export function mapFilesOf(rawLevels: unknown): string[] {
  if (!Array.isArray(rawLevels)) return [];
  const files = rawLevels
    .map((l) => (l && typeof l === 'object' ? (l as { map?: unknown }).map : undefined))
    .filter((m): m is string => typeof m === 'string' && MAP_PATH.test(m));
  return [...new Set(files)];
}

function checkMaps(
  levels: LevelDef[],
  raw: Record<string, unknown>,
  issues: Issue[],
): Record<string, MapLayout> {
  const maps: Record<string, MapLayout> = {};
  for (const file of new Set(levels.map((l) => l.map))) {
    if (!MAP_PATH.test(file) || !(file in raw)) continue;
    const tiled = validateFile(file, raw[file], mapSchema, issues);
    if (tiled) maps[file] = parseMap(file, tiled, issues);
  }
  const file = DATA_FILES.levels;
  for (const lv of levels) {
    const at = `[${lv.id}]`;
    if (!MAP_PATH.test(lv.map)) {
      issues.push({
        file,
        path: `${at}.map`,
        code: 'pattern',
        params: { value: lv.map, pattern: 'maps/<tên>.json' },
      });
      continue;
    }
    const map = maps[lv.map];
    if (!map) {
      if (!(lv.map in raw))
        issues.push({ file, path: `${at}.map`, code: 'unknownMap', params: { map: lv.map } });
      continue;
    }
    const out = (path: string, x: number, y: number) => {
      if (!insideMap(map, x, y))
        issues.push({
          file,
          path: `${at}.${path}`,
          code: 'outOfMap',
          params: { x, y, w: map.width, h: map.height },
        });
    };
    out('truck', lv.truck.x, lv.truck.y);
    lv.spawns.forEach((s, i) => out(`spawns[${i}]`, s.x, s.y));
    lv.playerSpawns.forEach(([x, y], i) => out(`playerSpawns[${i}]`, x, y));
  }
  return maps;
}

export interface ValidateOptions {
  /** Tên hành vi đồ vật hợp lệ (từ registry hành vi). Bỏ trống thì không kiểm tra. */
  knownBehaviors?: ReadonlySet<string>;
}

const paramsOf = (s: string) =>
  [...s.matchAll(/\{(\w+)\}/g)]
    .map((m) => m[1]!)
    .sort()
    .join(',');

/**
 * Kiểm tra một file dạng mảng từng phần tử một: phần tử sai bị bỏ ra, phần tử đúng vẫn được
 * dùng cho các bước kiểm tra chéo, để một lần chạy báo được càng nhiều lỗi càng tốt.
 */
function validateList<T extends { id: string }>(
  file: string,
  raw: unknown,
  schema: Schema<T>,
  issues: Issue[],
): { valid: T[]; ids: Set<string> } | null {
  const ctx: CheckContext = { file, issues };
  if (!Array.isArray(raw)) {
    report(ctx, '', 'type', { expected: 'array', actual: raw === null ? 'null' : typeof raw });
    return null;
  }
  if (raw.length === 0) {
    report(ctx, '', 'minItems', { count: 0, min: 1 });
    return null;
  }
  const valid: T[] = [];
  raw.forEach((el, i) => {
    const id =
      el && typeof el === 'object' && typeof el.id === 'string' ? (el.id as string) : String(i);
    if (schema.check(el, `[${id}]`, ctx)) valid.push(el as T);
  });
  // `ids` gồm cả phần tử sai, để chỗ khác tham chiếu tới nó không bị báo "không có" (lỗi dây chuyền).
  const withId = raw.filter(
    (el): el is { id: string } => el && typeof el === 'object' && typeof el.id === 'string',
  );
  checkDuplicates(file, withId, issues);
  return { valid, ids: new Set(withId.map((el) => el.id)) };
}

function checkDuplicates(file: string, list: { id: string }[], issues: Issue[]): void {
  const seen = new Set<string>();
  for (const { id } of list) {
    if (seen.has(id)) issues.push({ file, path: `[${id}]`, code: 'duplicateId', params: { id } });
    seen.add(id);
  }
}

function checkItems(
  items: ItemDef[],
  ids: ReadonlySet<string>,
  issues: Issue[],
  opts: ValidateOptions,
): void {
  const file = DATA_FILES.items;
  for (const item of items) {
    const at = `[${item.id}]`;
    if (item.grabPoints && item.grabPoints.length < item.requiredGrabbers) {
      issues.push({
        file,
        path: `${at}.grabPoints`,
        code: 'tooFewGrabPoints',
        params: { count: item.grabPoints.length, required: item.requiredGrabbers },
      });
    }
    (item.behaviors ?? []).forEach((b, i) => {
      const name = typeof b === 'string' ? b : b.type;
      if (opts.knownBehaviors && !opts.knownBehaviors.has(name)) {
        issues.push({
          file,
          path: `${at}.behaviors[${i}]`,
          code: 'unknownBehavior',
          params: { name },
        });
      }
      if (typeof b === 'object' && typeof b.item === 'string' && !ids.has(b.item)) {
        issues.push({
          file,
          path: `${at}.behaviors[${i}].item`,
          code: 'unknownItem',
          params: { id: b.item },
        });
      }
    });
  }
}

function checkLevels(
  levels: LevelDef[],
  itemById: ReadonlyMap<string, ItemDef>,
  itemIds: ReadonlySet<string>,
  landlordIds: ReadonlySet<string>,
  issues: Issue[],
): void {
  const file = DATA_FILES.levels;
  for (const lv of levels) {
    const at = `[${lv.id}]`;
    const ref = (path: string, code: 'unknownItem' | 'unknownLandlord', id: string) =>
      issues.push({ file, path: `${at}.${path}`, code, params: { id } });

    if (!landlordIds.has(lv.landlord)) ref('landlord', 'unknownLandlord', lv.landlord);
    if (
      lv.minPlayers > lv.maxPlayers ||
      lv.recommendedPlayers < lv.minPlayers ||
      lv.recommendedPlayers > lv.maxPlayers
    ) {
      issues.push({
        file,
        path: `${at}.minPlayers`,
        code: 'playerRange',
        params: { min: lv.minPlayers, recommended: lv.recommendedPlayers, max: lv.maxPlayers },
      });
    }
    if (lv.playerSpawns.length < lv.maxPlayers) {
      issues.push({
        file,
        path: `${at}.playerSpawns`,
        code: 'tooFewPlayerSpawns',
        params: { count: lv.playerSpawns.length, max: lv.maxPlayers },
      });
    }
    for (const [path, stars] of [
      ['stars', lv.stars],
      ['scaling.starsPerExtraPlayer', lv.scaling?.starsPerExtraPlayer],
    ] as const) {
      if (stars && !(stars[0]! <= stars[1]! && stars[1]! <= stars[2]!)) {
        issues.push({
          file,
          path: `${at}.${path}`,
          code: 'starsOrder',
          params: { stars: stars.join(', ') },
        });
      }
    }
    lv.spawns.forEach((s, i) => {
      if (!itemIds.has(s.item)) return ref(`spawns[${i}].item`, 'unknownItem', s.item);
      const item = itemById.get(s.item);
      if (!item) return; // món đồ có nhưng bị lỗi, đã báo ở items.json
      // Đồ bắt buộc mà thiếu người thì không nhấc nổi → màn không thể qua.
      if (s.required && item.liftRule === 'strict' && item.requiredGrabbers > lv.minPlayers) {
        issues.push({
          file,
          path: `${at}.spawns[${i}]`,
          code: 'levelInfeasible',
          params: { item: item.id, required: item.requiredGrabbers, minPlayers: lv.minPlayers },
        });
      }
    });
    lv.scaling?.extraSpawnsPerPlayer.forEach((e, i) => {
      if (!itemIds.has(e.item))
        ref(`scaling.extraSpawnsPerPlayer[${i}].item`, 'unknownItem', e.item);
    });
  }
}

function checkLandlords(
  landlords: LandlordDef[],
  itemIds: ReadonlySet<string>,
  lines: Partial<Record<Locale, LinesFile>>,
  issues: Issue[],
): void {
  const file = DATA_FILES.landlords;
  for (const ll of landlords) {
    const at = `[${ll.id}]`;
    ll.favoriteItems.forEach((id, i) => {
      if (!itemIds.has(id))
        issues.push({
          file,
          path: `${at}.favoriteItems[${i}]`,
          code: 'unknownItem',
          params: { id },
        });
    });
    for (const locale of LOCALES) {
      const l = lines[locale];
      if (l && !(ll.linesKey in l)) {
        issues.push({
          file,
          path: `${at}.linesKey`,
          code: 'unknownLinesKey',
          params: { key: ll.linesKey, file: DATA_FILES.lines(locale) },
        });
      }
    }
  }
}

/** Mọi ngôn ngữ phải có cùng chủ nhà, cùng sự kiện, cùng số câu (câu thứ i là cùng một câu). */
function checkLinesParity(lines: Partial<Record<Locale, LinesFile>>, issues: Issue[]): void {
  const [base, ...others] = LOCALES;
  const ref = lines[base!];
  if (!ref) return;
  for (const locale of others) {
    const other = lines[locale];
    if (!other) continue;
    const file = DATA_FILES.lines(locale);
    const keys = new Set([...Object.keys(ref), ...Object.keys(other)]);
    for (const key of keys) {
      const events = new Set([...Object.keys(ref[key] ?? {}), ...Object.keys(other[key] ?? {})]);
      for (const ev of events) {
        const a = ref[key]?.[ev]?.length ?? 0;
        const b = other[key]?.[ev]?.length ?? 0;
        if (a !== b) {
          issues.push({
            file,
            path: `${key}.${ev}`,
            code: 'linesMismatch',
            params: { base: base!, baseCount: a, locale, count: b },
          });
        }
      }
    }
  }
}

function checkI18nParity(dicts: Partial<Record<Locale, Dictionary>>, issues: Issue[]): void {
  const [base, ...others] = LOCALES;
  const ref = dicts[base!];
  if (!ref) return;
  for (const locale of others) {
    const d = dicts[locale];
    if (!d) continue;
    const file = DATA_FILES.i18n(locale);
    for (const key of new Set([...Object.keys(ref), ...Object.keys(d)])) {
      if (!(key in d) || !(key in ref)) {
        issues.push({
          file,
          path: key,
          code: 'i18nMismatch',
          params: { key, missingIn: key in d ? base! : locale },
        });
      } else if (paramsOf(ref[key]!) !== paramsOf(d[key]!)) {
        issues.push({
          file,
          path: key,
          code: 'i18nParams',
          params: { expected: paramsOf(ref[key]!) || '-', actual: paramsOf(d[key]!) || '-' },
        });
      }
    }
  }
}

/**
 * Kiểm tra toàn bộ data đã parse. `raw` là `{ "<tên file>": giá trị JSON }`.
 * Trả về data đã kiểm tra nếu không có lỗi nào.
 */
export function validateGameData(
  raw: Record<string, unknown>,
  opts: ValidateOptions = {},
): { data: GameData | null; issues: Issue[] } {
  const issues: Issue[] = [];
  const v = <T>(file: string, schema: Parameters<typeof validateFile<T>>[2]) =>
    file in raw ? validateFile(file, raw[file], schema, issues) : null;

  const list = <T extends { id: string }>(file: string, schema: Schema<T>) =>
    file in raw ? validateList(file, raw[file], schema, issues) : null;

  const config = v(DATA_FILES.config, configSchema);
  const items = list(DATA_FILES.items, itemSchema);
  const levels = list(DATA_FILES.levels, levelSchema);
  const landlords = list(DATA_FILES.landlords, landlordSchema);
  const lines: Partial<Record<Locale, LinesFile>> = {};
  const i18n: Partial<Record<Locale, Dictionary>> = {};
  for (const locale of LOCALES) {
    const l = v(DATA_FILES.lines(locale), linesSchema);
    if (l) lines[locale] = l;
    const d = v(DATA_FILES.i18n(locale), dictionarySchema);
    if (d) i18n[locale] = d;
  }

  const itemById = new Map((items?.valid ?? []).map((i) => [i.id, i]));
  if (items) checkItems(items.valid, items.ids, issues, opts);
  if (levels && items && landlords) {
    checkLevels(levels.valid, itemById, items.ids, landlords.ids, issues);
  }
  if (landlords && items) checkLandlords(landlords.valid, items.ids, lines, issues);
  checkLinesParity(lines, issues);
  checkI18nParity(i18n, issues);
  const maps = levels ? checkMaps(levels.valid, raw, issues) : {};

  const complete =
    config && items && levels && landlords && LOCALES.every((l) => lines[l] && i18n[l]);
  if (!complete || issues.length > 0) return { data: null, issues };
  return {
    data: {
      config,
      items: items.valid,
      itemById,
      levels: levels.valid,
      landlords: landlords.valid,
      lines: lines as Record<Locale, LinesFile>,
      i18n: i18n as Record<Locale, Dictionary>,
      maps,
    },
    issues,
  };
}
