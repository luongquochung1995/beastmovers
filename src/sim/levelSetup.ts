import type { MapLayout } from '../data/map';
import type { LevelDef } from '../data/types';
import type { Item } from '../entities/Item';
import type { Vec } from '../systems/geometry';
import { Truck } from './Truck';
import { rainPuddles } from '../systems/rain';
import type { World } from './World';

export interface BuiltLevel {
  level: LevelDef;
  map: MapLayout;
  /** uid các món đồ bắt buộc phải lên xe. */
  required: Set<number>;
  items: Item[];
}

/**
 * Dựng toàn bộ màn từ data: sàn, tường, cửa, vùng nguy hiểm, chỗ nấp, đồ vật.
 * Máy khách online không tạo đồ (`spawnItems = false`): đồ đến từ snapshot của host.
 */
export function buildLevel(
  world: World,
  level: LevelDef,
  map: MapLayout,
  spawnItems = true,
): BuiltLevel {
  for (const f of map.floors) world.addFloor(f.rect, f.color);
  for (const w of map.walls) world.addWall(w);
  for (const d of map.doors) world.addDoor(d.rect, d.hinge);
  for (const z of map.zones) world.addZone(z.kind, z.x, z.y, z.radius);
  for (const r of map.stairs) world.addStairs(r);
  world.hideSpots = map.hideSpots.map((p) => ({ ...p }));

  world.truck = new Truck(world, level.truck, map, level.modifiers.includes('slope'));
  if (level.modifiers.includes('rain')) {
    for (const p of rainPuddles(level.id, map, world.truck.bed))
      world.addZone('water', p.x, p.y, p.radius);
  }

  const required = new Set<number>();
  const items = (spawnItems ? level.spawns : []).map((s) => {
    const item = world.spawnItem(s.item, s.x, s.y, s.angle ?? 0);
    if (s.required) required.add(item.uid);
    return item;
  });
  if (spawnItems && level.modifiers.includes('paparazzi')) {
    for (const p of paparazziSpawns(map)) items.push(world.spawnItem('paparazzi', p.x, p.y, 0));
  }
  return { level, map, required, items };
}

/** Modifier `paparazzi`: 3 tay săn ảnh đứng ở góc xa của các sân ngoài trời. */
const PAPARAZZI = 3;

function paparazziSpawns(map: MapLayout): Vec[] {
  const out: Vec[] = [];
  const yards = map.floors.filter((f) => f.outdoor);
  for (let i = 0; out.length < PAPARAZZI && yards.length; i++) {
    const { x, y, w, h } = yards[i % yards.length]!.rect;
    const corner = Math.floor(i / yards.length) % 4;
    const m = 50;
    out.push({ x: corner % 2 ? x + w - m : x + w / 2, y: corner < 2 ? y + m : y + h - m });
  }
  return out;
}

/** Điểm xuất hiện của người chơi ô `slotIndex` (vòng lại nếu nhiều người hơn số điểm). */
export function playerSpawn(level: LevelDef, slotIndex: number): Vec {
  const [x, y] = level.playerSpawns[slotIndex % level.playerSpawns.length]!;
  return { x, y };
}
