import { Btn, frameAxis, type InputFrame, justPressed } from '../systems/input/InputFrame';
import {
  createMotorState,
  type MotorParams,
  type MotorState,
  stepMotor,
  type Vec,
} from '../systems/PlayerMotor';

/** Vật cản cho dự đoán: hình chữ nhật (có thể xoay quanh tâm). */
export interface Obstacle {
  cx: number;
  cy: number;
  w: number;
  h: number;
  angle: number;
}

/** Trạng thái host báo cho nhân vật của mình. */
export interface ServerPlayer {
  x: number;
  y: number;
  vx: number;
  vy: number;
  mode: MotorState['mode'];
  run: boolean;
  fx: number;
  fy: number;
}

/** Lệch quá mức này (dịch chuyển, bị đẩy mạnh) thì nhảy thẳng tới, không trượt từ từ. */
const SNAP_PX = 120;
/** Hằng số thời gian kéo phần lệch về 0 (ms). */
const CORRECT_MS = 120;

/** Đẩy hình tròn ra khỏi hình chữ nhật; trả vị trí mới và pháp tuyến nếu có va chạm. */
export function pushOut(p: Vec, r: number, o: Obstacle): { p: Vec; n: Vec } | null {
  const cos = Math.cos(-o.angle);
  const sin = Math.sin(-o.angle);
  // Đưa về hệ tọa độ của hình chữ nhật.
  const dx = p.x - o.cx;
  const dy = p.y - o.cy;
  const lx = dx * cos - dy * sin;
  const ly = dx * sin + dy * cos;
  const hw = o.w / 2;
  const hh = o.h / 2;
  const qx = Math.max(-hw, Math.min(hw, lx));
  const qy = Math.max(-hh, Math.min(hh, ly));
  let nx: number;
  let ny: number;
  let depth: number;
  if (qx === lx && qy === ly) {
    // Tâm nằm trong hình: đẩy ra theo cạnh gần nhất.
    const ex = hw - Math.abs(lx);
    const ey = hh - Math.abs(ly);
    if (ex < ey) {
      nx = Math.sign(lx) || 1;
      ny = 0;
      depth = ex + r;
    } else {
      nx = 0;
      ny = Math.sign(ly) || 1;
      depth = ey + r;
    }
  } else {
    const ox = lx - qx;
    const oy = ly - qy;
    const d = Math.hypot(ox, oy);
    if (d >= r) return null;
    nx = ox / d;
    ny = oy / d;
    depth = r - d;
  }
  // Quay pháp tuyến về hệ tọa độ thế giới.
  const c2 = Math.cos(o.angle);
  const s2 = Math.sin(o.angle);
  const n = { x: nx * c2 - ny * s2, y: nx * s2 + ny * c2 };
  return { p: { x: p.x + n.x * depth, y: p.y + n.y * depth }, n };
}

interface Sim {
  pos: Vec;
  vel: Vec;
  motor: MotorState;
}

/**
 * Dự đoán nhân vật của chính mình ở máy khách: chạy ngay input vừa bấm bằng cùng logic
 * di chuyển với host (chỉ va tường/đồ nặng, không vấp ngẫu nhiên). Mỗi snapshot: lấy trạng
 * thái host báo, chạy lại các input host chưa nhận, phần lệch so với hình đang vẽ được kéo
 * về từ từ để không giật.
 */
export class Predictor {
  private sim: Sim | null = null;
  /** Input chưa được host xác nhận, kèm trạng thái di chuyển dự đoán sau bước đó. */
  private readonly history: {
    seq: number;
    prev: InputFrame;
    cur: InputFrame;
    dt: number;
    motor: MotorState | null;
  }[] = [];
  /** Hình đang vẽ = vị trí dự đoán + phần lệch (giảm dần về 0). */
  private offset: Vec = { x: 0, y: 0 };
  /** Số lần phải chỉnh và độ lệch lớn nhất (để đo). */
  corrections = 0;
  maxError = 0;

  constructor(
    private readonly params: MotorParams,
    private readonly radius: number,
    private readonly obstacles: () => readonly Obstacle[],
  ) {}

  get active(): boolean {
    return this.sim !== null;
  }

