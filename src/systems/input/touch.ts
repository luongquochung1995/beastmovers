import { Btn, type InputFrame, quantizeAxis } from './InputFrame';

/**
 * Điều khiển cảm ứng (điện thoại, máy tính bảng). Phần giao diện (cần ảo, nút) ghi vào
 * `TouchState`; nguồn input `touch0` đọc ra `InputFrame` như bàn phím hay tay cầm, nên logic
 * game và chơi online không cần biết người chơi đang dùng cảm ứng.
 */
export interface TouchState {
  /** Hướng cần ảo, độ dài 0..1. */
  x: number;
  y: number;
  /** Bitmask nút đang giữ (Btn). */
  buttons: number;
  /** Nút được bấm từ lần đọc trước (giữ cú chạm nhanh tới lần đọc kế). */
  tapped: number;
}

export const touchState: TouchState = { x: 0, y: 0, buttons: 0, tapped: 0 };

/** Bán kính cần ảo (px CSS): kéo xa hơn vẫn tính là nghiêng hết cỡ. */
export const STICK_RADIUS = 56;
/** Vùng chết của cần ảo (tỉ lệ bán kính). */
const STICK_DEADZONE = 0.18;

/** Đổi độ lệch ngón tay so với tâm cần (px) thành hướng 0..1 (có vùng chết, tối đa 1). */
export function stickVector(
  dx: number,
  dy: number,
  radius = STICK_RADIUS,
): { x: number; y: number } {
  const len = Math.hypot(dx, dy);
  if (len < radius * STICK_DEADZONE) return { x: 0, y: 0 };
  const k = Math.min(1, len / radius) / len;
  return { x: dx * k, y: dy * k };
}

export function frameFromTouch(s: TouchState): InputFrame {
  return { mx: quantizeAxis(s.x), my: quantizeAxis(s.y), buttons: s.buttons | s.tapped };
}

export function pressButton(btn: number, down: boolean): void {
  if (down) {
    touchState.buttons |= btn;
    touchState.tapped |= btn;
  } else touchState.buttons &= ~btn;
}

export function resetTouch(): void {
  touchState.x = 0;
  touchState.y = 0;
  touchState.buttons = 0;
  touchState.tapped = 0;
}

/** Nút trên màn hình cảm ứng, theo thứ tự hiển thị (nút to nhất trước). */
export const TOUCH_BUTTONS = [
  { btn: Btn.Grab, key: 'button.grab' },
  { btn: Btn.Throw, key: 'button.throw' },
  { btn: Btn.Dash, key: 'button.dash' },
  { btn: Btn.Ping, key: 'button.ping' },
] as const;

// ---------- Chế độ cảm ứng ----------

let touchMode = false;
const listeners: (() => void)[] = [];

/** Máy chủ yếu dùng cảm ứng (điện thoại/máy tính bảng): không có chuột/bút chính xác. */
export function isTouchPrimary(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return (
    window.matchMedia('(pointer: coarse)').matches &&
    !window.matchMedia('(any-pointer: fine)').matches
  );
}

/** Đang chơi bằng cảm ứng: máy cảm ứng, hoặc đã có người chạm vào màn hình. */
export function inTouchMode(): boolean {
  return touchMode;
}

/** Đăng ký nghe khi chế độ cảm ứng bật/tắt; trả về hàm hủy đăng ký. */
export function onTouchMode(cb: () => void): () => void {
  listeners.push(cb);
  return () => {
    const k = listeners.indexOf(cb);
    if (k >= 0) listeners.splice(k, 1);
  };
}

export function setTouchMode(on: boolean): void {
  if (touchMode === on) return;
  touchMode = on;
  for (const cb of listeners) cb();
}

/** Gọi một lần lúc khởi động: bật chế độ cảm ứng theo loại máy và khi có người chạm màn hình. */
export function detectTouch(target: Window = window): void {
  if (isTouchPrimary()) setTouchMode(true);
  target.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'touch') setTouchMode(true);
  });
}
