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

  it('hai gói tới cùng lúc (nhấn rồi thả) vẫn thấy cú bấm', () => {
    const net = new LoopbackNetwork({ scheduler });
    const hub = new HostInputHub(net.join('host'), 8);
    const client = net.join('c1');
    client.send({ t: 'join', local: 0 });
    vi.advanceTimersByTime(0);
    hub.poll(true);
    client.send({ t: 'in', seq: 0, f: [[0, 0, 0, Btn.Grab]] });
    client.send({ t: 'in', seq: 1, f: [[0, 0, 0, 0]] });
    vi.advanceTimersByTime(0);
    hub.poll(true);
    expect(hub.slots[0]!.cur.buttons & Btn.Grab).toBeTruthy();
    hub.poll(true);
    expect(hub.slots[0]!.cur.buttons & Btn.Grab).toBeFalsy();
  });
});
