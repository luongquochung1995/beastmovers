import Phaser from 'phaser';
import type { GameConfig } from '../data/types';
import type { GameData } from '../data/validate';
import { Item } from '../entities/Item';
import { Player } from '../entities/Player';
import {
  applyDamage,
  applyImpact,
  breakThreshold,
  dropImpact,
  impactSpeed,
  WALL_HIT_SPEED,
} from '../systems/damage';
import { EventBus, type ZoneKind } from '../systems/EventBus';
import type { Vec } from '../systems/geometry';
import type { PlayerSlot } from '../systems/input/InputManager';
import { DEFAULT_MOTOR, type MotorParams } from '../systems/PlayerMotor';
import type { Random } from '../systems/Random';
import { Theme } from '../ui/theme';
import { createBehaviors } from './behaviors';
import { GrabSystem } from './GrabSystem';
import { Zone } from './Zone';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Va vào tường liên tục chỉ tính một lần "đập tường" trong khoảng này. */
const WALL_HIT_COOLDOWN_MS = 400;
/** Kéo lê đồ (cào sàn) bao nhiêu lần thì mất 1 độ bền (sự kiện cào sàn: 1 lần/giây). */
const SCRAPES_PER_DAMAGE = 2;
/** Người đi chậm hơn mức này (px/bước) thì không vấp trên mảnh kính. */
const ZONE_TRIP_MIN_SPEED = 1;

/**
 * Toàn bộ mô phỏng của một màn: tường, nhân vật, đồ vật, vùng nguy hiểm.
 * Màn chơi và sandbox cùng dùng lớp này; scene chỉ lo vẽ HUD và nhận input.
 */
export class World {
  readonly players: Player[] = [];
  readonly items: Item[] = [];
  readonly walls: MatterJS.BodyType[] = [];
  readonly zones: Zone[] = [];
  readonly motorParams: MotorParams;
  readonly bus = new EventBus();
  readonly grab: GrabSystem;
  /** Bật thì vẽ thêm điểm nắm của mọi món đồ. */
  debugDraw = false;
  private readonly overlay: Phaser.GameObjects.Graphics;
  private readonly playerByBody = new Map<MatterJS.BodyType, Player>();
  private readonly itemByBody = new Map<MatterJS.BodyType, Item>();
  private readonly wallSet = new Set<MatterJS.BodyType>();
  private readonly wallHitAt = new Map<Item, number>();
  private readonly scrapes = new Map<Item, number>();
  private timeMs = 0;

  constructor(
    readonly scene: Phaser.Scene,
    readonly data: GameData,
    readonly config: GameConfig,
    readonly random: Random,
  ) {
    this.motorParams = { ...DEFAULT_MOTOR, tripChancePerSec: config.runTripChance };
    this.grab = new GrabSystem(this);
    this.overlay = scene.add.graphics().setDepth(9_000);
    scene.matter.world.on('collisionstart', this.onCollisionStart, this);
    this.bus.on('itemScrape', (e) => this.onScrape(e.item));
  }

  // ---------- Dựng màn ----------

  addFloor(r: Rect): void {
    this.scene.add.rectangle(r.x, r.y, r.w, r.h, Theme.floor).setOrigin(0).setDepth(-1000);
  }

  addWall(r: Rect): MatterJS.BodyType {
    const body = this.scene.matter.add.rectangle(r.x + r.w / 2, r.y + r.h / 2, r.w, r.h, {
      isStatic: true,
      label: 'wall',
      friction: 0.1,
    });
    this.scene.add.rectangle(r.x, r.y, r.w, r.h, 0x3a3550).setOrigin(0).setDepth(-500);
    this.walls.push(body);
    this.wallSet.add(body);
    return body;
  }

  /** Sàn có 4 bức tường bao quanh, độ dày `t`. */
  addRoom(r: Rect, t = 20): void {
    this.addFloor(r);
    this.addWall({ x: r.x - t, y: r.y - t, w: r.w + t * 2, h: t });
    this.addWall({ x: r.x - t, y: r.y + r.h, w: r.w + t * 2, h: t });
    this.addWall({ x: r.x - t, y: r.y, w: t, h: r.h });
    this.addWall({ x: r.x + r.w, y: r.y, w: t, h: r.h });
  }

  addPlayer(slotIndex: number, x: number, y: number): Player {
    const player = new Player(
      this.scene,
      slotIndex,
      slotIndex,
      `P${slotIndex + 1}`,
      x,
      y,
      this.motorParams,
      () => this.random.next(),
    );
    this.players.push(player);
    this.playerByBody.set(player.body, player);
    return player;
  }

