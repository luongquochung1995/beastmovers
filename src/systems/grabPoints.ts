import type { ItemDef } from '../data/types';
import type { Vec } from './geometry';

/**
 * Điểm nắm của một món đồ, theo tọa độ của chính món đồ (tâm là 0,0, chưa xoay).
 * Data có `grabPoints` thì dùng luôn. Không có thì tự sinh:
 * - Hình tròn: chia đều quanh viền.
 * - Hình chữ nhật cần 1 người: giữa 4 cạnh.
 * - Hình chữ nhật cần nhiều người: chia đều hai cạnh dài, mỗi bên một nửa (như khiêng sofa, piano).
 */
export function resolveGrabPoints(def: ItemDef): Vec[] {
  if (def.grabPoints) return def.grabPoints.map(([x, y]) => ({ x, y }));
  const { w, h } = def.size;

  if (def.shape === 'circle') {
    const n = Math.max(4, def.requiredGrabbers);
    const r = w / 2;
    return Array.from({ length: n }, (_, i) => {
      const a = (i / n) * Math.PI * 2;
      return { x: Math.cos(a) * r, y: Math.sin(a) * r };
    });
  }

  if (def.requiredGrabbers <= 1) {
    return [
      { x: 0, y: -h / 2 },
      { x: w / 2, y: 0 },
      { x: 0, y: h / 2 },
      { x: -w / 2, y: 0 },
    ];
  }

  const perSide = Math.ceil(def.requiredGrabbers / 2);
  const horizontal = w >= h;
  const long = horizontal ? w : h;
  const half = (horizontal ? h : w) / 2;
  const points: Vec[] = [];
  for (const side of [-1, 1]) {
    for (let i = 0; i < perSide; i++) {
      const along = -long / 2 + (long * (i + 0.5)) / perSide;
      points.push(horizontal ? { x: along, y: side * half } : { x: side * half, y: along });
    }
  }
  return points;
}
