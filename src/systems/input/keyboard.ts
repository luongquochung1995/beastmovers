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

/** Bố cục phím theo `KeyboardEvent.code` (không phụ thuộc kiểu bàn phím QWERTY/AZERTY). */
export const KEYBOARD_LAYOUTS: readonly KeyboardLayout[] = [
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

/** Theo dõi các phím đang nhấn trên toàn trang. */
export class KeyboardTracker {
  readonly keys = new Set<string>();
  /**
   * Phím đã nhấn kể từ lần đọc trước. Bấm nhanh (nhấn và thả trong cùng một khung hình,
   * hay khi máy chậm) vẫn được tính là đang nhấn ở lần đọc kế tiếp.
   */
  private readonly tapped = new Set<string>();
  private readonly gameCodes: Set<string>;

  constructor(private readonly target: Window = window) {
    this.gameCodes = new Set(
      KEYBOARD_LAYOUTS.flatMap((l) => [
        ...l.up,
        ...l.down,
        ...l.left,
        ...l.right,
        ...l.grab,
        ...l.throw,
        ...l.dash,
        ...l.ping,
      ]),
    );
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
    if (this.gameCodes.has(e.code)) e.preventDefault();
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
