/**
 * Một khung input chuẩn của một người chơi trong một bước logic.
 * Mọi logic game chỉ đọc `InputFrame`, không bao giờ đọc phím hay tay cầm trực tiếp,
 * nhờ vậy sau này gửi được qua mạng (P22) mà không phải sửa logic.
 */
export interface InputFrame {
  /** Trục ngang, số nguyên -127..127 (int8). */
  mx: number;
  /** Trục dọc, số nguyên -127..127 (int8), dương là đi xuống. */
  my: number;
  /** Bitmask các nút, xem `Btn`. */
  buttons: number;
}

export const Btn = {
  Grab: 1 << 0,
  Throw: 1 << 1,
  Dash: 1 << 2,
  Ping: 1 << 3,
  Start: 1 << 4,
} as const;

export type BtnName = keyof typeof Btn;

export const EMPTY_FRAME: Readonly<InputFrame> = Object.freeze({ mx: 0, my: 0, buttons: 0 });

const AXIS_MAX = 127;

/** Đổi giá trị -1..1 thành int8. */
export function quantizeAxis(v: number): number {
  const clamped = Math.max(-1, Math.min(1, v));
  return Math.round(clamped * AXIS_MAX);
}

/** Đổi trục int8 về vector số thực, độ dài tối đa 1. */
export function frameAxis(frame: InputFrame): { x: number; y: number } {
  let x = frame.mx / AXIS_MAX;
  let y = frame.my / AXIS_MAX;
  const len = Math.hypot(x, y);
  if (len > 1) {
    x /= len;
    y /= len;
  }
  return { x, y };
}

export function isDown(frame: InputFrame, btn: number): boolean {
  return (frame.buttons & btn) !== 0;
}

/** Nút vừa được nhấn ở khung này (khung trước chưa nhấn). */
export function justPressed(prev: InputFrame, cur: InputFrame, btn: number): boolean {
  return isDown(cur, btn) && !isDown(prev, btn);
}

export function hasAnyInput(frame: InputFrame): boolean {
  return frame.mx !== 0 || frame.my !== 0 || frame.buttons !== 0;
}
