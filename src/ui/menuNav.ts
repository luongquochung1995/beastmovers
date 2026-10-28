import { applyRadialDeadzone, PAD_BUTTON } from '../systems/input/gamepad';

/** Hành động điều hướng menu, dùng chung cho bàn phím, tay cầm và chuột. */
export type NavAction = 'up' | 'down' | 'left' | 'right' | 'confirm' | 'back';

const DIRS = ['up', 'down', 'left', 'right'] as const;
/** Giữ hướng bao lâu thì bắt đầu tự lặp, và lặp nhanh cỡ nào. */
const REPEAT_DELAY_MS = 380;
const REPEAT_EVERY_MS = 120;

/**
 * Biến trạng thái nút đang giữ (mỗi khung hình) thành hành động: nút xác nhận/quay lại chỉ tính
 * lúc vừa nhấn; giữ hướng thì tự lặp. Lần đọc đầu chỉ ghi nhớ, không phát gì: nút A vừa bấm ở
 * màn trước (vẫn đang giữ) không bị tính là bấm ở màn mới.
 */
export class NavRepeat {
  private held = new Set<NavAction>();
  private primed = false;
  private dirMs = 0;
  private repeating = false;

  update(dtMs: number, now: ReadonlySet<NavAction>): NavAction[] {
    const out: NavAction[] = [];
    if (!this.primed) {
      this.primed = true;
      this.held = new Set(now);
      return out;
    }
    for (const a of now) if (!this.held.has(a)) out.push(a);
    const dir = DIRS.find((d) => now.has(d));
    if (dir && this.held.has(dir)) {
      this.dirMs += dtMs;
      const limit = this.repeating ? REPEAT_EVERY_MS : REPEAT_DELAY_MS;
      if (this.dirMs >= limit) {
        this.dirMs = 0;
        this.repeating = true;
        out.push(dir);
      }
    } else {
      this.dirMs = 0;
      this.repeating = false;
    }
    this.held = new Set(now);
    return out;
  }
}

type PadLike = Pick<Gamepad, 'axes' | 'buttons' | 'connected'>;

/** Gộp mọi tay cầm đang cắm: bất kỳ tay cầm nào cũng điều khiển được menu. */
export function padNavState(pads: readonly (PadLike | null)[]): Set<NavAction> {
  const out = new Set<NavAction>();
  for (const pad of pads) {
    if (!pad?.connected) continue;
    const pressed = (i: number) => pad.buttons[i]?.pressed === true;
    const { x, y } = applyRadialDeadzone(pad.axes[0] ?? 0, pad.axes[1] ?? 0, 0.5);
    if (y < -0.3 || pressed(PAD_BUTTON.DpadUp)) out.add('up');
    if (y > 0.3 || pressed(PAD_BUTTON.DpadDown)) out.add('down');
    if (x < -0.3 || pressed(PAD_BUTTON.DpadLeft)) out.add('left');
    if (x > 0.3 || pressed(PAD_BUTTON.DpadRight)) out.add('right');
    if (pressed(PAD_BUTTON.A) || pressed(PAD_BUTTON.Start)) out.add('confirm');
    if (pressed(PAD_BUTTON.B)) out.add('back');
  }
  return out;
}

/** Phím điều hướng menu. Cả WASD và mũi tên đều dùng được. */
export const MENU_KEYS: Record<string, NavAction> = {
  ArrowUp: 'up',
  KeyW: 'up',
  ArrowDown: 'down',
  KeyS: 'down',
  ArrowLeft: 'left',
  KeyA: 'left',
  ArrowRight: 'right',
  KeyD: 'right',
  Enter: 'confirm',
  NumpadEnter: 'confirm',
  Space: 'confirm',
  Escape: 'back',
  Backspace: 'back',
};
