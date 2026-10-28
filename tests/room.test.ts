import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LoopbackNetwork } from '../src/net/LoopbackNetwork';
import {
  generateRoomCode,
  inviteLink,
  normalizeRoomCode,
  ROOM_ALPHABET,
  roomFromUrl,
} from '../src/net/room';
import { RoomSession, type SessionInfo } from '../src/net/session';
import type { Scheduler } from '../src/net/Transport';

const scheduler: Scheduler = {
  now: () => Date.now(),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
};

describe('mã phòng', () => {
  it('sinh 6 ký tự trong bảng chữ, không có ký tự dễ nhầm', () => {
    for (let i = 0; i < 200; i++) {
      const code = generateRoomCode();
      expect(code).toHaveLength(6);
      for (const ch of code) expect(ROOM_ALPHABET).toContain(ch);
    }
    expect(ROOM_ALPHABET).not.toMatch(/[01OIL]/);
  });

  it('chuẩn hóa mã gõ tay và đọc từ URL', () => {
    expect(normalizeRoomCode(' abc-d23 ')).toBe('ABCD23');
    expect(normalizeRoomCode('ABCD2')).toBeNull();
    expect(normalizeRoomCode('ABCD10')).toBeNull();
    expect(roomFromUrl('?room=xyz789&debug')).toBe('XYZ789');
    expect(roomFromUrl('?debug')).toBeNull();
  });

  it('link mời bỏ các tham số khác', () => {
    expect(inviteLink('https://a.github.io/beastmovers/?debug&net=x#h', 'ABC234')).toBe(
      'https://a.github.io/beastmovers/?room=ABC234',
    );
  });
});

describe('bắt tay vào phòng', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const info: SessionInfo = { version: '0.1.0', dataHash: 'abcd1234', maxPlayers: 8 };
  const setup = () => {
    const net = new LoopbackNetwork({ latencyMs: 20, scheduler });
    const host = new RoomSession(net.join('host'), 'host', info, 1, scheduler);
    return { net, host };
  };

  it('cùng phiên bản và data thì vào được, host gửi danh sách cho mọi người', () => {
    const { net, host } = setup();
    const a = new RoomSession(net.join('a'), 'client', info, 2, scheduler);
    vi.advanceTimersByTime(100);
    expect(a.state.kind).toBe('joined');
    expect(a.hostId).toBe('host');
    expect(host.totalSeats).toBe(3);
    const b = new RoomSession(net.join('b'), 'client', info, 1, scheduler);
    vi.advanceTimersByTime(100);
    expect(b.state.kind).toBe('joined');
    expect(a.members.map((m) => m.id)).toEqual(['host', 'a', 'b']);
    expect(a.totalSeats).toBe(4);
    b.close();
    vi.advanceTimersByTime(100);
    expect(a.members.map((m) => m.id)).toEqual(['host', 'a']);
  });

  it('khác phiên bản hoặc khác data thì bị từ chối kèm lý do', () => {
    const { net } = setup();
    const v = new RoomSession(net.join('v'), 'client', { ...info, version: '0.2.0' }, 1, scheduler);
    const d = new RoomSession(
      net.join('d'),
      'client',
      { ...info, dataHash: 'ffff0000' },
      1,
      scheduler,
    );
    vi.advanceTimersByTime(100);
    expect(v.state).toEqual({
      kind: 'rejected',
      reason: 'version',
      hostVersion: '0.1.0',
      hostDataHash: 'abcd1234',
    });
    expect(d.state.kind === 'rejected' && d.state.reason).toBe('data');
  });

  it('tổng 8 người tính cả người chơi chung máy', () => {
    const { net, host } = setup();
    host.setLocalSeats(4);
    const a = new RoomSession(net.join('a'), 'client', info, 3, scheduler);
    vi.advanceTimersByTime(100);
    // Còn 1 chỗ mà máy B có 2 người: vẫn vào, chỉ được 1 ô.
    const b = new RoomSession(net.join('b'), 'client', info, 2, scheduler);
    vi.advanceTimersByTime(100);
    expect(a.state.kind).toBe('joined');
    expect(b.state.kind).toBe('joined');
    expect(host.totalSeats).toBe(8);
    const c = new RoomSession(net.join('c'), 'client', info, 1, scheduler);
    vi.advanceTimersByTime(100);
    expect(c.state.kind === 'rejected' && c.state.reason).toBe('full');
  });

  it('máy khách rớt mạng rồi có lại: vào lại phòng; quá thời gian chờ thì báo mất host', () => {
    const { net, host } = setup();
    const a = new RoomSession(net.join('a'), 'client', info, 1, scheduler);
    a.reconnectGraceMs = 10_000;
    vi.advanceTimersByTime(100);
    host.lock(['host', 'a']);
    net.setOffline('a', true);
    vi.advanceTimersByTime(100);
    expect(a.state.kind).toBe('reconnecting');
    expect(host.members.map((m) => m.id)).toEqual(['host']);
    // Có mạng lại sau 5 giây: chào lại host, được nhận lại.
    vi.advanceTimersByTime(5000);
    net.setOffline('a', false);
    vi.advanceTimersByTime(100);
    expect(a.state.kind).toBe('joined');
    expect(a.rejoins).toBe(1);
    expect(host.members.map((m) => m.id)).toEqual(['host', 'a']);
    // Máy lạ không được vào giữa lúc đang chơi.
    const x = new RoomSession(net.join('x'), 'client', info, 1, scheduler);
    vi.advanceTimersByTime(100);
    expect(x.state.kind === 'rejected' && x.state.reason).toBe('started');
    // Mất mạng lâu hơn thời gian chờ.
    net.setOffline('a', true);
    vi.advanceTimersByTime(10_100);
    expect(a.state).toEqual({ kind: 'hostLeft', quit: false });
  });

  it('không có host thì báo không tìm thấy; host rời thì báo cho máy khách', () => {
    const net = new LoopbackNetwork({ latencyMs: 20, scheduler });
    const lone = new RoomSession(net.join('x'), 'client', info, 1, scheduler, 5000);
    vi.advanceTimersByTime(5000);
    expect(lone.state.kind).toBe('noHost');

    const host = new RoomSession(net.join('host'), 'host', info, 1, scheduler);
    vi.advanceTimersByTime(100);
    // Host xuất hiện muộn vẫn vào được.
    expect(lone.state.kind).toBe('joined');
    host.close();
    vi.advanceTimersByTime(300);
    expect(lone.state).toEqual({ kind: 'hostLeft', quit: true });
  });
});
