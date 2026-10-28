import { hashFiles } from './hash';
import type { Issue } from './schema';
import { allDataFiles, type GameData, validateGameData, type ValidateOptions } from './validate';

export type ReadText = (file: string) => Promise<string>;

export type LoadResult =
  { ok: true; data: GameData; hash: string; issues: Issue[] } | { ok: false; issues: Issue[] };

/** Đổi vị trí ký tự trong chuỗi thành dòng/cột (bắt đầu từ 1). */
export function lineColumn(text: string, position: number): { line: number; column: number } {
  const before = text.slice(0, position);
  const line = before.split('\n').length;
  return { line, column: position - before.lastIndexOf('\n') };
}

export function parseJson(file: string, text: string, issues: Issue[]): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const pos = /position (\d+)/.exec(message);
    const { line, column } = pos ? lineColumn(text, Number(pos[1])) : { line: 0, column: 0 };
    issues.push({ file, path: '', code: 'jsonSyntax', params: { line, column, message } });
    return undefined;
  }
}

/** Trình duyệt: đọc file tĩnh trong `data/` bằng fetch. */
export const fetchText =
  (base = 'data/'): ReadText =>
  async (file) => {
    const res = await fetch(base + file, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.text();
  };

/** Đọc, parse và kiểm tra toàn bộ data game. Không bao giờ ném lỗi: lỗi nằm trong `issues`. */
export async function loadGameData(
  readText: ReadText,
  opts: ValidateOptions = {},
): Promise<LoadResult> {
  const issues: Issue[] = [];
  const files = allDataFiles();
  const texts: Record<string, string> = {};
  const raw: Record<string, unknown> = {};

  const results = await Promise.allSettled(files.map((f) => readText(f)));
  results.forEach((r, i) => {
    const file = files[i]!;
    if (r.status === 'rejected') {
      issues.push({ file, path: '', code: 'fileMissing', params: { reason: String(r.reason) } });
      return;
    }
    texts[file] = r.value;
    const value = parseJson(file, r.value, issues);
    if (value !== undefined) raw[file] = value;
  });

  const { data, issues: dataIssues } = validateGameData(raw, opts);
  issues.push(...dataIssues);
  if (!data || issues.length > 0) return { ok: false, issues };
  return { ok: true, data, hash: hashFiles(texts), issues };
}
