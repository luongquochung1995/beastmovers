import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LAYOUTS,
  effectiveLayouts,
  keyLabel,
  primaryKey,
  rebindKey,
} from '../src/systems/input/keyboard';
import { type NavAction, NavRepeat, padNavState } from '../src/ui/menuNav';

const set = (...a: NavAction[]) => new Set<NavAction>(a);

describe('Điều hướng menu', () => {
  it('lần đọc đầu không phát gì (nút A từ màn trước vẫn đang giữ)', () => {
    const nav = new NavRepeat();
    expect(nav.update(16, set('confirm'))).toEqual([]);
    expect(nav.update(16, set('confirm'))).toEqual([]);
    expect(nav.update(16, set())).toEqual([]);
    expect(nav.update(16, set('confirm'))).toEqual(['confirm']);
  });

  it('giữ hướng thì tự lặp sau một lúc, xác nhận thì không lặp', () => {
    const nav = new NavRepeat();
    nav.update(16, set());
    const got: NavAction[] = [];
    for (let i = 0; i < 60; i++) got.push(...nav.update(16, set('down', 'confirm')));
    // 1 lần lúc nhấn + lặp sau 380 ms rồi mỗi 120 ms (~960 ms giữ) → 1 + 1 + 4.
    expect(got.filter((a) => a === 'down').length).toBe(6);
    expect(got.filter((a) => a === 'confirm').length).toBe(1);
  });

  it('gộp mọi tay cầm: cần trái, D-pad, A/Start, B', () => {
    const btn = (on: number[]) =>
      Array.from({ length: 17 }, (_, i) => ({ pressed: on.includes(i) }));
    const pads = [
      { connected: true, axes: [0, -0.9], buttons: btn([]) },
      { connected: true, axes: [0, 0], buttons: btn([15, 9]) },
      { connected: false, axes: [0, 0.9], buttons: btn([1]) },
      null,
    ] as unknown as Gamepad[];
    expect(padNavState(pads)).toEqual(set('up', 'right', 'confirm'));
    expect(
      padNavState([{ connected: true, axes: [0.2, 0.1], buttons: btn([1]) }] as never),
    ).toEqual(set('back'));
  });
});

describe('Đổi phím', () => {
  it('đổi phím chính, phím phụ mặc định vẫn còn', () => {
    const b = rebindKey([], 1, 'grab', 'KeyK');
    const l = effectiveLayouts(b);
    expect(l[1]!.grab).toEqual(['KeyK', 'NumpadEnter', 'Numpad0']);
    expect(l[0]!.grab).toEqual(['Space']);
  });

  it('phím đang dùng ở hành động khác thì hai bên đổi chỗ (kể cả khác bố cục)', () => {
    let b = rebindKey([], 0, 'grab', 'KeyE'); // E đang là Ném của người 1
    expect(primaryKey(b, 0, 'grab')).toBe('KeyE');
    expect(primaryKey(b, 0, 'throw')).toBe('Space');
    b = rebindKey(b, 0, 'up', 'ArrowUp'); // mũi tên lên của người 2
    expect(primaryKey(b, 0, 'up')).toBe('ArrowUp');
    expect(primaryKey(b, 1, 'up')).toBe('KeyW');
  });

  it('phím phụ trùng phím chính mới thì bị bỏ khỏi bố cục kia', () => {
    const l = effectiveLayouts(rebindKey([], 0, 'ping', 'Numpad0'));
    expect(l[0]!.ping).toEqual(['Numpad0']);
    expect(l[1]!.grab).toEqual(['Enter', 'NumpadEnter']);
  });

  it('không đổi gì thì giống mặc định', () => {
    expect(effectiveLayouts([])).toEqual(DEFAULT_LAYOUTS);
  });

  it('tên phím dễ đọc', () => {
    expect(['KeyW', 'ArrowLeft', 'Digit3', 'Numpad1', 'ShiftRight', 'Space'].map(keyLabel)).toEqual(
      ['W', '←', '3', 'Num 1', 'Shift R', 'Space'],
    );
  });
});
