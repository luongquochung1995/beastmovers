import { describe, expect, it } from 'vitest';
import { interpolateSnapshots, lerpAngle, SnapshotBuffer } from '../src/net/interpolate';
import { type Obstacle, Predictor, pushOut, type ServerPlayer } from '../src/net/predict';
import type { Snapshot } from '../src/net/snapshot';
import { EMPTY_FRAME, type InputFrame } from '../src/systems/input/InputFrame';
import { createMotorState, DEFAULT_MOTOR, stepMotor } from '../src/systems/PlayerMotor';

const DT = 1000 / 60;

const snap = (tick: number, x: number, itemX: number, angle = 0): Snapshot => ({
  tick,
  players: [
    { s: 0, x, y: 0, fx: 1, fy: 0, mode: 'normal', run: false, hold: -1, vx: 0, vy: 0, ack: 0 },
  ],
  items: [
    {
      u: 1,
      d: 'box',
      x: itemX,
      y: 0,
      a: angle,
      cs: 'idle',
      carriers: 0,
      dur: 5,
      broken: false,
      hidden: false,
      loaded: false,
      icon: null,
      box: -1,
    },
  ],
  doors: [],
  truck: null,
  landlord: null,
  clock: { left: 1000, phase: 'playing' },
  required: [],
});

describe('nội suy snapshot', () => {
  it('ở giữa hai snapshot; góc đi đường ngắn; nhảy xa thì không nội suy', () => {
    const m = interpolateSnapshots(snap(0, 0, 10, 3), snap(3, 10, 20, -3), 0.5);
    expect(m.players[0]!.x).toBe(5);
    expect(m.items[0]!.x).toBe(15);
    expect(Math.abs(Math.abs(m.items[0]!.a) - Math.PI)).toBeLessThan(0.3);
    expect(m.clock!.left).toBe(1000);
    expect(interpolateSnapshots(snap(0, 0, 0), snap(3, 500, 0), 0.5).players[0]!.x).toBe(500);
    expect(lerpAngle(3, -3, 0.5)).toBeCloseTo(Math.PI, 1);
  });

  it('bộ đệm: mạng dao động vẫn mượt, không thiếu gói', () => {
    const tickMs = 1000 / 60;
    const buf = new SnapshotBuffer(tickMs, 100);
    // Host gửi mỗi 3 bước (50ms), gói tới với độ trễ 80..120ms; vẽ 60 khung/giây.
    const xs: number[] = [];
    let k = 0;
    for (let now = 0; now < 3000; now += 16.7) {
      while (k * 50 + 80 + ((k * 37) % 40) <= now) {
        buf.push(snap(k * 3, k * 6, 0), now);
        k++;
      }
      const s = buf.sample(now);
      if (s && now > 1000) xs.push(s.players[0]!.x);
    }
    for (let i = 1; i < xs.length; i++) expect(xs[i]!).toBeGreaterThanOrEqual(xs[i - 1]!);
    expect(buf.starved).toBe(0);
  });

  it('bộ đệm: host chạy chậm hơn thời gian thực vẫn không đứng khựng', () => {
    const tickMs = 1000 / 60;
    const buf = new SnapshotBuffer(tickMs, 100);
    // Host chỉ chạy 60% tốc độ: snapshot (50ms giờ host) tới mỗi ~83ms giờ thật.
    let k = 0;
    let stalls = 0;
    let last = -1;
    for (let now = 0; now < 6000; now += 16.7) {
      while (k * 83 + 100 <= now) {
        buf.push(snap(k * 3, k * 6, 0), now);
        k++;
      }
      const x = buf.sample(now)?.players[0]!.x ?? -1;
      if (now > 2000 && x === last) stalls++;
      last = x;
    }
    expect(stalls).toBeLessThan(5);
    expect(buf.resyncs).toBe(0);
  });
});

describe('dự đoán nhân vật của mình', () => {
  const right: InputFrame = { mx: 127, my: 0, buttons: 0 };

  /** "Host": cùng logic di chuyển, không có vật cản. */
  const truthAfter = (frames: InputFrame[]) => {
    let motor = createMotorState();
    let vel = { x: 0, y: 0 };
    const pos = { x: 0, y: 0 };
    let prev = EMPTY_FRAME;
    for (const f of frames) {
      const r = stepMotor(
        motor,
        { move: { x: f.mx / 127, y: f.my / 127 }, dashPressed: false, carrying: false },
        vel,
        DT,
        DEFAULT_MOTOR,
        () => 1,
      );
      motor = r.state;
      vel = r.velocity;
      pos.x += vel.x;
      pos.y += vel.y;
      prev = f;
    }
    void prev;
    return { pos, vel, motor };
  };

  it('đi ngay khi bấm, khớp với host khi snapshot (trễ 9 bước) tới', () => {
    const pred = new Predictor(DEFAULT_MOTOR, 20, () => []);
    pred.reconcile({ x: 0, y: 0, vx: 0, vy: 0, mode: 'normal', run: false, fx: 1, fy: 0 }, 0);
    const frames: InputFrame[] = [];
    let maxErr = 0;
    for (let i = 1; i <= 60; i++) {
      frames.push(right);
      // Mỗi bước là một gói (seq = i). Host nhận trễ 9 bước.
      pred.tick(i === 1 ? EMPTY_FRAME : right, right, i, DT);
      if (i % 3 === 0 && i > 9) {
        const t = truthAfter(frames.slice(0, i - 9));
        const s: ServerPlayer = {
          x: t.pos.x,
          y: t.pos.y,
          vx: t.vel.x,
          vy: t.vel.y,
          mode: t.motor.mode,
          run: t.motor.running,
          fx: 1,
          fy: 0,
        };
        pred.reconcile(s, i - 9);
      }
      maxErr = Math.max(maxErr, Math.abs(pred.position!.x - truthAfter(frames).pos.x));
    }
    // Bước đầu tiên đã di chuyển (không phải đợi host).
    expect(pred.position!.x).toBeGreaterThan(100);
    expect(maxErr).toBeLessThan(3);
  });

  it('không đi xuyên tường; phần lệch được kéo về từ từ', () => {
    const wall: Obstacle = { cx: 100, cy: 0, w: 20, h: 200, angle: 0 };
    const pred = new Predictor(DEFAULT_MOTOR, 20, () => [wall]);
    pred.reconcile({ x: 0, y: 0, vx: 0, vy: 0, mode: 'normal', run: false, fx: 1, fy: 0 }, 0);
    for (let i = 1; i <= 120; i++) pred.tick(right, right, i, DT);
    expect(pred.position!.x).toBeCloseTo(70, 0);
    // Host nói mình đang ở 60 (lệch 10px): hình vẽ không nhảy ngay mà trượt về.
    pred.reconcile({ x: 60, y: 0, vx: 0, vy: 0, mode: 'normal', run: false, fx: 1, fy: 0 }, 120);
    const d0 = pred.display(0)!.x;
    expect(d0).toBeCloseTo(70, 0);
    pred.display(600);
    expect(pred.display(0)!.x).toBeCloseTo(60, 0);
  });

  it('đẩy hình tròn ra khỏi hình chữ nhật xoay', () => {
    const o: Obstacle = { cx: 0, cy: 0, w: 100, h: 20, angle: Math.PI / 2 };
    const hit = pushOut({ x: 15, y: 0 }, 10, o)!;
    expect(hit.p.x).toBeCloseTo(20, 5);
    expect(pushOut({ x: 40, y: 0 }, 10, o)).toBeNull();
  });
});
