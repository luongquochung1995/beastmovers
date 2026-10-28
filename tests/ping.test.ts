import { describe, expect, it } from 'vitest';
import { Btn, type InputFrame } from '../src/systems/input/InputFrame';
import { type PingHold, steerFrame, stepPing, wheelChoice } from '../src/systems/ping';

const f = (mx = 0, my = 0, ping = false): InputFrame => ({
  mx,
  my,
  buttons: ping ? Btn.Ping : 0,
});

/** Chạy một chuỗi khung (mỗi khung 1/60 giây), trả về các ping được gửi. */
function run(frames: InputFrame[]) {
  const hold: PingHold = { heldMs: 0, choice: null };
  const out = [];
  let prev = f();
  for (const cur of frames) {
    const r = stepPing(hold, prev, cur, 1000 / 60);
    if (r) out.push(r);
    prev = cur;
  }
  return out;
}
const times = (n: number, fr: InputFrame) => Array.from({ length: n }, () => fr);

describe('Ping nhanh', () => {
  it('bấm nhanh = ping theo ngữ cảnh', () => {
    expect(run([...times(5, f(0, 0, true)), f()])).toEqual([{ kind: 'tap' }]);
  });

  it('giữ + nghiêng hướng rồi nhả = ô trên vòng (nhả cần gạt trước vẫn giữ ô)', () => {
    const up = run([
      ...times(10, f(0, 0, true)),
      ...times(10, f(0, -127, true)),
      f(0, 0, true),
      f(),
    ]);
    expect(up).toEqual([{ kind: 'wheel', ping: 'come' }]);
    expect(run([...times(20, f(127, 0, true)), f()])).toEqual([{ kind: 'wheel', ping: 'lift' }]);
    expect(run([...times(20, f(0, 127, true)), f()])).toEqual([{ kind: 'wheel', ping: 'drop' }]);
    expect(run([...times(20, f(-127, 0, true)), f()])).toEqual([{ kind: 'wheel', ping: 'door' }]);
  });

  it('giữ lâu mà không chọn hướng thì hủy', () => {
    expect(run([...times(30, f(0, 0, true)), f()])).toEqual([]);
  });

  it('5 ô đều chọn được bằng 8 hướng bàn phím', () => {
    const d = Math.SQRT1_2;
    expect(wheelChoice(0, -1)).toBe('come');
    expect(wheelChoice(d, -d)).toBe('cat');
    expect(wheelChoice(1, 0)).toBe('lift');
    expect(wheelChoice(0, 1)).toBe('drop');
    expect(wheelChoice(-1, 0)).toBe('door');
    expect(wheelChoice(0.2, 0.1)).toBeNull();
  });

  it('đang giữ Ping thì nhân vật đứng yên', () => {
    expect(steerFrame(f(100, 50, true))).toEqual(f(0, 0, true));
    expect(steerFrame(f(100, 50))).toEqual(f(100, 50));
  });
});
