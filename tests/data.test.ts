import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { fnv1a, hashFiles } from '../src/data/hash';
import { lineColumn, loadGameData, type ReadText } from '../src/data/loader';
import type { Issue } from '../src/data/schema';
import { allDataFiles } from '../src/data/validate';
import { KNOWN_BEHAVIORS } from '../src/systems/behaviors/names';

const DATA_DIR = join(__dirname, '..', 'public', 'data');
const realText = (file: string) => readFileSync(join(DATA_DIR, file), 'utf8');

/** Đọc data thật, cho phép sửa từng file (dạng JSON) hoặc thay bằng chuỗi thô. */
function reader(
  patch: Record<string, (json: never) => void> = {},
  rawOverride: Record<string, string | null> = {},
): ReadText {
  return async (file) => {
    if (file in rawOverride) {
      const raw = rawOverride[file];
      if (raw === null) throw new Error('HTTP 404');
      return raw!;
    }
    const text = realText(file);
    const fix = patch[file];
    if (!fix) return text;
    const json = JSON.parse(text) as never;
    fix(json);
    return JSON.stringify(json, null, 2);
  };
}

type Item = Record<string, unknown> & { id: string };
const item = (items: Item[], id: string) => items.find((i) => i.id === id)!;
const load = (r: ReadText) => loadGameData(r, { knownBehaviors: KNOWN_BEHAVIORS });

async function issuesFor(r: ReadText): Promise<Issue[]> {
  const res = await load(r);
  expect(res.ok).toBe(false);
  return res.issues;
}

describe('Data thật trong public/data', () => {
  it('hợp lệ hoàn toàn', async () => {
    const res = await load(reader());
    if (!res.ok) console.error(res.issues);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.items.length).toBeGreaterThanOrEqual(10);
      expect(res.hash).toMatch(/^[0-9a-f]{8}$/);
    }
  });

  it('có đủ 16 món đồ trong plan', async () => {
    const res = await load(reader());
    const ids = res.ok ? res.data.items.map((i) => i.id) : [];
    for (const id of [
      'box',
      'mirror',
      'plant',
      'teddy',
      'fridge',
      'sofa',
      'cat',
      'fish_tank',
      'treadmill',
      'upright_piano',
      'safe',
      'pool_table',
      'weight_rack',
      'giant_aquarium',
      'grand_piano',
      'statue',
    ]) {
      expect(ids).toContain(id);
    }
  });
});

