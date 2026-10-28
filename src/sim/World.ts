import Phaser from 'phaser';
import type { GameConfig } from '../data/types';
import type { GameData } from '../data/validate';
import { Door } from '../entities/Door';
import { Item } from '../entities/Item';
import { Player } from '../entities/Player';
import { PLAYER_RADIUS } from '../entities/playerStyles';
import {
  applyDamage,
  applyImpact,
  breakThreshold,
  dropImpact,
  impactSpeed,
  WALL_HIT_SPEED,
} from '../systems/damage';
import type { DialogueEvent } from '../data/types';
import { EventBus, type ZoneKind } from '../systems/EventBus';
import {
  PING_ICONS,
  type PingHold,
  PING_ITEM_RANGE,
  type PingKind,
  steerFrame,
  stepPing,
} from '../systems/ping';
import { dist, type Vec } from '../systems/geometry';
import type { SimSlot } from './SimSlot';
import { DEFAULT_MOTOR, type MotorParams } from '../systems/PlayerMotor';
import type { Random } from '../systems/Random';
import { t } from '../data/i18n';
import { loadSettings } from '../data/settings';
import { PingLayer } from '../ui/PingLayer';
import { popText } from '../ui/popText';
import { Theme } from '../ui/theme';
import { createBehaviors } from './behaviors';
import { GrabSystem } from './GrabSystem';
import type { Truck } from './Truck';
import { Zone } from './Zone';

export interface Interactable {
  position(): Vec;
  /** Bán kính bấm được tính từ mép nhân vật. */
  radius: number;
  use(p: Player): void;
}

/** Chữ hiện ra: chữ cố định (emoji) hoặc khóa i18n (mỗi máy dịch theo ngôn ngữ của mình). */
export type TextSpec = string | { key: string };

/**
 * Hiệu ứng trình diễn: chữ nổi, rung màn hình, câu thoại của chủ nhà (gửi bằng mã: loại
 * sự kiện + số thứ tự câu), vùng nước/kính mới sinh, ping. Mô phỏng không vẽ thẳng mà gọi
 * `world.fx`; host online gửi lại cho máy khách để mọi máy thấy cùng một thứ.
 */
export type Fx =
  | { k: 'pop'; x: number; y: number; text: TextSpec; color?: string }
  | { k: 'shake'; ms: number; intensity: number }
  | { k: 'say'; ev: DialogueEvent; index: number; item?: string }
  | { k: 'zone'; kind: ZoneKind; x: number; y: number; radius: number }
  /** Ping: ở vị trí (x, y), hoặc lên món đồ `item` (uid) kèm số người còn thiếu `n`. */
  | { k: 'ping'; slot: number; kind: PingKind; x: number; y: number; item?: number; n?: number }
  | { k: 'playerPop'; slot: number; text: TextSpec };

export const textOf = (spec: TextSpec): string => (typeof spec === 'string' ? spec : t(spec.key));

export interface PlayerLook {
  style: number;
  name: string;
  hat: string;
}

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
/** Va nhẹ hơn mức này thì không báo cho hành vi đặc biệt (tránh chạm lướt). */
const BEHAVIOR_MIN_IMPACT = 1.5;
/** Trên cầu thang đi chậm còn bấy nhiêu phần tốc độ đi bộ. */
const STAIRS_SPEED = 0.55;
/** Thả mèo cách mép đồ chứa trong khoảng này thì mèo chui vào. */
const CONTAIN_RANGE = 30;

/**
 * Toàn bộ mô phỏng của một màn: tường, nhân vật, đồ vật, vùng nguy hiểm.
 * Màn chơi và sandbox cùng dùng lớp này; scene chỉ lo vẽ HUD và nhận input.
 */
