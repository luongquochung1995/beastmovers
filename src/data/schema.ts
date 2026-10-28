/**
 * Bộ kiểm tra dữ liệu JSON nhỏ, tự viết (không thêm thư viện).
 * Mỗi schema vừa kiểm tra giá trị, vừa cho TypeScript suy ra kiểu (`Infer<typeof schema>`).
 * Lỗi được gom thành danh sách `Issue` để màn hình lỗi hiển thị đúng file, đúng trường.
 */

export type IssueParams = Record<string, string | number>;

export interface Issue {
  /** File data, vd. `items.json`. */
  file: string;
  /** Đường dẫn tới trường, vd. `[fridge].size.w`. */
  path: string;
  /** Mã lỗi; chữ hiển thị nằm ở khóa i18n `dataError.<code>`. */
  code: string;
  params?: IssueParams;
}

export interface CheckContext {
  file: string;
  issues: Issue[];
}

export interface Schema<T> {
  /** Trả về true nếu hợp lệ; nếu không thì thêm lỗi vào `ctx.issues`. */
  check(value: unknown, path: string, ctx: CheckContext): boolean;
  /** Chỉ dùng để suy kiểu, không có giá trị lúc chạy. */
  readonly _type?: T;
}

export interface OptionalSchema<T> extends Schema<T> {
  readonly optional: true;
}

export type Infer<S> = S extends Schema<infer T> ? T : never;

export function report(ctx: CheckContext, path: string, code: string, params?: IssueParams): false {
  ctx.issues.push(params ? { file: ctx.file, path, code, params } : { file: ctx.file, path, code });
  return false;
}

const typeName = (v: unknown): string =>
  v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v;

const join = (base: string, key: string) => (base ? `${base}.${key}` : key);

export function str(opts: { minLen?: number; pattern?: RegExp; patternName?: string } = {}) {
  return {
    check(v, path, ctx) {
      if (typeof v !== 'string')
        return report(ctx, path, 'type', { expected: 'string', actual: typeName(v) });
      if (opts.minLen !== undefined && v.length < opts.minLen) return report(ctx, path, 'empty');
      if (opts.pattern && !opts.pattern.test(v))
        return report(ctx, path, 'pattern', {
          value: v,
          pattern: opts.patternName ?? String(opts.pattern),
        });
      return true;
    },
  } satisfies Schema<string> as Schema<string>;
}

export function num(opts: { min?: number; max?: number; int?: boolean } = {}) {
  return {
    check(v, path, ctx) {
      if (typeof v !== 'number' || !Number.isFinite(v))
        return report(ctx, path, 'type', { expected: 'number', actual: typeName(v) });
      if (opts.int && !Number.isInteger(v)) return report(ctx, path, 'int', { value: v });
      if (opts.min !== undefined && v < opts.min)
        return report(ctx, path, 'min', { value: v, min: opts.min });
      if (opts.max !== undefined && v > opts.max)
        return report(ctx, path, 'max', { value: v, max: opts.max });
      return true;
    },
  } satisfies Schema<number> as Schema<number>;
}

export const int = (opts: { min?: number; max?: number } = {}) => num({ ...opts, int: true });

export function bool(): Schema<boolean> {
  return {
    check(v, path, ctx) {
      return typeof v === 'boolean'
        ? true
        : report(ctx, path, 'type', { expected: 'boolean', actual: typeName(v) });
    },
  };
}

export function oneOf<const T extends readonly string[]>(values: T): Schema<T[number]> {
  return {
    check(v, path, ctx) {
      if (typeof v === 'string' && values.includes(v)) return true;
      return report(ctx, path, 'enum', { value: String(v), allowed: values.join(', ') });
    },
  };
}

/**
 * Mảng. Phần tử là object có `id` thì đường dẫn lỗi dùng id (`[fridge]`) thay cho số thứ tự,
 * để người sửa data tìm ra ngay.
 */
export function arr<T>(item: Schema<T>, opts: { min?: number; max?: number } = {}): Schema<T[]> {
  return {
    check(v, path, ctx) {
      if (!Array.isArray(v))
        return report(ctx, path, 'type', { expected: 'array', actual: typeName(v) });
      let ok = true;
      if (opts.min !== undefined && v.length < opts.min)
        ok = report(ctx, path, 'minItems', { count: v.length, min: opts.min });
      if (opts.max !== undefined && v.length > opts.max)
        ok = report(ctx, path, 'maxItems', { count: v.length, max: opts.max });
      v.forEach((el, i) => {
        const id =
          el && typeof el === 'object' && typeof (el as { id?: unknown }).id === 'string'
            ? (el as { id: string }).id
            : String(i);
        if (!item.check(el, `${path}[${id}]`, ctx)) ok = false;
      });
      return ok;
    },
  };
}

