import type { GameConfig } from '../data/types';
import type { LevelResult } from '../sim/LevelRuntime';
import type { LevelRuntime } from '../sim/LevelRuntime';
import type { SlotSource } from '../sim/SimSlot';
import type { PlayerLook, World } from '../sim/World';
import type { InputManager } from '../systems/input/InputManager';
import { PLAYER_RADIUS } from '../entities/playerStyles';
import { DEFAULT_MOTOR } from '../systems/PlayerMotor';
import { ClientMirror } from './ClientMirror';
import { SnapshotBuffer } from './interpolate';
import { type Obstacle, Predictor } from './predict';
import { ClientInputSender, HostInputHub, OnlineHostSlots } from './inputLink';
import { HATS } from './lobby';
import type { NetContext } from './netContext';
import type { Snapshot } from './snapshot';
import { SnapshotBroadcaster, SnapshotReceiver } from './snapshotLink';
import type { Payload } from './Transport';

/** Đồ nặng hơn mức này coi như vật cản khi dự đoán (đồ nhẹ thì người chơi đẩy đi được). */
const HEAVY_KG = 40;
/** `?predict=0`: tắt dự đoán (để so sánh khi thử nghiệm). */
const PREDICT =
  typeof location === 'undefined' || new URLSearchParams(location.search).get('predict') !== '0';

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
  private readonly hub: HostInputHub | null = null;
  private readonly readyPeers = new Set<string>();
  private readonly sender: ClientInputSender | null = null;
  private readonly receiver: SnapshotReceiver | null = null;
  private mirror: ClientMirror | null = null;
  private world: World | null = null;
  private readonly buffer: SnapshotBuffer;
  /** Ô toàn cục của người chơi trên máy này → bộ dự đoán. */
  private readonly predictors = new Map<number, Predictor>();
  private ended: LevelResult | null = null;
  private readonly meter = new RateMeter();
  private nowMs = 0;

  constructor(
    readonly ctx: NetContext,
    config: GameConfig,
    private readonly inputs: InputManager,
    defIds: readonly string[],
  ) {
    this.buffer = new SnapshotBuffer(1000 / config.logicHz, config.net.interpolationDelayMs);
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
      this.hub = hub;
      // Chỉ gửi snapshot cho máy đã vào màn (máy đó xin ô); lần đầu gửi gói đầy đủ.
      hub.onJoin((peer) => {
        if (!this.readyPeers.has(peer)) this.broadcaster?.forget(peer);
        this.readyPeers.add(peer);
      });
      transport.onPeerLeave((peer) => this.readyPeers.delete(peer));
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

  /** Host: gói input cuối cùng đã dùng cho ô `slot` (gửi kèm snapshot để máy khách dự đoán). */
  ackOf(slot: number): number {
    return this.hub?.ackOf(slot) ?? 0;
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
    this.world = world;
    this.mirror = new ClientMirror(world, runtime, (s) => this.lookOf(s), spawnAt);
  }

  /** Vật cản cho dự đoán: tường, xe (thân tĩnh của Matter) và đồ nặng (khó đẩy). */
  private obstacles(): Obstacle[] {
    const w = this.world;
    if (!w) return [];
    const out: Obstacle[] = [];
    const bodies = (w.scene.matter.world.localWorld as unknown as { bodies: MatterJS.BodyType[] })
      .bodies;
    for (const b of bodies) {
      if (!b.isStatic) continue;
      const { min, max } = b.bounds;
      out.push({
        cx: (min.x + max.x) / 2,
        cy: (min.y + max.y) / 2,
        w: max.x - min.x,
        h: max.y - min.y,
        angle: 0,
      });
    }
    for (const it of w.items) {
      if (it.hidden || it.def.mass < HEAVY_KG) continue;
      const p = it.position;
      out.push({ cx: p.x, cy: p.y, w: it.def.size.w, h: it.def.size.h, angle: it.angle });
    }
    return out;
  }

  private predictor(slot: number): Predictor {
    let p = this.predictors.get(slot);
    if (!p) {
      p = new Predictor(this.world?.motorParams ?? DEFAULT_MOTOR, PLAYER_RADIUS, () =>
        this.obstacles(),
      );
      this.predictors.set(slot, p);
    }
    return p;
  }

  /** Host: sau mỗi bước mô phỏng. */
  hostStep(dtMs: number, take: () => Snapshot): void {
    this.nowMs += dtMs;
    this.broadcaster?.tick(dtMs, [...this.readyPeers], take);
  }

  /** Máy khách: thay cho bước mô phỏng. Gửi input, dự đoán nhân vật của mình, nhận snapshot. */
  clientStep(dtMs: number): void {
    this.nowMs += dtMs;
    const sender = this.sender!;
    sender.tick(dtMs, false);
    if (PREDICT) {
      for (const [local, global] of sender.assigned) {
        const s = this.inputs.slots[local];
        if (s) this.predictor(global).tick(s.prev, s.cur, sender.tickSeq, dtMs);
      }
    }
    const now = performance.now();
    for (const snap of this.receiver!.take()) {
      this.buffer.push(snap, now);
      for (const global of PREDICT ? sender.assigned.values() : []) {
        const ps = snap.players.find((p) => p.s === global);
        if (!ps) continue;
        const pred = this.predictor(global);
        // Đang khiêng đồ hoặc bị ngã: vẽ theo host (đồ và người đi cùng nhau, không lệch).
        if (ps.hold >= 0 || ps.mode === 'fallen') pred.reset();
        else pred.reconcile(ps, ps.ack, this.drawnPosition(global));
      }
    }
    this.meter.update(this.nowMs, this.receiver!.recvBytes);
  }

  private drawnPosition(slot: number) {
    return this.world?.players.find((p) => p.slotIndex === slot)?.position ?? null;
  }

  /** Máy khách, mỗi khung hình: đặt thế giới theo bộ đệm (nội suy) và theo dự đoán. */
  renderFrame(frameMs: number): void {
    const s = this.buffer.sample(performance.now());
    if (!s || !this.mirror || !this.world) return;
    this.mirror.apply(s);
    for (const [slot, pred] of this.predictors) {
      const pos = pred.display(frameMs);
      const motor = pred.motor;
      const vel = pred.velocity;
      const p = this.world.players.find((pl) => pl.slotIndex === slot);
      if (!pos || !motor || !vel || !p) continue;
      p.applyRemote({
        x: pos.x,
        y: pos.y,
        vx: vel.x,
        vy: vel.y,
        fx: motor.facing.x,
        fy: motor.facing.y,
        mode: motor.mode,
        run: motor.running,
      });
    }
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
      buffered: this.buffer.size,
      starved: this.buffer.starved,
      predictions: [...this.predictors].map(([slot, p]) => ({
        slot,
        active: p.active,
        corrections: p.corrections,
        maxError: Math.round(p.maxError * 10) / 10,
      })),
      assigned: this.sender ? Object.fromEntries(this.sender.assigned) : null,
      nowMs: this.nowMs,
    };
  }

  destroy(): void {
    this.mirror?.destroy();
    this.slotSource?.destroy();
  }
}
