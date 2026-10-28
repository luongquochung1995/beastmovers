import {
  arr,
  bool,
  type CheckContext,
  type Infer,
  int,
  type Issue,
  num,
  obj,
  optional,
  report,
  type Schema,
  str,
} from './schema';

/**
 * Bản đồ màn chơi theo định dạng JSON của Tiled (https://www.mapeditor.org), chỉ dùng
 * các lớp đối tượng (object layer). Tọa độ là pixel, cùng hệ tọa độ với `levels.json`.
 *
 * Lớp theo tên:
 * - `floors`: hình chữ nhật sàn; thuộc tính `color` (#rrggbb), `outdoor` (bool, sân ngoài trời).
 * - `walls`: hình chữ nhật tường.
 * - `doors`: hình chữ nhật cánh cửa; thuộc tính `hinge` = `start` (mặc định) hoặc `end`
 *   (bản lề ở đầu trái/trên hay đầu phải/dưới của cánh cửa).
 * - `markers`: điểm; loại `hideSpot` (chỗ nấp của mèo) hoặc `landlordPath`
 *   (đường đi của chủ nhà, theo thuộc tính `order`, không có thì theo id).
 * - `zones`: hình tròn/elip hoặc chữ nhật; loại `water`, `soil`, `glass`.
 * Lớp khác (vd. lớp ô gạch để trang trí) được bỏ qua.
 */

const anyValue: Schema<unknown> = { check: () => true };

const propertySchema = obj(
  { name: str({ minLen: 1 }), type: optional(str()), value: anyValue },
  { allowUnknown: true },
);

const objectSchema = obj(
  {
    id: int({ min: 0 }),
    name: optional(str()),
    type: optional(str()),
    /** Tiled 1.9 dùng `class` thay cho `type`. */
    class: optional(str()),
    x: num(),
    y: num(),
    width: optional(num({ min: 0 })),
    height: optional(num({ min: 0 })),
    rotation: optional(num()),
    point: optional(bool()),
    ellipse: optional(bool()),
    properties: optional(arr(propertySchema)),
  },
  { allowUnknown: true },
);
type MapObject = Infer<typeof objectSchema>;

const layerSchema = obj(
  { type: str(), name: str(), objects: optional(arr(objectSchema)) },
  { allowUnknown: true },
);

export const mapSchema = obj(
  {
    width: int({ min: 1 }),
    height: int({ min: 1 }),
    tilewidth: int({ min: 1 }),
    tileheight: int({ min: 1 }),
    layers: arr(layerSchema),
  },
  { allowUnknown: true },
);
export type TiledMap = Infer<typeof mapSchema>;

export interface MapRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type MapZoneKind = 'water' | 'soil' | 'glass';
const ZONE_KINDS: readonly string[] = ['water', 'soil', 'glass'];

export interface MapLayout {
  /** Kích thước bản đồ (pixel). */
  width: number;
  height: number;
  /** `outdoor`: sân ngoài trời (modifier `rain` làm ướt). */
  floors: { rect: MapRect; color: number; outdoor: boolean }[];
  walls: MapRect[];
  doors: { rect: MapRect; hinge: 'start' | 'end' }[];
  hideSpots: { x: number; y: number }[];
  landlordPath: { x: number; y: number }[];
  zones: { kind: MapZoneKind; x: number; y: number; radius: number }[];
}

const DEFAULT_FLOOR = 0x2b2838;

function prop(o: MapObject, name: string): unknown {
  return o.properties?.find((p) => p.name === name)?.value;
}

const kindOf = (o: MapObject) => o.type || o.class || '';
const rectOf = (o: MapObject): MapRect => ({ x: o.x, y: o.y, w: o.width ?? 0, h: o.height ?? 0 });

function parseColor(v: unknown): number | null {
  if (typeof v !== 'string') return null;
  // Tiled lưu màu dạng #aarrggbb; chấp nhận cả #rrggbb.
  const m = /^#(?:[0-9a-f]{2})?([0-9a-f]{6})$/i.exec(v);
  return m ? parseInt(m[1]!, 16) : null;
}

/** Đọc bản đồ Tiled đã qua schema thành bố cục màn. Lỗi nội dung được thêm vào `issues`. */
export function parseMap(file: string, map: TiledMap, issues: Issue[]): MapLayout {
  const ctx: CheckContext = { file, issues };
  const layout: MapLayout = {
    width: map.width * map.tilewidth,
    height: map.height * map.tileheight,
    floors: [],
    walls: [],
    doors: [],
    hideSpots: [],
    landlordPath: [],
    zones: [],
  };
  const path: { order: number; x: number; y: number }[] = [];

  for (const layer of map.layers) {
    const objects = layer.objects ?? [];
    objects.forEach((o, i) => {
      const at = `layers[${layer.name}].objects[${o.id ?? i}]`;
      if (o.rotation) {
        report(ctx, `${at}.rotation`, 'mapRotation', { id: o.id });
        return;
      }
      const needsSize = (r: MapRect) => {
        if (r.w > 0 && r.h > 0) return true;
        report(ctx, at, 'mapEmptyRect', { id: o.id });
        return false;
      };
      switch (layer.name) {
        case 'floors': {
          const r = rectOf(o);
          if (!needsSize(r)) return;
          const color = prop(o, 'color');
          const c = color === undefined ? DEFAULT_FLOOR : parseColor(color);
          if (c === null)
            report(ctx, `${at}.properties.color`, 'mapColor', { value: String(color) });
          layout.floors.push({
            rect: r,
            color: c ?? DEFAULT_FLOOR,
            outdoor: prop(o, 'outdoor') === true,
          });
          break;
        }
        case 'walls': {
          const r = rectOf(o);
          if (needsSize(r)) layout.walls.push(r);
          break;
        }
        case 'doors': {
          const r = rectOf(o);
          if (!needsSize(r)) return;
          const hinge = prop(o, 'hinge') ?? 'start';
          if (hinge !== 'start' && hinge !== 'end') {
            report(ctx, `${at}.properties.hinge`, 'enum', {
              value: String(hinge),
              allowed: 'start, end',
            });
            return;
          }
          layout.doors.push({ rect: r, hinge });
          break;
        }
        case 'markers': {
          const kind = kindOf(o);
          if (kind === 'hideSpot') layout.hideSpots.push({ x: o.x, y: o.y });
          else if (kind === 'landlordPath') {
            const order = prop(o, 'order');
            path.push({ order: typeof order === 'number' ? order : o.id, x: o.x, y: o.y });
          } else
            report(ctx, `${at}.type`, 'enum', { value: kind, allowed: 'hideSpot, landlordPath' });
          break;
        }
        case 'zones': {
          const kind = kindOf(o);
          if (!ZONE_KINDS.includes(kind)) {
            report(ctx, `${at}.type`, 'enum', { value: kind, allowed: ZONE_KINDS.join(', ') });
            return;
          }
          const r = rectOf(o);
          if (!needsSize(r)) return;
          layout.zones.push({
            kind: kind as MapZoneKind,
            x: r.x + r.w / 2,
            y: r.y + r.h / 2,
            radius: Math.min(r.w, r.h) / 2,
          });
          break;
        }
        default:
          // Lớp trang trí hoặc lớp chưa dùng: bỏ qua.
          break;
      }
    });
  }
  layout.landlordPath = path.sort((a, b) => a.order - b.order).map(({ x, y }) => ({ x, y }));
  return layout;
}

export function insideMap(layout: MapLayout, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x <= layout.width && y <= layout.height;
}
