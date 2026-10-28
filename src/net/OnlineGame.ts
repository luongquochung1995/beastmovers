import type { GameConfig } from '../data/types';
import type { LevelResult } from '../sim/LevelRuntime';
import type { LevelRuntime } from '../sim/LevelRuntime';
import type { SlotSource } from '../sim/SimSlot';
import type { Fx, PlayerLook, World } from '../sim/World';
import type { GameEvent } from '../systems/EventBus';
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
/** Máy vào màn muộn vẫn nhận hiệu ứng/sự kiện trong khoảng này. */
const RECENT_MS = 5000;
/** `?predict=0`: tắt dự đoán (để so sánh khi thử nghiệm). */
const PREDICT =
  typeof location === 'undefined' || new URLSearchParams(location.search).get('predict') !== '0';

/**
 * Tin điều khiển màn chơi online (ngoài input và snapshot): hiệu ứng và sự kiện trong game
 * (kèm bước logic để máy khách phát đúng lúc), kết quả màn.
 */
export type GameMsg =
  | { t: 'end'; result: LevelResult }
  | { t: 'ev'; fx: { tick: number; fx: Fx }[]; ev: { tick: number; e: GameEvent }[] }
  /** Đo độ trễ: máy khách gửi `png` mỗi giây (kèm độ trễ đo lần trước), host trả `pog`. */
  | { t: 'png'; ts: number; rtt: number }
  | { t: 'pog'; ts: number };

const GAME_TYPES = new Set(['end', 'ev', 'png', 'pog']);
const isGameMsg = (d: Payload): d is GameMsg => {
  const t = typeof d === 'object' && d !== null ? (d as { t?: unknown }).t : undefined;
  return typeof t === 'string' && GAME_TYPES.has(t);
};

/** Không nhận snapshot lâu hơn mức này thì báo mạng chập chờn. */
const STALL_MS = 1500;
/** Độ trễ khứ hồi trên mức này thì cảnh báo mạng chậm. */
export const SLOW_PING_MS = 250;

