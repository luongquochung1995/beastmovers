import { speakGibberish } from '../audio/gibberish';
import { format, getLocale } from '../data/i18n';
import type { DialogueEvent } from '../data/types';
import type { GameData } from '../data/validate';
import type { Item } from '../entities/Item';
import { Landlord } from '../entities/Landlord';
import { applySatisfaction, DialogueDirector } from '../systems/dialogue';
import {
  assignTitles,
  computeScore,
  type PlayerStats,
  type ScoreBreakdown,
  type TitleKey,
} from '../systems/scoring';
import { StatsTracker } from './StatsTracker';
import type { GameEvent, GameEventType } from '../systems/EventBus';
import {
  type ClockState,
  createClock,
  finishNow,
  type LevelPhase,
  tickClock,
} from '../systems/levelClock';
import type { BuiltLevel } from './levelSetup';
import type { World } from './World';

/** Sự kiện trong game → loại thoại của chủ nhà. */
const DIALOGUE_OF: Partial<Record<GameEventType, DialogueEvent>> = {
  itemBroken: 'itemBroken',
  itemDropped: 'itemDropped',
  wallHit: 'wallHit',
  itemLoaded: 'itemLoaded',
  catEscaped: 'catEscaped',
  timeLow: 'timeLow',
  levelStart: 'levelStart',
  levelEnd: 'levelEnd',
  bigLiftStart: 'bigLiftStart',
  bigLiftFail: 'bigLiftFail',
};

/** Chủ nhà đổi ý sau mỗi khoảng ngẫu nhiên trong đoạn này (ms). */
const CHANGE_MIND_MS: [number, number] = [60_000, 90_000];

/** Kết quả màn gửi sang màn hình Kết quả. */
export interface LevelResult {
  levelId: string;
  passed: boolean;
  requiredLoaded: number;
  requiredTotal: number;
  /** Thời gian đã chơi (giây). */
  seconds: number;
  satisfaction: number;
  score: ScoreBreakdown;
  players: { slot: number; title: TitleKey; stats: PlayerStats }[];
}

export interface RequiredStatus {
  item: Item;
  loaded: boolean;
}

/** Trạng thái của màn đang chơi: đồng hồ, đồ bắt buộc, chủ nhà, qua màn hay chưa. */
export class LevelRuntime {
  clock: ClockState;
  readonly landlord: Landlord;
  readonly stats: StatsTracker;
  private readonly dialogue: DialogueDirector;
  private started = false;
  private elapsedMs = 0;
  private nextChangeMindMs: number | null;

  constructor(
    private readonly world: World,
    readonly built: BuiltLevel,
    private readonly data: GameData,
    /** Máy khách online: không tự phản ứng với sự kiện (câu thoại, độ hài lòng do host gửi). */
    remote = false,
  ) {
    this.clock = createClock(built.level.timeLimitSec);
    const def = data.landlords.find((l) => l.id === built.level.landlord)!;
    const path = built.map.landlordPath;
    const start = path[0] ?? { x: built.map.width / 2, y: built.map.height / 2 };
    this.landlord = new Landlord(
      world.scene,
      def,
      path,
      start,
      () => world.random.next(),
      def.name[getLocale()],
    );
    const lines = data.lines[getLocale()][def.linesKey] ?? {};
    this.dialogue = new DialogueDirector(
      Object.fromEntries(Object.entries(lines).map(([ev, l]) => [ev, l.length])),
      data.config.dialogue.cooldownSec,
      () => world.random.next(),
    );
    this.nextChangeMindMs = built.level.modifiers.includes('landlordChangesMind')
      ? this.randomChangeMindDelay()
      : null;
    this.stats = new StatsTracker(world);
    world.sayHandler = (fx) => this.present(fx.ev, fx.index, fx.item);
    if (!remote) world.bus.onAny((e) => this.onEvent(e));
  }

  private randomChangeMindDelay(): number {
    const [a, b] = CHANGE_MIND_MS;
    return this.elapsedMs + a + this.world.random.next() * (b - a);
  }

