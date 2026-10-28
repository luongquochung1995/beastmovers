import Phaser from 'phaser';
import type { MapLayout } from '../data/map';
import type { LevelDef, TruckFacing } from '../data/types';
import type { Item } from '../entities/Item';
import type { Player } from '../entities/Player';
import { t } from '../data/i18n';
import { rotate, type Vec } from '../systems/geometry';
import { type CargoState, emptyCargo, updateCargo } from '../systems/truckCargo';
import type { Rect, World } from './World';

/** Kích thước lòng thùng xe (cạnh dài chạy từ cửa thùng vào trong). */
const BED_LONG = 260;
const BED_SHORT = 220;
const WALL_T = 14;
const CAB_LEN = 90;
/** Đồ đứng yên khi tốc độ nhỏ hơn mức này (px/bước). */
const SETTLED_SPEED = 1.2;
const ROLL_ACCEL = 0.004;
const ROLL_MAX = 0.6;
/** Đồ nằm sát cửa thùng trong khoảng này dễ rơi khi xe chạy (xếp ẩu). */
const FALL_MARGIN = 30;
const FALL_CHANCE = 0.5;
const DEPART_ACCEL = 0.12;
const DEPART_MAX = 7;
/** Sai số khi xét "nằm trọn trong thùng" (px). */
const INSIDE_TOLERANCE = 6;
/** Độ dày tường bao bản đồ. */
const MAP_BORDER = 24;

/** Góc xoay từ hệ tọa độ "cửa thùng quay sang trái" sang hướng thật. */
const FACING_ANGLE: Record<TruckFacing, number> = {
  left: 0,
  up: Math.PI / 2,
  right: Math.PI,
  down: -Math.PI / 2,
};

/** Hình chữ nhật (tọa độ cục bộ, tâm thùng là 0,0) → hình chữ nhật thế giới sau khi xoay 90°·k. */
function toWorld(center: Vec, angle: number, r: Rect): Rect {
  const corners = [
    rotate({ x: r.x, y: r.y }, angle),
    rotate({ x: r.x + r.w, y: r.y + r.h }, angle),
  ];
  const x1 = Math.min(corners[0]!.x, corners[1]!.x);
  const y1 = Math.min(corners[0]!.y, corners[1]!.y);
  const x2 = Math.max(corners[0]!.x, corners[1]!.x);
  const y2 = Math.max(corners[0]!.y, corners[1]!.y);
  return { x: center.x + x1, y: center.y + y1, w: x2 - x1, h: y2 - y1 };
}

const inRect = (p: Vec, r: Rect) =>
  p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;

/**
 * Xe tải: thùng 3 vách (cửa thùng quay về phía nhà), cabin, cần phanh tay.
 * Đồ nằm trọn trong thùng và đã yên vị thì tính là đã lên xe.
 */
export class Truck {
  readonly capacity: number;
  cargo: CargoState = emptyCargo();
  handbrakeOn: boolean;
  /** Bản đồ có dốc (modifier `slope`): nhả phanh thì xe trôi. */
  readonly onSlope: boolean;
  private bed: Rect;
  /** Hình bao toàn bộ xe (thùng, vách, cabin) để chặn xe trôi ra ngoài bản đồ. */
  private extent: Rect;
  private readonly openingNormal: Vec;
  private readonly rollDir: Vec;
  private readonly bodies: MatterJS.BodyType[] = [];
  private readonly view: Phaser.GameObjects.Container;
  private readonly label: Phaser.GameObjects.Text;
  private readonly lever: Phaser.GameObjects.Container | null;
  private leverPos: Vec | null;
  private rollSpeed = 0;
  private departing = false;
  private departSpeed = 0;
  private offset: Vec = { x: 0, y: 0 };

