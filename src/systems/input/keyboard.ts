import { Btn, type InputFrame, quantizeAxis } from './InputFrame';

export interface KeyboardLayout {
  /** Khóa i18n của tên bố cục. */
  nameKey: string;
  up: string[];
  down: string[];
  left: string[];
  right: string[];
  grab: string[];
  throw: string[];
  dash: string[];
  ping: string[];
}

export const KEY_ACTIONS = [
  'up',
  'down',
  'left',
  'right',
  'grab',
  'throw',
  'dash',
  'ping',
] as const;
export type KeyAction = (typeof KEY_ACTIONS)[number];

/** Bố cục phím mặc định theo `KeyboardEvent.code` (không phụ thuộc kiểu bàn phím QWERTY/AZERTY). */
export const DEFAULT_LAYOUTS: readonly KeyboardLayout[] = [
  {
    nameKey: 'layout.wasd',
    up: ['KeyW'],
    down: ['KeyS'],
    left: ['KeyA'],
    right: ['KeyD'],
    grab: ['Space'],
    throw: ['KeyE'],
    dash: ['KeyQ'],
    ping: ['KeyF'],
  },
  {
    nameKey: 'layout.arrows',
    up: ['ArrowUp'],
    down: ['ArrowDown'],
    left: ['ArrowLeft'],
    right: ['ArrowRight'],
    grab: ['Enter', 'NumpadEnter', 'Numpad0'],
    throw: ['ShiftRight', 'Numpad1'],
    dash: ['ControlRight', 'Numpad2'],
    ping: ['Numpad3'],
  },
];

/** Phím chính của từng hành động trên từng bố cục (phím người chơi đã đổi). */
export type KeyBindings = Partial<Record<string, string>>[];

/** Phím dành cho menu/debug, không cho gán vào hành động. */
export const RESERVED_KEYS = new Set(['Escape', 'F1', 'Tab', 'MetaLeft', 'MetaRight']);

/** Phím chính đang dùng của một hành động. */
export function primaryKey(bindings: KeyBindings, layout: number, action: KeyAction): string {
  return bindings[layout]?.[action] ?? DEFAULT_LAYOUTS[layout]![action][0]!;
}

/**
 * Dựng bố cục từ phím đã đổi: phím chính thay phím đầu của mặc định, các phím phụ mặc định
 * (vd. Numpad) giữ lại nếu không trùng phím chính nào.
 */
export function effectiveLayouts(bindings: KeyBindings): KeyboardLayout[] {
  const primaries = new Set(
    DEFAULT_LAYOUTS.flatMap((_, i) => KEY_ACTIONS.map((a) => primaryKey(bindings, i, a))),
  );
  return DEFAULT_LAYOUTS.map((def, i) => {
    const layout = { ...def };
    for (const a of KEY_ACTIONS) {
      const alts = def[a].slice(1).filter((c) => !primaries.has(c));
      layout[a] = [primaryKey(bindings, i, a), ...alts];
    }
    return layout;
  });
}

/**
 * Gán phím `code` cho `action` của bố cục `layout`. Phím đó đang là phím chính của hành động
 * khác (bố cục nào cũng vậy) thì hai bên đổi chỗ cho nhau, để không hành động nào mất phím.
 */
export function rebindKey(
  bindings: KeyBindings,
  layout: number,
  action: KeyAction,
  code: string,
): KeyBindings {
  const next: KeyBindings = DEFAULT_LAYOUTS.map((_, i) => ({ ...bindings[i] }));
  const old = primaryKey(bindings, layout, action);
  DEFAULT_LAYOUTS.forEach((_, i) => {
    for (const a of KEY_ACTIONS) {
      if ((i !== layout || a !== action) && primaryKey(bindings, i, a) === code) next[i]![a] = old;
    }
  });
  next[layout]![action] = code;
  return next;
}

/** Bố cục đang dùng (đổi bằng `applyKeyBindings`). */
export let KEYBOARD_LAYOUTS: readonly KeyboardLayout[] = DEFAULT_LAYOUTS;

export function applyKeyBindings(bindings: KeyBindings | undefined): void {
  KEYBOARD_LAYOUTS = effectiveLayouts(bindings ?? []);
}