/** Cặp số `[x, y]`. */
export function vec2(): Schema<[number, number]> {
  const n = num();
  return {
    check(v, path, ctx) {
      if (!Array.isArray(v) || v.length !== 2)
        return report(ctx, path, 'vec2', { actual: JSON.stringify(v) });
      return n.check(v[0], `${path}[0]`, ctx) && n.check(v[1], `${path}[1]`, ctx);
    },
  };
}

export function optional<T>(schema: Schema<T>): OptionalSchema<T> {
  return {
    optional: true,
    check: (v, path, ctx) => schema.check(v, path, ctx),
  };
}

export function nullable<T>(schema: Schema<T>): Schema<T | null> {
  return {
    check: (v, path, ctx) => v === null || schema.check(v, path, ctx),
  };
}

export function anyOf<A, B>(
  a: Schema<A>,
  b: Schema<B>,
  pick: (v: unknown) => 'a' | 'b',
): Schema<A | B> {
  return {
    check: (v, path, ctx) => (pick(v) === 'a' ? a.check(v, path, ctx) : b.check(v, path, ctx)),
  };
}

type Shape = Record<string, Schema<unknown>>;
type OptionalKeys<S extends Shape> = {
  [K in keyof S]: S[K] extends OptionalSchema<unknown> ? K : never;
}[keyof S];
type RequiredKeys<S extends Shape> = Exclude<keyof S, OptionalKeys<S>>;
type Simplify<T> = { [K in keyof T]: T[K] } & {};
export type ObjectOf<S extends Shape> = Simplify<
  { [K in RequiredKeys<S>]: Infer<S[K]> } & { [K in OptionalKeys<S>]?: Infer<S[K]> }
>;

/**
 * Object có các trường cố định. Trường lạ bị báo lỗi (thường là gõ sai tên trường),
 * trừ khi `allowUnknown` (vd. file của Tiled có nhiều trường phụ không cần dùng).
 */
export function obj<S extends Shape>(
  shape: S,
  opts: { allowUnknown?: boolean } = {},
): Schema<ObjectOf<S>> {
  return {
    check(v, path, ctx) {
      if (typeof v !== 'object' || v === null || Array.isArray(v))
        return report(ctx, path, 'type', { expected: 'object', actual: typeName(v) });
      const rec = v as Record<string, unknown>;
      let ok = true;
      for (const [key, schema] of Object.entries(shape)) {
        if (!(key in rec)) {
          if (!(schema as Partial<OptionalSchema<unknown>>).optional)
            ok = report(ctx, join(path, key), 'required');
          continue;
        }
        if (!schema.check(rec[key], join(path, key), ctx)) ok = false;
      }
      if (!opts.allowUnknown) {
        for (const key of Object.keys(rec)) {
          if (!(key in shape)) ok = report(ctx, join(path, key), 'unknownField', { field: key });
        }
      }
      return ok;
    },
  };
}

/** Object dạng từ điển `{ [khóa]: giá trị }`. */
export function record<T>(value: Schema<T>, key?: Schema<string>): Schema<Record<string, T>> {
  return {
    check(v, path, ctx) {
      if (typeof v !== 'object' || v === null || Array.isArray(v))
        return report(ctx, path, 'type', { expected: 'object', actual: typeName(v) });
      let ok = true;
      for (const [k, el] of Object.entries(v as Record<string, unknown>)) {
        const p = join(path, k);
        if (key && !key.check(k, p, ctx)) ok = false;
        if (!value.check(el, p, ctx)) ok = false;
      }
      return ok;
    },
  };
}

/** Chạy schema trên một file, trả về giá trị đã kiểm tra hoặc null. */
export function validateFile<T>(
  file: string,
  value: unknown,
  schema: Schema<T>,
  issues: Issue[],
): T | null {
  const ctx: CheckContext = { file, issues };
  return schema.check(value, '', ctx) ? (value as T) : null;
}
