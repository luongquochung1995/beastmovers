import { emptyStats, type PlayerStats } from '../systems/scoring';
import type { World } from './World';

/** Ghi lại thành tích từng người trong màn (cho danh hiệu cuối màn). */
export class StatsTracker {
  private readonly stats = new Map<number, PlayerStats>();

  constructor(private readonly world: World) {
    const bus = world.bus;
    const item = (uid: number) => world.items.find((i) => i.uid === uid);
    bus.on('itemGrabbed', (e) => this.of(e.slot).grabs++);
    bus.on('itemThrown', (e) => this.of(e.slot).throws++);
    bus.on('itemBroken', (e) => {
      const who = item(e.item)?.lastHandler;
      if (who != null) this.of(who).broken++;
    });
    bus.on('itemLoaded', (e) => {
      for (const slot of item(e.item)?.handlers ?? []) this.of(slot).loaded++;
    });
    bus.on('catCaught', (e) => {
      if (e.slot != null) this.of(e.slot).catsCaught++;
    });
    bus.on('bigLiftFail', (e) => {
      if (e.slot != null) this.of(e.slot).letGo++;
    });
  }

  private of(slot: number): PlayerStats {
    let s = this.stats.get(slot);
    if (!s) {
      s = emptyStats(slot);
      this.stats.set(slot, s);
    }
    return s;
  }

  /** Mỗi bước logic: cộng thời gian đang khiêng đồ. */
  step(dt: number): void {
    for (const p of this.world.grab.holds.keys()) this.of(p.slotIndex).carriedMs += dt;
  }

  /** Thống kê của mọi người đang trong màn. */
  all(): PlayerStats[] {
    return this.world.players.map((p) => ({ ...this.of(p.slotIndex) }));
  }
}
