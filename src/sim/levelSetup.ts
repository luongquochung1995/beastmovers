import type { MapLayout } from '../data/map';
import type { LevelDef } from '../data/types';
import type { Item } from '../entities/Item';
import type { Vec } from '../systems/geometry';
import type { World } from './World';

export interface BuiltLevel {
  level: LevelDef;
  map: MapLayout;
  /** uid các món đồ bắt buộc phải lên xe. */
  required: Set<number>;
  items: Item[];
}

/** Dựng toàn bộ màn từ data: sàn, tường, cửa, vùng nguy hiểm, chỗ nấp, đồ vật. */
export function buildLevel(world: World, level: LevelDef, map: MapLayout): BuiltLevel {
  for (const f of map.floors) world.addFloor(f.rect, f.color);
  for (const w of map.walls) world.addWall(w);
  for (const d of map.doors) world.addDoor(d.rect, d.hinge);
  for (const z of map.zones) world.addZone(z.kind, z.x, z.y, z.radius);
  world.hideSpots = map.hideSpots.map((p) => ({ ...p }));

  const required = new Set<number>();
  const items = level.spawns.map((s) => {
    const item = world.spawnItem(s.item, s.x, s.y, s.angle ?? 0);
    if (s.required) required.add(item.uid);
    return item;
  });
  return { level, map, required, items };
}

/** Điểm xuất hiện của người chơi ô `slotIndex` (vòng lại nếu nhiều người hơn số điểm). */
export function playerSpawn(level: LevelDef, slotIndex: number): Vec {
  const [x, y] = level.playerSpawns[slotIndex % level.playerSpawns.length]!;
  return { x, y };
}
