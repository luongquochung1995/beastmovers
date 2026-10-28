import type { GameConfig } from '../data/types';
import { BroadcastTransport } from './BroadcastTransport';
import { FallbackTransport, MultiTransport } from './combinedTransports';
import { LaggedTransport } from './LaggedTransport';
import { PeerJsTransport, type PeerServerOptions } from './PeerJsTransport';
import type { Transport } from './Transport';
import { TrysteroTransport } from './TrysteroTransport';

export type TransportKind = 'trystero' | 'peerjs' | 'broadcast';

export interface OpenedTransport {
  transport: Transport;
  kind: TransportKind;
  /** Máy khách: chuyển sang PeerJS khi Trystero không tìm được host (null nếu không có). */
  fallback: FallbackTransport | null;
}

/**
 * Chọn kênh truyền cho phòng online. Mặc định Trystero (WebRTC, tìm nhau qua relay nostr);
 * host nghe thêm trên PeerJS, máy khách không tìm được host qua Trystero thì chuyển sang PeerJS.
 * Tham số URL để thử nghiệm:
 * `?transport=broadcast`: các tab cùng trình duyệt (không cần mạng);
 * `?relay=wss://a,wss://b`: relay nostr khác; `?peerserver=localhost:9000`: máy chủ PeerJS khác;
 * `?fallback=0`: tắt dự phòng; `?lag=150&jitter=30`: thêm độ trễ cho mọi gói gửi đi.
 */
export function openTransport(
  net: GameConfig['net'],
  roomCode: string,
  search: string,
  role: 'host' | 'client',
): OpenedTransport {
  const p = new URLSearchParams(search);
  const opened = openRaw(net, roomCode, p, role);
  const lag = Number(p.get('lag') ?? 0);
  const jitter = Number(p.get('jitter') ?? 0);
  if (lag > 0 || jitter > 0) {
    return { ...opened, transport: new LaggedTransport(opened.transport, lag, jitter) };
  }
  return opened;
}

function openRaw(
  net: GameConfig['net'],
  roomCode: string,
  p: URLSearchParams,
  role: 'host' | 'client',
): OpenedTransport {
  if (p.get('transport') === 'broadcast') {
    return { transport: new BroadcastTransport(roomCode), kind: 'broadcast', fallback: null };
  }
  const relay = p.get('relay');
  const urls = relay ? relay.split(',').filter((u) => /^wss?:\/\//.test(u)) : undefined;
  const trystero = new TrysteroTransport(net, roomCode, urls?.length ? urls : undefined);
  const useFallback = net.fallbackTransport === 'peerjs' && p.get('fallback') !== '0';
  if (!useFallback) return { transport: trystero, kind: 'trystero', fallback: null };
  const server = peerServer(net, p.get('peerserver'));
  if (role === 'host') {
    // Host nghe trên cả hai kênh; PeerJS lỗi (máy chủ không với tới) thì chỉ còn Trystero.
    const peerjs = new PeerJsTransport(net, roomCode, 'host', trystero.selfId, server);
    return { transport: new MultiTransport([trystero, peerjs]), kind: 'trystero', fallback: null };
  }
  const fallback = new FallbackTransport(
    trystero,
    () => new PeerJsTransport(net, roomCode, 'client', trystero.selfId, server),
  );
  return { transport: fallback, kind: 'trystero', fallback };
}

/** Máy chủ PeerJS: `?peerserver=host:port[/path]` (http), hoặc theo config, mặc định của PeerJS. */
function peerServer(net: GameConfig['net'], param: string | null): PeerServerOptions | undefined {
  if (param) {
    const m = /^([^:/]+)(?::(\d+))?(\/.*)?$/.exec(param);
    if (m) return { host: m[1]!, port: Number(m[2] ?? 80), path: m[3] ?? '/', secure: false };
  }
  return net.peerServer;
}