export class World {
  readonly players: Player[] = [];
  readonly items: Item[] = [];
  readonly walls: MatterJS.BodyType[] = [];
  readonly zones: Zone[] = [];
  /** Cầu thang: đi chậm, không chạy được. */
  readonly stairs: Rect[] = [];
  readonly doors: Door[] = [];
  /** Vật bấm Nắm để dùng (cần phanh tay…). */
  readonly interactables: Interactable[] = [];
  truck: Truck | null = null;
  /** Chỗ nấp của mèo (do màn chơi đặt). */
  hideSpots: Vec[] = [];
  /** Mèo → đồ chứa đang nhốt nó. */
  readonly containedIn = new Map<Item, Item>();
  readonly motorParams: MotorParams;
  readonly bus = new EventBus();
  readonly grab: GrabSystem;
  /** Bật thì vẽ thêm điểm nắm của mọi món đồ. */
  debugDraw = false;
  /** Host online: ghi lại hiệu ứng để gửi cho máy khách. */
  recordFx = false;
  /**
   * Máy khách online: thế giới chỉ để vẽ theo host, không tự gây ra gì (sự kiện host gửi
   * lại chỉ để hiển thị).
   */
  remote = false;
  readonly fxOut: { tick: number; fx: Fx }[] = [];
  /** Người nhận câu thoại (LevelRuntime): hiện bong bóng và đọc. */
  sayHandler: ((fx: Extract<Fx, { k: 'say' }>) => void) | null = null;
  private readonly overlay: Phaser.GameObjects.Graphics;
  private readonly playerByBody = new Map<MatterJS.BodyType, Player>();
  private readonly itemByBody = new Map<MatterJS.BodyType, Item>();
  private readonly wallSet = new Set<MatterJS.BodyType>();
  private readonly wallHitAt = new Map<Item, number>();
  private readonly scrapes = new Map<Item, number>();
  /** Việc chờ chạy sau bước vật lý (không thêm body giữa lúc Matter đang xử lý va chạm). */
  private readonly deferred: (() => void)[] = [];
  /** Trạng thái nút Ping của từng người (giữ bao lâu, đang chọn ô nào trên vòng). */
  private readonly pingHolds = new Map<number, PingHold>();
  /** Ping đang hiện trên bản đồ (HUD đọc để vẽ mũi tên khi ping ở ngoài khung hình). */
  readonly pingLayer: PingLayer;
  private timeMs = 0;
  private popTick = -1;
  private popsThisTick = 0;

  constructor(
    readonly scene: Phaser.Scene,
    readonly data: GameData,
    readonly config: GameConfig,
    readonly random: Random,
  ) {
    this.motorParams = { ...DEFAULT_MOTOR, tripChancePerSec: config.runTripChance };
    this.grab = new GrabSystem(this);
    this.overlay = scene.add.graphics().setDepth(9_000);
    this.pingLayer = new PingLayer(scene);
    scene.matter.world.on('collisionstart', this.onCollisionStart, this);
    this.bus.on('itemScrape', (e) => this.onScrape(e.item));
  }

  // ---------- Dựng màn ----------

  addFloor(r: Rect, color: number = Theme.floor): void {
    this.scene.add.rectangle(r.x, r.y, r.w, r.h, color).setOrigin(0).setDepth(-1000);
  }

  /** Cầu thang: các bậc vẽ sọc ngang (hoặc dọc nếu cầu thang hẹp ngang). */
  addStairs(r: Rect): void {
    this.stairs.push(r);
    const g = this.scene.add.graphics().setDepth(-950);
    g.fillStyle(0x5d5470, 1).fillRect(r.x, r.y, r.w, r.h);
    g.lineStyle(3, 0x2b2838, 0.8);
    const vertical = r.h >= r.w;
    for (let i = 14; i < (vertical ? r.h : r.w); i += 18) {
      if (vertical) g.lineBetween(r.x, r.y + i, r.x + r.w, r.y + i);
      else g.lineBetween(r.x + i, r.y, r.x + i, r.y + r.h);
    }
    g.lineStyle(2, 0xb39ddb, 0.6).strokeRect(r.x, r.y, r.w, r.h);
  }

  addDoor(r: Rect, hinge: 'start' | 'end'): Door {
    const door = new Door(this.scene, r, hinge);
    this.doors.push(door);
    return door;
  }

