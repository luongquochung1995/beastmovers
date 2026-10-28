/**
 * Logic di chuyển của nhân vật, viết thuần (không đụng Phaser/Matter) để dễ test và để
 * sau này chạy trên máy host khi chơi online.
 *
 * Đơn vị vận tốc: pixel mỗi bước logic (60 bước/giây).
 */

export type MotorMode = 'normal' | 'dashing' | 'fallen';

export interface MotorParams {
  walkSpeed: number;
  runSpeed: number;
  /** Giữ hướng đi liên tục bao lâu thì chuyển sang chạy. */
  runAfterMs: number;
  /** Độ "bám" vận tốc mỗi bước, 0..1. Thấp thì trơn, cao thì nhạy. */
  accel: number;
  dashSpeed: number;
  dashMs: number;
  dashCooldownMs: number;
  fallMs: number;
  /** Xác suất vấp ngã cho mỗi giây đang chạy. */
  tripChancePerSec: number;
}

export const DEFAULT_MOTOR: MotorParams = {
  walkSpeed: 2.4,
  runSpeed: 4.2,
  runAfterMs: 600,
  accel: 0.2,
  dashSpeed: 9,
  dashMs: 180,
  dashCooldownMs: 800,
  fallMs: 1000,
  tripChancePerSec: 0.03,
};

export interface Vec {
  x: number;
  y: number;
}

export interface MotorState {
  mode: MotorMode;
  /** Thời gian đã ở trong `mode` hiện tại. */
  modeMs: number;
  dashCooldownMs: number;
  /** Thời gian đã giữ hướng đi gần như không đổi. */
  holdMs: number;
  running: boolean;
  /** Hướng đang nhìn (độ dài 1). */
  facing: Vec;
}

export interface MotorInput {
  move: Vec;
  /** Nút Lao vừa được nhấn ở bước này. */
  dashPressed: boolean;
}

export type MotorEvent = 'dashed' | 'tripped' | 'gotUp';

export interface MotorResult {
  state: MotorState;
  velocity: Vec;
  events: MotorEvent[];
}

export function createMotorState(): MotorState {
  return {
    mode: 'normal',
    modeMs: 0,
    dashCooldownMs: 0,
    holdMs: 0,
    running: false,
    facing: { x: 0, y: 1 },
  };
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Ngưỡng cos góc để coi là "vẫn cùng hướng" (khoảng 35°). */
const SAME_DIRECTION = 0.82;

/** Ép nhân vật ngã (bị người lao vào, bị vật đè…). */
export function knockDown(state: MotorState): MotorState {
  return { ...state, mode: 'fallen', modeMs: 0, running: false, holdMs: 0 };
}

export function stepMotor(
  state: MotorState,
  input: MotorInput,
  velocity: Vec,
  dtMs: number,
  params: MotorParams,
  random: () => number,
): MotorResult {
  const events: MotorEvent[] = [];
  const s: MotorState = {
    ...state,
    modeMs: state.modeMs + dtMs,
    dashCooldownMs: Math.max(0, state.dashCooldownMs - dtMs),
  };

  // Đang ngã: không điều khiển được, trượt chậm dần.
  if (s.mode === 'fallen') {
    if (s.modeMs >= params.fallMs) {
      s.mode = 'normal';
      s.modeMs = 0;
      events.push('gotUp');
    }
    return { state: s, velocity: { x: velocity.x * 0.9, y: velocity.y * 0.9 }, events };
  }

  // Đang lao: giữ nguyên vận tốc lao theo hướng nhìn.
  if (s.mode === 'dashing') {
    if (s.modeMs >= params.dashMs) {
      s.mode = 'normal';
      s.modeMs = 0;
    } else {
      return {
        state: s,
        velocity: { x: s.facing.x * params.dashSpeed, y: s.facing.y * params.dashSpeed },
        events,
      };
    }
  }

  const mag = Math.min(1, Math.hypot(input.move.x, input.move.y));
  const moving = mag > 0.05;
  if (moving) {
    const dir = { x: input.move.x / mag, y: input.move.y / mag };
    const dot = dir.x * s.facing.x + dir.y * s.facing.y;
    s.holdMs = dot >= SAME_DIRECTION ? s.holdMs + dtMs : 0;
    s.facing = dir;
  } else {
    s.holdMs = 0;
  }
  s.running = moving && mag > 0.9 && s.holdMs >= params.runAfterMs;

  if (input.dashPressed && s.dashCooldownMs <= 0) {
    s.mode = 'dashing';
    s.modeMs = 0;
    s.dashCooldownMs = params.dashCooldownMs;
    s.running = false;
    events.push('dashed');
    return {
      state: s,
      velocity: { x: s.facing.x * params.dashSpeed, y: s.facing.y * params.dashSpeed },
      events,
    };
  }

  if (s.running && random() < (params.tripChancePerSec * dtMs) / 1000) {
    events.push('tripped');
    // Vấp thì văng về phía trước một chút rồi nằm.
    return {
      state: knockDown(s),
      velocity: { x: velocity.x * 1.3, y: velocity.y * 1.3 },
      events,
    };
  }

  const speed = (s.running ? params.runSpeed : params.walkSpeed) * mag;
  const target = moving ? { x: s.facing.x * speed, y: s.facing.y * speed } : { x: 0, y: 0 };
  return {
    state: s,
    velocity: {
      x: lerp(velocity.x, target.x, params.accel),
      y: lerp(velocity.y, target.y, params.accel),
    },
    events,
  };
}
