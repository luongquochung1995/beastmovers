import { joinRoom, type Room, selfId } from 'trystero/nostr';
import type { GameConfig } from '../data/types';
import { emptyStats, type Payload, type PeerId, payloadSize, type Transport } from './Transport';

/**
 * WebRTC thật qua Trystero: các máy tìm nhau qua relay nostr (không cần server riêng),
 * sau đó nói chuyện trực tiếp bằng data channel (tin cậy, giữ thứ tự).
 */
export class TrysteroTransport implements Transport {
  readonly selfId: PeerId = selfId;
  readonly stats = emptyStats();
  private readonly room: Room;
  private readonly sendRaw: (data: Payload, to?: PeerId) => void;
  private readonly known = new Set<PeerId>();
  private readonly messageCbs: ((data: Payload, from: PeerId) => void)[] = [];
  private readonly joinCbs: ((peer: PeerId) => void)[] = [];
  private readonly leaveCbs: ((peer: PeerId) => void)[] = [];
  private readonly errorCbs: ((error: string) => void)[] = [];
  private closed = false;

  constructor(net: GameConfig['net'], roomCode: string, relayUrls?: string[]) {
    const urls = relayUrls ?? net.relayUrls;
    this.room = joinRoom(
      {
        appId: net.appId,
        rtcConfig: { iceServers: net.iceServers },
        ...(urls ? { relayConfig: { urls, redundancy: Math.min(urls.length, 5) } } : {}),
      },
      roomCode,
      { onJoinError: (e) => this.errorCbs.forEach((cb) => cb(e.error)) },
    );
    const action = this.room.makeAction<never>('m', {
      onMessage: (data, ctx) => {
        if (this.closed) return;
        this.stats.recvMessages++;
        this.stats.recvBytes += payloadSize(data);
        for (const cb of this.messageCbs) cb(data, ctx.peerId);
      },
    });
    this.sendRaw = (data, to) => {
      void action.send(data as never, to === undefined ? {} : { target: to }).catch(() => {});
    };
    this.room.onPeerJoin = (peer) => {
      this.known.add(peer);
      for (const cb of this.joinCbs) cb(peer);
    };
    this.room.onPeerLeave = (peer) => {
      if (!this.known.delete(peer)) return;
      for (const cb of this.leaveCbs) cb(peer);
    };
  }

  send(data: Payload, to?: PeerId): void {
    if (this.closed) return;
    const n = to === undefined ? this.known.size : this.known.has(to) ? 1 : 0;
    if (n === 0) return;
    this.stats.sentMessages += n;
    this.stats.sentBytes += payloadSize(data) * n;
    this.sendRaw(data, to);
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

  /** Lỗi khi vào phòng (vd. sai mật khẩu, relay từ chối). */
  onError(cb: (error: string) => void): void {
    this.errorCbs.push(cb);
  }

  peers(): PeerId[] {
    return [...this.known];
  }

  /** Thời gian khứ hồi tới một máy (ms). */
  ping(peer: PeerId): Promise<number> {
    return this.room.ping(peer);
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    void this.room.leave();
  }
}