/** Tình trạng kết nối để hiện lên HUD. */
export type NetStatus =
  | { kind: 'ok' }
  | { kind: 'stalled' }
  | { kind: 'reconnecting'; secondsLeft: number }
  | { kind: 'hostGone'; quit: boolean };

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
  /** Host: sự kiện trong game chờ gửi. Máy khách: hiệu ứng/sự kiện chờ tới lúc phát. */
  private readonly outEvents: { tick: number; e: GameEvent }[] = [];
  private readonly incoming: ({ tick: number; fx: Fx } | { tick: number; e: GameEvent })[] = [];
  private readonly tickMs: number;
  /** Host: máy đang mất kết nối; độ trễ máy khách tự báo. */
  private readonly lostPeers = new Set<string>();
  private readonly clientPing = new Map<string, number>();
  /** Máy khách: độ trễ khứ hồi tới host (ms), thời điểm nhận snapshot gần nhất. */
  rtt: number | null = null;
  private lastSnapAt = performance.now();
  private sincePingMs = 0;
  private reconnectFrom = 0;
  private lastRejoins = 0;

  /** Host: hiệu ứng/sự kiện vài giây gần nhất (gửi bù cho máy vào màn muộn). */
  private readonly recent: ({ tick: number; fx: Fx } | { tick: number; e: GameEvent })[] = [];
  private readonly meter = new RateMeter();
  private nowMs = 0;

  constructor(
    readonly ctx: NetContext,
    config: GameConfig,
    private readonly inputs: InputManager,
    defIds: readonly string[],
  ) {
    this.tickMs = 1000 / config.logicHz;
    ctx.session.reconnectGraceMs = config.net.reconnectGraceSec * 1000;

    this.buffer = new SnapshotBuffer(this.tickMs, config.net.interpolationDelayMs);
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
        if (this.readyPeers.has(peer)) return;
        this.broadcaster?.forget(peer);
        this.readyPeers.add(peer);
        if (this.lostPeers.delete(peer)) this.announce(peer, 'net.playerBack');
        // Hiệu ứng/sự kiện vừa xảy ra trước khi máy này vào màn (vd. câu chào đầu màn).
        if (this.recent.length) {
          const fx = this.recent.flatMap((r) => ('fx' in r ? [r] : []));
          const ev = this.recent.flatMap((r) => ('e' in r ? [r] : []));
          transport.send({ t: 'ev', fx, ev } satisfies GameMsg, peer);
        }
      });
      transport.onPeerLeave((peer) => this.peerLost(peer));
      session.onChange(() => {
        // Máy rời phòng chủ động (lời chào tạm biệt) cũng coi như mất kết nối.
        for (const p of [...this.readyPeers]) if (!session.isMember(p)) this.peerLost(p);
      });
      transport.onMessage((d, from) => {
        if (!isGameMsg(d) || d.t !== 'png') return;
        this.clientPing.set(from, d.rtt);
        transport.send({ t: 'pog', ts: d.ts } satisfies GameMsg, from);
      });
      // Đang chơi: chỉ những máy trong danh sách lúc bắt đầu được vào (lại).
      session.lock(roster.seats.map((s) => s.peer));
      this.slotSource = new OnlineHostSlots(inputs, hub, localToGlobal);
      this.broadcaster = new SnapshotBroadcaster(transport, defIds, config.net.snapshotHz);
    } else {
      const hostId = session.hostId!;
      this.sender = new ClientInputSender(transport, hostId, inputs, config.net.inputHz);
      this.receiver = new SnapshotReceiver(transport, hostId, defIds);
      transport.onMessage((d, from) => {
        if (from !== hostId || !isGameMsg(d)) return;
        if (d.t === 'end') this.ended = d.result;
        else if (d.t === 'pog') this.rtt = Math.round(performance.now() - d.ts);
        else if (d.t === 'ev') {
          for (const f of d.fx) this.incoming.push({ tick: f.tick, fx: f.fx });
          for (const e of d.ev) this.incoming.push({ tick: e.tick, e: e.e });
          this.incoming.sort((a, b) => a.tick - b.tick);
        }
      });
    }
  }

  /** Host: gói input cuối cùng đã dùng cho ô `slot` (gửi kèm snapshot để máy khách dự đoán). */
  ackOf(slot: number): number {
    return this.hub?.ackOf(slot) ?? 0;
  }

  /** Các ô toàn cục chơi trên máy này (camera chỉ ôm những người này). */
  /** Ô trong màn của người chơi chung máy thứ `local` trên máy này. */
  globalSlotOf(local: number): number | undefined {
    const selfId = this.ctx.session.transport.selfId;
    const i = this.ctx.roster.seats.findIndex((s) => s.peer === selfId && s.local === local);
    return i < 0 ? undefined : i;
  }

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

  /** Host: một máy mất kết nối (hoặc rời đi): người chơi của máy đó đứng yên, buông đồ. */
  private peerLost(peer: string): void {
    if (!this.readyPeers.delete(peer)) return;
    this.lostPeers.add(peer);
    const w = this.world;
    if (w) {
      for (const slot of this.slotsOf(peer)) {
        const p = w.players.find((pl) => pl.slotIndex === slot);
        if (p) w.grab.release(p, 'released');
      }
    }
    this.announce(peer, 'net.playerLost');
  }

  private slotsOf(peer: string): number[] {
    return this.ctx.roster.seats.flatMap((s, i) => (s.peer === peer ? [i] : []));
  }

  /** Chữ nổi trên đầu người chơi của máy `peer` (mọi máy đều thấy). */
  private announce(peer: string, key: string): void {
    for (const slot of this.slotsOf(peer)) this.world?.fx({ k: 'playerPop', slot, text: { key } });
  }

  /** Tình trạng kết nối hiện tại (máy khách). */
  status(): NetStatus {
    const s = this.ctx.session.state;
    if (s.kind === 'hostLeft') return { kind: 'hostGone', quit: s.quit };
    if (s.kind === 'reconnecting') {
      const left = this.ctx.session.reconnectGraceMs - (performance.now() - this.reconnectFrom);
      return { kind: 'reconnecting', secondsLeft: Math.max(0, Math.ceil(left / 1000)) };
    }
    if (!this.isHost && performance.now() - this.lastSnapAt > STALL_MS) return { kind: 'stalled' };
    return { kind: 'ok' };
  }

  /** Độ trễ để hiện: máy khách tới host; host: máy khách chậm nhất. */
  pingMs(): number | null {
    if (!this.isHost) return this.rtt;
    let worst: number | null = null;
    for (const p of this.readyPeers) {
      const v = this.clientPing.get(p);
      if (v !== undefined && v >= 0) worst = Math.max(worst ?? 0, v);
    }
    return worst;
  }

  /** Số máy khách đang kết nối / tổng số máy khách lúc bắt đầu (host). */
  peersOnline(): [number, number] {
    const selfId = this.ctx.session.transport.selfId;
    const all = new Set(this.ctx.roster.seats.map((s) => s.peer).filter((p) => p !== selfId));
    return [[...all].filter((p) => this.readyPeers.has(p)).length, all.size];
  }

  /** Host: ghi lại hiệu ứng và sự kiện của thế giới để gửi cho máy khách. */
  attachHost(world: World): void {
    if (!this.isHost) return;
    world.recordFx = true;
    world.bus.onAny((e) => this.outEvents.push({ tick: world.bus.tick, e }));
    this.world = world;
  }

  /** Máy khách: gắn thế giới để áp snapshot. */
  attachMirror(
    world: World,
    runtime: LevelRuntime | null,
    spawnAt: (slot: number) => { x: number; y: number },
  ): void {
    if (this.isHost) return;
    this.world = world;
    world.remote = true;
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
      const world = this.world;
      p = new Predictor(world ? (pos) => world.paramsAt(pos) : DEFAULT_MOTOR, PLAYER_RADIUS, () =>
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
    const w = this.world;
    if (w && (w.fxOut.length || this.outEvents.length)) {
      const msg: GameMsg = { t: 'ev', fx: w.fxOut.splice(0), ev: this.outEvents.splice(0) };
      for (const peer of this.readyPeers) this.ctx.session.transport.send(msg, peer);
      this.recent.push(...msg.fx, ...msg.ev);
      const keepFrom = w.bus.tick - RECENT_MS / this.tickMs;
      while (this.recent.length && this.recent[0]!.tick < keepFrom) this.recent.shift();
    }
  }

  /** Máy khách: thay cho bước mô phỏng. Gửi input, dự đoán nhân vật của mình, nhận snapshot. */
  clientStep(dtMs: number): void {
    this.nowMs += dtMs;
    const sender = this.sender!;
    const session = this.ctx.session;
    // Vào lại sau khi mất kết nối: xin lại ô (host gửi lại snapshot đầy đủ).
    if (session.rejoins !== this.lastRejoins) {
      this.lastRejoins = session.rejoins;
      sender.rejoin();
      this.predictors.forEach((p) => p.reset());
    }
    if (session.state.kind !== 'reconnecting') this.reconnectFrom = performance.now();
    this.sincePingMs += dtMs;
    if (this.sincePingMs >= 1000 && session.hostId) {
      this.sincePingMs = 0;
      const msg: GameMsg = { t: 'png', ts: performance.now(), rtt: this.rtt ?? -1 };
      session.transport.send(msg, session.hostId);
    }
    sender.tick(dtMs, false);
    // Mất kết nối / chập chờn: không đoán tiếp (host đang giữ nhân vật đứng yên).
    const connected = this.status().kind === 'ok';
    if (!connected) this.predictors.forEach((p) => p.reset());
    if (PREDICT && connected) {
      for (const [local, global] of sender.assigned) {
        const s = this.inputs.slots[local];
        if (s) this.predictor(global).tick(s.prev, s.cur, sender.tickSeq, dtMs);
      }
    }
    const now = performance.now();
    for (const snap of this.receiver!.take()) {
      this.lastSnapAt = now;
      this.buffer.push(snap, now);
      for (const global of PREDICT && connected ? sender.assigned.values() : []) {
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
    // Hiệu ứng, câu thoại, sự kiện: phát khi hình vẽ tới đúng bước đó.
    const head = this.buffer.playhead ?? 0;
    while (this.incoming.length && this.incoming[0]!.tick * this.tickMs <= head) {
      const m = this.incoming.shift()!;
      if ('fx' in m) this.world.present(m.fx);
      else this.world.bus.emit(m.e);
    }
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
      desyncs: this.receiver?.desyncs ?? 0,
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
