import type { Payload, PeerId, Transport } from './Transport';

/**
 * Bọc một kênh truyền thật, thêm độ trễ (và dao động) cho mọi gói gửi đi, vẫn giữ thứ tự.
 * Dùng để thử chơi online với mạng chậm: `?lag=150&jitter=30` (trễ một chiều, ms).
 */
export class LaggedTransport implements Transport {
  private readonly queue: { at: number; data: Payload; to: PeerId | undefined }[] = [];
  private lastAt = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly inner: Transport,
    private readonly lagMs: number,
    private readonly jitterMs = 0,
  ) {}

  get selfId(): PeerId {
    return this.inner.selfId;
  }

  get stats() {
    return this.inner.stats;
  }

  send(data: Payload, to?: PeerId): void {
    const at = Math.max(
      performance.now() + this.lagMs + Math.random() * this.jitterMs,
      this.lastAt,
    );
    this.lastAt = at;
    // Gói nhị phân có thể bị bên gọi dùng lại: chép ra trước khi giữ lại.
    const copy = data instanceof ArrayBuffer ? data.slice(0) : data;
    this.queue.push({ at, data: copy, to });
    if (!this.timer) this.schedule();
  }

  private schedule(): void {
    const head = this.queue[0];
    if (!head) {
      this.timer = null;
      return;
    }
    this.timer = setTimeout(
      () => {
        const now = performance.now();
        while (this.queue[0] && this.queue[0].at <= now + 1) {
          const m = this.queue.shift()!;
          this.inner.send(m.data, m.to);
        }
        this.schedule();
      },
      Math.max(0, head.at - performance.now()),
    );
  }

  onMessage(cb: (data: Payload, from: PeerId) => void): void {
    this.inner.onMessage(cb);
  }

  onPeerJoin(cb: (peer: PeerId) => void): void {
    this.inner.onPeerJoin(cb);
  }

  onPeerLeave(cb: (peer: PeerId) => void): void {
    this.inner.onPeerLeave(cb);
  }

  peers(): PeerId[] {
    return this.inner.peers();
  }

  close(): void {
    if (this.timer) clearTimeout(this.timer);
    // Gửi nốt các gói đang chờ (vd. lời chào tạm biệt) rồi mới đóng.
    for (const m of this.queue.splice(0)) this.inner.send(m.data, m.to);
    this.inner.close();
  }
}