  constructor(
    private readonly world: World,
    def: LevelDef['truck'],
    private readonly map: MapLayout,
    slope: boolean,
  ) {
    const scene = world.scene;
    this.capacity = def.slots;
    this.onSlope = slope;
    // Có dốc thì xe đỗ lúc đầu chưa kéo phanh: người chơi phải nhớ kéo.
    this.handbrakeOn = !slope;
    const angle = FACING_ANGLE[def.facing ?? 'left'];
    const c = { x: def.x, y: def.y };
    const L = BED_LONG;
    const S = BED_SHORT;
    this.bed = toWorld(c, angle, { x: -L / 2, y: -S / 2, w: L, h: S });
    this.openingNormal = rotate({ x: -1, y: 0 }, angle);
    this.rollDir = { x: -this.openingNormal.x, y: -this.openingNormal.y };

    const local: { r: Rect; color: number; body: boolean }[] = [
      {
        r: { x: -L / 2, y: -S / 2 - WALL_T, w: L + WALL_T, h: WALL_T },
        color: 0xc0392b,
        body: true,
      },
      { r: { x: -L / 2, y: S / 2, w: L + WALL_T, h: WALL_T }, color: 0xc0392b, body: true },
      { r: { x: L / 2, y: -S / 2, w: WALL_T, h: S }, color: 0xc0392b, body: true },
      {
        r: { x: L / 2 + WALL_T, y: -S / 2 + 10, w: CAB_LEN, h: S - 20 },
        color: 0xe74c3c,
        body: true,
      },
    ];
    const parts = local.map((p) => toWorld(c, angle, p.r));
    const xs = [this.bed.x, ...parts.map((r) => r.x)];
    const ys = [this.bed.y, ...parts.map((r) => r.y)];
    const xe = [this.bed.x + this.bed.w, ...parts.map((r) => r.x + r.w)];
    const ye = [this.bed.y + this.bed.h, ...parts.map((r) => r.y + r.h)];
    this.extent = {
      x: Math.min(...xs),
      y: Math.min(...ys),
      w: Math.max(...xe) - Math.min(...xs),
      h: Math.max(...ye) - Math.min(...ys),
    };
    const g = scene.add.graphics();
    const bedW = this.bed;
    // Lòng thùng + nan sàn
    g.fillStyle(0x37474f, 1).fillRect(bedW.x, bedW.y, bedW.w, bedW.h);
    g.lineStyle(2, 0x455a64, 1);
    for (let k = 1; k < 8; k++) {
      const f = k / 8;
      if (bedW.w >= bedW.h)
        g.lineBetween(bedW.x, bedW.y + bedW.h * f, bedW.x + bedW.w, bedW.y + bedW.h * f);
      else g.lineBetween(bedW.x + bedW.w * f, bedW.y, bedW.x + bedW.w * f, bedW.y + bedW.h);
    }
    // Dải cửa thùng (ván dốc)
    const ramp = toWorld(c, angle, { x: -L / 2 - 18, y: -S / 2, w: 18, h: S });
    g.fillStyle(0x78909c, 0.6).fillRect(ramp.x, ramp.y, ramp.w, ramp.h);
    for (const part of local) {
      const r = toWorld(c, angle, part.r);
      g.fillStyle(part.color, 1).fillRect(r.x, r.y, r.w, r.h);
      if (part.body) {
        this.bodies.push(
          scene.matter.add.rectangle(r.x + r.w / 2, r.y + r.h / 2, r.w, r.h, {
            isStatic: true,
            label: 'truck',
          }),
        );
      }
    }
    // Kính cabin
    const glass = toWorld(c, angle, {
      x: L / 2 + WALL_T + CAB_LEN - 28,
      y: -S / 2 + 26,
      w: 18,
      h: S - 52,
    });
    g.fillStyle(0x90caf9, 1).fillRect(glass.x, glass.y, glass.w, glass.h);
    g.setDepth(-450);

    const cabCenter = toWorld(c, angle, {
      x: L / 2 + WALL_T,
      y: -S / 2 + 10,
      w: CAB_LEN,
      h: S - 20,
    });
    this.label = scene.add
      .text(cabCenter.x + cabCenter.w / 2, cabCenter.y + cabCenter.h / 2, '', {
        fontFamily: 'sans-serif',
        fontSize: '18px',
        fontStyle: 'bold',
        color: '#ffffff',
        stroke: '#000000',
        strokeThickness: 4,
        align: 'center',
      })
      .setOrigin(0.5)
      .setDepth(-440);
    this.view = scene.add.container(0, 0, [g, this.label]);

    if (def.hasHandbrake || slope) {
      const lp = rotate({ x: L / 2 + WALL_T + CAB_LEN / 2, y: S / 2 + 34 }, angle);
      this.leverPos = { x: c.x + lp.x, y: c.y + lp.y };
      const knob = scene.add.circle(0, 0, 12, 0x263238).setStrokeStyle(3, 0xffca28);
      const handle = scene.add.text(0, 0, '🅿', { fontSize: '16px' }).setOrigin(0.5);
      this.lever = scene.add
        .container(this.leverPos.x, this.leverPos.y, [knob, handle])
        .setDepth(-430);
      world.interactables.push({
        position: () => this.leverPos!,
        radius: 34,
        use: (p) => this.toggleHandbrake(p),
      });
    } else {
      this.leverPos = null;
      this.lever = null;
    }
    this.refreshLabel();
  }

