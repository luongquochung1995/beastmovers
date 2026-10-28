import { Btn, type InputFrame, quantizeAxis } from './InputFrame';

export interface PadButtonLike {
  pressed: boolean;
}

/** Nút theo "standard mapping" của Gamepad API (Xbox: A B X Y; PlayStation: ✕ ○ □ △). */
export const PAD_BUTTON = {
  A: 0,
  B: 1,
  X: 2,
  Y: 3,
  Start: 9,
  DpadUp: 12,
  DpadDown: 13,
  DpadLeft: 14,
  DpadRight: 15,
} as const;

export const DEFAULT_DEADZONE = 0.2;

/** Vùng chết hình tròn, sau đó co giãn lại để vừa ra khỏi vùng chết là bắt đầu từ 0. */
export function applyRadialDeadzone(
  x: number,
  y: number,
  deadzone: number,
): { x: number; y: number } {
  const len = Math.hypot(x, y);
  if (len <= deadzone) return { x: 0, y: 0 };
  const scaled = Math.min(1, (len - deadzone) / (1 - deadzone));
  return { x: (x / len) * scaled, y: (y / len) * scaled };
}

const isPressed = (buttons: readonly PadButtonLike[], i: number) => buttons[i]?.pressed === true;

export function frameFromGamepad(
  axes: readonly number[],
  buttons: readonly PadButtonLike[],
  deadzone = DEFAULT_DEADZONE,
): InputFrame {
  let { x, y } = applyRadialDeadzone(axes[0] ?? 0, axes[1] ?? 0, deadzone);
  // Cần trái nằm yên thì dùng D-pad.
  if (x === 0 && y === 0) {
    x =
      (isPressed(buttons, PAD_BUTTON.DpadRight) ? 1 : 0) -
      (isPressed(buttons, PAD_BUTTON.DpadLeft) ? 1 : 0);
    y =
      (isPressed(buttons, PAD_BUTTON.DpadDown) ? 1 : 0) -
      (isPressed(buttons, PAD_BUTTON.DpadUp) ? 1 : 0);
    if (x !== 0 && y !== 0) {
      x *= Math.SQRT1_2;
      y *= Math.SQRT1_2;
    }
  }
  let b = 0;
  if (isPressed(buttons, PAD_BUTTON.A)) b |= Btn.Grab;
  if (isPressed(buttons, PAD_BUTTON.B)) b |= Btn.Throw;
  if (isPressed(buttons, PAD_BUTTON.X)) b |= Btn.Dash;
  if (isPressed(buttons, PAD_BUTTON.Y)) b |= Btn.Ping;
  if (isPressed(buttons, PAD_BUTTON.Start)) b |= Btn.Start;
  return { mx: quantizeAxis(x), my: quantizeAxis(y), buttons: b };
}