  spawnItem(id: string, x: number, y: number, angle = 0): Item {
    const def = this.data.itemById.get(id);
    if (!def) throw new Error(`Unknown item "${id}"`);
    const item = new Item(this.scene, def, x, y, angle);
    item.behaviors = createBehaviors(this, item);
    this.items.push(item);
    this.itemByBody.set(item.body, item);
    return item;
  }

  removeItem(item: Item): void {
    const i = this.items.indexOf(item);
    if (i < 0) return;
    this.grab.releaseItem(item);
    this.items.splice(i, 1);
    this.itemByBody.delete(item.body);
    item.destroy();
  }

  clearItems(): void {
    for (const item of [...this.items]) this.removeItem(item);
  }

  addZone(kind: ZoneKind, x: number, y: number, radius: number): Zone {
    const zone = new Zone(this.scene, kind, x, y, radius, () => this.random.next());
    this.zones.push(zone);
    this.bus.emit({ type: 'zoneSpawned', kind, x: Math.round(x), y: Math.round(y) });
    return zone;
  }

  clearZones(): void {
    for (const z of this.zones) z.destroy();
    this.zones.length = 0;
  }

  /** Món đồ có nắm được không (P11: mèo đang trong lồng thì không). */
  isGrabbable(_item: Item): boolean {
    return true;
  }

  playerOf(body: MatterJS.BodyType): Player | undefined {
    return this.playerByBody.get(body);
  }

  itemOf(body: MatterJS.BodyType): Item | undefined {
    return this.itemByBody.get(body);
  }

  /** Món đồ nằm dưới điểm `p` (dùng cho chuột trong sandbox). */
  itemAt(p: Vec): Item | undefined {
    const bodies = this.scene.matter.intersectPoint(p.x, p.y) as MatterJS.BodyType[];
    for (const b of bodies) {
      const item = this.itemByBody.get(b.parent ?? b);
      if (item) return item;
    }
    return undefined;
  }

  // ---------- Sát thương ----------

  /** Một cú va với tốc độ `speed` (px/bước): vượt ngưỡng thì trừ độ bền. */
  impact(item: Item, speed: number): void {
    this.applyResult(item, applyImpact(item.damage, speed, breakThreshold(item.def)), speed);
    if (speed >= breakThreshold(item.def)) for (const b of item.behaviors) b.onImpact?.(speed);
  }

  /** Trừ thẳng độ bền (kéo lê, hành vi đặc biệt…). */
  damage(item: Item, amount: number): void {
    this.applyResult(item, applyDamage(item.damage, amount), 0);
  }

  private applyResult(item: Item, r: ReturnType<typeof applyDamage>, speed: number): void {
    if (!r.damaged) return;
    item.damage = r.state;
    const ref = { item: item.uid, itemId: item.id };
    this.bus.emit({
      type: 'itemDamaged',
      ...ref,
      durability: r.state.durability,
      speed: Math.round(speed * 10) / 10,
    });
    if (r.broke) {
      this.bus.emit({ type: 'itemBroken', ...ref });
      for (const b of item.behaviors) b.onBroken?.();
    }
  }

  /** Một món đồ đang được khiêng thì bị rơi (có người buông giữa chừng). */
  onItemDropped(item: Item): void {
    this.impact(item, dropImpact(item.def.mass));
    for (const b of item.behaviors) b.onDropped?.();
  }

  private onScrape(uid: number): void {
    const item = this.items.find((i) => i.uid === uid);
    if (!item) return;
    const n = (this.scrapes.get(item) ?? 0) + 1;
    this.scrapes.set(item, n % SCRAPES_PER_DAMAGE);
    if (n >= SCRAPES_PER_DAMAGE) this.damage(item, 1);
  }

  // ---------- Vòng lặp ----------

  /** Một bước logic. `slots[i]` là input của người chơi ô i trên máy này. */
  step(dt: number, slots: readonly (PlayerSlot | null)[]): void {
    this.bus.tick++;
    this.timeMs += dt;
    for (const item of this.items) {
      item.beforeStep(dt);
      item.setSurfaceFactor(this.surfaceAt(item.position)?.effect.itemFriction ?? 1);
      for (const b of item.behaviors) b.onStep?.(dt);
    }
    for (const p of this.players) {
      const slot = slots[p.slotIndex];
      if (!slot) continue;
      this.grab.handleButtons(p, slot);
      p.fixedUpdate(slot.prev, slot.cur, dt, this.grab.holds.has(p), this.paramsFor(p));
      this.zoneTrip(p, dt);
    }
    this.grab.applyCarry(slots, dt);
    this.scene.matter.world.step(dt);
  }