  get used(): number {
    return this.cargo.used;
  }

  get loadedUids(): ReadonlySet<number> {
    return new Set(this.cargo.loaded.keys());
  }

  get bedRect(): Rect {
    return { ...this.bed };
  }

  /** Món đồ nằm trọn trong lòng thùng (cho lấn vách vài px vì va chạm vật lý có độ lún). */
  contains(item: Item): boolean {
    const b = this.bed;
    const loose = {
      x: b.x - INSIDE_TOLERANCE,
      y: b.y - INSIDE_TOLERANCE,
      w: b.w + INSIDE_TOLERANCE * 2,
      h: b.h + INSIDE_TOLERANCE * 2,
    };
    return item.vertices.every((v) => inRect(v, loose));
  }

  /** Khoảng cách từ tâm món đồ tới mép cửa thùng (dùng để xét đồ xếp sát cửa dễ rơi). */
  distanceToOpening(item: Item): number {
    const n = this.openingNormal;
    const b = this.bed;
    const edge = n.x < 0 ? b.x : n.x > 0 ? b.x + b.w : n.y < 0 ? b.y : b.y + b.h;
    const p = item.position;
    return n.x !== 0 ? Math.abs(p.x - edge) : Math.abs(p.y - edge);
  }

  private toggleHandbrake(p: Player): void {
    this.handbrakeOn = !this.handbrakeOn;
    this.world.bus.emit({ type: 'handbrake', on: this.handbrakeOn, slot: p.slotIndex });
    this.world.pop(
      this.leverPos!,
      t(this.handbrakeOn ? 'truck.handbrakeOn' : 'truck.handbrakeOff'),
    );
  }

  /** Mỗi bước logic, sau bước vật lý. */
  step(): void {
    if (this.departing) return;
    this.roll();
    const res = updateCargo(
      this.cargo,
      this.world.items
        .filter((i) => !i.hidden)
        .map((i) => {
          const v = i.body.velocity;
          return {
            uid: i.uid,
            slots: i.def.truckSlots,
            inside: this.contains(i),
            settled: i.carriers.size === 0 && !i.airborne && Math.hypot(v.x, v.y) < SETTLED_SPEED,
          };
        }),
      this.capacity,
    );
    this.cargo = res.state;
    const byUid = (uid: number) => this.world.items.find((i) => i.uid === uid);
    for (const uid of res.loaded) {
      const item = byUid(uid);
      if (!item) continue;
      item.loaded = true;
      this.world.bus.emit({ type: 'itemLoaded', item: uid, itemId: item.id });
      this.world.pop(item.position, '✓', '#7CFC8A');
    }
    for (const uid of res.unloaded) {
      const item = byUid(uid);
      if (item) item.loaded = false;
      this.world.bus.emit({ type: 'itemUnloaded', item: uid, itemId: item?.id ?? '' });
    }
    for (const uid of res.rejected) {
      const item = byUid(uid);
      if (!item) continue;
      this.world.bus.emit({ type: 'truckFull', item: uid, itemId: item.id });
      this.world.pop(item.position, t('truck.full'), '#ff8a80');
      // Đẩy món đồ ra phía cửa thùng.
      const n = this.openingNormal;
      this.world.scene.matter.body.setVelocity(item.body, { x: n.x * 6, y: n.y * 6 });
      item.setAirborne(400);
    }
    // Món bị từ chối vì xe đầy: đẩy dần về phía cửa thùng cho tới khi ra hẳn.
    for (const uid of this.cargo.rejected) {
      const item = byUid(uid);
      if (!item || item.carriers.size > 0) continue;
      const n = this.openingNormal;
      this.world.scene.matter.body.setVelocity(item.body, { x: n.x * 3, y: n.y * 3 });
    }
    if (res.loaded.length || res.unloaded.length) this.refreshLabel();
  }

