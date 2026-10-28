import { describe, expect, it } from 'vitest';
import {
  type Carrier,
  carryState,
  computeCarry,
  loadFactor,
  MAX_ANGULAR,
} from '../src/systems/carry';

const base = { walkSpeed: 2.4, massKg: 250, required: 4, liftRule: 'strict' as const };
const pianoCorners = (move: (i: number) => { x: number; y: number }): Carrier[] =>
  [
    { x: -40, y: -25 },
    { x: 40, y: -25 },
    { x: -40, y: 25 },
    { x: 40, y: 25 },
  ].map((r, i) => ({ r, move: move(i) }));

describe('carryState', () => {
  it('strict: thiếu người thì không nhúc nhích', () => {
    expect(carryState('strict', 0, 4)).toBe('immovable');
    expect(carryState('strict', 3, 4)).toBe('immovable');
    expect(carryState('strict', 4, 4)).toBe('lifted');
  });
  it('drag: thiếu người thì kéo lê', () => {
    expect(carryState('drag', 1, 2)).toBe('dragging');
    expect(carryState('drag', 2, 2)).toBe('lifted');
  });
  it('free: không ai nắm thì để yên', () => {
    expect(carryState('free', 0, 1)).toBe('idle');
    expect(carryState('free', 1, 1)).toBe('lifted');
  });
});

describe('computeCarry', () => {
  it('4 người cùng đẩy sang phải → piano đi thẳng, không xoay', () => {
    const r = computeCarry({ ...base, carriers: pianoCorners(() => ({ x: 1, y: 0 })) });
    expect(r.state).toBe('lifted');
    expect(r.velocity.x).toBeGreaterThan(0.5);
    expect(Math.abs(r.velocity.y)).toBeLessThan(1e-9);
    expect(Math.abs(r.angularVelocity)).toBeLessThan(1e-9);
  });

  it('3 người thì piano đứng im', () => {
    const r = computeCarry({ ...base, carriers: pianoCorners(() => ({ x: 1, y: 0 })).slice(0, 3) });
    expect(r.state).toBe('immovable');
    expect(r.velocity).toEqual({ x: 0, y: 0 });
  });

  it('hai đầu kéo ngược chiều → đứng im', () => {
    const r = computeCarry({
      ...base,
      carriers: pianoCorners((i) => ({ x: i % 2 === 0 ? -1 : 1, y: 0 })),
    });
    expect(Math.hypot(r.velocity.x, r.velocity.y)).toBeLessThan(1e-9);
  });

  it('hai đầu đẩy ngược chiều vuông góc → xoay', () => {
    const r = computeCarry({
      ...base,
      carriers: pianoCorners((i) => ({ x: 0, y: i % 2 === 0 ? 1 : -1 })),
    });
    expect(Math.hypot(r.velocity.x, r.velocity.y)).toBeLessThan(1e-9);
    expect(Math.abs(r.angularVelocity)).toBeGreaterThan(0.005);
    expect(Math.abs(r.angularVelocity)).toBeLessThanOrEqual(MAX_ANGULAR);
  });

  it('đồ nặng đi chậm hơn đồ nhẹ', () => {
    const light = computeCarry({
      ...base,
      massKg: 8,
      required: 1,
      liftRule: 'free',
      carriers: [{ r: { x: 20, y: 0 }, move: { x: 1, y: 0 } }],
    });
    const heavy = computeCarry({
      ...base,
      massKg: 70,
      required: 1,
      liftRule: 'free',
      carriers: [{ r: { x: 20, y: 0 }, move: { x: 1, y: 0 } }],
    });
    expect(light.speed).toBeGreaterThan(heavy.speed);
    expect(loadFactor(8, 1)).toBe(1);
    expect(loadFactor(1000, 1)).toBe(0.4);
  });

  it('drag thiếu người: kéo lê chậm và cào sàn', () => {
    const one = computeCarry({
      walkSpeed: 2.4,
      massKg: 120,
      required: 2,
      liftRule: 'drag',
      carriers: [{ r: { x: 30, y: 0 }, move: { x: 1, y: 0 } }],
    });
    const two = computeCarry({
      walkSpeed: 2.4,
      massKg: 120,
      required: 2,
      liftRule: 'drag',
      carriers: [
        { r: { x: 30, y: -20 }, move: { x: 1, y: 0 } },
        { r: { x: 30, y: 20 }, move: { x: 1, y: 0 } },
      ],
    });
    expect(one.state).toBe('dragging');
    expect(one.scraping).toBe(true);
    expect(two.state).toBe('lifted');
    expect(two.scraping).toBe(false);
    expect(Math.hypot(one.velocity.x, one.velocity.y)).toBeLessThan(
      Math.hypot(two.velocity.x, two.velocity.y) / 2,
    );
  });

  it('một người cầm: đồ chỉ đung đưa nhẹ', () => {
    const r = computeCarry({
      walkSpeed: 2.4,
      massKg: 8,
      required: 1,
      liftRule: 'free',
      carriers: [{ r: { x: 20, y: 0 }, move: { x: 0, y: 1 } }],
    });
    expect(r.velocity.y).toBeGreaterThan(2);
    expect(Math.abs(r.angularVelocity)).toBeLessThan(0.05);
  });
});
