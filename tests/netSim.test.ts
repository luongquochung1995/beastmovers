import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ClientInputSender, HostInputHub } from '../src/net/inputLink';
import { SnapshotBuffer } from '../src/net/interpolate';
import { LoopbackNetwork } from '../src/net/LoopbackNetwork';
import { Predictor } from '../src/net/predict';
import type { Snapshot } from '../src/net/snapshot';
import { SnapshotBroadcaster, SnapshotReceiver } from '../src/net/snapshotLink';
import type { Scheduler } from '../src/net/Transport';
import { EMPTY_FRAME, frameAxis } from '../src/systems/input/InputFrame';
import { InputManager } from '../src/systems/input/InputManager';
import { KeyboardTracker } from '../src/systems/input/keyboard';
import { createMotorState, DEFAULT_MOTOR, stepMotor } from '../src/systems/PlayerMotor';

/**
 * Chạy trọn đường online trong bộ nhớ, 60 khung/giây, mạng trễ 150 ms ± 30 mỗi chiều:
 * máy khách bấm phím → input qua mạng → host di chuyển nhân vật → snapshot nhị phân về
 * máy khách → bộ đệm nội suy + dự đoán. Đo xem điều khiển có "dính" và hình có giật không.
 */
describe('mô phỏng chơi online với mạng trễ 150 ms', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('nhân vật mình phản hồi ngay, đi mượt; người khác thấy mượt, không khựng', () => {
    const DT = 1000 / 60;
    const scheduler: Scheduler = {
      now: () => Date.now(),
      setTimeout: (fn, ms) => setTimeout(fn, ms),
    };
    const net = new LoopbackNetwork({ latencyMs: 150, jitterMs: 30, seed: 3, scheduler });
    const hostEp = net.join('host');
    const clientEp = net.join('c1');

    // Host: gom input, chạy logic di chuyển, gửi snapshot 20 Hz.
    const hub = new HostInputHub(hostEp, 8);
    hub.reserve('c1', 0, 0);
    const bc = new SnapshotBroadcaster(hostEp, ['box'], 20);
    hub.onJoin((peer) => bc.forget(peer));
    let motor = createMotorState();
    let vel = { x: 0, y: 0 };
    const pos = { x: 0, y: 0 };
    let tick = 0;
    const hostSnap = (): Snapshot => ({
      tick,
      players: [
        {
          s: 0,
          x: pos.x,
          y: pos.y,
          fx: motor.facing.x,
          fy: motor.facing.y,
          mode: motor.mode,
          run: motor.running,
          hold: -1,
          vx: vel.x,
          vy: vel.y,
          ack: hub.ackOf(0),
        },
      ],
      items: [],
      doors: [],
      truck: null,
      landlord: null,
      clock: null,
      required: [],
    });

    // Máy khách.
    const target = new EventTarget();
    const tracker = new KeyboardTracker(target as unknown as Window);
    const inputs = new InputManager(1, { tracker, getPads: () => [] });
    inputs.join('kb0');
    const sender = new ClientInputSender(clientEp, 'host', inputs, 30);
    const receiver = new SnapshotReceiver(clientEp, 'host', ['box']);
    const buffer = new SnapshotBuffer(DT, 100);
    const pred = new Predictor(DEFAULT_MOTOR, 20, () => []);
    const key = (type: string, code: string) =>
      target.dispatchEvent(Object.assign(new Event(type), { code, preventDefault() {} }));

    const own: { t: number; x: number; y: number }[] = [];
    const seen: { t: number; x: number; y: number }[] = [];
    let pressedAt = -1;
    const frame = (t: number) => {
      // Host.
      hub.poll(false);
      const s = hub.slots[0]!;
      const r = stepMotor(
        motor,
        { move: frameAxis(s.cur ?? EMPTY_FRAME), dashPressed: false, carrying: false },
        vel,
        DT,
        DEFAULT_MOTOR,
        () => 1,
      );
      motor = r.state;
      vel = r.velocity;
      pos.x += vel.x;
      pos.y += vel.y;
      tick++;
      bc.tick(DT, hub.slots[0]!.connected ? ['c1'] : [], hostSnap);
      // Máy khách.
      sender.tick(DT, false);
      const ls = inputs.slots[0]!;
      if (sender.assigned.size) pred.tick(ls.prev, ls.cur, sender.tickSeq, DT);
      for (const snap of receiver.take()) {
        buffer.push(snap, t);
        const ps = snap.players[0]!;
        pred.reconcile(ps, ps.ack);
      }
      const d = pred.display(DT);
      if (d) own.push({ t, ...d });
      const b = buffer.sample(t)?.players[0];
      if (b) seen.push({ t, x: b.x, y: b.y });
      vi.advanceTimersByTime(DT);
    };

    let t = 0;
    const run = (ms: number) => {
      for (const end = t + ms; t < end; t += DT) frame(t);
    };
    run(1500); // vào màn, chờ ổn định
    pressedAt = t;
    key('keydown', 'KeyD');
    run(1500);
    key('keyup', 'KeyD');
    run(400);
    key('keydown', 'KeyS');
    run(1000);
    key('keyup', 'KeyS');
    run(1500);

    // 1) Phản hồi: hình nhân vật của mình bắt đầu đi ngay khung sau khi bấm.
    const startX = own.find((o) => o.t >= pressedAt)!.x;
    const moved = own.find((o) => o.t > pressedAt && o.x - startX > 0.5)!;
    expect(moved.t - pressedAt).toBeLessThanOrEqual(2 * DT + 0.01);

    // 2) Nhân vật mình khi đang đi sang phải: không giật lùi, không khựng.
    const walk = own.filter((o) => o.t > pressedAt + 300 && o.t < pressedAt + 1400);
    let back = 0;
    let stall = 0;
    for (let i = 1; i < walk.length; i++) {
      const dx = walk[i]!.x - walk[i - 1]!.x;
      if (dx < -0.05) {
        back++;
        console.log(
          'back at',
          Math.round(walk[i]!.t - pressedAt),
          dx.toFixed(2),
          'maxErr',
          pred.maxError.toFixed(1),
        );
      }
      if (Math.abs(dx) < 0.05) stall++;
    }
    console.log(
      'own back/stall',
      back,
      stall,
      'view',
      JSON.stringify(walk.slice(0, 4).map((o) => o.x.toFixed(2))),
    );
    expect(back).toBe(0);
    expect(stall).toBe(0);

    // Dự đoán gần như trùng host: chỉnh rất ít.
    expect(pred.maxError).toBeLessThan(5);

    // 3) Cuối cùng khớp đúng vị trí host.
    const last = own[own.length - 1]!;
    expect(Math.hypot(last.x - pos.x, last.y - pos.y)).toBeLessThan(1);

    // 4) Người khác nhìn thấy (bộ đệm nội suy): đi đều, không khựng, không lùi.
    const view = seen.filter((o) => o.t > pressedAt + 700 && o.t < pressedAt + 1700);
    let vBack = 0;
    let vStall = 0;
    for (let i = 1; i < view.length; i++) {
      const dx = view[i]!.x - view[i - 1]!.x;
      if (dx < -0.05) vBack++;
      if (Math.abs(dx) < 0.05) vStall++;
    }
    console.log('view back/stall', vBack, vStall, 'starved', buffer.starved);
    expect(vBack).toBe(0);
    expect(vStall).toBe(0);
    expect(buffer.resyncs).toBe(0);
  });
});