  addWall(r: Rect): MatterJS.BodyType {
    const body = this.scene.matter.add.rectangle(r.x + r.w / 2, r.y + r.h / 2, r.w, r.h, {
      isStatic: true,
      label: 'wall',
      friction: 0.1,
    });
    this.scene.add
      .rectangle(r.x, r.y, r.w, r.h, 0x6a6188)
      .setOrigin(0)
      .setStrokeStyle(2, 0x8a80aa)
      .setDepth(-500);
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

  /** Thêm người chơi ô `slotIndex`; `look` (màu, tên, mũ) chọn trong lobby online. */
  addPlayer(slotIndex: number, x: number, y: number, look?: PlayerLook): Player {
    const player = new Player(
      this.scene,
      slotIndex,
      look?.style ?? slotIndex,
      look?.name ?? `P${slotIndex + 1}`,
      x,
      y,
      this.motorParams,
      () => this.random.next(),
      look?.hat ?? '',
    );
    player.onPop = (text) => this.fx({ k: 'playerPop', slot: slotIndex, text });
    this.players.push(player);
    this.playerByBody.set(player.body, player);
    return player;
  }

  /** Tạo món đồ; `uid` chỉ dùng ở máy khách online (lấy đúng uid của host). */
  spawnItem(id: string, x: number, y: number, angle = 0, uid?: number): Item {
    const def = this.data.itemById.get(id);
    if (!def) throw new Error(`Unknown item "${id}"`);
    const item = new Item(this.scene, def, x, y, angle, uid);
    item.behaviors = createBehaviors(this, item);
    this.items.push(item);
    this.itemByBody.set(item.body, item);
    return item;
  }

  removeItem(item: Item): void {
    const i = this.items.indexOf(item);
    if (i < 0) return;
    for (const [cat, box] of this.containedIn) if (box === item) this.letOut(cat, false);
    this.containedIn.delete(item);
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
    if (!this.remote)
      this.bus.emit({ type: 'zoneSpawned', kind, x: Math.round(x), y: Math.round(y) });
    if (this.recordFx) this.record({ k: 'zone', kind, x, y, radius });
    return zone;
  }

  clearZones(): void {
    for (const z of this.zones) z.destroy();
    this.zones.length = 0;
  }

  /** Chạy `fn` ngay sau bước vật lý hiện tại. */
  later(fn: () => void): void {
    this.deferred.push(fn);
  }

  /** Văng `count` món đồ `id` ra quanh điểm `at`, mỗi món một hướng ngẫu nhiên. */
  burst(id: string, at: Vec, count: number, spread: number, speed: [number, number]): void {
    this.later(() => {
      for (let i = 0; i < count; i++) {
        const a = this.random.next() * Math.PI * 2;
        const v = speed[0] + this.random.next() * (speed[1] - speed[0]);
        const it = this.spawnItem(id, at.x + Math.cos(a) * spread, at.y + Math.sin(a) * spread, a);
        this.scene.matter.body.setVelocity(it.body, { x: Math.cos(a) * v, y: Math.sin(a) * v });
        it.setAirborne(300);
      }
    });
  }

  /** Rung màn hình (tắt được trong cài đặt). */
  shake(durationMs: number, intensity: number): void {
    this.fx({ k: 'shake', ms: durationMs, intensity });
  }

  private readonly shakeEnabled = loadSettings().screenShake !== false;

  /** Chữ nổi ngắn ở vị trí `at`. */
  pop(at: Vec, text: TextSpec, color?: string): void {
    this.fx(color ? { k: 'pop', x: at.x, y: at.y, text, color } : { k: 'pop', ...at, text });
  }

  /** Hiệu ứng: hiện ở máy này, và host online ghi lại để gửi cho máy khách. */
  fx(f: Fx): void {
    this.present(f);
    if (this.recordFx) this.record(f);
  }

  private record(f: Fx): void {
    this.fxOut.push({ tick: this.bus.tick, fx: f });
  }

  /** Hiện một hiệu ứng (máy khách gọi thẳng với hiệu ứng host gửi). */
  present(f: Fx): void {
    switch (f.k) {
      case 'pop':
        this.popAt(f.x, f.y, textOf(f.text), f.color);
        break;
      case 'shake':
        if (this.shakeEnabled) this.scene.cameras.main.shake(f.ms, f.intensity);
        break;
      case 'say':
        this.sayHandler?.(f);
        break;
      case 'zone':
        // Máy khách: vùng mới sinh ở host (host đã tự tạo khi gọi addZone).
        if (!this.recordFx) this.addZone(f.kind, f.x, f.y, f.radius);
        break;
      case 'ping': {
        const p = this.players.find((pl) => pl.slotIndex === f.slot);
        this.pingLayer.add({
          slot: f.slot,
          style: p?.styleIndex ?? f.slot,
          kind: f.kind,
          n: f.n ?? 0,
          pos: { x: f.x, y: f.y },
          bornMs: this.scene.time.now,
          ...(f.item !== undefined ? { item: f.item } : {}),
        });
        if (p) {
          const at = p.viewPosition;
          this.popAt(at.x, at.y - PLAYER_RADIUS - 6, PING_ICONS[f.kind], Theme.accent);
        }
        break;
      }
      case 'playerPop': {
        const p = this.players.find((pl) => pl.slotIndex === f.slot);
        if (!p) break;
        const at = p.viewPosition;
        this.popAt(at.x, at.y - PLAYER_RADIUS - 6, textOf(f.text));
        break;
      }
    }
  }

  /** Nhiều chữ trong cùng một bước thì xếp lệch nhau cho khỏi chồng. */
  private popAt(x: number, y: number, text: string, color?: string): void {
    if (this.popTick !== this.bus.tick) {
      this.popTick = this.bus.tick;
      this.popsThisTick = 0;
    }
    popText(this.scene, x, y - 24 - this.popsThisTick++ * 22, text, color);
  }

  /** Món đồ có nắm được không (mèo đang trong lồng thì không). */
  isGrabbable(item: Item): boolean {
    return !item.hidden;
  }

  // ---------- Đồ chứa (lồng, thùng) ----------

  /**
   * Đồ chứa còn trống gần nhất để bỏ mèo vào: mèo ở gần đồ chứa, hoặc người thả đứng sát
   * đồ chứa (mèo đang ôm phía sau lưng cũng bỏ vào được).
   */
  private containerNear(item: Item, by?: Player): Item | undefined {
    let best: Item | undefined;
    let bestD = Infinity;
    for (const c of this.items) {
      if (c === item || !c.def.container || c.hidden || this.contentsOf(c)) continue;
      const fromCat = dist(c.position, item.position) - c.boundingRadius;
      const fromHand = by
        ? dist(c.position, by.position) - c.boundingRadius - PLAYER_RADIUS
        : Infinity;
      const d = Math.min(fromCat, fromHand);
      if (d <= CONTAIN_RANGE && d < bestD) {
        bestD = d;
        best = c;
      }
    }
    return best;
  }

  contentsOf(container: Item): Item | undefined {
    for (const [cat, box] of this.containedIn) if (box === container) return cat;
    return undefined;
  }

  /** Có người buông tay (bấm Nắm) một món đồ: mèo thả cạnh lồng/thùng thì chui vào. */
  onItemReleased(item: Item, by: Player): void {
    if (!item.def.ai) return;
    const box = this.containerNear(item, by);
    if (box) this.later(() => this.putInside(item, box, by.slotIndex));
  }

  putInside(cat: Item, box: Item, slot: number | null = null): void {
    if (cat.hidden) return;
    this.grab.releaseItem(cat);
    this.scene.matter.world.remove(cat.body);
    cat.setHidden(true);
    this.containedIn.set(cat, box);
    box.setIcon('😺');
    this.bus.emit({ type: 'catCaught', item: cat.uid, itemId: cat.id, container: box.uid, slot });
    this.pop(box.position, { key: 'cat.caught' }, '#7CFC8A');
  }

  /** Thả mèo ra khỏi đồ chứa (mèo tự nhảy ra, hoặc đồ chứa bị xóa). */
  letOut(cat: Item, escaped = true): void {
    const box = this.containedIn.get(cat);
    if (!box) return;
    this.containedIn.delete(cat);
    box.setIcon(null);
    const a = this.random.next() * Math.PI * 2;
    const r = box.boundingRadius + cat.boundingRadius + 6;
    const at = { x: box.position.x + Math.cos(a) * r, y: box.position.y + Math.sin(a) * r };
    const mb = this.scene.matter.body;
    mb.setPosition(cat.body, at, false);
    this.scene.matter.world.add(cat.body);
    mb.setVelocity(cat.body, { x: Math.cos(a) * 4, y: Math.sin(a) * 4 });
    cat.setHidden(false);
    if (escaped) {
      this.bus.emit({ type: 'catEscaped', item: cat.uid, itemId: cat.id });
      this.pop(at, { key: 'cat.escaped' }, '#ff8a80');
    }
  }

  private updateContainers(dt: number): void {
    for (const [cat, box] of this.containedIn) {
      // Mèo đi theo đồ chứa (để khi nhảy ra thì ra đúng chỗ).
      this.scene.matter.body.setPosition(cat.body, box.position, false);
      const chance = box.def.container?.escapeChancePerSec ?? 0;
      if (cat.hasBehavior('escapeBox') && chance > 0 && this.random.chance((chance * dt) / 1000)) {
        this.later(() => this.letOut(cat));
      }
    }
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
    if (speed >= BEHAVIOR_MIN_IMPACT) for (const b of item.behaviors) b.onImpact?.(speed);
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
    if (this.remote) return;
    const item = this.items.find((i) => i.uid === uid);
    if (!item) return;
    const n = (this.scrapes.get(item) ?? 0) + 1;
    this.scrapes.set(item, n % SCRAPES_PER_DAMAGE);
    if (n >= SCRAPES_PER_DAMAGE) this.damage(item, 1);
  }

  // ---------- Vòng lặp ----------

  /** Một bước logic. `slots[i]` là input của người chơi ô i trên máy này. */
  step(dt: number, slots: readonly (SimSlot | null)[]): void {
    this.bus.tick++;
    this.timeMs += dt;
    this.updateContainers(dt);
    for (const d of this.doors) d.step();
    for (const item of this.items) {
      item.beforeStep(dt);
      if (item.hidden) continue;
      item.setSurfaceFactor(this.surfaceAt(item.position)?.effect.itemFriction ?? 1);
      for (const b of item.behaviors) b.onStep?.(dt);
    }
    // Đang giữ Ping: cần gạt dùng để chọn ô trên vòng ping, nhân vật đứng yên.
    const steered = slots.map(
      (s) => s && { ...s, prev: steerFrame(s.prev), cur: steerFrame(s.cur) },
    );
    for (const p of this.players) {
      const raw = slots[p.slotIndex];
      const slot = steered[p.slotIndex];
      if (!raw || !slot) continue;
      this.grab.handleButtons(p, slot);
      this.stepPing(p, raw, dt);
      p.fixedUpdate(slot.prev, slot.cur, dt, this.grab.holds.has(p), this.paramsFor(p));
      this.zoneTrip(p, dt);
    }
    this.grab.applyCarry(steered, dt);
    this.scene.matter.world.step(dt);
    this.truck?.step();
    for (const fn of this.deferred.splice(0)) fn();
  }

  private stepPing(p: Player, slot: SimSlot, dt: number): void {
    let hold = this.pingHolds.get(p.slotIndex);
    if (!hold) this.pingHolds.set(p.slotIndex, (hold = { heldMs: 0, choice: null }));
    const res = stepPing(hold, slot.prev, slot.cur, dt);
    if (!res || this.remote) return;
    const at = p.position;
    let ping: Extract<Fx, { k: 'ping' }> = {
      k: 'ping',
      slot: p.slotIndex,
      kind: res.kind === 'wheel' ? res.ping : 'come',
      x: Math.round(at.x),
      y: Math.round(at.y),
    };
    // Bấm nhanh gần món đồ đang thiếu người khiêng: "Cần thêm N người!" lên món đồ đó.
    if (res.kind === 'tap') {
      const item = this.itemNeedingHands(p);
      if (item) {
        const c = item.position;
        const n = item.def.requiredGrabbers - item.carriers.size;
        ping = { ...ping, kind: 'need', x: Math.round(c.x), y: Math.round(c.y), item: item.uid, n };
      }
    }
    this.bus.emit({ type: 'ping', slot: p.slotIndex, kind: ping.kind });
    this.fx(ping);
  }

  /** Món đồ cần nhiều người, còn thiếu người, gần `p` nhất. */
  private itemNeedingHands(p: Player): Item | undefined {
    let best: Item | undefined;
    let bestD = Infinity;
    for (const item of this.items) {
      if (item.hidden || item.broken) continue;
      if (item.def.requiredGrabbers < 2 || item.carriers.size >= item.def.requiredGrabbers)
        continue;
      const d = dist(item.position, p.position) - item.boundingRadius - PLAYER_RADIUS;
      if (d < PING_ITEM_RANGE && d < bestD) {
        bestD = d;
        best = item;
      }
    }
    return best;
  }

  /** Vùng sàn ở vị trí `p` (vùng thêm sau ưu tiên hơn). */
  private surfaceAt(p: Vec): Zone | undefined {
    for (let i = this.zones.length - 1; i >= 0; i--) {
      if (this.zones[i]!.contains(p)) return this.zones[i];
    }
    return undefined;
  }

  private paramsFor(p: Player): MotorParams {
    return this.paramsAt(p.position);
  }

  /** Thông số di chuyển tại vị trí `p`: vũng nước/đất (trơn), cầu thang (chậm, không chạy). */
  paramsAt(p: Vec): MotorParams {
    const accel = this.surfaceAt(p)?.effect.accel;
    let params = accel == null ? this.motorParams : { ...this.motorParams, accel };
    if (this.stairs.some((r) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h)) {
      const speed = params.walkSpeed * STAIRS_SPEED;
      params = { ...params, walkSpeed: speed, runSpeed: speed };
    }
    return params;
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
    this.truck?.render();
    for (const d of this.doors) d.render();
    for (const item of this.items) item.render(alpha);
    for (const p of this.players) p.render(alpha, frameMs);
    this.grab.render(this.overlay, this.debugDraw);
    // Ping lên món đồ thì đi theo món đồ.
    this.pingLayer.render((m) => {
      if (m.item === undefined) return null;
      const item = this.items.find((i) => i.uid === m.item);
      return item && !item.hidden ? item.viewPosition : null;
    });
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
      // Người chạm vào đồ (vd. đẩy tủ lạnh trượt, đạp nút máy chạy bộ).
      const toucher = pa ?? pb;
      const touched = ia ?? ib;
      if (toucher && touched) {
        for (const b of touched.behaviors) b.onTouched?.(toucher);
        continue;
      }
      // Sự kiện collisionstart chạy trước khi Matter xử lý va chạm nên vận tốc còn là trước va.
      const speed = impactSpeed(bodyA.velocity, bodyB.velocity, pair.collision.normal);
      if (ia) this.onItemContact(ia, bodyB, speed);
      if (ib) this.onItemContact(ib, bodyA, speed);
    }
  }

  private onItemContact(item: Item, other: MatterJS.BodyType, speed: number): void {
    // Mèo tự chạy đụng tường thì không tính là người chơi đập đồ vào tường.
    if (this.wallSet.has(other) && speed >= WALL_HIT_SPEED && !item.def.ai) {
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
        carriers: i.remoteCarriers ?? i.carriers.size,
        pinned: i.pinned,
        hidden: i.hidden,
        status: i.status,
      })),
      zones: this.zones.map((z) => ({ kind: z.kind, x: Math.round(z.x), y: Math.round(z.y) })),
      truck: this.truck && {
        used: this.truck.used,
        capacity: this.truck.capacity,
        loaded: [...this.truck.loadedUids],
        handbrake: this.truck.handbrakeOn,
        x: Math.round(this.truck.bedRect.x),
        y: Math.round(this.truck.bedRect.y),
      },
      events: this.bus.history.map((l) => l.event.type),
    };
  }
}
