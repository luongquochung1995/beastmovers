import { describe, expect, it } from 'vitest';
import type { ItemSnap, Snapshot } from '../src/net/snapshot';
import {
  decodeSnapshot,
  encodeSnapshot,
  quantize,
  readChecksum,
  snapshotChecksum,
} from '../src/net/snapshotCodec';

const defIds = ['box', 'sofa', 'cat'];
const defIndex = new Map(defIds.map((d, i) => [d, i]));

const item = (u: number, d: string, x: number, y: number, extra: Partial<ItemSnap> = {}) => ({
  u,
  d,
  x,
  y,
  a: 0.3,
  cs: 'idle' as const,
  carriers: 0,
  dur: 100,
  broken: false,
  hidden: false,
  loaded: false,
  icon: null,
  box: -1,
  ...extra,
});

const snap = (tick: number, items: ItemSnap[]): Snapshot => ({
  tick,
  players: [
    {
      s: 0,
      x: 100.13,
      y: 200.9,
      fx: 0.6,
      fy: 0.8,
      mode: 'normal',
      run: true,
      hold: 3,
      vx: 2.345,
      vy: -1,
      ack: 77,
    },
    {
      s: 5,
      x: 1500.2,
      y: 20,
      fx: -1,
      fy: 0,
      mode: 'fallen',
      run: false,
      hold: -1,
      vx: 0,
      vy: 0,
      ack: 0,
    },
  ],
  items,
  doors: [0.5, -1.2],
  truck: { ox: -3.3, oy: 0, used: 4, handbrake: true },
  landlord: { x: 640.4, y: 320.6, sat: 49.6 },
  clock: { left: 123456, phase: 'playing' },
  required: [1, 3],
});

describe('mã hóa snapshot nhị phân', () => {
  const s1 = snap(10, [
    item(1, 'box', 10.11, 20.22),
    item(2, 'sofa', 300, 400, { cs: 'lifted', carriers: 2, a: -2.5 }),
    item(3, 'cat', 50, 60, { hidden: true, box: 1, icon: '😺' }),
  ]);

  it('gói đầy đủ giải mã ra đúng giá trị đã lượng tử', () => {
    const buf = encodeSnapshot(quantize(s1), null, defIndex);
    const out = decodeSnapshot(buf, null, defIds)!;
    expect(out).toEqual(quantize(s1));
    expect(Math.abs(out.items[0]!.x - 10.11)).toBeLessThanOrEqual(0.125);
    expect(Math.abs(out.items[1]!.a - -2.5)).toBeLessThanOrEqual(Math.PI / 127);
    expect(out.items[2]).toMatchObject({ d: 'cat', hidden: true, box: 1, icon: '😺' });
  });

  it('gói delta chỉ chứa phần thay đổi, có đồ mới và đồ biến mất', () => {
    const q1 = quantize(s1);
    const c1 = decodeSnapshot(encodeSnapshot(q1, null, defIndex), null, defIds)!;
    const s2 = snap(13, [
      item(1, 'box', 10.11, 20.22),
      item(2, 'sofa', 305, 400, { cs: 'lifted', carriers: 2, a: -2.5 }),
      item(4, 'box', 7, 8, { dur: 3 }),
    ]);
    const q2 = quantize(s2);
    const full = encodeSnapshot(q2, null, defIndex);
    const delta = encodeSnapshot(q2, q1, defIndex);
    expect(delta.byteLength).toBeLessThan(full.byteLength);
    const c2 = decodeSnapshot(delta, c1, defIds)!;
    expect(c2.tick).toBe(13);
    expect(c2.items.map((i) => i.u).sort()).toEqual([1, 2, 4]);
    expect(c2.items.find((i) => i.u === 2)!.x).toBe(305);
    expect(c2.items.find((i) => i.u === 4)).toMatchObject({ d: 'box', dur: 3 });
    // Không đổi gì: gói delta chỉ còn phần đầu (2 người chơi, xe, đồng hồ…).
    const idle = encodeSnapshot(q2, q2, defIndex);
    expect(idle.byteLength).toBeLessThan(80);
    // Mã kiểm tra: trạng thái dựng từ delta khớp với host; sai một chút là phát hiện được.
    expect(snapshotChecksum(c2)).toBe(readChecksum(delta));
    expect(
      snapshotChecksum({ ...c2, items: [{ ...c2.items[0]!, dur: 1 }, ...c2.items.slice(1)] }),
    ).not.toBe(readChecksum(delta));
    // Delta mà chưa có gói gốc thì bỏ qua.
    expect(decodeSnapshot(delta, null, defIds)).toBeNull();
  });

  it('8 người + 40 món đồ: gói đầy đủ dưới 1 KB', () => {
    const items = Array.from({ length: 40 }, (_, i) => item(i + 1, 'box', i * 30, i * 20));
    const s = {
      ...snap(1, items),
      players: Array.from({ length: 8 }, (_, i) => ({ ...snap(1, []).players[0]!, s: i })),
    };
    expect(encodeSnapshot(quantize(s), null, defIndex).byteLength).toBeLessThan(1024);
  });
});
