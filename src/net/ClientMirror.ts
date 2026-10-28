import Phaser from 'phaser';
import { PLAYER_STYLES } from '../entities/playerStyles';
import type { LevelRuntime } from '../sim/LevelRuntime';
import type { PlayerLook, World } from '../sim/World';
import { dist } from '../systems/geometry';
import type { Snapshot } from './snapshot';

/**
 * Máy khách online: thế giới không chạy vật lý, chỉ đặt lại theo snapshot của host.
 * Mỗi khung hình áp một trạng thái đã nội suy từ bộ đệm snapshot (xem `SnapshotBuffer`).
 */
export class ClientMirror {
  /** Ô người chơi → uid món đang nắm (để vẽ "cánh tay"). */
  private readonly holds = new Map<number, number>();
  private readonly arms: Phaser.GameObjects.Graphics;
  applied = 0;

  constructor(
    private readonly world: World,
    private readonly runtime: LevelRuntime | null,
    private readonly lookOf: (slot: number) => PlayerLook | undefined,
    private readonly spawnAt: (slot: number) => { x: number; y: number },
  ) {
    this.arms = world.scene.add.graphics().setDepth(8_999);
  }

  /** Áp một trạng thái (đã nội suy) để vẽ khung hình này. */
  apply(s: Snapshot): void {
    const w = this.world;
    this.applied++;

    for (const ps of s.players) {
      let p = w.players.find((pl) => pl.slotIndex === ps.s);
      if (!p) {
        const at = this.spawnAt(ps.s);
        p = w.addPlayer(ps.s, at.x, at.y, this.lookOf(ps.s));
      }
      p.applyRemote(ps);
      if (ps.hold >= 0) this.holds.set(ps.s, ps.hold);
      else this.holds.delete(ps.s);
    }

    const seen = new Set<number>();
    for (const is of s.items) {
      seen.add(is.u);
      let item = w.items.find((i) => i.uid === is.u);
      if (!item) {
        if (!w.data.itemById.has(is.d)) continue;
        item = w.spawnItem(is.d, is.x, is.y, is.a, is.u);
        // Máy khách không chạy vật lý: món đồ chỉ để vẽ.
        w.scene.matter.world.remove(item.body);
      }
      item.applyRemote(is);
      item.settle();
    }
    for (const item of [...w.items]) if (!seen.has(item.uid)) w.removeItem(item);
    w.containedIn.clear();
    for (const is of s.items) {
      if (is.box < 0) continue;
      const cat = w.items.find((i) => i.uid === is.u);
      const box = w.items.find((i) => i.uid === is.box);
      if (cat && box) w.containedIn.set(cat, box);
    }

    s.doors.forEach((a, i) => w.doors[i]?.applyRemote(a));
    if (s.truck && w.truck) {
      w.truck.applyRemote(
        s.truck,
        s.items.filter((i) => i.loaded).map((i) => i.u),
      );
    }
    const rt = this.runtime;
    if (rt) {
      if (s.landlord) rt.landlord.applyRemote(s.landlord.x, s.landlord.y, s.landlord.sat);
      if (s.clock) rt.clock = { ...rt.clock, timeLeftMs: s.clock.left, phase: s.clock.phase };
      const req = rt.built.required;
      req.clear();
      for (const u of s.required) req.add(u);
    }
  }

  /** Vẽ "cánh tay" từ người chơi tới điểm nắm gần nhất của món đang nắm. */
  render(): void {
    const g = this.arms.clear();
    for (const [slot, uid] of this.holds) {
      const p = this.world.players.find((pl) => pl.slotIndex === slot);
      const item = this.world.items.find((i) => i.uid === uid);
      if (!p || !item) continue;
      const pos = p.viewPosition;
      let best = item.position;
      let bestD = Infinity;
      item.grabPoints.forEach((_, i) => {
        const gp = item.grabWorld(i);
        const d = dist(gp, pos);
        if (d < bestD) {
          bestD = d;
          best = gp;
        }
      });
      const color = PLAYER_STYLES[p.styleIndex]?.color ?? 0xffffff;
      g.lineStyle(6, color, 0.9).lineBetween(pos.x, pos.y, best.x, best.y);
    }
  }

  destroy(): void {
    this.arms.destroy();
  }
}
