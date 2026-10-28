import Phaser from 'phaser';
import type { Item } from '../entities/Item';
import type { Player } from '../entities/Player';
import { PLAYER_RADIUS, PLAYER_STYLES } from '../entities/playerStyles';
import { computeCarry, pointVelocity } from '../systems/carry';
import { dist, lerpVec } from '../systems/geometry';
import { Btn, EMPTY_FRAME, frameAxis, justPressed } from '../systems/input/InputFrame';
import type { PlayerSlot } from '../systems/input/InputManager';
import type { World } from './World';

/** Độ cứng của "cánh tay" nối người với điểm nắm. Thấp thì mềm, đồ lắc lư. */
const ARM_STIFFNESS = 0.25;
/** Bị kéo xa điểm nắm quá mức này thì tuột tay. */
const ARM_BREAK = 55;
/** Sau khi ném, người ném xuyên qua vật vừa ném trong chốc lát (vật có thể đang ở sau lưng). */
const THROW_PASS_THROUGH_MS = 250;
/** Thời gian vật bay trong không khí sau khi ném: gần như không ma sát sàn. */
const THROW_AIRBORNE_MS = 450;
/** Đồ nặng hơn mức này thì không ném được. */
const THROW_MAX_KG = 30;
/** Độ "bám" vận tốc của đồ đang khiêng mỗi bước (0..1). */
const CARRY_RESPONSE = 0.35;
const SCRAPE_EVENT_MS = 1000;

interface Hold {
  item: Item;
  point: number;
  constraint: MatterJS.ConstraintType;
}

interface Target {
  item: Item;
  point: number;
}

export type ReleaseReason =
  | 'released'
  | 'dropped'
  | 'thrown'
  | 'stretched'
  | 'removed'
  /** Mèo cào, tuột tay. */
  | 'scratched';

/** Nắm, thả, ném và khiêng đồ (một hay nhiều người). */
export class GrabSystem {
  readonly holds = new Map<Player, Hold>();
  private readonly scrapeMs = new Map<Item, number>();
  /** Người vừa ném: còn bao lâu nữa thì trở lại nhóm va chạm bình thường. */
  private readonly passThrough = new Map<Player, number>();

  constructor(private readonly world: World) {}

  holding(p: Player): Item | undefined {
    return this.holds.get(p)?.item;
  }

  /** Bước 1 (trước khi nhân vật di chuyển): đọc nút Nắm / Ném. */
  handleButtons(p: Player, slot: PlayerSlot): void {
    const hold = this.holds.get(p);
    if (p.motor.mode === 'fallen') {
      if (hold) this.release(p, 'dropped');
      return;
    }
    if (justPressed(slot.prev, slot.cur, Btn.Grab)) {
      if (hold) this.release(p, 'released');
      else this.tryGrab(p);
    } else if (hold && justPressed(slot.prev, slot.cur, Btn.Throw)) {
      this.tryThrow(p);
    }
  }

  /**
   * Món đồ và điểm nắm mà người chơi sẽ nắm nếu bấm Nắm bây giờ: điểm nắm còn trống
   * gần nhất trong tầm với. Đồ dài (sofa, piano) phải đi tới đúng chỗ nắm mới nắm được.
   */
  findTarget(p: Player): Target | null {
    const pos = p.position;
    const reach = this.world.config.grabRange;
    let best: (Target & { d: number }) | null = null;
    for (const item of this.world.items) {
      if (!this.world.isGrabbable(item)) continue;
      if (dist(pos, item.position) > item.boundingRadius + PLAYER_RADIUS + reach) continue;
      for (const point of item.freeGrabPoints()) {
        const d = dist(pos, item.grabWorld(point)) - PLAYER_RADIUS;
        if (d <= reach && (!best || d < best.d)) best = { item, point, d };
      }
    }
    return best && { item: best.item, point: best.point };
  }

  private tryGrab(p: Player): void {
    // Vật tương tác (cần phanh…) ở trong tầm tay thì dùng nó trước.
    const it = this.world.interactables.find(
      (k) => dist(p.position, k.position()) - PLAYER_RADIUS <= k.radius,
    );
    if (it) {
      it.use(p);
      return;
    }
    const target = this.findTarget(p);
    if (target) this.attach(p, target.item, target.point);
  }

