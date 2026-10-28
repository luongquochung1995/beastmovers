import type { GameConfig } from '../data/types';
import { BroadcastTransport } from './BroadcastTransport';
import type { Transport } from './Transport';
import { TrysteroTransport } from './TrysteroTransport';

export type TransportKind = 'trystero' | 'broadcast';

/**
 * Chọn kênh truyền cho phòng online. Mặc định Trystero (WebRTC thật);
 * `?transport=broadcast`: các tab cùng trình duyệt (thử không cần mạng);
 * `?relay=wss://a,wss://b`: dùng relay nostr khác (vd. relay chạy trên máy để kiểm thử).
 */
export function openTransport(
  net: GameConfig['net'],
  roomCode: string,
  search: string,
): { transport: Transport; kind: TransportKind } {
  const p = new URLSearchParams(search);
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
