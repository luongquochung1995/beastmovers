import { t } from '../data/i18n';
import type { BehaviorRef } from '../data/types';
import type { Item } from '../entities/Item';
import type { Player } from '../entities/Player';
import type { BehaviorName } from '../systems/behaviors/names';
import { breakThreshold } from '../systems/damage';
import type { ZoneKind } from '../systems/EventBus';
import { PLAYER_RADIUS } from '../entities/playerStyles';
import {
  closestPointOnPolygon,
  dist,
  pointInConvexPolygon,
  rotate,
  sub,
} from '../systems/geometry';
import type { World } from './World';

/** Các thời điểm một hành vi có thể can thiệp. */
export interface BehaviorHooks {
  readonly name: string;
  onStep?(dtMs: number): void;
  /** Va chạm (tốc độ theo pháp tuyến, px/bước). */
  onImpact?(speed: number): void;
  /** Đang khiêng thì có người buông, đồ rơi xuống. */
  onDropped?(): void;
  onBroken?(): void;
  /** Có người chạm vào (đi bộ đụng, lao vào). */
  onTouched?(player: Player): void;
}

export type BehaviorParams = Record<string, unknown>;

export interface BehaviorContext {
  world: World;
  item: Item;
  /** Tham số: mặc định của preset, ghi đè bởi object trong `behaviors` của data. */
  params: BehaviorParams;
}

export type BehaviorFactory = (ctx: BehaviorContext) => BehaviorHooks;

// ---------- Đọc tham số ----------

const num = (v: unknown, fallback: number) => (typeof v === 'number' ? v : fallback);
const bool = (v: unknown, fallback: boolean) => (typeof v === 'boolean' ? v : fallback);
const str = (v: unknown, fallback: string) => (typeof v === 'string' ? v : fallback);
/** `3` hoặc `[2, 4]` (ngẫu nhiên trong khoảng). */
function range(v: unknown, fallback: [number, number]): [number, number] {
  if (typeof v === 'number') return [v, v];
  if (Array.isArray(v) && typeof v[0] === 'number' && typeof v[1] === 'number') return [v[0], v[1]];
  return fallback;
}
const pick = (world: World, [a, b]: [number, number]) =>
  a + Math.floor(world.random.next() * (b - a + 1));

/**
 * Bộ đếm kích hoạt dùng chung: hồi chiêu, số lần tối đa, xác suất.
 * Trả về true nếu lần kích hoạt này được chạy.
 */
function makeTrigger(world: World, params: BehaviorParams) {
  const cooldownMs = num(params.cooldownMs, 800);
  const maxTimes = num(params.maxTimes, Infinity);
  const chance = num(params.chance, 1);
  let times = 0;
  let cooldown = 0;
  return {
    tick(dt: number) {
      cooldown = Math.max(0, cooldown - dt);
    },
    fire(force = false): boolean {
      if (times >= maxTimes) return false;
      if (!force && (cooldown > 0 || !world.random.chance(chance))) return false;
      times++;
      cooldown = cooldownMs;
      return true;
    },
  };
}

function announce(world: World, item: Item, name: string, popKey: unknown) {
  world.bus.emit({ type: 'behavior', item: item.uid, itemId: item.id, name });
  if (typeof popKey === 'string') world.pop(item.position, t(popKey));
}

// ---------- Hành vi chung, có tham số ----------

/**
 * Va mạnh / rơi / vỡ / bị lắc mạnh khi đang khiêng → văng đồ nhỏ ra xung quanh.
 * Tham số: item, count, minImpact, onDrop, onBreak, breakCount, tiltSpeed, chance, maxTimes,
 * cooldownMs, speed, popKey.
 */
const spawnOnImpact: BehaviorFactory = ({ world, item, params }) => {
  const id = str(params.item, 'food');
  const count = range(params.count, [1, 1]);
  const breakCount = range(params.breakCount, count);
  const minImpact = num(params.minImpact, breakThreshold(item.def));
  const tiltSpeed = num(params.tiltSpeed, Infinity);
  const speed = range(params.speed, [3, 6]);
  const trigger = makeTrigger(world, params);
  const spill = (n: number) => {
    world.burst(id, item.position, n, item.boundingRadius * 0.6, speed);
    announce(world, item, 'spawnOnImpact', params.popKey);
  };
  return {
    name: 'spawnOnImpact',
    onStep(dt) {
      trigger.tick(dt);
      if (item.lifted && Math.abs(item.body.angularVelocity) >= tiltSpeed && trigger.fire()) {
        spill(pick(world, count));
      }
    },
    onImpact(s) {
      if (s >= minImpact && trigger.fire()) spill(pick(world, count));
    },
    onDropped() {
      if (bool(params.onDrop, true) && trigger.fire()) spill(pick(world, count));
    },
    onBroken() {
      if (bool(params.onBreak, false) && trigger.fire(true)) spill(pick(world, breakCount));
    },
  };
};

/**
 * Va mạnh / rơi / vỡ / bị lắc mạnh → đổ ra thành vùng sàn (nước, đất, kính).
 * Tham số: zone, radius, minImpact, onImpact, onDrop, onBreak, tiltSpeed, chance, maxTimes,
 * cooldownMs, popKey.
 */
