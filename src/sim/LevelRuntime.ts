import type { Item } from '../entities/Item';
import {
  type ClockState,
  createClock,
  finishNow,
  type LevelPhase,
  tickClock,
} from '../systems/levelClock';
import type { BuiltLevel } from './levelSetup';
import type { World } from './World';

export interface RequiredStatus {
  item: Item;
  loaded: boolean;
}

/** Trạng thái của màn đang chơi: đồng hồ, đồ bắt buộc, qua màn hay chưa. */
export class LevelRuntime {
  clock: ClockState;
  private started = false;

  constructor(
    private readonly world: World,
    readonly built: BuiltLevel,
  ) {
    this.clock = createClock(built.level.timeLimitSec);
  }

  get phase(): LevelPhase {
    return this.clock.phase;
  }

  /** Hết giờ (hoặc đã kết thúc sớm): khóa điều khiển. */
  get locked(): boolean {
    return this.clock.phase !== 'playing';
  }

  get done(): boolean {
    return this.clock.phase === 'done';
  }

  step(dt: number): void {
    if (!this.started) {
      this.started = true;
      this.world.bus.emit({ type: 'levelStart' });
    }
    const wasDone = this.done;
    const r = tickClock(this.clock, dt);
    this.clock = r.state;
    for (const e of r.events) if (e === 'timeLow') this.world.bus.emit({ type: 'timeLow' });
    if (!wasDone && this.done) this.world.bus.emit({ type: 'levelEnd', passed: this.passed });
  }

  finishNow(): void {
    this.clock = finishNow(this.clock);
  }

  /** Món đồ đã lên xe (tính cả mèo đang nằm trong lồng/thùng đã lên xe). */
  isLoaded(item: Item): boolean {
    const loaded = this.world.truck?.loadedUids ?? new Set<number>();
    if (loaded.has(item.uid)) return true;
    const box = this.world.containedIn.get(item);
    return !!box && loaded.has(box.uid);
  }

  requiredStatus(): RequiredStatus[] {
    return this.world.items
      .filter((i) => this.built.required.has(i.uid))
      .map((item) => ({ item, loaded: this.isLoaded(item) }));
  }

  /** Đủ mọi món đồ bắt buộc trên xe (món bắt buộc bị xóa khỏi màn thì coi như thiếu). */
  get passed(): boolean {
    const status = this.requiredStatus();
    return status.length === this.built.required.size && status.every((s) => s.loaded);
  }
}