  /** Vùng sàn ở vị trí `p` (vùng thêm sau ưu tiên hơn). */
  private surfaceAt(p: Vec): Zone | undefined {
    for (let i = this.zones.length - 1; i >= 0; i--) {
      if (this.zones[i]!.contains(p)) return this.zones[i];
    }
    return undefined;
  }

  private paramsFor(p: Player): MotorParams {
    const accel = this.surfaceAt(p.position)?.effect.accel;
    return accel == null ? this.motorParams : { ...this.motorParams, accel };
  }

  private zoneTrip(p: Player, dt: number): void {
    const zone = this.surfaceAt(p.position);
    if (!zone || p.motor.mode !== 'normal') return;
    const v = p.body.velocity;
    if (Math.hypot(v.x, v.y) < ZONE_TRIP_MIN_SPEED) return;
    if (this.random.chance((zone.effect.tripPerSec * dt) / 1000)) {
      p.knockDown();
      this.bus.emit({ type: 'playerTripped', slot: p.slotIndex, cause: zone.kind });
    }
  }

  render(alpha: number, frameMs: number): void {
    for (const item of this.items) item.render(alpha);
    for (const p of this.players) p.render(alpha, frameMs);
    this.grab.render(this.overlay, this.debugDraw);
  }

  // ---------- Va chạm ----------

  private onCollisionStart(event: Phaser.Physics.Matter.Events.CollisionStartEvent): void {
    for (const pair of event.pairs) {
      const bodyA = pair.bodyA.parent ?? pair.bodyA;
      const bodyB = pair.bodyB.parent ?? pair.bodyB;
      const pa = this.playerByBody.get(bodyA);
      const pb = this.playerByBody.get(bodyB);
      // Người đang lao đâm vào người khác thì người kia ngã.
      if (pa && pb) {
        if (pa.motor.mode === 'dashing' && pb.motor.mode !== 'dashing') pb.knockDown();
        else if (pb.motor.mode === 'dashing' && pa.motor.mode !== 'dashing') pa.knockDown();
        continue;
      }
      const ia = this.itemByBody.get(bodyA);
      const ib = this.itemByBody.get(bodyB);
      if (!ia && !ib) continue;
      // Sự kiện collisionstart chạy trước khi Matter xử lý va chạm nên vận tốc còn là trước va.
      const speed = impactSpeed(bodyA.velocity, bodyB.velocity, pair.collision.normal);
      if (ia) this.onItemContact(ia, bodyB, speed);
      if (ib) this.onItemContact(ib, bodyA, speed);
    }
  }

  private onItemContact(item: Item, other: MatterJS.BodyType, speed: number): void {
    // Người đi bộ va vào đồ không làm vỡ đồ; chỉ đồ bay, đồ va đồ, và đồ va tường.
    if (this.playerByBody.has(other)) return;
    if (this.wallSet.has(other) && speed >= WALL_HIT_SPEED) {
      const last = this.wallHitAt.get(item) ?? -Infinity;
      if (this.timeMs - last >= WALL_HIT_COOLDOWN_MS) {
        this.wallHitAt.set(item, this.timeMs);
        this.bus.emit({
          type: 'wallHit',
          item: item.uid,
          itemId: item.id,
          speed: Math.round(speed * 10) / 10,
        });
      }
    }
    this.impact(item, speed);
  }

  destroy(): void {
    // Phaser có thể đã hủy world trước (world bị hủy thì listener cũng mất theo).
    this.scene.matter.world?.off('collisionstart', this.onCollisionStart, this);
  }

  /** Trạng thái rút gọn cho kiểm thử tự động. */
  snapshot() {
    return {
      players: this.players.map((p) => ({
        slot: p.slotIndex,
        x: Math.round(p.position.x),
        y: Math.round(p.position.y),
        mode: p.motor.mode,
        running: p.motor.running,
        holding: this.grab.holding(p)?.uid ?? null,
      })),
      items: this.items.map((i) => ({
        uid: i.uid,
        id: i.id,
        x: Math.round(i.position.x),
        y: Math.round(i.position.y),
        angle: Math.round((i.angle * 180) / Math.PI),
        durability: i.durability,
        broken: i.broken,
        state: i.carryState,
        carriers: i.carriers.size,
        pinned: i.pinned,
      })),
      zones: this.zones.map((z) => ({ kind: z.kind, x: Math.round(z.x), y: Math.round(z.y) })),
      events: this.bus.history.map((l) => l.event.type),
    };
  }
}
