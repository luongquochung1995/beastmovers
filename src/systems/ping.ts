import { Btn, frameAxis, type InputFrame, isDown } from './input/InputFrame';

/**
 * Ping nhanh thay cho voice chat. Bấm nhanh nút Ping: ping theo ngữ cảnh (đứng gần món đồ
 * thiếu người khiêng thì "Cần thêm N người!", không thì "Lại đây khiêng!"). Giữ nút Ping:
 * mở vòng ping, nghiêng hướng để chọn, nhả nút để gửi. Mọi thứ tính từ `InputFrame` nên chạy
 * y hệt ở host và khi chơi chung máy.
 */
export const WHEEL_PINGS = ['come', 'lift', 'drop', 'cat', 'door'] as const;
export type WheelPing = (typeof WHEEL_PINGS)[number];
/** `need`: ping lên món đồ đang thiếu người. */
export type PingKind = WheelPing | 'need';

/** Góc của từng ô trên vòng (độ, 0 = lên, theo chiều kim đồng hồ). */
export const WHEEL_ANGLES: Record<WheelPing, number> = {
  come: 0,
  cat: 45,
  lift: 90,
  drop: 180,
  door: 270,
};

export const PING_ICONS: Record<PingKind, string> = {
  come: '👐',
  lift: '⬆️',
  drop: '✋',
  cat: '🐈',
  door: '🚪',
  need: '👐',
};

/** Giữ Ping lâu hơn mức này thì là mở vòng (không phải bấm nhanh). */
export const WHEEL_HOLD_MS = 220;
/** Ping hiện trên bản đồ bao lâu. */
export const PING_LIFETIME_MS = 4000;
/** Bấm nhanh gần món đồ thiếu người trong bán kính này (tính từ mép món đồ) thì ping lên đồ. */
export const PING_ITEM_RANGE = 70;

/** Ô của vòng ứng với hướng (x, y), hoặc null nếu cần gạt chưa nghiêng đủ. */
export function wheelChoice(x: number, y: number): WheelPing | null {
  if (Math.hypot(x, y) < 0.5) return null;
  const deg = ((Math.atan2(x, -y) * 180) / Math.PI + 360) % 360;
  let best: WheelPing = 'come';
  let bestD = Infinity;
  for (const k of WHEEL_PINGS) {
    const d = Math.abs(((deg - WHEEL_ANGLES[k] + 540) % 360) - 180);
    if (d < bestD) {
      bestD = d;
      best = k;
    }
  }
  return best;
}

export interface PingHold {
  heldMs: number;
  choice: WheelPing | null;
}

export type PingResult = { kind: 'tap' } | { kind: 'wheel'; ping: WheelPing } | null;

/**
 * Một bước của nút Ping cho một người. Trả về ping cần gửi khi vừa nhả nút:
 * bấm nhanh → `tap`; giữ và đã chọn hướng → ô đó; giữ mà không chọn → hủy (null).
 */
export function stepPing(
  hold: PingHold,
  prev: InputFrame,
  cur: InputFrame,
  dtMs: number,
): PingResult {
  const down = isDown(cur, Btn.Ping);
  if (down) {
    if (!isDown(prev, Btn.Ping)) {
      hold.heldMs = 0;
      hold.choice = null;
    }
    hold.heldMs += dtMs;
    const { x, y } = frameAxis(cur);
    const c = wheelChoice(x, y);
    // Nhả cần gạt về giữa vẫn giữ ô đã chọn (người chơi thường nhả cần trước khi nhả nút).
    if (c) hold.choice = c;
    return null;
  }
  if (!isDown(prev, Btn.Ping)) return null;
  const result: PingResult =
    hold.choice !== null && hold.heldMs >= WHEEL_HOLD_MS
      ? { kind: 'wheel', ping: hold.choice }
      : hold.heldMs < WHEEL_HOLD_MS
        ? { kind: 'tap' }
        : null;
  hold.heldMs = 0;
  hold.choice = null;
  return result;
}

/** Đang giữ Ping thì cần gạt dùng để chọn ô, nhân vật đứng yên. */
export function steerFrame(frame: InputFrame): InputFrame {
  return isDown(frame, Btn.Ping) ? { ...frame, mx: 0, my: 0 } : frame;
}