  /**
   * Hết giờ, xe chạy đi: đồ xếp sát cửa thùng có thể rơi ra (xếp ẩu); đồ còn lại
   * đứng im theo xe. Trả về những món bị rơi.
   */
  startDeparture(): Item[] {
    if (this.departing) return [];
    this.departing = true;
    const fallen: Item[] = [];
    const loaded = new Map(this.cargo.loaded);
    let used = this.cargo.used;
    const n = this.openingNormal;
    for (const [uid, slots] of this.cargo.loaded) {
      const item = this.world.items.find((i) => i.uid === uid);
      if (!item) continue;
      if (this.distanceToOpening(item) < FALL_MARGIN && this.world.random.chance(FALL_CHANCE)) {
        loaded.delete(uid);
        used -= slots;
        item.loaded = false;
        fallen.push(item);
        this.world.scene.matter.body.setVelocity(item.body, { x: n.x * 4, y: n.y * 4 });
        item.setAirborne(400);
        this.world.bus.emit({ type: 'itemUnloaded', item: uid, itemId: item.id });
        this.world.pop(item.position, t('truck.fellOff'), '#ff8a80');
      } else {
        item.frozen = true;
        this.world.grab.releaseItem(item);
        this.world.scene.matter.body.setStatic(item.body, true);
      }
    }
    this.cargo = { ...this.cargo, loaded, used };
    this.refreshLabel();
    return fallen;
  }

  /** Mỗi bước trong cảnh xe chạy đi. */
  departStep(): void {
    if (!this.departing) return;
    this.departSpeed = Math.min(DEPART_MAX, this.departSpeed + DEPART_ACCEL);
    this.translate({ x: this.rollDir.x * this.departSpeed, y: this.rollDir.y * this.departSpeed });
  }

  /** Dời cả xe (vách, cabin, cần phanh) và đồ đã lên xe. */
  private translate(d: Vec): void {
    this.extent = { ...this.extent, x: this.extent.x + d.x, y: this.extent.y + d.y };
    this.bed = { ...this.bed, x: this.bed.x + d.x, y: this.bed.y + d.y };
    this.offset = { x: this.offset.x + d.x, y: this.offset.y + d.y };
    const mb = this.world.scene.matter.body;
    for (const b of this.bodies)
      mb.setPosition(b, { x: b.position.x + d.x, y: b.position.y + d.y }, false);
    for (const uid of this.cargo.loaded.keys()) {
      const item = this.world.items.find((i) => i.uid === uid);
      if (item && item.carriers.size === 0) {
        mb.setPosition(
          item.body,
          { x: item.body.position.x + d.x, y: item.body.position.y + d.y },
          false,
        );
      }
    }
    if (this.leverPos) this.leverPos = { x: this.leverPos.x + d.x, y: this.leverPos.y + d.y };
  }

  /** Có dốc và chưa kéo phanh: xe trôi dần ra xa nhà (kéo theo đồ đã lên xe). */
  private roll(): void {
    if (!this.onSlope) return;
    const wasStill = this.rollSpeed === 0;
    this.rollSpeed = this.handbrakeOn
      ? Math.max(0, this.rollSpeed - ROLL_ACCEL * 4)
      : Math.min(ROLL_MAX, this.rollSpeed + ROLL_ACCEL);
    if (this.rollSpeed === 0) return;
    if (wasStill) this.world.bus.emit({ type: 'truckRolling' });
    const d = { x: this.rollDir.x * this.rollSpeed, y: this.rollDir.y * this.rollSpeed };
    // Dừng khi chạm tường bao bản đồ.
    const next = { ...this.extent, x: this.extent.x + d.x, y: this.extent.y + d.y };
    const margin = MAP_BORDER;
    if (
      next.x < margin ||
      next.y < margin ||
      next.x + next.w > this.map.width - margin ||
      next.y + next.h > this.map.height - margin
    ) {
      this.rollSpeed = 0;
      return;
    }
    this.translate(d);
  }

  private refreshLabel(): void {
    this.label.setText(`🚚\n${this.cargo.used}/${this.capacity}`);
  }

  render(): void {
    this.view.setPosition(this.offset.x, this.offset.y);
    if (this.lever && this.leverPos) {
      this.lever.setPosition(this.leverPos.x, this.leverPos.y);
      this.lever.setAngle(this.handbrakeOn ? 0 : 180);
    }
  }
}
