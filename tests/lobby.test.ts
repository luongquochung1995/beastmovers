import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LoopbackNetwork } from '../src/net/LoopbackNetwork';
import { cleanName, Lobby, type LocalSeat } from '../src/net/lobby';
import { RoomSession, type SessionInfo } from '../src/net/session';
import type { Scheduler } from '../src/net/Transport';

const scheduler: Scheduler = {
  now: () => Date.now(),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
};
const info: SessionInfo = { version: '1', dataHash: 'h', maxPlayers: 8 };
const kb = (name: string, local = 0): LocalSeat => ({ local, source: 'keyboard', name });

describe('lobby online', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const setup = () => {
    const net = new LoopbackNetwork({ latencyMs: 10, scheduler });
    const hs = new RoomSession(net.join('host'), 'host', info, 1, scheduler);
    const host = new Lobby(hs, 'lv01', 8);
    host.setLocalSeats([kb('Hà')]);
    const join = (id: string, seats: LocalSeat[]) => {
      const s = new RoomSession(net.join(id), 'client', info, seats.length, scheduler);
      vi.advanceTimersByTime(50);
      const lobby = new Lobby(s, 'lv01', 8);
      lobby.setLocalSeats(seats);
      vi.advanceTimersByTime(50);
      return lobby;
    };
    return { net, host, join };
  };

  it('mỗi người một màu khác nhau, mọi máy thấy cùng danh sách', () => {
    const { host, join } = setup();
    const a = join('a', [kb('An'), { local: 1, source: 'gamepad', name: 'Bình' }]);
    const b = join('b', [kb('Chi')]);
    expect(host.state.seats.map((s) => [s.peer, s.name, s.color])).toEqual([
      ['host', 'Hà', 0],
      ['a', 'An', 1],
      ['a', 'Bình', 2],
      ['b', 'Chi', 3],
    ]);
    expect(a.state).toEqual(host.state);
    expect(b.state).toEqual(host.state);

    // Đổi sang màu đã có người dùng: bị bỏ qua. Màu trống: được.
    b.setLook(0, { color: 1 });
    vi.advanceTimersByTime(50);
    expect(b.mySeats()[0]!.color).toBe(3);
    b.setLook(0, { color: 6, hat: 2, name: '  Chi Chi  ' });
    vi.advanceTimersByTime(50);
    expect(a.state.seats[3]).toMatchObject({ color: 6, hat: 2, name: 'Chi Chi' });
  });

  it('sẵn sàng, chọn màn, đủ/thiếu người, bắt đầu', () => {
    const { host, join } = setup();
    const a = join('a', [kb('An')]);
    expect(host.startBlock(1, 8)).toBe('notReady');
    a.setReady(true);
    vi.advanceTimersByTime(50);
    expect(host.startBlock(1, 8)).toBeNull();
    expect(host.startBlock(3, 8)).toBe('tooFew');
    expect(host.startBlock(1, 1)).toBe('tooMany');
    host.setLevel('lv02');
    host.start();
    vi.advanceTimersByTime(50);
    expect(a.started?.levelId).toBe('lv02');
    expect(a.started?.seats.map((s) => s.name)).toEqual(['Hà', 'An']);
  });

  it('tổng tối đa 8 người; người rời phòng hoặc bị đuổi thì mất ô', () => {
    const { host, join } = setup();
    const a = join(
      'a',
      [0, 1, 2, 3].map((i) => kb(`A${i}`, i)),
    );
    const b = join(
      'b',
      [0, 1, 2, 3].map((i) => kb(`B${i}`, i)),
    );
    expect(host.state.seats).toHaveLength(8);
    expect(b.mySeats()).toHaveLength(3);
    expect(new Set(host.state.seats.map((s) => s.color)).size).toBe(8);

    host.kick('a');
    vi.advanceTimersByTime(50);
    expect(a.kicked).toBe(true);
    expect(b.state.seats.map((s) => s.peer)).toEqual(['host', 'b', 'b', 'b']);
    // Máy bị đuổi gửi gì cũng bị bỏ qua.
    a.setLocalSeats([kb('again')]);
    vi.advanceTimersByTime(50);
    expect(host.state.seats).toHaveLength(4);

    b.session.close();
    vi.advanceTimersByTime(50);
    expect(host.state.seats.map((s) => s.peer)).toEqual(['host']);
  });

  it('tên trùng thì thêm số', () => {
    const { host, join } = setup();
    join('a', [kb('Hà'), kb('Hà', 1)]);
    expect(host.state.seats.map((s) => s.name)).toEqual(['Hà', 'Hà 2', 'Hà 3']);
  });

  it('làm sạch tên', () => {
    expect(cleanName('  Một cái tên rất là dài quá  ')).toBe('Một cái tên ');
    expect(cleanName('a\u0000b\nc')).toBe('abc');
  });
});
