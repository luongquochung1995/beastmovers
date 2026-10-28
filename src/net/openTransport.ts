import type { GameConfig } from '../data/types';
import { BroadcastTransport } from './BroadcastTransport';
import { LaggedTransport } from './LaggedTransport';
import type { Transport } from './Transport';
import { TrysteroTransport } from './TrysteroTransport';

export type TransportKind = 'trystero' | 'broadcast';

/**
 * Chọn kênh truyền cho phòng online. Mặc định Trystero (WebRTC thật);
 * `?transport=broadcast`: các tab cùng trình duyệt (thử không cần mạng);
 * `?relay=wss://a,wss://b`: dùng relay nostr khác (vd. relay chạy trên máy để kiểm thử).
 * `?lag=150&jitter=30`: thêm độ trễ cho mọi gói gửi đi (thử mạng chậm).
 */
export function openTransport(
  net: GameConfig['net'],
  roomCode: string,
  search: string,
): { transport: Transport; kind: TransportKind } {
  const p = new URLSearchParams(search);
  const { transport, kind } = openRaw(net, roomCode, p);
  const lag = Number(p.get('lag') ?? 0);
  const jitter = Number(p.get('jitter') ?? 0);
  if (lag > 0 || jitter > 0)
    return { transport: new LaggedTransport(transport, lag, jitter), kind };
  return { transport, kind };
}

function openRaw(
  net: GameConfig['net'],
  roomCode: string,
  p: URLSearchParams,
): { transport: Transport; kind: TransportKind } {
  if (p.get('transport') === 'broadcast') {
    return { transport: new BroadcastTransport(roomCode), kind: 'broadcast' };
  }
  const relay = p.get('relay');
  const urls = relay ? relay.split(',').filter((u) => /^wss?:\/\//.test(u)) : undefined;
  return {
    transport: new TrysteroTransport(net, roomCode, urls?.length ? urls : undefined),
    kind: 'trystero',
  };
}