describe('Báo lỗi đúng file, đúng trường', () => {
  it('giá trị nhỏ hơn mức tối thiểu', async () => {
    const issues = await issuesFor(
      reader({
        'items.json': (items: Item[]) => ((item(items, 'fridge').size as { w: number }).w = 0),
      }),
    );
    expect(issues).toContainEqual(
      expect.objectContaining({ file: 'items.json', path: '[fridge].size.w', code: 'min' }),
    );
  });

  it('thiếu trường bắt buộc', async () => {
    const issues = await issuesFor(
      reader({ 'items.json': (items: Item[]) => delete item(items, 'mirror').mass }),
    );
    expect(issues).toContainEqual(
      expect.objectContaining({ file: 'items.json', path: '[mirror].mass', code: 'required' }),
    );
  });

  it('gõ sai tên trường', async () => {
    const issues = await issuesFor(
      reader({
        'items.json': (items: Item[]) => {
          const sofa = item(items, 'sofa');
          sofa.frction = sofa.friction;
          delete sofa.friction;
        },
      }),
    );
    expect(issues).toContainEqual(
      expect.objectContaining({ path: '[sofa].frction', code: 'unknownField' }),
    );
    expect(issues).toContainEqual(
      expect.objectContaining({ path: '[sofa].friction', code: 'required' }),
    );
  });

  it('sai kiểu và giá trị ngoài danh sách', async () => {
    const issues = await issuesFor(
      reader({
        'items.json': (items: Item[]) => {
          item(items, 'safe').liftRule = 'carry';
          item(items, 'box').value = '20';
        },
      }),
    );
    expect(issues).toContainEqual(
      expect.objectContaining({ path: '[safe].liftRule', code: 'enum' }),
    );
    expect(issues).toContainEqual(
      expect.objectContaining({
        path: '[box].value',
        code: 'type',
        params: { expected: 'number', actual: 'string' },
      }),
    );
  });

  it('trùng id, hành vi lạ, thiếu bản dịch', async () => {
    const issues = await issuesFor(
      reader({
        'items.json': (items: Item[]) => {
          items.push({ ...item(items, 'box') });
          item(items, 'plant').behaviors = ['teleport'];
          (item(items, 'teddy').name as Record<string, string>).vi = '';
        },
      }),
    );
    expect(issues).toContainEqual(
      expect.objectContaining({ code: 'duplicateId', params: { id: 'box' } }),
    );
    expect(issues).toContainEqual(
      expect.objectContaining({ path: '[plant].behaviors[0]', code: 'unknownBehavior' }),
    );
    expect(issues).toContainEqual(
      expect.objectContaining({ path: '[teddy].name.vi', code: 'missingTranslation' }),
    );
  });

  it('ít điểm nắm hơn số người cần', async () => {
    const issues = await issuesFor(
      reader({
        'items.json': (items: Item[]) => (item(items, 'grand_piano').grabPoints = [[0, 0]]),
      }),
    );
    expect(issues).toContainEqual(
      expect.objectContaining({ path: '[grand_piano].grabPoints', code: 'tooFewGrabPoints' }),
    );
  });

  it('màn tham chiếu đồ không tồn tại', async () => {
    const issues = await issuesFor(
      reader({
        'levels.json': (levels: { spawns: { item: string }[] }[]) =>
          (levels[0]!.spawns[0]!.item = 'unicorn'),
      }),
    );
    expect(issues).toContainEqual(
      expect.objectContaining({
        file: 'levels.json',
        path: '[lv01_studio].spawns[0].item',
        code: 'unknownItem',
      }),
    );
  });

  it('màn không thể qua: đồ bắt buộc cần nhiều người hơn số người tối thiểu', async () => {
    const issues = await issuesFor(
      reader({
        'levels.json': (levels: { spawns: unknown[] }[]) =>
          levels[0]!.spawns.push({ item: 'grand_piano', x: 0, y: 0, required: true }),
      }),
    );
    expect(issues).toContainEqual(
      expect.objectContaining({
        code: 'levelInfeasible',
        params: { item: 'grand_piano', required: 8, minPlayers: 1 },
      }),
    );
  });

  it('mốc sao không tăng dần', async () => {
    const issues = await issuesFor(
      reader({
        'levels.json': (levels: { stars: number[] }[]) => (levels[0]!.stars = [900, 500, 1300]),
      }),
    );
    expect(issues).toContainEqual(
      expect.objectContaining({ path: '[lv01_studio].stars', code: 'starsOrder' }),
    );
  });

  it('thoại hai ngôn ngữ lệch số câu', async () => {
    const issues = await issuesFor(
      reader({
        'lines.vi.json': (lines: Record<string, Record<string, string[]>>) =>
          lines.grandma!.itemBroken!.push('Thêm câu'),
      }),
    );
    expect(issues).toContainEqual(
      expect.objectContaining({
        file: 'lines.vi.json',
        path: 'grandma.itemBroken',
        code: 'linesMismatch',
      }),
    );
  });

  it('chủ nhà trỏ tới bộ thoại không có', async () => {
    const issues = await issuesFor(
      reader({ 'landlords.json': (l: { linesKey: string }[]) => (l[0]!.linesKey = 'nobody') }),
    );
    expect(issues).toContainEqual(
      expect.objectContaining({ path: '[grandma].linesKey', code: 'unknownLinesKey' }),
    );
  });

  it('chữ giao diện thiếu khóa ở một ngôn ngữ', async () => {
    const issues = await issuesFor(
      reader({ 'i18n/vi.json': (d: Record<string, string>) => delete d['menu.start'] }),
    );
    expect(issues).toContainEqual(
      expect.objectContaining({
        file: 'i18n/vi.json',
        code: 'i18nMismatch',
        params: { key: 'menu.start', missingIn: 'vi' },
      }),
    );
  });

  it('JSON sai cú pháp: báo đúng dòng', async () => {
    const broken = realText('landlords.json').replace('"voicePitch": 1.3,', '"voicePitch": 1.3,,');
    const issues = await issuesFor(reader({}, { 'landlords.json': broken }));
    const issue = issues.find((i) => i.code === 'jsonSyntax');
    expect(issue?.file).toBe('landlords.json');
    const expectedLine = broken.split('\n').findIndex((l) => l.includes('1.3,,')) + 1;
    expect(issue?.params?.line).toBe(expectedLine);
  });

  it('thiếu file', async () => {
    const issues = await issuesFor(reader({}, { 'levels.json': null }));
    expect(issues).toContainEqual(
      expect.objectContaining({ file: 'levels.json', code: 'fileMissing' }),
    );
  });
});

describe('Hash data', () => {
  it('không phụ thuộc thứ tự file, đổi khi nội dung đổi', () => {
    expect(hashFiles({ a: '1', b: '2' })).toBe(hashFiles({ b: '2', a: '1' }));
    expect(hashFiles({ a: '1', b: '2' })).not.toBe(hashFiles({ a: '1', b: '3' }));
    expect(fnv1a('')).toBe('811c9dc5');
  });

  it('đổi một số trong data thì hash đổi', async () => {
    const a = await load(reader());
    const b = await load(
      reader({ 'config.json': (c: { grabRange: number }) => (c.grabRange = 41) }),
    );
    expect(a.ok && b.ok && a.hash !== b.hash).toBe(true);
  });
});

it('lineColumn', () => {
  expect(lineColumn('ab\ncd\nef', 4)).toEqual({ line: 2, column: 2 });
});

it('danh sách file data gồm cả hai ngôn ngữ', () => {
  expect(allDataFiles()).toEqual(
    expect.arrayContaining(['lines.en.json', 'lines.vi.json', 'i18n/en.json', 'i18n/vi.json']),
  );
});

it('món đồ sai schema không gây lỗi dây chuyền "không có món đồ" ở levels.json', async () => {
  const issues = await issuesFor(
    reader({ 'items.json': (items: Item[]) => delete item(items, 'mirror').mass }),
  );
  expect(issues.filter((i) => i.file === 'levels.json')).toEqual([]);
});
