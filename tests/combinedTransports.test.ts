import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FallbackTransport, MultiTransport } from '../src/net/combinedTransports';
import { LoopbackNetwork } from '../src/net/LoopbackNetwork';
import { RoomSession, type SessionInfo } from '../src/net/session';
import type { Scheduler } from '../src/net/Transport';

const scheduler: Scheduler = { now: () => Date.now(), setTimeout: (fn, ms) => setTimeout(fn, ms) };
const info: SessionInfo = { version: '1', dataHash: 'h', maxPlayers: 8 };

describe('kênh dự phòng', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('host nghe trên hai kênh; máy khách kênh chính hỏng thì chuyển sang dự phòng', () => {
    // Kênh chính (giả Trystero) và kênh dự phòng (giả PeerJS) là hai mạng riêng.
    const main = new LoopbackNetwork({ latencyMs: 10, scheduler });
    const backup = new LoopbackNetwork({ latencyMs: 10, scheduler });
    const host = new RoomSession(
      new MultiTransport([main.join('H'), backup.join('H-peerjs')]),
      'host',
      info,
      1,
      scheduler,
    );
    // Máy A vào bằng kênh chính, bình thường.
    const a = new RoomSession(main.join('A'), 'client', info, 1, scheduler);
    // Máy B: kênh chính không thấy ai (mạng chặn relay) → chuyển sang dự phòng.
    const blocked = new LoopbackNetwork({ latencyMs: 10, scheduler });
    const fb = new FallbackTransport(blocked.join('B'), () => backup.join('B'));
    const b = new RoomSession(fb, 'client', info, 1, scheduler);
    vi.advanceTimersByTime(100);
    expect(a.state.kind).toBe('joined');
    expect(b.state.kind).toBe('connecting');
    fb.useFallback();
    vi.advanceTimersByTime(100);
    expect(b.state.kind).toBe('joined');
    expect(b.hostId).toBe('H-peerjs');
    expect(host.members.map((m) => m.id)).toEqual(['H', 'A', 'B']);
    // Host gửi riêng cho B: đi đúng kênh dự phòng.
    const got: unknown[] = [];
    fb.onMessage((d) => got.push(d));
    host.transport.send({ t: 'x' }, 'B');
    vi.advanceTimersByTime(50);
    expect(got).toContainEqual({ t: 'x' });
  });
});
