import { describe, expect, it } from 'vitest';
import { applyRadialDeadzone, frameFromGamepad, PAD_BUTTON } from '../src/systems/input/gamepad';
import {
  Btn,
  frameAxis,
  justPressed,
  quantizeAxis,
  type InputFrame,
} from '../src/systems/input/InputFrame';
import { InputManager } from '../src/systems/input/InputManager';
import { frameFromKeys, KEYBOARD_LAYOUTS, KeyboardTracker } from '../src/systems/input/keyboard';

const [P1, P2] = KEYBOARD_LAYOUTS as [(typeof KEYBOARD_LAYOUTS)[0], (typeof KEYBOARD_LAYOUTS)[0]];
const keys = (...codes: string[]) => new Set(codes);
const pressedButtons = (...indices: number[]) =>
  Array.from({ length: 17 }, (_, i) => ({ pressed: indices.includes(i) }));

describe('InputFrame', () => {
  it('quantizeAxis kẹp về -127..127', () => {
    expect(quantizeAxis(1)).toBe(127);
    expect(quantizeAxis(-3)).toBe(-127);
    expect(quantizeAxis(0)).toBe(0);
  });

  it('frameAxis không dài quá 1', () => {
    const { x, y } = frameAxis({ mx: 127, my: 127, buttons: 0 });
    expect(Math.hypot(x, y)).toBeLessThanOrEqual(1.0001);
  });

  it('justPressed chỉ đúng ở khung đầu tiên', () => {
    const up: InputFrame = { mx: 0, my: 0, buttons: 0 };
    const down: InputFrame = { mx: 0, my: 0, buttons: Btn.Grab };
    expect(justPressed(up, down, Btn.Grab)).toBe(true);
    expect(justPressed(down, down, Btn.Grab)).toBe(false);
  });
});

describe('Bàn phím', () => {
  it('WASD đi phải', () => {
    expect(frameFromKeys(keys('KeyD'), P1)).toEqual({ mx: 127, my: 0, buttons: 0 });
  });

  it('đi chéo được chuẩn hóa', () => {
    const f = frameFromKeys(keys('KeyW', 'KeyA'), P1);
    expect(f.mx).toBe(-90);
    expect(f.my).toBe(-90);
  });

  it('hai phím ngược chiều triệt tiêu nhau', () => {
    expect(frameFromKeys(keys('KeyA', 'KeyD'), P1).mx).toBe(0);
  });

  it('nút của người 1 không ảnh hưởng người 2', () => {
    const k = keys('Space', 'KeyD', 'ArrowLeft', 'ShiftRight');
    expect(frameFromKeys(k, P1)).toEqual({ mx: 127, my: 0, buttons: Btn.Grab });
    expect(frameFromKeys(k, P2)).toEqual({ mx: -127, my: 0, buttons: Btn.Throw });
  });
});

describe('Tay cầm', () => {
  it('vùng chết bỏ rung nhẹ của cần', () => {
    expect(applyRadialDeadzone(0.1, 0.1, 0.2)).toEqual({ x: 0, y: 0 });
  });

  it('cần đẩy hết cỡ ra 127', () => {
    expect(frameFromGamepad([1, 0], pressedButtons()).mx).toBe(127);
  });

  it('cần nằm yên thì dùng D-pad', () => {
    const f = frameFromGamepad([0.05, 0], pressedButtons(PAD_BUTTON.DpadUp));
    expect(f).toEqual({ mx: 0, my: -127, buttons: 0 });
  });

  it('A B X Y Start ra đúng nút', () => {
    const f = frameFromGamepad([0, 0], pressedButtons(0, 1, 2, 3, 9));
    expect(f.buttons).toBe(Btn.Grab | Btn.Throw | Btn.Dash | Btn.Ping | Btn.Start);
  });
});