  /** Vị trí dự đoán (chưa cộng phần lệch). */
  get position(): Vec | null {
    return this.sim && { ...this.sim.pos };
  }

  get motor(): MotorState | null {
    return this.sim?.motor ?? null;
  }

  get velocity(): Vec | null {
    return this.sim && { ...this.sim.vel };
  }

  /** Mỗi bước logic: input của bước này, mang theo bởi gói số `seq`. */
  tick(prev: InputFrame, cur: InputFrame, seq: number, dt: number): void {
    if (this.sim) this.sim = this.step(this.sim, prev, cur, dt);
    this.history.push({ seq, prev, cur, dt, motor: this.sim?.motor ?? null });
    if (this.history.length > 240) this.history.shift();
  }

  /**
   * Snapshot mới: đặt lại theo host rồi chạy lại các input host chưa nhận (`seq > ack`).
   * `drawn`: chỗ nhân vật đang được vẽ, để bắt đầu dự đoán mà không nhảy hình.
   */
  reconcile(s: ServerPlayer, ack: number, drawn: Vec | null = null): void {
    // Bộ đếm bên trong (giữ hướng bao lâu, hồi lao…) không có trong snapshot: lấy theo
    // trạng thái đã dự đoán ở đúng thời điểm của snapshot.
    let base: MotorState | null = null;
    while (this.history.length && this.history[0]!.seq <= ack) base = this.history.shift()!.motor;
    const before = this.sim ? this.displayPos() : drawn;
    const motor = base ?? createMotorState();
    let sim: Sim = {
      pos: { x: s.x, y: s.y },
      vel: { x: s.vx, y: s.vy },
      motor: {
        ...motor,
        mode: s.mode,
        running: s.run,
        facing: { x: s.fx, y: s.fy },
        modeMs: motor.mode === s.mode ? motor.modeMs : 0,
      },
    };
    for (const h of this.history) {
      sim = this.step(sim, h.prev, h.cur, h.dt);
      h.motor = sim.motor;
    }
    this.sim = sim;
    if (!before) {
      this.offset = { x: 0, y: 0 };
      return;
    }
    const ex = before.x - sim.pos.x;
    const ey = before.y - sim.pos.y;
    const err = Math.hypot(ex, ey);
    this.maxError = Math.max(this.maxError, err);
    if (err > 0.5) this.corrections++;
    this.offset = err > SNAP_PX ? { x: 0, y: 0 } : { x: ex, y: ey };
  }

  /** Bỏ dự đoán (đang khiêng đồ, bị ngã…): vẽ theo host. */
  reset(): void {
    this.sim = null;
    this.offset = { x: 0, y: 0 };
  }

  /** Vị trí để vẽ, gọi mỗi khung hình (`frameMs`: thời gian từ khung trước). */
  display(frameMs: number): Vec | null {
    if (!this.sim) return null;
    const k = Math.exp(-frameMs / CORRECT_MS);
    this.offset = { x: this.offset.x * k, y: this.offset.y * k };
    return this.displayPos();
  }

  private displayPos(): Vec {
    return { x: this.sim!.pos.x + this.offset.x, y: this.sim!.pos.y + this.offset.y };
  }

  private step(sim: Sim, prev: InputFrame, cur: InputFrame, dt: number): Sim {
    const r = stepMotor(
      sim.motor,
      { move: frameAxis(cur), dashPressed: justPressed(prev, cur, Btn.Dash), carrying: false },
      sim.vel,
      dt,
      this.params,
      () => 1, // không vấp ngẫu nhiên khi dự đoán; host quyết định
    );
    // Vận tốc tính theo bước 60 Hz như Matter.
    const k = dt / (1000 / 60);
    let pos = { x: sim.pos.x + r.velocity.x * k, y: sim.pos.y + r.velocity.y * k };
    let vel = r.velocity;
    for (const o of this.obstacles()) {
      const hit = pushOut(pos, this.radius, o);
      if (!hit) continue;
      pos = hit.p;
      // Bỏ phần vận tốc lao vào vật cản.
      const into = vel.x * hit.n.x + vel.y * hit.n.y;
      if (into < 0) vel = { x: vel.x - into * hit.n.x, y: vel.y - into * hit.n.y };
    }
    return { pos, vel, motor: r.state };
  }
}
