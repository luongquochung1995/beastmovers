import type { Snapshot } from './snapshot';
import { decodeSnapshot, encodeSnapshot, quantize, SNAP_FULL, snapshotKind } from './snapshotCodec';
import type { Payload, PeerId, Transport } from './Transport';

/** Gửi snapshot đầy đủ định kỳ để chắc chắn mọi máy khớp với host. */
export const FULL_EVERY_MS = 2000;

const asBytes = (d: Payload): Uint8Array | null =>
  d instanceof ArrayBuffer
    ? new Uint8Array(d)
    : ArrayBuffer.isView(d)
      ? new Uint8Array(d.buffer, d.byteOffset, d.byteLength)
      : null;

/**
 * Host: gửi snapshot `snapshotHz` lần/giây cho từng máy khách. Mỗi máy có gói gốc riêng
 * (gói trước đã gửi cho máy đó): máy mới vào nhận gói đầy đủ, sau đó chỉ nhận phần thay đổi,
 * và cứ `FULL_EVERY_MS` lại nhận một gói đầy đủ.
 */
export class SnapshotBroadcaster {
  private readonly defIndex: ReadonlyMap<string, number>;
  private readonly baselines = new Map<PeerId, Snapshot>();
  private readonly lastFull = new Map<PeerId, number>();
  private sinceMs = 0;
  private clockMs = 0;
  /** Byte đã gửi cho từng máy (để đo băng thông). */
  readonly sentBytes = new Map<PeerId, number>();
  fullCount = 0;
  deltaCount = 0;

  constructor(
    private readonly transport: Transport,
    defIds: readonly string[],
    private readonly snapshotHz: number,
  ) {
    this.defIndex = new Map(defIds.map((d, i) => [d, i]));
    transport.onPeerLeave((peer) => this.forget(peer));
  }

  /** Máy rời đi (hoặc vào lại): lần sau gửi gói đầy đủ. */
  forget(peer: PeerId): void {
    this.baselines.delete(peer);
    this.lastFull.delete(peer);
  }

  /** Gọi mỗi bước logic; `take` chỉ được gọi khi tới lượt gửi. */
  tick(dtMs: number, peers: readonly PeerId[], take: () => Snapshot): void {
    this.clockMs += dtMs;
    this.sinceMs += dtMs;
    if (this.sinceMs + 0.001 < 1000 / this.snapshotHz || peers.length === 0) return;
    this.sinceMs = 0;
    const snap = quantize(take());
    for (const peer of peers) {
      const due = this.clockMs - (this.lastFull.get(peer) ?? -Infinity) >= FULL_EVERY_MS;
      const base = due ? null : (this.baselines.get(peer) ?? null);
      const buf = encodeSnapshot(snap, base, this.defIndex);
      if (!base) {
        this.lastFull.set(peer, this.clockMs);
        this.fullCount++;
      } else this.deltaCount++;
      this.transport.send(buf, peer);
      this.baselines.set(peer, snap);
      this.sentBytes.set(peer, (this.sentBytes.get(peer) ?? 0) + buf.byteLength);
    }
  }
}

/** Máy khách: nhận và giải mã snapshot từ host, xếp hàng chờ áp vào thế giới. */
export class SnapshotReceiver {
  private decoded: Snapshot | null = null;
  private readonly queue: Snapshot[] = [];
  recvBytes = 0;
  recvCount = 0;
  /** Gói delta tới khi chưa có gói gốc (bỏ qua, chờ gói đầy đủ). */
  dropped = 0;

  constructor(
    transport: Transport,
    private readonly hostId: PeerId,
    private readonly defIds: readonly string[],
  ) {
    transport.onMessage((d, from) => {
      if (from !== this.hostId) return;
      const bytes = asBytes(d);
      if (bytes) this.receive(bytes);
    });
  }

  private receive(bytes: Uint8Array): void {
    this.recvBytes += bytes.byteLength;
    this.recvCount++;
    const base = snapshotKind(bytes) === SNAP_FULL ? null : this.decoded;
    const snap = decodeSnapshot(bytes, base, this.defIds);
    if (!snap) {
      this.dropped++;
      return;
    }
    this.decoded = snap;
    this.queue.push(snap);
  }

  /** Lấy mọi snapshot đã nhận kể từ lần trước (cũ trước, mới sau). */
  take(): Snapshot[] {
    return this.queue.splice(0);
  }

  get latest(): Snapshot | null {
    return this.decoded;
  }
}
