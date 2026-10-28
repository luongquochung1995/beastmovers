import { Random } from '../systems/Random';
import {
  emptyStats,
  type Payload,
  payloadSize,
  type PeerId,
  realScheduler,
  type Scheduler,
  type Transport,
  type TransportStats,
} from './Transport';

export interface LoopbackOptions {
  /** Độ trễ một chiều (ms). */
  latencyMs?: number;
  /** Dao động ngẫu nhiên thêm vào độ trễ (0..jitter ms). */
  jitterMs?: number;
  /**
   * Tỉ lệ gói "mất". Kênh là loại tin cậy nên gói mất được gửi lại: mô phỏng bằng
   * thêm một khoảng trễ khứ hồi (2 × latency), vẫn giữ đúng thứ tự.
   */
  loss?: number;
  seed?: number;
  scheduler?: Scheduler;
}

/**
 * Mạng giả trong một máy: nhiều điểm cuối nối với nhau, có độ trễ/mất gói.
 * Dùng để thử chế độ online ngay khi chơi chung máy (?net=loopback&lag=100).
 */
export class LoopbackNetwork {
  private readonly endpoints = new Map<PeerId, LoopbackEndpoint>();
  /** Thời điểm giao gói gần nhất trên từng cặp (để giữ thứ tự). */
  private readonly lastDelivery = new Map<string, number>();
  readonly scheduler: Scheduler;
  private readonly random: Random;

  constructor(readonly options: LoopbackOptions = {}) {
    this.scheduler = options.scheduler ?? realScheduler;
    this.random = new Random(options.seed ?? 1);
  }

  /** Thêm một máy vào phòng. */
  join(id: PeerId): LoopbackEndpoint {
    const ep = new LoopbackEndpoint(this, id);
    for (const other of this.endpoints.values()) {
      other.emitJoin(id);
      ep.emitJoin(other.selfId);
    }
    this.endpoints.set(id, ep);
    return ep;
  }

  leave(id: PeerId): void {
    if (!this.endpoints.delete(id)) return;
    for (const other of this.endpoints.values()) other.emitLeave(id);
  }

  peersOf(id: PeerId): PeerId[] {
    return [...this.endpoints.keys()].filter((p) => p !== id);
  }

  deliver(from: PeerId, to: PeerId, data: Payload): void {
    const { latencyMs = 0, jitterMs = 0, loss = 0 } = this.options;
    let delay = latencyMs + this.random.next() * jitterMs;
    if (loss > 0 && this.random.chance(loss)) delay += 2 * latencyMs;
    const key = `${from}>${to}`;
    const at = Math.max(this.scheduler.now() + delay, this.lastDelivery.get(key) ?? 0);
    this.lastDelivery.set(key, at);
    this.scheduler.setTimeout(
      () => this.endpoints.get(to)?.receive(data, from),
      at - this.scheduler.now(),
    );
  }
}

export class LoopbackEndpoint implements Transport {
  readonly stats: TransportStats = emptyStats();
  private readonly messageCbs: ((data: Payload, from: PeerId) => void)[] = [];
  private readonly joinCbs: ((p: PeerId) => void)[] = [];
  private readonly leaveCbs: ((p: PeerId) => void)[] = [];

  constructor(
    private readonly net: LoopbackNetwork,
    readonly selfId: PeerId,
  ) {}

  send(data: Payload, to?: PeerId): void {
    // Sao chép như gửi qua mạng thật (người nhận không dùng chung object với người gửi).
    const copy =
      data instanceof Uint8Array ? data.slice() : (JSON.parse(JSON.stringify(data)) as Payload);
    const targets = to ? [to] : this.net.peersOf(this.selfId);
    for (const t of targets) {
      this.stats.sentBytes += payloadSize(copy);
      this.stats.sentMessages++;
      this.net.deliver(this.selfId, t, copy);
    }
  }

  receive(data: Payload, from: PeerId): void {
    this.stats.recvBytes += payloadSize(data);
    this.stats.recvMessages++;
    for (const cb of this.messageCbs) cb(data, from);
  }

  emitJoin(p: PeerId): void {
    for (const cb of this.joinCbs) cb(p);
  }

  emitLeave(p: PeerId): void {
    for (const cb of this.leaveCbs) cb(p);
  }

  onMessage(cb: (data: Payload, from: PeerId) => void): void {
    this.messageCbs.push(cb);
  }

  onPeerJoin(cb: (p: PeerId) => void): void {
    this.joinCbs.push(cb);
  }

  onPeerLeave(cb: (p: PeerId) => void): void {
    this.leaveCbs.push(cb);
  }

  peers(): PeerId[] {
    return this.net.peersOf(this.selfId);
  }

  close(): void {
    this.net.leave(this.selfId);
  }
}
