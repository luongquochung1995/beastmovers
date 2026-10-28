import Peer, { type DataConnection } from 'peerjs';
import type { GameConfig } from '../data/types';
import { emptyStats, type Payload, type PeerId, payloadSize, type Transport } from './Transport';

export interface PeerServerOptions {
  host: string;
  port: number;
  path: string;
  secure: boolean;
}

/** Định danh PeerJS của host: suy ra từ mã phòng để máy khách tự tìm được. */
export function peerJsHostId(appId: string, roomCode: string): string {
  return `${appId}-${roomCode}`.replace(/[^A-Za-z0-9_-]/g, '-');
}

/**
 * Kênh dự phòng qua PeerJS (máy chủ trung gian của PeerJS để tìm nhau, rồi WebRTC trực tiếp).
 * Hình sao: máy khách chỉ nối tới host (mọi tin trong game đều đi qua host).
 */
export class PeerJsTransport implements Transport {
  readonly stats = emptyStats();
  private readonly peer: Peer;
  private readonly conns = new Map<PeerId, DataConnection>();
  private readonly messageCbs: ((data: Payload, from: PeerId) => void)[] = [];
  private readonly joinCbs: ((peer: PeerId) => void)[] = [];
  private readonly leaveCbs: ((peer: PeerId) => void)[] = [];
  private readonly errorCbs: ((error: string) => void)[] = [];
  private closed = false;

  constructor(
    net: GameConfig['net'],
    roomCode: string,
    role: 'host' | 'client',
    /** Định danh của máy này (máy khách dùng lại định danh Trystero để không đổi danh tính). */
    readonly selfId: PeerId,
    server?: PeerServerOptions,
  ) {
    const hostId = peerJsHostId(net.appId, roomCode);
    if (role === 'host') this.selfId = hostId;
    this.peer = new Peer(this.selfId, {
      config: { iceServers: net.iceServers },
      ...(server ?? {}),
    });
    this.peer.on('error', (e) => this.errorCbs.forEach((cb) => cb(String(e.type ?? e))));
    if (role === 'host') {
      this.peer.on('connection', (conn) => this.setup(conn));
    } else {
      this.peer.on('open', () => this.setup(this.peer.connect(hostId, { reliable: true })));
    }
  }

  private setup(conn: DataConnection): void {
    conn.on('open', () => {
      if (this.closed) return;
      this.conns.set(conn.peer, conn);
      for (const cb of this.joinCbs) cb(conn.peer);
    });
    conn.on('data', (data) => {
      if (this.closed) return;
      this.stats.recvMessages++;
      this.stats.recvBytes += payloadSize(data);
      for (const cb of this.messageCbs) cb(data, conn.peer);
    });
    conn.on('close', () => {
      if (this.conns.get(conn.peer) !== conn) return;
      this.conns.delete(conn.peer);
      for (const cb of this.leaveCbs) cb(conn.peer);
    });
  }

  send(data: Payload, to?: PeerId): void {
    if (this.closed) return;
    const targets = to === undefined ? [...this.conns.values()] : [this.conns.get(to)];
    for (const c of targets) {
      if (!c?.open) continue;
      this.stats.sentMessages++;
      this.stats.sentBytes += payloadSize(data);
      void c.send(data);
    }
  }

  onMessage(cb: (data: Payload, from: PeerId) => void): void {
    this.messageCbs.push(cb);
  }

  onPeerJoin(cb: (peer: PeerId) => void): void {
    this.joinCbs.push(cb);
  }

  onPeerLeave(cb: (peer: PeerId) => void): void {
    this.leaveCbs.push(cb);
  }

  onError(cb: (error: string) => void): void {
    this.errorCbs.push(cb);
  }

  peers(): PeerId[] {
    return [...this.conns.keys()];
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.peer.destroy();
  }
}