const spillZone: BehaviorFactory = ({ world, item, params }) => {
  const kind = str(params.zone, 'water') as ZoneKind;
  const radius = num(params.radius, Math.max(30, item.boundingRadius));
  const minImpact = num(params.minImpact, breakThreshold(item.def));
  const tiltSpeed = num(params.tiltSpeed, Infinity);
  const trigger = makeTrigger(world, { cooldownMs: 1200, ...params });
  const spill = () => {
    const a = world.random.next() * Math.PI * 2;
    const off = item.boundingRadius * 0.4;
    const at = { x: item.position.x + Math.cos(a) * off, y: item.position.y + Math.sin(a) * off };
    world.later(() => world.addZone(kind, at.x, at.y, radius));
    announce(world, item, 'spillZone', params.popKey);
  };
  return {
    name: 'spillZone',
    onStep(dt) {
      trigger.tick(dt);
      if (item.lifted && Math.abs(item.body.angularVelocity) >= tiltSpeed && trigger.fire())
        spill();
    },
    onImpact(s) {
      if (bool(params.onImpact, true) && s >= minImpact && trigger.fire()) spill();
    },
    onDropped() {
      if (bool(params.onDrop, true) && trigger.fire()) spill();
    },
    onBroken() {
      if (bool(params.onBreak, true) && trigger.fire(true)) spill();
    },
  };
};

// ---------- Hành vi riêng ----------

/** Vỡ thì rải mảnh vỡ thành vùng nguy hiểm (người đi qua dễ vấp). */
const shatterDebris: BehaviorFactory = ({ world, item, params }) => ({
  name: 'shatterDebris',
  onBroken() {
    const r = num(params.radius, Math.max(30, item.boundingRadius * 1.1));
    world.later(() => world.addZone('glass', item.position.x, item.position.y, r));
    announce(world, item, 'shatterDebris', 'behavior.shatter');
  },
});

/** Trơn như băng: không ai khiêng mà bị người đụng vào thì trượt theo hướng người đó. */
const slippery: BehaviorFactory = ({ world, item, params }) => {
  const push = num(params.push, 1.1);
  const maxSpeed = num(params.maxSpeed, 6);
  return {
    name: 'slippery',
    onTouched(p) {
      if (item.carriers.size > 0 || item.pinned) return;
      const v = item.body.velocity;
      const pv = p.body.velocity;
      let nx = v.x + pv.x * push;
      let ny = v.y + pv.y * push;
      const len = Math.hypot(nx, ny);
      if (len > maxSpeed) {
        nx = (nx / len) * maxSpeed;
        ny = (ny / len) * maxSpeed;
      }
      world.scene.matter.body.setVelocity(item.body, { x: nx, y: ny });
    },
  };
};

/** Cá giãy đành đạch: không ai cầm thì thỉnh thoảng nảy sang một hướng ngẫu nhiên. */
const flop: BehaviorFactory = ({ world, item, params }) => {
  const interval = range(params.intervalMs, [400, 900]);
  const speed = num(params.speed, 3);
  let next = pick(world, interval);
  return {
    name: 'flop',
    onStep(dt) {
      if (item.carriers.size > 0 || !world.isGrabbable(item)) return;
      next -= dt;
      if (next > 0) return;
      next = pick(world, interval);
      const a = world.random.next() * Math.PI * 2;
      const matterBody = world.scene.matter.body;
      matterBody.setVelocity(item.body, { x: Math.cos(a) * speed, y: Math.sin(a) * speed });
      matterBody.setAngularVelocity(item.body, (world.random.next() - 0.5) * 0.5);
    },
  };
};

/**
 * Máy chạy bộ: đụng vào nút (đầu +x của máy) hoặc va mạnh thì băng chuyền chạy vài giây.
 * Ai đứng sát máy (máy là vật rắn, nhìn từ trên xuống thì "đứng trên băng" = chạm vào nó)
 * bị kéo theo băng, chạm lâu thì bị hất văng.
 */
const treadmillBelt: BehaviorFactory = ({ world, item, params }) => {
  const durationMs = num(params.durationMs, 3000);
  const beltSpeed = num(params.beltSpeed, 5);
  const flingAfterMs = num(params.flingAfterMs, 300);
  let runningMs = 0;
  const onBelt = new Map<Player, number>();
  const start = () => {
    if (runningMs > 0) return;
    runningMs = durationMs;
    item.setIcon('💨');
    announce(world, item, 'treadmillBelt', 'behavior.beltOn');
  };
  return {
    name: 'treadmillBelt',
    onTouched(p) {
      // Nút ở đầu +x của máy (30% chiều dài cuối).
      const local = rotate(sub(p.position, item.position), -item.angle);
      if (local.x > item.def.size.w * 0.2) start();
    },
    onImpact(s) {
      if (s >= 3) start();
    },
    onStep(dt) {
      if (runningMs <= 0) return;
      runningMs -= dt;
      if (runningMs <= 0) {
        item.setIcon(null);
        onBelt.clear();
        return;
      }
      const axis = rotate({ x: -1, y: 0 }, item.angle);
      const verts = item.vertices;
      for (const p of world.players) {
        const touching =
          pointInConvexPolygon(p.position, verts) ||
          dist(p.position, closestPointOnPolygon(p.position, verts)) <= PLAYER_RADIUS + 6;
        if (p.motor.mode === 'fallen' || !touching) {
          onBelt.delete(p);
          continue;
        }
        const ms = (onBelt.get(p) ?? 0) + dt;
        onBelt.set(p, ms);
        const k = ms >= flingAfterMs ? 1.8 : 1;
        p.setVelocity({ x: axis.x * beltSpeed * k, y: axis.y * beltSpeed * k });
        if (ms >= flingAfterMs) {
          p.knockDown();
          onBelt.delete(p);
          world.bus.emit({ type: 'playerTripped', slot: p.slotIndex, cause: 'treadmill' });
        }
      }
    },
  };
};

