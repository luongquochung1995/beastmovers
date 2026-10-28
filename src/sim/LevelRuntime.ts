import { speakGibberish } from '../audio/gibberish';
import { format, getLocale } from '../data/i18n';
import type { DialogueEvent } from '../data/types';
import type { GameData } from '../data/validate';
import type { Item } from '../entities/Item';
import { Landlord } from '../entities/Landlord';
import { applySatisfaction, DialogueDirector } from '../systems/dialogue';
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

export interface RequiredStatus {
  item: Item;
  loaded: boolean;
}

/** Trạng thái của màn đang chơi: đồng hồ, đồ bắt buộc, chủ nhà, qua màn hay chưa. */
export class LevelRuntime {
  clock: ClockState;
  readonly landlord: Landlord;
  private readonly dialogue: DialogueDirector;
  private started = false;
  private elapsedMs = 0;
  private nextChangeMindMs: number | null;

  constructor(
    private readonly world: World,
    readonly built: BuiltLevel,
    private readonly data: GameData,
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
    world.bus.onAny((e) => this.onEvent(e));
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

  private speak(ev: DialogueEvent, params: Record<string, string> = {}): void {
    const index = this.dialogue.pick(ev, this.elapsedMs);
    if (index === null) return;
    const def = this.landlord.def;
    const template = this.data.lines[getLocale()][def.linesKey]?.[ev]?.[index];
    if (!template) return;
    const text = format(template, params);
    this.landlord.say(text);
    speakGibberish(text, def.voicePitch);
  }

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
    this.speak('changeMind', { item: item.def.name[getLocale()] });
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
    if (this.nextChangeMindMs !== null && this.elapsedMs >= this.nextChangeMindMs && !this.locked) {
      this.changeMind();
      this.nextChangeMindMs = this.randomChangeMindDelay();
    }
    const wasLocked = this.locked;
    const r = tickClock(this.clock, dt);
    this.clock = r.state;
    for (const e of r.events) if (e === 'timeLow') this.world.bus.emit({ type: 'timeLow' });
    if (!wasLocked && this.locked) this.world.bus.emit({ type: 'levelEnd', passed: this.passed });
  }

  finishNow(): void {
    const wasLocked = this.locked;
    this.clock = finishNow(this.clock);
    if (!wasLocked && this.locked) this.world.bus.emit({ type: 'levelEnd', passed: this.passed });
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
