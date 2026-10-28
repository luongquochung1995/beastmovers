import {
  emptyStats,
  type Payload,
  type PeerId,
  type Transport,
  type TransportStats,
} from './Transport';

/** Host: nghe trên nhiều kênh cùng lúc (Trystero và PeerJS dự phòng). */
export class MultiTransport implements Transport {
  constructor(private readonly parts: readonly Transport[]) {}

  get selfId(): PeerId {
    return this.parts[0]!.selfId;
  }

  get stats(): TransportStats {
    const s = emptyStats();
    for (const p of this.parts) {
      s.sentBytes += p.stats.sentBytes;
      s.recvBytes += p.stats.recvBytes;
      s.sentMessages += p.stats.sentMessages;
      s.recvMessages += p.stats.recvMessages;
    }
    return s;
  }

  send(data: Payload, to?: PeerId): void {
    if (to === undefined) for (const p of this.parts) p.send(data);
    else this.parts.find((p) => p.peers().includes(to))?.send(data, to);
  }

  onMessage(cb: (data: Payload, from: PeerId) => void): void {
    for (const p of this.parts) p.onMessage(cb);
  }

  onPeerJoin(cb: (peer: PeerId) => void): void {
    for (const p of this.parts) p.onPeerJoin(cb);
  }

  onPeerLeave(cb: (peer: PeerId) => void): void {
    for (const p of this.parts) p.onPeerLeave(cb);
  }

  peers(): PeerId[] {
    return [...new Set(this.parts.flatMap((p) => p.peers()))];
  }

  close(): void {
    for (const p of this.parts) p.close();
  }
}

/**
 * Máy khách: dùng kênh chính; không tìm được host thì chuyển sang kênh dự phòng
 * (`useFallback`). Bên dùng chỉ thấy một kênh, định danh của máy không đổi.
 */
export class FallbackTransport implements Transport {
  private current: Transport;
  private readonly messageCbs: ((data: Payload, from: PeerId) => void)[] = [];
  private readonly joinCbs: ((peer: PeerId) => void)[] = [];
  private readonly leaveCbs: ((peer: PeerId) => void)[] = [];
  usingFallback = false;

  constructor(
    primary: Transport,
    private readonly makeFallback: () => Transport,
  ) {
    this.current = primary;
    this.wire(primary);
  }

  private wire(t: Transport): void {
    t.onMessage((d, from) => {
      if (t === this.current) for (const cb of this.messageCbs) cb(d, from);
    });
    t.onPeerJoin((p) => {
      if (t === this.current) for (const cb of this.joinCbs) cb(p);
    });
    t.onPeerLeave((p) => {
      if (t === this.current) for (const cb of this.leaveCbs) cb(p);
    });
  }

  /** Chuyển sang kênh dự phòng (một lần). */
  useFallback(): void {
    if (this.usingFallback) return;
    this.usingFallback = true;
    const old = this.current;
    this.current = this.makeFallback();
    this.wire(this.current);
    old.close();
    // Máy đã thấy trên kênh mới trước khi kịp gắn bộ nghe.
    for (const p of this.current.peers()) for (const cb of this.joinCbs) cb(p);
  }

  get selfId(): PeerId {
    return this.current.selfId;
  }

  get stats(): TransportStats {
    return this.current.stats;
  }

  send(data: Payload, to?: PeerId): void {
    this.current.send(data, to);
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

  peers(): PeerId[] {
    return this.current.peers();
  }

  close(): void {
    this.current.close();
  }
}