/** Rơi "RẦM": người đứng gần (trừ người đang khiêng) bị hất ngã, màn hình rung. */
const dropOnRelease: BehaviorFactory = ({ world, item, params }) => {
  const radius = num(params.radius, item.boundingRadius + 70);
  return {
    name: 'dropOnRelease',
    onDropped() {
      const carriers = new Set([...item.carriers.values()]);
      for (const p of world.players) {
        if (!carriers.has(p as never) && dist(p.position, item.position) <= radius) p.knockDown();
      }
      world.scene.cameras.main.shake(180, 0.006);
      announce(world, item, 'dropOnRelease', 'behavior.thud');
    },
  };
};

/** Piano: va vào đâu cũng kêu "plinggg". */
const keysSoundOnHit: BehaviorFactory = ({ world, item, params }) => {
  const trigger = makeTrigger(world, { cooldownMs: 600, ...params });
  return {
    name: 'keysSoundOnHit',
    onStep: (dt) => trigger.tick(dt),
    onImpact(s) {
      if (s >= num(params.minImpact, 2) && trigger.fire()) {
        announce(world, item, 'keysSoundOnHit', 'behavior.plonk');
      }
    },
  };
};

// ---------- Registry ----------

/** Tên đặt sẵn trong plan → hành vi chung + tham số mặc định. */
const PRESETS: Partial<Record<BehaviorName, { base: BehaviorFactory; params: BehaviorParams }>> = {
  doorPopsOpen: {
    base: spawnOnImpact,
    params: {
      item: 'food',
      count: [2, 3],
      minImpact: 3,
      chance: 0.7,
      cooldownMs: 1500,
      maxTimes: 3,
      onDrop: false,
      popKey: 'behavior.doorPops',
    },
  },
  boxBottomTear: {
    base: spawnOnImpact,
    params: {
      item: 'book',
      count: [2, 3],
      minImpact: 6,
      chance: 0.5,
      maxTimes: 1,
      onDrop: false,
      popKey: 'behavior.boxTear',
    },
  },
  escapeFish: {
    base: spawnOnImpact,
    params: {
      item: 'fish',
      count: [1, 2],
      chance: 0.6,
      onBreak: true,
      breakCount: [3, 4],
      maxTimes: 4,
      popKey: 'behavior.fishOut',
    },
  },
  ballsRoll: {
    base: spawnOnImpact,
    params: {
      item: 'ball',
      count: [3, 5],
      tiltSpeed: 0.035,
      maxTimes: 3,
      cooldownMs: 1500,
      popKey: 'behavior.balls',
    },
  },
  weightsRoll: {
    base: spawnOnImpact,
    params: {
      item: 'dumbbell',
      count: [2, 3],
      tiltSpeed: 0.04,
      maxTimes: 3,
      cooldownMs: 1500,
      popKey: 'behavior.weights',
    },
  },
  spillSoil: {
    base: spillZone,
    params: { zone: 'soil', radius: 34, minImpact: 4, maxTimes: 2, popKey: 'behavior.soil' },
  },
  spillWater: {
    base: spillZone,
    params: { zone: 'water', radius: 46, tiltSpeed: 0.035, maxTimes: 3, popKey: 'behavior.water' },
  },
};

export const BEHAVIORS: Partial<Record<BehaviorName, BehaviorFactory>> = {
  spawnOnImpact,
  spillZone,
  shatterDebris,
  slippery,
  flop,
  treadmillBelt,
  dropOnRelease,
  keysSoundOnHit,
};

/** Tạo các hành vi của một món đồ từ data. Tên chưa có cài đặt (hành vi của mèo, P11) bị bỏ qua. */
export function createBehaviors(world: World, item: Item): BehaviorHooks[] {
  return (item.def.behaviors ?? []).flatMap((ref: BehaviorRef) => {
    const name = (typeof ref === 'string' ? ref : ref.type) as BehaviorName;
    const own = typeof ref === 'string' ? {} : ref;
    const preset = PRESETS[name];
    if (preset)
      return [{ ...preset.base({ world, item, params: { ...preset.params, ...own } }), name }];
    const factory = BEHAVIORS[name];
    return factory ? [factory({ world, item, params: own })] : [];
  });
}