  /** Chủ nhà phản ứng: đổi độ hài lòng theo `sensitivity`, rồi có thể nói một câu. */
  private onEvent(e: GameEvent): void {
    const ev = DIALOGUE_OF[e.type];
    if (!ev) return;
    const ll = this.landlord;
    const itemId = 'itemId' in e ? e.itemId : undefined;
    const delta = ll.def.sensitivity[ev] ?? 0;
    if (delta) {
      ll.satisfaction = applySatisfaction(
        ll.satisfaction,
        delta,
        !!itemId && ll.def.favoriteItems.includes(itemId),
      );
    }
    this.speak(ev);
  }

  /** Chọn câu thoại (host); câu được gửi bằng mã để mỗi máy hiện theo ngôn ngữ của mình. */
  private speak(ev: DialogueEvent, itemId?: string): void {
    const index = this.dialogue.pick(ev, this.elapsedMs);
    if (index === null) return;
    this.world.fx(itemId ? { k: 'say', ev, index, item: itemId } : { k: 'say', ev, index });
  }

  /** Câu thoại thứ `index` của loại `ev`, theo ngôn ngữ của máy này. */
  private present(ev: DialogueEvent, index: number, itemId?: string): void {
    const def = this.landlord.def;
    const template = this.data.lines[getLocale()][def.linesKey]?.[ev]?.[index];
    if (!template) return;
    const item = itemId ? this.data.itemById.get(itemId)?.name[getLocale()] : undefined;
    const text = format(template, item ? { item } : {});
    this.lastLine = { ev, index, text };
    this.landlord.say(text);
    speakGibberish(text, def.voicePitch);
  }

  /** Câu thoại vừa nói (cho kiểm thử). */
  lastLine: { ev: DialogueEvent; index: number; text: string } | null = null;

  /** Modifier `landlordChangesMind`: bắt mang thêm một món chưa bắt buộc. */
  private changeMind(): void {
    const candidates = this.world.items.filter(
      (i) =>
        !this.built.required.has(i.uid) &&
        !i.hidden &&
        !i.broken &&
        !i.loaded &&
        i.def.value > 0 &&
        !i.def.ai,
    );
    if (candidates.length === 0) return;
    const item = candidates[Math.floor(this.world.random.next() * candidates.length)]!;
    this.built.required.add(item.uid);
    this.world.bus.emit({ type: 'requiredChanged', item: item.uid, itemId: item.id });
    this.speak('changeMind', item.id);
  }

  render(alpha: number): void {
    this.landlord.render(alpha);
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
    this.elapsedMs += dt;
    this.landlord.step(dt);
    if (!this.locked) this.stats.step(dt);
    else this.world.truck?.departStep();
    if (this.nextChangeMindMs !== null && this.elapsedMs >= this.nextChangeMindMs && !this.locked) {
      this.changeMind();
      this.nextChangeMindMs = this.randomChangeMindDelay();
    }
    const wasLocked = this.locked;
    const r = tickClock(this.clock, dt);
    this.clock = r.state;
    for (const e of r.events) if (e === 'timeLow') this.world.bus.emit({ type: 'timeLow' });
    if (!wasLocked && this.locked) this.onLock();
  }

  finishNow(): void {
    const wasLocked = this.locked;
    this.clock = finishNow(this.clock);
    if (!wasLocked && this.locked) this.onLock();
  }

  /** Hết giờ: xe chạy đi (đồ sát cửa thùng có thể rơi), rồi mới chốt qua màn hay không. */
  private onLock(): void {
    this.world.truck?.startDeparture();
    this.world.bus.emit({ type: 'levelEnd', passed: this.passed });
  }

  result(): LevelResult {
    const status = this.requiredStatus();
    const passed = this.passed;
    const score = computeScore({
      items: this.world.items.map((i) => ({
        value: i.def.value,
        repairCost: i.def.repairCost,
        broken: i.broken,
        loaded: this.isLoaded(i),
      })),
      satisfaction: this.landlord.satisfaction,
      satisfactionMultiplier: this.built.level.satisfactionMultiplier,
      stars: this.built.level.stars,
      passed,
    });
    const stats = this.stats.all();
    const titles = assignTitles(stats);
    return {
      levelId: this.built.level.id,
      passed,
      requiredLoaded: status.filter((s) => s.loaded).length,
      requiredTotal: this.built.required.size,
      seconds: Math.round(this.elapsedMs / 1000),
      satisfaction: Math.round(this.landlord.satisfaction),
      score,
      players: stats.map((st) => ({ slot: st.slot, title: titles.get(st.slot)!, stats: st })),
    };
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