describe('InputManager', () => {
  function fakePad(index: number, axes: number[] = [0, 0], pressed: number[] = []) {
    return {
      index,
      id: `pad ${index}`,
      connected: true,
      axes,
      buttons: pressedButtons(...pressed),
    };
  }

  it('2 bàn phím + 2 tay cầm cùng điều khiển 4 ô', () => {
    const target = new EventTarget() as unknown as Window;
    const tracker = new KeyboardTracker(target);
    const pads: (ReturnType<typeof fakePad> | null)[] = [fakePad(0), fakePad(1)];
    const im = new InputManager(4, {
      tracker,
      getPads: () => pads as unknown as Gamepad[],
    });

    // Ai cũng nhấn nút Nắm để tham gia.
    tracker.keys.add('Space');
    tracker.keys.add('Enter');
    pads[0] = fakePad(0, [0, 0], [PAD_BUTTON.A]);
    pads[1] = fakePad(1, [0, 0], [PAD_BUTTON.A]);
    const joined = im.poll(true);
    expect(joined.map((s) => s.source.id).sort()).toEqual(['kb0', 'kb1', 'pad0', 'pad1']);

    // Mỗi người đi một hướng khác nhau cùng lúc.
    tracker.keys.clear();
    tracker.keys.add('KeyD');
    tracker.keys.add('ArrowUp');
    pads[0] = fakePad(0, [-1, 0]);
    pads[1] = fakePad(1, [0, 1]);
    im.poll();
    const bySource = Object.fromEntries(im.slots.map((s) => [s!.source.id, s!.cur]));
    expect(bySource.kb0).toMatchObject({ mx: 127, my: 0 });
    expect(bySource.kb1).toMatchObject({ mx: 0, my: -127 });
    expect(bySource.pad0).toMatchObject({ mx: -127, my: 0 });
    expect(bySource.pad1).toMatchObject({ mx: 0, my: 127 });
  });

  it('không quá số ô tối đa', () => {
    const tracker = new KeyboardTracker(new EventTarget() as unknown as Window);
    const im = new InputManager(1, { tracker, getPads: () => [] });
    expect(im.join('kb0')).not.toBeNull();
    expect(im.join('kb1')).toBeNull();
  });

  it('nút dùng để tham gia không bị tính là vừa nhấn', () => {
    const tracker = new KeyboardTracker(new EventTarget() as unknown as Window);
    const im = new InputManager(4, { tracker, getPads: () => [] });
    tracker.keys.add('Space');
    const [slot] = im.poll(true);
    im.poll();
    expect(justPressed(slot!.prev, slot!.cur, Btn.Grab)).toBe(false);
  });

  it('bấm nhanh (nhấn và thả giữa hai lần đọc) vẫn được tính một lần', () => {
    const target = new EventTarget();
    const tracker = new KeyboardTracker(target as unknown as Window);
    const im = new InputManager(1, { tracker, getPads: () => [] });
    const [slot] = [im.join('kb0')!];
    const key = (type: string, code: string) =>
      target.dispatchEvent(Object.assign(new Event(type), { code, preventDefault() {} }));
    key('keydown', 'Space');
    key('keyup', 'Space');
    im.poll();
    expect(justPressed(slot.prev, slot.cur, Btn.Grab)).toBe(true);
    im.poll();
    expect(slot.cur.buttons & Btn.Grab).toBe(0);
  });

  it('rút tay cầm thì ô mất kết nối, cắm lại thì nhận lại', () => {
    const tracker = new KeyboardTracker(new EventTarget() as unknown as Window);
    const pads: (ReturnType<typeof fakePad> | null)[] = [fakePad(0, [1, 0])];
    const im = new InputManager(4, { tracker, getPads: () => pads as unknown as Gamepad[] });
    im.poll();
    const slot = im.join('pad0')!;
    pads[0] = null;
    im.poll();
    expect(slot.connected).toBe(false);
    expect(slot.cur.mx).toBe(0);
    pads[0] = fakePad(0, [1, 0]);
    im.poll();
    expect(slot.connected).toBe(true);
    expect(slot.cur.mx).toBe(127);
  });
});
