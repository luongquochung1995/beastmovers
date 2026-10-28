/**
 * Sự kiện trong màn chơi. Chủ nhà (P15), điểm số (P16), âm thanh và chơi online (P24)
 * đều nghe từ đây thay vì gọi thẳng vào nhau.
 */
export type ZoneKind = 'glass' | 'water' | 'soil';

interface ItemRef {
  /** uid của món đồ trong màn. */
  item: number;
  itemId: string;
}

export type GameEvent =
  | ({ type: 'itemGrabbed'; slot: number } & ItemRef)
  | ({ type: 'itemReleased'; slot: number } & ItemRef)
  | ({ type: 'itemThrown'; slot: number } & ItemRef)
  | ({ type: 'itemDropped' } & ItemRef)
  | ({ type: 'bigLiftStart'; carriers: number } & ItemRef)
  | ({ type: 'bigLiftFail'; slot: number | null } & ItemRef)
  | ({ type: 'itemScrape' } & ItemRef)
  | ({ type: 'itemDamaged'; durability: number; speed: number } & ItemRef)
  | ({ type: 'itemBroken' } & ItemRef)
  | ({ type: 'wallHit'; speed: number } & ItemRef)
  | ({ type: 'behavior'; name: string } & ItemRef)
  | ({ type: 'catEscaped' } & ItemRef)
  | ({ type: 'catCaught'; container: number; slot: number | null } & ItemRef)
  | ({ type: 'catScratch'; slot: number } & ItemRef)
  | ({ type: 'itemLoaded' } & ItemRef)
  | ({ type: 'itemUnloaded' } & ItemRef)
  | ({ type: 'truckFull' } & ItemRef)
  | { type: 'handbrake'; on: boolean; slot: number }
  | { type: 'truckRolling' }
  | ({ type: 'requiredChanged' } & ItemRef)
  | { type: 'levelStart' }
  | { type: 'timeLow' }
  | { type: 'levelEnd'; passed: boolean }
  | { type: 'zoneSpawned'; kind: ZoneKind; x: number; y: number }
  | { type: 'playerTripped'; slot: number; cause: string }
  /** Người chơi bấm Ping (gọi đồng đội). */
  | { type: 'ping'; slot: number };

export type GameEventType = GameEvent['type'];
type Handler<T extends GameEventType> = (e: Extract<GameEvent, { type: T }>) => void;

export interface LoggedEvent {
  tick: number;
  event: GameEvent;
}

export class EventBus {
  private readonly handlers = new Map<string, ((e: GameEvent) => void)[]>();
  private readonly anyHandlers: ((e: GameEvent) => void)[] = [];
  /** Lịch sử gần đây (để debug và kiểm thử). */
  readonly history: LoggedEvent[] = [];
  tick = 0;

  constructor(private readonly historySize = 300) {}

  on<T extends GameEventType>(type: T, handler: Handler<T>): () => void {
    const list = this.handlers.get(type) ?? [];
    list.push(handler as (e: GameEvent) => void);
    this.handlers.set(type, list);
    return () => list.splice(list.indexOf(handler as (e: GameEvent) => void), 1);
  }

  onAny(handler: (e: GameEvent) => void): void {
    this.anyHandlers.push(handler);
  }

  emit(event: GameEvent): void {
    this.history.push({ tick: this.tick, event });
    if (this.history.length > this.historySize) this.history.shift();
    for (const h of this.handlers.get(event.type) ?? []) h(event);
    for (const h of this.anyHandlers) h(event);
  }

  count(type: GameEventType): number {
    return this.history.filter((l) => l.event.type === type).length;
  }
}
