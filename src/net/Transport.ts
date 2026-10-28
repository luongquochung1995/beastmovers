/**
 * Kênh truyền giữa các máy trong một phòng. Có nhiều cài đặt:
 * - LoopbackNetwork: giả lập mạng ngay trong một máy (độ trễ, mất gói) để thử nghiệm.
 * - BroadcastChannel: các tab cùng trình duyệt (P20, để kiểm thử).
 * - Trystero/PeerJS: WebRTC thật qua Internet (P20).
 * Mọi kênh đều tin cậy và giữ thứ tự (như WebRTC data channel mặc định).
 */
export type PeerId = string;

/** Dữ liệu gửi đi: object JSON hoặc gói nhị phân. */
export type Payload = unknown;

export interface TransportStats {
  sentBytes: number;
  recvBytes: number;
  sentMessages: number;
  recvMessages: number;
}

export interface Transport {
  readonly selfId: PeerId;
  /** Gửi cho một máy, hoặc mọi máy khác trong phòng nếu bỏ trống `to`. */
  send(data: Payload, to?: PeerId): void;
  onMessage(cb: (data: Payload, from: PeerId) => void): void;
  onPeerJoin(cb: (peer: PeerId) => void): void;
  onPeerLeave(cb: (peer: PeerId) => void): void;
  peers(): PeerId[];
  readonly stats: TransportStats;
  close(): void;
}

export function emptyStats(): TransportStats {
  return { sentBytes: 0, recvBytes: 0, sentMessages: 0, recvMessages: 0 };
}

/** Ước lượng kích thước gói (byte) để thống kê băng thông. */
export function payloadSize(data: Payload): number {
  if (data instanceof ArrayBuffer) return data.byteLength;
  if (ArrayBuffer.isView(data)) return data.byteLength;
  return new TextEncoder().encode(JSON.stringify(data)).length;
}

/** Bộ hẹn giờ thay được (kiểm thử dùng đồng hồ giả). */
export interface Scheduler {
  now(): number;
  setTimeout(fn: () => void, ms: number): unknown;
}

export const realScheduler: Scheduler = {
  now: () => performance.now(),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
};