  attach(p: Player, item: Item, point: number): void {
    const offset = item.grabOffset(point);
    const length = Phaser.Math.Clamp(
      dist(p.position, item.grabWorld(point)),
      PLAYER_RADIUS * 0.8,
      PLAYER_RADIUS + 10,
    );
    const constraint = this.world.scene.matter.add.constraint(
      p.body,
      item.body,
      length,
      ARM_STIFFNESS,
      { pointA: { x: 0, y: 0 }, pointB: offset, damping: 0.1, label: 'arm' },
    );
    item.carriers.set(point, p);
    item.lastHandler = p.slotIndex;
    item.handlers.add(p.slotIndex);
    this.passThrough.delete(p);
    p.setCollisionGroup(item.collisionGroup);
    this.holds.set(p, { item, point, constraint });
    this.world.bus.emit({
      type: 'itemGrabbed',
      item: item.uid,
      itemId: item.id,
      slot: p.slotIndex,
    });
  }

  release(p: Player, reason: ReleaseReason): void {
    const hold = this.holds.get(p);
    if (!hold) return;
    this.world.scene.matter.world.removeConstraint(hold.constraint);
    hold.item.carriers.delete(hold.point);
    hold.item.lastReleasedBy = p.slotIndex;
    p.setCollisionGroup(0);
    this.holds.delete(p);
    const ref = { item: hold.item.uid, itemId: hold.item.id };
    if (reason === 'dropped') this.world.bus.emit({ type: 'itemDropped', ...ref });
    else if (reason === 'scratched')
      this.world.bus.emit({ type: 'catScratch', ...ref, slot: p.slotIndex });
    else if (reason !== 'thrown')
      this.world.bus.emit({ type: 'itemReleased', ...ref, slot: p.slotIndex });
    if (reason === 'released') this.world.onItemReleased(hold.item, p);
  }

  /** Thả hết người đang nắm một món đồ (vd. món đồ bị xóa). */
  releaseItem(item: Item): void {
    for (const [p, hold] of this.holds) if (hold.item === item) this.release(p, 'removed');
  }

  private tryThrow(p: Player): void {
    const hold = this.holds.get(p);
    if (!hold) return;
    const { item } = hold;
    const def = item.def;
    if (item.carriers.size !== 1 || def.requiredGrabbers !== 1) return;
    if (def.throwable === false || def.mass > THROW_MAX_KG) return;
    this.release(p, 'thrown');
    p.setCollisionGroup(item.collisionGroup);
    this.passThrough.set(p, THROW_PASS_THROUGH_MS);
    item.setAirborne(THROW_AIRBORNE_MS);
    const factor = Phaser.Math.Clamp(1.3 - def.mass / 30, 0.35, 1.2);
    const speed = this.world.config.throwSpeed * factor;
    const f = p.motor.facing;
    const pv = p.body.velocity;
    const matterBody = this.world.scene.matter.body;
    matterBody.setVelocity(item.body, { x: f.x * speed + pv.x * 0.5, y: f.y * speed + pv.y * 0.5 });
    matterBody.setAngularVelocity(item.body, (this.world.random.next() - 0.5) * 0.4);
    this.world.bus.emit({ type: 'itemThrown', item: item.uid, itemId: item.id, slot: p.slotIndex });
  }

