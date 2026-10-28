import { describe, expect, it } from 'vitest';
import {
  createMotorState,
  DEFAULT_MOTOR,
  knockDown,
  type MotorInput,
  type MotorState,
  stepMotor,
  type Vec,
} from '../src/systems/PlayerMotor';

const DT = 1000 / 60;
const never = () => 1;
const always = () => 0;

function simulate(
  steps: number,
  input: MotorInput,
  start: { state?: MotorState; vel?: Vec } = {},
  random = never,
  params = DEFAULT_MOTOR,
) {
  let state = start.state ?? createMotorState();
  let vel = start.vel ?? { x: 0, y: 0 };
  const events: string[] = [];
  for (let i = 0; i < steps; i++) {
    const r = stepMotor(
      state,
      i === 0 ? input : { ...input, dashPressed: false },
      vel,
      DT,
      params,
      random,
    );
    state = r.state;
    vel = r.velocity;
    events.push(...r.events);
  }
  return { state, vel, events };
}

const right: MotorInput = { move: { x: 1, y: 0 }, dashPressed: false };

describe('PlayerMotor', () => {
  it('đi bộ tăng tốc dần tới tốc độ đi', () => {
    const { vel, state } = simulate(20, right);
    expect(state.running).toBe(false);
    expect(vel.x).toBeGreaterThan(DEFAULT_MOTOR.walkSpeed * 0.95);
    expect(vel.x).toBeLessThanOrEqual(DEFAULT_MOTOR.walkSpeed);
  });

  it('giữ một hướng đủ lâu thì chạy', () => {
    const { vel, state } = simulate(90, right);
    expect(state.running).toBe(true);
    expect(vel.x).toBeGreaterThan(DEFAULT_MOTOR.walkSpeed);
  });

  it('đổi hướng thì mất trạng thái chạy', () => {
    const run = simulate(90, right);
    const turned = simulate(1, { move: { x: 0, y: 1 }, dashPressed: false }, run);
    expect(turned.state.running).toBe(false);
  });

  it('cần đẩy nhẹ thì đi chậm và không chạy', () => {
    const { vel, state } = simulate(120, { move: { x: 0.4, y: 0 }, dashPressed: false });
    expect(state.running).toBe(false);
    expect(vel.x).toBeCloseTo(DEFAULT_MOTOR.walkSpeed * 0.4, 1);
  });

  it('thả tay thì dừng lại', () => {
    const moving = simulate(30, right);
    const { vel } = simulate(60, { move: { x: 0, y: 0 }, dashPressed: false }, moving);
    expect(Math.abs(vel.x)).toBeLessThan(0.01);
  });

  it('lao theo hướng nhìn rồi trở lại bình thường', () => {
    const r = stepMotor(
      createMotorState(),
      { move: { x: 1, y: 0 }, dashPressed: true },
      { x: 0, y: 0 },
      DT,
      DEFAULT_MOTOR,
      never,
    );
    expect(r.events).toContain('dashed');
    expect(r.velocity.x).toBe(DEFAULT_MOTOR.dashSpeed);
    const after = simulate(20, right, { state: r.state, vel: r.velocity });
    expect(after.state.mode).toBe('normal');
  });

  it('không lao lại được khi đang hồi chiêu', () => {
    const first = stepMotor(
      createMotorState(),
      { ...right, dashPressed: true },
      { x: 0, y: 0 },
      DT,
      DEFAULT_MOTOR,
      never,
    );
    const mid = simulate(15, right, { state: first.state, vel: first.velocity });
    const again = stepMotor(
      mid.state,
      { ...right, dashPressed: true },
      mid.vel,
      DT,
      DEFAULT_MOTOR,
      never,
    );
    expect(again.events).not.toContain('dashed');
  });

  it('đang chạy có thể vấp ngã, nằm một lúc rồi đứng dậy', () => {
    const run = simulate(90, right);
    const trip = stepMotor(run.state, right, run.vel, DT, DEFAULT_MOTOR, always);
    expect(trip.events).toContain('tripped');
    expect(trip.state.mode).toBe('fallen');
    const lying = simulate(30, right, { state: trip.state, vel: trip.velocity });
    expect(lying.state.mode).toBe('fallen');
    const up = simulate(70, right, { state: trip.state, vel: trip.velocity });
    expect(up.events).toContain('gotUp');
    expect(up.state.mode).toBe('normal');
  });

  it('đi bộ thì không bao giờ vấp', () => {
    const { events } = simulate(20, right, {}, always);
    expect(events).not.toContain('tripped');
  });

  it('bị hạ gục thì không điều khiển được', () => {
    const down = knockDown(createMotorState());
    const { vel } = simulate(10, right, { state: down });
    expect(vel.x).toBe(0);
  });
});
