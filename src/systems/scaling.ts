import type { MapLayout, MapRect } from '../data/map';
import type { ItemDef, LevelDef } from '../data/types';

/** Thời gian chơi không ngắn hơn mức này dù đông người. */
export const MIN_TIME_SEC = 90;
/** Đồ thêm đặt cách tường/cửa/đồ khác ít nhất chừng này (px). */
const CLEARANCE = 16;
const TRIES_PER_ITEM = 300;

/**
 * Co giãn màn theo số người (`scaling` trong levels.json). Mỗi người vượt `basePlayers`:
 * thêm đồ thưởng (`extraSpawnsPerPlayer`, không bắt buộc), đổi thời gian
 * (`timeDeltaPerPlayerSec`), nâng mốc sao (`starsPerExtraPlayer`) và thêm chỗ trên xe.
 *
 * Hàm thuần, chỉ phụ thuộc màn + bản đồ + số người: host và máy khách online tính ra
 * y hệt nhau (vị trí đồ thêm sinh từ id màn), không cần gửi qua mạng.
 */
export function scaleLevel(
  level: LevelDef,
  map: Pick<MapLayout, 'floors' | 'walls' | 'doors' | 'width' | 'height'>,
  players: number,
  items: ReadonlyMap<string, Pick<ItemDef, 'size'>>,
): LevelDef {
  const s = level.scaling;
  const extra = s ? Math.max(0, players - s.basePlayers) : 0;
  if (!s || extra === 0) return level;

  const rand = seeded(`${level.id}:${players}`);
  const taken: { x: number; y: number; r: number }[] = level.spawns.map((sp) => ({
    x: sp.x,
    y: sp.y,
    r: radiusOf(items.get(sp.item)),
  }));
  const blocks: MapRect[] = [...map.walls, ...map.doors.map((d) => d.rect)];
  const indoor = map.floors.filter((f) => !f.outdoor).map((f) => f.rect);
  const floors = indoor.length ? indoor : map.floors.map((f) => f.rect);
  const area = floors.reduce((a, r) => a + r.w * r.h, 0);

  const spawns = [...level.spawns];
  for (let n = 0; n < extra; n++) {
    for (const { item, count } of s.extraSpawnsPerPlayer) {
      const r = radiusOf(items.get(item));
      for (let c = 0; c < count; c++) {
        const p = placeOne(rand, floors, area, r, blocks, taken);
        if (!p) continue; // hết chỗ: bỏ qua món đó
        taken.push({ ...p, r });
        spawns.push({ item, x: p.x, y: p.y, required: false });
      }
    }
  }

  const stars = level.stars.map((v, i) => v + s.starsPerExtraPlayer[i]! * extra);
  return {
    ...level,
    spawns,
    stars,
    timeLimitSec: Math.max(MIN_TIME_SEC, level.timeLimitSec + s.timeDeltaPerPlayerSec * extra),
    truck: { ...level.truck, slots: level.truck.slots + s.truckSlotsPerPlayer * extra },
  };
}

function radiusOf(def: Pick<ItemDef, 'size'> | undefined): number {
  return def ? Math.hypot(def.size.w, def.size.h) / 2 : 20;
}

function placeOne(
  rand: () => number,
  floors: readonly MapRect[],
  area: number,
  r: number,
  blocks: readonly MapRect[],
  taken: readonly { x: number; y: number; r: number }[],
): { x: number; y: number } | null {
  for (let t = 0; t < TRIES_PER_ITEM; t++) {
    // Chọn sàn theo diện tích để đồ rải đều.
    let pick = rand() * area;
    let f = floors[0]!;
    for (const fl of floors) {
      pick -= fl.w * fl.h;
      if (pick <= 0) {
        f = fl;
        break;
      }
    }
    const m = r + CLEARANCE;
    if (f.w <= 2 * m || f.h <= 2 * m) continue;
    const p = {
      x: Math.round(f.x + m + rand() * (f.w - 2 * m)),
      y: Math.round(f.y + m + rand() * (f.h - 2 * m)),
    };
    if (blocks.some((b) => circleHitsRect(p, m, b))) continue;
    if (taken.some((o) => Math.hypot(o.x - p.x, o.y - p.y) < o.r + r + CLEARANCE)) continue;
    return p;
  }
  return null;
}

function circleHitsRect(p: { x: number; y: number }, r: number, b: MapRect): boolean {
  const cx = Math.max(b.x, Math.min(p.x, b.x + b.w));
  const cy = Math.max(b.y, Math.min(p.y, b.y + b.h));
  return Math.hypot(p.x - cx, p.y - cy) < r;
}

function seeded(key: string): () => number {
  let seed = 2166136261;
  for (const ch of key) seed = Math.imul(seed ^ ch.charCodeAt(0), 16777619);
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
}
