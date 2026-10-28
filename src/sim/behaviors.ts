import type { BehaviorRef } from '../data/types';
import type { Item } from '../entities/Item';
import type { BehaviorName } from '../systems/behaviors/names';
import type { World } from './World';

/** Các thời điểm một hành vi có thể can thiệp. */
export interface BehaviorHooks {
  readonly name: string;
  onStep?(dtMs: number): void;
  /** Va chạm mạnh (tốc độ theo pháp tuyến, px/bước). */
  onImpact?(speed: number): void;
  /** Đang khiêng thì có người buông, đồ rơi xuống. */
  onDropped?(): void;
  onBroken?(): void;
}

export interface BehaviorContext {
  world: World;
  item: Item;
  /** Tham số từ data (object trong `behaviors`), trộn với tham số mặc định của preset. */
  params: Record<string, unknown>;
}

export type BehaviorFactory = (ctx: BehaviorContext) => BehaviorHooks;

const num = (v: unknown, fallback: number) => (typeof v === 'number' ? v : fallback);

/** Vỡ thì rải mảnh vỡ thành vùng nguy hiểm (người đi qua dễ vấp). */
const shatterDebris: BehaviorFactory = ({ world, item, params }) => ({
  name: 'shatterDebris',
  onBroken() {
    const r = num(params.radius, Math.max(30, item.boundingRadius * 1.1));
    world.addZone('glass', item.position.x, item.position.y, r);
  },
});

/**
 * Registry hành vi theo tên dùng trong `items.json`.
 * P10 bổ sung các hành vi còn lại; tên chưa có cài đặt thì bị bỏ qua (data vẫn hợp lệ).
 */
export const BEHAVIORS: Partial<Record<BehaviorName, BehaviorFactory>> = {
  shatterDebris,
};

/** Tạo các hành vi của một món đồ từ data. */
export function createBehaviors(world: World, item: Item): BehaviorHooks[] {
  return (item.def.behaviors ?? []).flatMap((ref: BehaviorRef) => {
    const name = (typeof ref === 'string' ? ref : ref.type) as BehaviorName;
    const factory = BEHAVIORS[name];
    if (!factory) return [];
    const params = typeof ref === 'string' ? {} : ref;
    return [factory({ world, item, params })];
  });
}