/** Tên phím ngắn gọn để hiện trên màn hình. */
export function keyLabel(code: string): string {
  const named: Record<string, string> = {
    ArrowUp: '↑',
    ArrowDown: '↓',
    ArrowLeft: '←',
    ArrowRight: '→',
    Space: 'Space',
    Enter: 'Enter',
    NumpadEnter: 'Num Enter',
    ShiftLeft: 'Shift L',
    ShiftRight: 'Shift R',
    ControlLeft: 'Ctrl L',
    ControlRight: 'Ctrl R',
    AltLeft: 'Alt L',
    AltRight: 'Alt R',
    Backspace: '⌫',
    Backquote: '`',
    Minus: '-',
    Equal: '=',
    BracketLeft: '[',
    BracketRight: ']',
    Backslash: '\\',
    Semicolon: ';',
    Quote: "'",
    Comma: ',',
    Period: '.',
    Slash: '/',
  };
  if (named[code]) return named[code];
  let m = /^Key([A-Z])$/.exec(code);
  if (m) return m[1]!;
  m = /^Digit(\d)$/.exec(code);
  if (m) return m[1]!;
  m = /^Numpad(.+)$/.exec(code);
  if (m) return `Num ${m[1]}`;
  return code;
}

const anyDown = (keys: ReadonlySet<string>, codes: readonly string[]) =>
  codes.some((c) => keys.has(c));

/** Tính `InputFrame` từ tập phím đang nhấn. Đi chéo được chuẩn hóa để không nhanh hơn đi thẳng. */
export function frameFromKeys(keys: ReadonlySet<string>, layout: KeyboardLayout): InputFrame {
  let x = (anyDown(keys, layout.right) ? 1 : 0) - (anyDown(keys, layout.left) ? 1 : 0);
  let y = (anyDown(keys, layout.down) ? 1 : 0) - (anyDown(keys, layout.up) ? 1 : 0);
  if (x !== 0 && y !== 0) {
    x *= Math.SQRT1_2;
    y *= Math.SQRT1_2;
  }
  let buttons = 0;
  if (anyDown(keys, layout.grab)) buttons |= Btn.Grab;
  if (anyDown(keys, layout.throw)) buttons |= Btn.Throw;
  if (anyDown(keys, layout.dash)) buttons |= Btn.Dash;
  if (anyDown(keys, layout.ping)) buttons |= Btn.Ping;
  return { mx: quantizeAxis(x), my: quantizeAxis(y), buttons };
}

/** Phím đang được gán cho một hành động (bố cục hiện tại). */
function isGameKey(code: string): boolean {
  return KEYBOARD_LAYOUTS.some((l) => KEY_ACTIONS.some((a) => l[a].includes(code)));
}

/** Theo dõi các phím đang nhấn trên toàn trang. */
export class KeyboardTracker {
  readonly keys = new Set<string>();
  /**
   * Phím đã nhấn kể từ lần đọc trước. Bấm nhanh (nhấn và thả trong cùng một khung hình,
   * hay khi máy chậm) vẫn được tính là đang nhấn ở lần đọc kế tiếp.
   */
  private readonly tapped = new Set<string>();

  constructor(private readonly target: Window = window) {
    target.addEventListener('keydown', this.onDown);
    target.addEventListener('keyup', this.onUp);
    target.addEventListener('blur', this.onBlur);
  }

  destroy(): void {
    this.target.removeEventListener('keydown', this.onDown);
    this.target.removeEventListener('keyup', this.onUp);
    this.target.removeEventListener('blur', this.onBlur);
    this.keys.clear();
  }

  /** Phím đang nhấn, cộng phím vừa bấm nhanh từ lần đọc trước. */
  get active(): ReadonlySet<string> {
    if (this.tapped.size === 0) return this.keys;
    return new Set([...this.keys, ...this.tapped]);
  }

  /** Gọi sau mỗi lần đọc input (InputManager.poll). */
  endPoll(): void {
    this.tapped.clear();
  }

  private readonly onDown = (e: KeyboardEvent) => {
    this.keys.add(e.code);
    this.tapped.add(e.code);
    // Chặn cuộn trang bằng phím mũi tên / Space khi đang chơi.
    if (isGameKey(e.code)) e.preventDefault();
  };

  private readonly onUp = (e: KeyboardEvent) => {
    this.keys.delete(e.code);
  };

  // Chuyển tab thì trình duyệt không gửi keyup, nên xóa hết để nhân vật không tự chạy.
  private readonly onBlur = () => {
    this.keys.clear();
    this.tapped.clear();
  };
}
