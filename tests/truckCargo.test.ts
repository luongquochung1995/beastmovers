import { describe, expect, it } from 'vitest';
import { type CargoCandidate, emptyCargo, updateCargo } from '../src/systems/truckCargo';

const c = (uid: number, over: Partial<CargoCandidate> = {}): CargoCandidate => ({
  uid,
  slots: 1,
  inside: true,
  settled: true,
  ...over,
});

describe('truckCargo', () => {
  it('đồ yên vị trong thùng thì lên xe', () => {
    const r = updateCargo(emptyCargo(), [c(1), c(2, { slots: 4 })], 20);
    expect(r.loaded).toEqual([1, 2]);
    expect(r.state.used).toBe(5);
  });

  it('đang khiêng hoặc đang bay thì chưa tính', () => {
    const r = updateCargo(emptyCargo(), [c(1, { settled: false })], 20);
    expect(r.loaded).toEqual([]);
  });

  it('xe đầy thì từ chối, chỉ báo một lần', () => {
    let s = updateCargo(emptyCargo(), [c(1, { slots: 3 })], 3).state;
    const r = updateCargo(s, [c(1, { slots: 3 }), c(2)], 3);
    expect(r.rejected).toEqual([2]);
    s = r.state;
    expect(updateCargo(s, [c(1, { slots: 3 }), c(2)], 3).rejected).toEqual([]);
  });

  it('bị từ chối rồi ra khỏi thùng, có chỗ thì vào lại được', () => {
    let s = updateCargo(emptyCargo(), [c(1, { slots: 3 })], 3).state;
    s = updateCargo(s, [c(1, { slots: 3 }), c(2)], 3).state;
    s = updateCargo(s, [c(1, { slots: 3, inside: false }), c(2, { inside: false })], 3).state;
    const r = updateCargo(s, [c(2)], 3);
    expect(r.loaded).toEqual([2]);
  });

  it('kéo đồ ra khỏi thùng thì xuống xe, trả lại chỗ', () => {
    const s = updateCargo(emptyCargo(), [c(1, { slots: 4 })], 20).state;
    const r = updateCargo(s, [c(1, { slots: 4, inside: false })], 20);
    expect(r.unloaded).toEqual([1]);
    expect(r.state.used).toBe(0);
  });

  it('đồ biến mất (bị xóa) thì xuống xe', () => {
    const s = updateCargo(emptyCargo(), [c(1)], 20).state;
    const r = updateCargo(s, [], 20);
    expect(r.unloaded).toEqual([1]);
    expect(r.state.used).toBe(0);
  });
});
