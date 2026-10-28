import type { Vec } from './geometry';

/**
 * Camera chung khi chơi chung máy (thuần): ôm mọi người chơi trên máy này,
 * chừa chỗ cho thanh HUD trên cùng, không zoom xa hơn mức thấy cả bản đồ.
 */
export interface CameraFitInput {
  points: readonly Vec[];
  view: { w: number; h: number };
  map: { w: number; h: number };
  /** Khoảng đệm quanh người chơi (đơn vị thế giới). */
  padding: number;
  maxZoom: number;
  /** Chiều cao thanh HUD trên cùng (px màn hình) cần chừa ra. */
  hudTop: number;
}

export interface CameraFit {
  /** Điểm thế giới đặt ở tâm màn hình. */
  center: Vec;
  zoom: number;
}

/** Zoom nhỏ nhất: vừa đủ thấy cả bản đồ (trừ thanh HUD). */
export function wholeMapZoom(
  view: { w: number; h: number },
  map: { w: number; h: number },
  hudTop = 0,
): number {
  return Math.min(view.w / map.w, (view.h - hudTop) / map.h);
}

export function fitCamera(input: CameraFitInput): CameraFit {
  const { view, map, padding, hudTop } = input;
  const minZoom = wholeMapZoom(view, map, hudTop);
  const maxZoom = Math.max(minZoom, input.maxZoom);
  if (input.points.length === 0) {
    return { center: { x: map.w / 2, y: map.h / 2 - hudTop / (2 * minZoom) }, zoom: minZoom };
  }
  const xs = input.points.map((p) => p.x);
  const ys = input.points.map((p) => p.y);
  const x1 = Math.min(...xs) - padding;
  const x2 = Math.max(...xs) + padding;
  const y1 = Math.min(...ys) - padding;
  const y2 = Math.max(...ys) + padding;
  const zoom = Math.max(
    minZoom,
    Math.min(maxZoom, view.w / (x2 - x1), (view.h - hudTop) / (y2 - y1)),
  );
  // Nội dung nằm ở phần màn hình dưới thanh HUD: dời tâm lên một nửa chiều cao thanh HUD.
  const cx = (x1 + x2) / 2;
  const cy = (y1 + y2) / 2 - hudTop / (2 * zoom);
  return { center: { x: cx, y: cy }, zoom };
}

/**
 * Vị trí mũi tên chỉ người ở ngoài khung hình: điểm trên mép vùng nhìn thấy (đã chừa lề),
 * theo hướng từ tâm màn hình tới người đó. Trả về null nếu người đó đang ở trong khung.
 */
export function edgeIndicator(
  screen: Vec,
  area: { x: number; y: number; w: number; h: number },
  margin: number,
): { pos: Vec; angle: number } | null {
  const inside =
    screen.x >= area.x &&
    screen.x <= area.x + area.w &&
    screen.y >= area.y &&
    screen.y <= area.y + area.h;
  if (inside) return null;
  const c = { x: area.x + area.w / 2, y: area.y + area.h / 2 };
  const dx = screen.x - c.x;
  const dy = screen.y - c.y;
  const hx = area.w / 2 - margin;
  const hy = area.h / 2 - margin;
  const s = Math.min(hx / Math.abs(dx || 1e-9), hy / Math.abs(dy || 1e-9));
  return { pos: { x: c.x + dx * s, y: c.y + dy * s }, angle: Math.atan2(dy, dx) };
}
