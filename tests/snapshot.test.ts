import { describe, expect, it } from 'vitest';
import { captureSnapshot, type SnapshotSource } from '../src/net/snapshot';

const src: SnapshotSource = {
  tick: 42,
  players: [
    {
      slotIndex: 0,
      position: { x: 100.123, y: 200.456 },
      motor: { mode: 'normal', running: true, facing: { x: 0.70711, y: -0.70711 } },
    },
  ],
  holding: (s) => (s === 0 ? 7 : -1),
  items: [
    {
      uid: 7,
      id: 'box',
      position: { x: 5.55, y: 6.66 },
      angle: 1.23456,
      carryState: 'lifted',
      carriers: { size: 1 },
      durability: 3,
      broken: false,
      hidden: false,
      loaded: false,
      iconOverride: null,
    },
  ],
  containerOf: () => -1,
  doorAngles: [0.5],
  truck: { offset: { x: 0, y: 0 }, used: 2, handbrakeOn: true },
  landlord: { position: { x: 1, y: 2 }, satisfaction: 49.94 },
  clock: { timeLeftMs: 1234.5, phase: 'playing' },
  required: [7],
};

describe('snapshot', () => {
  it('chụp đủ thông tin, làm tròn, qua JSON không đổi', () => {
    const s = captureSnapshot(src);
    expect(s.players[0]).toEqual({
      s: 0,
      x: 100.1,
      y: 200.5,
      fx: 0.707,
      fy: -0.707,
      mode: 'normal',
      run: true,
      hold: 7,
    });
    expect(s.items[0]).toMatchObject({
      u: 7,
      d: 'box',
      x: 5.6,
      y: 6.7,
      a: 1.235,
      cs: 'lifted',
      carriers: 1,
    });
    expect(s.clock).toEqual({ left: 1235, phase: 'playing' });
    expect(JSON.parse(JSON.stringify(s))).toEqual(s);
  });
});
