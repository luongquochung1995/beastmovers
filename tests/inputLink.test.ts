import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ClientInputSender, HostInputHub } from '../src/net/inputLink';
import { LoopbackNetwork } from '../src/net/LoopbackNetwork';
import type { Scheduler } from '../src/net/Transport';
import { Btn } from '../src/systems/input/InputFrame';
import { InputManager } from '../src/systems/input/InputManager';
import { KeyboardTracker } from '../src/systems/input/keyboard';

const scheduler: Scheduler = { now: () => Date.now(), setTimeout: (fn, ms) => setTimeout(fn, ms) };
const DT = 1000 / 60;

function setup(latencyMs = 50, maxPlayers = 8) {
  const net = new LoopbackNetwork({ latencyMs, scheduler });
  const hub = new HostInputHub(net.join('host'), maxPlayers);
  const tracker = new KeyboardTracker(new EventTarget() as unknown as Window);
  const inputs = new InputManager(4, { tracker, getPads: () => [] });
  const sender = new ClientInputSender(net.join('c1'), 'host', inputs, 30);
  /** Chạy n bước logic: máy khách gửi, mạng giao tin, host đọc. */
  const run = (n: number, allowJoin = true) => {
    const joined = [];
    for (let i = 0; i < n; i++) {
      sender.tick(DT, allowJoin);
      vi.advanceTimersByTime(DT);
      joined.push(...hub.poll(allowJoin));
    }
    return joined;
  };
  return { net, hub, tracker, inputs, sender, run };
}

describe('Input qua mạng', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('máy khách xin ô, host cấp ô, phím đi tới host sau độ trễ', () => {
    const { hub, tracker, inputs, sender, run } = setup(50);
    inputs.join('kb0');
    const joined = run(10);
    expect(joined.map((s) => s.index)).toEqual([0]);
    run(10);
    expect(sender.assigned.get(0)).toBe(0);
    tracker.keys.add('KeyD');
    run(1);
    expect(hub.slots[0]!.cur.mx).toBe(0); // chưa tới vì còn trễ
    run(8);
    expect(hub.slots[0]!.cur.mx).toBe(127);
  });

  it('cú bấm rất nhanh giữa hai lần gửi không bị lọt', () => {
    const { hub, tracker, inputs, sender, run } = setup(20);
    inputs.join('kb0');
    run(20);
    // Nhấn Space đúng 1 bước logic (~17ms) rồi thả, ngắn hơn khoảng gửi 33ms.
    tracker.keys.add('Space');
    sender.tick(DT, true);
    tracker.keys.delete('Space');
    let sawGrab = false;
    for (let i = 0; i < 10; i++) {
      sender.tick(DT, true);
      vi.advanceTimersByTime(DT);
      hub.poll(true);
      if (hub.slots[0]!.cur.buttons & Btn.Grab) sawGrab = true;
    }
    expect(sawGrab).toBe(true);
  });

  it('hết chỗ thì từ chối; không cho vào giữa chừng thì từ chối', () => {
    const { inputs, run } = setup(10, 1);
    inputs.join('kb0');
    inputs.join('kb1');
    const joined = run(20);
    expect(joined).toHaveLength(1);
    const late = setup(10);
    late.inputs.join('kb0');
    expect(late.run(20, false)).toHaveLength(0);
  });

  it('máy khách rời phòng thì ô mất kết nối, input về rỗng', () => {
    const { net, hub, tracker, inputs, run } = setup(10);
    inputs.join('kb0');
    run(10);
    tracker.keys.add('KeyD');
    run(10);
    expect(hub.slots[0]!.cur.mx).toBe(127);
    net.leave('c1');
    hub.poll(true);
    expect(hub.slots[0]!.connected).toBe(false);
    expect(hub.slots[0]!.cur.mx).toBe(0);
  });

  it('host chạy từng khung đúng thứ tự; hàng chờ dài thì bỏ bớt nhưng giữ cú bấm', () => {
    const net = new LoopbackNetwork({ scheduler });
    const hub = new HostInputHub(net.join('host'), 8);
    const client = net.join('c1');
    client.send({ t: 'join', local: 0 });
    vi.advanceTimersByTime(0);
    hub.poll(true);
    const G = Btn.Grab;
    const pressedNow = () => {
      const s = hub.slots[0]!;
      return !!(s.cur.buttons & G) && !(s.prev.buttons & G);
    };
    // Hai khung tới cùng lúc: nhấn rồi thả → bước 1 thấy nhấn, bước 2 thấy thả.
    client.send({ t: 'in', f: [[0, 0, 0, 0, G, 0, 0, 0]] });
    vi.advanceTimersByTime(0);
    hub.poll(true);
    expect(pressedNow()).toBe(true);
    expect(hub.ackOf(0)).toBe(0);
    hub.poll(true);
    expect(hub.slots[0]!.cur.buttons & G).toBe(0);
    expect(hub.ackOf(0)).toBe(1);
    // Gửi lại khung cũ thì bỏ qua.
    client.send({ t: 'in', f: [[0, 0, 0, 0, G, 0, 0, 0]] });
    vi.advanceTimersByTime(0);
    hub.poll(true);
    expect(pressedNow()).toBe(false);

    // 40 khung dồn một lúc, cú bấm nằm ở khung thứ 2 (bị bỏ vì hàng chờ quá dài).
    const frames: number[] = [];
    for (let k = 0; k < 40; k++) frames.push(0, 0, k === 1 ? G : 0);
    client.send({ t: 'in', f: [[0, 2, ...frames]] });
    vi.advanceTimersByTime(0);
    hub.poll(true);
    expect(pressedNow()).toBe(true);
    expect(hub.ackOf(0)).toBe(12);
  });
});
