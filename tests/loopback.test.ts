import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LoopbackNetwork } from '../src/net/LoopbackNetwork';
import type { Scheduler } from '../src/net/Transport';

const fakeScheduler: Scheduler = {
  now: () => Date.now(),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
};

describe('LoopbackNetwork', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('giao tin sau đúng độ trễ, báo người vào/ra', () => {
    const net = new LoopbackNetwork({ latencyMs: 100, scheduler: fakeScheduler });
    const host = net.join('host');
    const joined: string[] = [];
    host.onPeerJoin((p) => joined.push(p));
    const client = net.join('c1');
    expect(joined).toEqual(['c1']);
    const got: unknown[] = [];
    host.onMessage((d, from) => got.push([from, d]));
    client.send({ t: 'hi' });
    vi.advanceTimersByTime(99);
    expect(got).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(got).toEqual([['c1', { t: 'hi' }]]);
    const left: string[] = [];
    host.onPeerLeave((p) => left.push(p));
    client.close();
    expect(left).toEqual(['c1']);
  });

  it('giữ đúng thứ tự dù có dao động và mất gói', () => {
    const net = new LoopbackNetwork({
      latencyMs: 50,
      jitterMs: 40,
      loss: 0.3,
      scheduler: fakeScheduler,
      seed: 7,
    });
    const a = net.join('a');
    const b = net.join('b');
    const got: number[] = [];
    b.onMessage((d) => got.push((d as { n: number }).n));
    for (let n = 0; n < 100; n++) {
      a.send({ n });
      vi.advanceTimersByTime(5);
    }
    vi.advanceTimersByTime(1000);
    expect(got).toEqual([...Array(100).keys()]);
  });

  it('gửi bản sao, đếm byte', () => {
    const net = new LoopbackNetwork({ scheduler: fakeScheduler });
    const a = net.join('a');
    const b = net.join('b');
    const msg = { list: [1, 2, 3] };
    let received: { list: number[] } | null = null;
    b.onMessage((d) => (received = d as { list: number[] }));
    a.send(msg);
    vi.advanceTimersByTime(0);
    msg.list.push(4);
    expect(received!.list).toEqual([1, 2, 3]);
    expect(a.stats.sentBytes).toBeGreaterThan(0);
    expect(b.stats.recvMessages).toBe(1);
  });
});

describe('parseNetOptions', () => {
  it('đọc chế độ và thông số, kẹp giá trị lạ', async () => {
    const { parseNetOptions } = await import('../src/net/netOptions');
    expect(parseNetOptions('')).toEqual({ mode: 'local', lagMs: 100, jitterMs: 0, loss: 0 });
    expect(parseNetOptions('?net=loopback&lag=250&loss=5&jitter=abc')).toEqual({
      mode: 'loopback',
      lagMs: 250,
      jitterMs: 0,
      loss: 0.9,
    });
  });
});
