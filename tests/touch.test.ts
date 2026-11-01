import { afterEach, describe, expect, it } from 'vitest';
import { Btn } from '../src/systems/input/InputFrame';
import { InputManager } from '../src/systems/input/InputManager';
import {
  frameFromTouch,
  pressButton,
  resetTouch,
  setTouchMode,
  STICK_RADIUS,
  stickVector,
  touchState,
} from '../src/systems/input/touch';

afterEach(() => {
  resetTouch();
  setTouchMode(false);
});

describe('Điều khiển cảm ứng', () => {
  it('cần ảo: vùng chết ở giữa, kéo xa quá bán kính vẫn tối đa 1', () => {
    expect(stickVector(5, 0)).toEqual({ x: 0, y: 0 });
    expect(stickVector(STICK_RADIUS / 2, 0).x).toBeCloseTo(0.5);
    const far = stickVector(300, 400);
    expect(Math.hypot(far.x, far.y)).toBeCloseTo(1);
    expect(far.x).toBeCloseTo(0.6);
  });

  it('chạm nhanh nút (nhấn và nhả trong một khung hình) vẫn được đọc ở lần kế', () => {
    pressButton(Btn.Grab, true);
    pressButton(Btn.Grab, false);
    expect(frameFromTouch(touchState).buttons & Btn.Grab).toBeTruthy();
  });

  it('chuyển sang cảm ứng: người 1 đang dùng WASD đổi sang màn hình cảm ứng', () => {
    const im = new InputManager(4, { tracker: null, getPads: () => [] });
    expect(im.primarySourceId()).toBe('kb0');
    // Không có bàn phím thật trong test: gán thẳng nguồn kb0 giả bằng swapSource ngược.
    setTouchMode(true);
    expect(im.primarySourceId()).toBe('touch0');
    const slot = im.join('touch0');
    expect(slot?.source.kind).toBe('touch');
    touchState.x = 1;
    im.poll();
    expect(im.slots[0]!.cur.mx).toBe(127);
  });

  it('cảm ứng chưa bật thì nguồn cảm ứng không tự tham gia', () => {
    const im = new InputManager(4, { tracker: null, getPads: () => [] });
    pressButton(Btn.Grab, true);
    expect(im.poll(true)).toEqual([]);
  });
});
