import type { GameConfig } from '../data/types';
import type { LevelResult } from '../sim/LevelRuntime';
import type { LevelRuntime } from '../sim/LevelRuntime';
import type { SlotSource } from '../sim/SimSlot';
import type { PlayerLook, World } from '../sim/World';
import type { InputManager } from '../systems/input/InputManager';
import { ClientMirror } from './ClientMirror';
import { ClientInputSender, HostInputHub, OnlineHostSlots } from './inputLink';
import { HATS } from './lobby';
import type { NetContext } from './netContext';
import type { Snapshot } from './snapshot';
import { SnapshotBroadcaster, SnapshotReceiver } from './snapshotLink';
import type { Payload } from './Transport';

/** Tin điều khiển màn chơi online (ngoài input và snapshot). */
export type GameMsg = { t: 'end'; result: LevelResult };

const isGameMsg = (d: Payload): d is GameMsg =>
  typeof d === 'object' && d !== null && (d as { t?: unknown }).t === 'end';

/** Đo băng thông theo cửa sổ 1 giây. */
class RateMeter {
  private windowStart = 0;
  private startBytes = 0;
  rate = 0;
  update(nowMs: number, totalBytes: number): void {
    if (nowMs - this.windowStart < 1000) return;
    this.rate = ((totalBytes - this.startBytes) * 1000) / Math.max(1, nowMs - this.windowStart);
    this.windowStart = nowMs;
    this.startBytes = totalBytes;
  }
}

/**
 * Một màn chơi online. Host: chạy mô phỏng với input của mọi máy (ô người chơi theo thứ tự
 * lobby) và gửi snapshot. Máy khách: gửi input, không chạy vật lý, vẽ theo snapshot.
 */
export class OnlineGame {
  readonly isHost: boolean;
  /** Host: nguồn ô người chơi cho mô phỏng. */
  readonly slotSource: SlotSource | null = null;
  private readonly broadcaster: SnapshotBroadcaster | null = null;
  private readonly sender: ClientInputSender | null = null;
  private readonly receiver: SnapshotReceiver | null = null;
  private mirror: ClientMirror | null = null;
  private lastApplyAt = -Infinity;
  private ended: LevelResult | null = null;
  private readonly meter = new RateMeter();
  private nowMs = 0;

  constructor(
    readonly ctx: NetContext,
    private readonly config: GameConfig,
    inputs: InputManager,
    defIds: readonly string[],
  ) {
    const { session, roster } = ctx;
    const transport = session.transport;
    const selfId = transport.selfId;
    this.isHost = session.isHost;
    if (this.isHost) {
      const hub = new HostInputHub(transport, config.maxPlayers);
      const localToGlobal = new Map<number, number>();
      roster.seats.forEach((seat, i) => {
        if (seat.peer === selfId) localToGlobal.set(seat.local, i);
        else hub.reserve(seat.peer, seat.local, i);
      });
      this.slotSource = new OnlineHostSlots(inputs, hub, localToGlobal);
      this.broadcaster = new SnapshotBroadcaster(transport, defIds, config.net.snapshotHz);
    } else {
      const hostId = session.hostId!;
      this.sender = new ClientInputSender(transport, hostId, inputs, config.net.inputHz);
      this.receiver = new SnapshotReceiver(transport, hostId, defIds);
      transport.onMessage((d, from) => {
        if (from === hostId && isGameMsg(d)) this.ended = d.result;
      });
    }
  }

  /** Các ô toàn cục chơi trên máy này (camera chỉ ôm những người này). */
  ownSlots(): number[] {
    const selfId = this.ctx.session.transport.selfId;
    return this.ctx.roster.seats.flatMap((s, i) => (s.peer === selfId ? [i] : []));
  }

  /** Mọi ô trong màn (host tạo nhân vật cho đủ ngay từ đầu). */
  allSlots(): number[] {
    return this.ctx.roster.seats.map((_, i) => i);
  }

  lookOf(slot: number): PlayerLook | undefined {
    const seat = this.ctx.roster.seats[slot];
    return seat && { style: seat.color, name: seat.name, hat: HATS[seat.hat] ?? '' };
  }

  /** Máy khách: gắn thế giới để áp snapshot. */
  attachMirror(
    world: World,
    runtime: LevelRuntime | null,
    spawnAt: (slot: number) => { x: number; y: number },
  ): void {
    if (this.isHost) return;
    this.mirror = new ClientMirror(world, runtime, (s) => this.lookOf(s), spawnAt);
  }

  /** Host: sau mỗi bước mô phỏng. */
  hostStep(dtMs: number, take: () => Snapshot): void {
    this.nowMs += dtMs;
    const peers = this.ctx.session.members
      .map((m) => m.id)
      .filter((id) => id !== this.ctx.session.transport.selfId);
    this.broadcaster?.tick(dtMs, peers, take);
  }

  /** Máy khách: thay cho bước mô phỏng. */
  clientStep(dtMs: number): void {
    this.nowMs += dtMs;
    this.sender?.tick(dtMs, false);
    const snaps = this.receiver?.take() ?? [];
    for (const s of snaps) this.mirror?.apply(s, this.config.logicHz, this.config.net.snapshotHz);
    if (snaps.length > 0) this.lastApplyAt = performance.now();
    if (this.receiver) this.meter.update(this.nowMs, this.receiver.recvBytes);
  }

  /** Máy khách: vị trí vẽ giữa snapshot trước và snapshot mới nhất (0..1). */
  renderAlpha(): number {
    const interval = 1000 / this.config.net.snapshotHz;
    return Math.min(1, Math.max(0, (performance.now() - this.lastApplyAt) / interval));
  }

  renderExtras(): void {
    this.mirror?.render();
  }

  /** Host: gửi kết quả màn cho mọi máy. */
  sendResult(result: LevelResult): void {
    this.ctx.session.transport.send({ t: 'end', result } satisfies GameMsg);
  }

  /** Máy khách: kết quả host gửi (null nếu màn chưa kết thúc). */
  get result(): LevelResult | null {
    return this.ended;
  }

  /** Một dòng cho bảng debug: băng thông, số gói. */
  info(): string {
    if (this.broadcaster) {
      const total = [...this.broadcaster.sentBytes.values()].reduce((a, b) => a + b, 0);
      this.meter.update(this.nowMs, total);
      const peers = Math.max(1, this.broadcaster.sentBytes.size);
      return `online host · ${(this.meter.rate / peers / 1024).toFixed(1)} KB/s/client · full ${this.broadcaster.fullCount} delta ${this.broadcaster.deltaCount}`;
    }
    const r = this.receiver!;
    return `online client · ${(this.meter.rate / 1024).toFixed(1)} KB/s · snaps ${r.recvCount} dropped ${r.dropped}`;
  }

  /** Bảng số liệu cho kiểm thử tự động. */
  stats() {
    return {
      host: this.isHost,
      sentBytes: this.broadcaster ? Object.fromEntries(this.broadcaster.sentBytes) : null,
      full: this.broadcaster?.fullCount ?? 0,
      delta: this.broadcaster?.deltaCount ?? 0,
      recvBytes: this.receiver?.recvBytes ?? 0,
      recvCount: this.receiver?.recvCount ?? 0,
      dropped: this.receiver?.dropped ?? 0,
      applied: this.mirror?.applied ?? 0,
      assigned: this.sender ? Object.fromEntries(this.sender.assigned) : null,
      nowMs: this.nowMs,
    };
  }

  destroy(): void {
    this.mirror?.destroy();
    this.slotSource?.destroy();
  }
}