  /**
   * Bước 2 (sau khi nhân vật di chuyển, trước `world.step`): tính vận tốc của mọi món đồ
   * đang được nắm và kéo người nắm đi theo điểm nắm của họ.
   */
  applyCarry(slots: readonly (PlayerSlot | null)[], dtMs: number): void {
    const matterBody = this.world.scene.matter.body;
    for (const [p, ms] of this.passThrough) {
      if (ms - dtMs > 0) this.passThrough.set(p, ms - dtMs);
      else {
        this.passThrough.delete(p);
        if (!this.holds.has(p)) p.setCollisionGroup(0);
      }
    }
    for (const item of this.world.items) {
      if (item.frozen) continue;
      const entries = [...item.carriers.entries()] as [number, Player][];
      const before = item.carryState;
      const res = computeCarry({
        liftRule: item.def.liftRule,
        required: item.def.requiredGrabbers,
        massKg: item.def.mass,
        walkSpeed: this.world.motorParams.walkSpeed,
        carriers: entries.map(([point, pl]) => ({
          r: item.grabOffset(point),
          move: frameAxis(slots[pl.slotIndex]?.cur ?? EMPTY_FRAME),
        })),
      });
      item.carryState = res.state;
      item.setPinned(res.state === 'immovable');
      this.emitTransitions(item, before, entries.length);

      if (res.state === 'immovable') {
        // Thiếu người: ai nắm cũng chỉ gồng tại chỗ.
        for (const [, pl] of entries) pl.setVelocity({ x: 0, y: 0 });
        continue;
      }
      if (entries.length === 0) continue;

      const v = lerpVec(item.body.velocity, res.velocity, CARRY_RESPONSE);
      const w =
        item.body.angularVelocity +
        (res.angularVelocity - item.body.angularVelocity) * CARRY_RESPONSE;
      matterBody.setVelocity(item.body, v);
      matterBody.setAngularVelocity(item.body, w);
      for (const [point, pl] of entries)
        pl.setVelocity(pointVelocity(v, w, item.grabOffset(point)));

      if (res.scraping) {
        const ms = (this.scrapeMs.get(item) ?? 0) + dtMs;
        if (ms >= SCRAPE_EVENT_MS) {
          this.world.bus.emit({ type: 'itemScrape', item: item.uid, itemId: item.id });
          this.scrapeMs.set(item, 0);
        } else {
          this.scrapeMs.set(item, ms);
        }
      }
    }

    // Bị kéo quá xa điểm nắm (kẹt tường, bị đẩy) thì tuột tay.
    for (const [p, hold] of this.holds) {
      if (dist(p.position, hold.item.grabWorld(hold.point)) > PLAYER_RADIUS + ARM_BREAK) {
        this.release(p, 'stretched');
      }
    }
  }

  private emitTransitions(item: Item, before: Item['carryState'], carriers: number): void {
    const need = item.def.requiredGrabbers;
    if (need < 2) return;
    const ref = { item: item.uid, itemId: item.id };
    if (before !== 'lifted' && item.carryState === 'lifted') {
      this.world.bus.emit({ type: 'bigLiftStart', ...ref, carriers });
    } else if (before === 'lifted' && item.carryState !== 'lifted' && carriers > 0) {
      // Có người buông trong khi những người khác vẫn đang khiêng → rơi.
      this.world.bus.emit({ type: 'bigLiftFail', ...ref, slot: item.lastReleasedBy });
      if (item.def.liftRule === 'strict') {
        this.world.bus.emit({ type: 'itemDropped', ...ref });
        this.world.onItemDropped(item);
      }
    }
  }

  /** Vẽ viền món đồ sắp nắm được, "cánh tay" của người đang nắm, và điểm nắm khi debug. */
  render(g: Phaser.GameObjects.Graphics, debug: boolean): void {
    g.clear();
    for (const p of this.world.players) {
      const color = PLAYER_STYLES[p.styleIndex]!.color;
      const hold = this.holds.get(p);
      if (hold) {
        const gp = hold.item.grabWorld(hold.point);
        g.lineStyle(6, color, 0.9).lineBetween(p.position.x, p.position.y, gp.x, gp.y);
        continue;
      }
      if (p.motor.mode === 'fallen') continue;
      const target = this.findTarget(p);
      if (!target) continue;
      g.lineStyle(3, color, 0.9);
      g.strokePoints(target.item.vertices, true, true);
      const gp = target.item.grabWorld(target.point);
      g.fillStyle(color, 1).fillCircle(gp.x, gp.y, 5);
    }
    if (!debug) return;
    for (const item of this.world.items) {
      item.grabPoints.forEach((_, i) => {
        const gp = item.grabWorld(i);
        const who = item.carriers.get(i);
        g.fillStyle(who ? PLAYER_STYLES[who.slotIndex]!.color : 0xffffff, who ? 1 : 0.6);
        g.fillCircle(gp.x, gp.y, 3);
      });
    }
  }
}
