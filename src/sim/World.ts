import Phaser from 'phaser';
import type { GameConfig } from '../data/types';
import type { GameData } from '../data/validate';
import { Item } from '../entities/Item';
import { Player } from '../entities/Player';
import type { PlayerSlot } from '../systems/input/InputManager';
import { DEFAULT_MOTOR, type MotorParams } from '../systems/PlayerMotor';
import type { Random } from '../systems/Random';
import type { Vec } from '../systems/geometry';
import { Theme } from '../ui/theme';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Toàn bộ mô phỏng của một màn: tường, nhân vật, đồ vật.
 * Màn chơi và sandbox cùng dùng lớp này; scene chỉ lo vẽ HUD và nhận input.
 */
export class World {
  readonly players: Player[] = [];
  readonly items: Item[] = [];
  readonly walls: MatterJS.BodyType[] = [];
  readonly motorParams: MotorParams;
  private readonly playerByBody = new Map<MatterJS.BodyType, Player>();
  private readonly itemByBody = new Map<MatterJS.BodyType, Item>();

  constructor(
    readonly scene: Phaser.Scene,
    readonly data: GameData,
    readonly config: GameConfig,
    readonly random: Random,
  ) {
    this.motorParams = { ...DEFAULT_MOTOR, tripChancePerSec: config.runTripChance };
    scene.matter.world.on('collisionstart', this.onCollisionStart, this);
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
    this.items.push(item);
    this.itemByBody.set(item.body, item);
    return item;
  }

  removeItem(item: Item): void {
    const i = this.items.indexOf(item);
    if (i < 0) return;
    this.items.splice(i, 1);
    this.itemByBody.delete(item.body);
    item.destroy();
  }

  clearItems(): void {
    for (const item of [...this.items]) this.removeItem(item);
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

  // ---------- Vòng lặp ----------

  /** Một bước logic. `slots[i]` là input của người chơi ô i trên máy này. */
  step(dt: number, slots: readonly (PlayerSlot | null)[]): void {
    for (const item of this.items) item.beforeStep();
    for (const p of this.players) {
      const slot = slots[p.slotIndex];
      if (slot) p.fixedUpdate(slot.prev, slot.cur, dt);
    }
    this.scene.matter.world.step(dt);
  }

  render(alpha: number, frameMs: number): void {
    for (const item of this.items) item.render(alpha);
    for (const p of this.players) p.render(alpha, frameMs);
  }

  // ---------- Va chạm ----------

  private onCollisionStart(event: Phaser.Physics.Matter.Events.CollisionStartEvent): void {
    for (const pair of event.pairs) {
      const a = this.playerByBody.get(pair.bodyA);
      const b = this.playerByBody.get(pair.bodyB);
      // Người đang lao đâm vào người khác thì người kia ngã.
      if (a && b) {
        if (a.motor.mode === 'dashing' && b.motor.mode !== 'dashing') b.knockDown();
        else if (b.motor.mode === 'dashing' && a.motor.mode !== 'dashing') a.knockDown();
      }
    }
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
      })),
      items: this.items.map((i) => ({
        uid: i.uid,
        id: i.id,
        x: Math.round(i.position.x),
        y: Math.round(i.position.y),
        angle: Math.round((i.angle * 180) / Math.PI),
        durability: i.durability,
        broken: i.broken,
      })),
    };
  }
}
