import type { MapLayout } from '../data/map';

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Vũng nước mỗi 100×100 px sân (trung bình). */
const PUDDLES_PER_AREA = 1 / 30_000;

/**
 * Modifier `rain`: vũng nước rải trên sân ngoài trời. Vị trí sinh từ id màn (không dùng số
 * ngẫu nhiên của trận) nên host và máy khách online ra y hệt nhau. Không đặt trong thùng xe
 * (đồ đã xếp sẽ trượt ra ngoài).
 */
export function rainPuddles(
  levelId: string,
  map: Pick<MapLayout, 'floors'>,
  avoid: Rect | null,
): { x: number; y: number; radius: number }[] {
  let seed = 2166136261;
  for (const ch of levelId) seed = Math.imul(seed ^ ch.charCodeAt(0), 16777619);
  const rand = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
  const out: { x: number; y: number; radius: number }[] = [];
  const margin = 40;
  for (const f of map.floors) {
    if (!f.outdoor) continue;
    const { x, y, w, h } = f.rect;
    const n = Math.round(w * h * PUDDLES_PER_AREA);
    for (let i = 0; i < n; i++) {
      const radius = 36 + rand() * 30;
      const p = {
        x: x + radius + rand() * (w - 2 * radius),
        y: y + radius + rand() * (h - 2 * radius),
      };
      const inTruck =
        avoid &&
        p.x > avoid.x - margin &&
        p.x < avoid.x + avoid.w + margin &&
        p.y > avoid.y - margin &&
        p.y < avoid.y + avoid.h + margin;
      if (!inTruck) out.push({ ...p, radius });
    }
  }
  return out;
}
