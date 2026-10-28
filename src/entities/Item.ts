import Phaser from 'phaser';
import type { ItemDef } from '../data/types';
import { type CarryState, carryState } from '../systems/carry';
import { rotate, type Vec } from '../systems/geometry';
import { resolveGrabPoints } from '../systems/grabPoints';
import { Theme } from '../ui/theme';
import { ensureItemTexture } from './itemTextures';

/** Đổi kg sang khối lượng Matter. Nhân vật (~75 kg) có khối lượng Matter khoảng 5. */
export const KG_TO_MASS = 1 / 15;

/** Ma sát sàn trong data (0..1) → `frictionAir` của Matter (nhìn từ trên xuống nên sàn = lực cản). */
export function floorFrictionAir(friction: number): number {
  return 0.02 + friction * 0.25;
}

const LIFT_HEIGHT = 6;
const AIRBORNE_FRICTION = 0.012;

/** Một món đồ trong nhà: thân vật lý Matter + phần hình ảnh vẽ riêng (nội suy giữa hai bước logic). */
export class Item {
  private static nextUid = 1;

  readonly uid = Item.nextUid++;
  readonly body: MatterJS.BodyType;
  /** Điểm nắm theo tọa độ của món đồ (chưa xoay). */
  readonly grabPoints: readonly Vec[];
  /** Nhóm va chạm riêng: người đang nắm món đồ được đưa vào nhóm này để không va vào nó. */
  readonly collisionGroup: number;
  /** Người đang nắm, theo số thứ tự điểm nắm. Kiểu tổng quát để tránh vòng import với Player. */
  readonly carriers = new Map<number, { slotIndex: number }>();
  carryState: CarryState;
  durability: number;
  broken = false;
  /** Còn bao lâu nữa vật vừa bị ném chạm sàn (ms). */
  private airborneMs = 0;

  protected readonly view: Phaser.GameObjects.Container;
  protected readonly image: Phaser.GameObjects.Image;
  private readonly shadow: Phaser.GameObjects.Image;
  private readonly icon: Phaser.GameObjects.Text | null;
  private readonly counter: Phaser.GameObjects.Text;
  private readonly radius: number;
  private prevPos: Vec;
  private prevAngle: number;

  constructor(
    protected readonly scene: Phaser.Scene,
    readonly def: ItemDef,
    x: number,
    y: number,
    angle = 0,
  ) {
    const { w, h } = def.size;
    this.collisionGroup = -1000 - this.uid;
    const options: Phaser.Types.Physics.Matter.MatterBodyConfig = {
      label: 'item',
      angle,
      friction: 0.05,
      frictionAir: floorFrictionAir(def.friction),
      restitution: def.restitution ?? 0.2,
      collisionFilter: { group: this.collisionGroup, category: 1, mask: 0xffffffff },
    };
    this.body =
      def.shape === 'circle'
        ? scene.matter.add.circle(x, y, w / 2, options)
        : scene.matter.add.rectangle(x, y, w, h, options);
    scene.matter.body.setMass(this.body, def.mass * KG_TO_MASS);
    this.grabPoints = resolveGrabPoints(def);
    this.durability = def.durability;
    this.carryState = carryState(def.liftRule, 0, def.requiredGrabbers);
    // Đồ "strict" không ai khiêng thì nằm im như đóng đinh: đẩy cũng không đi.
    if (this.carryState === 'immovable') scene.matter.body.setStatic(this.body, true);
    this.radius = Math.hypot(w, h) / 2;
    this.prevPos = { x, y };
    this.prevAngle = angle;

    const texture = ensureItemTexture(scene, def);
    this.shadow = scene.add.image(0, 0, texture).setTint(0x000000).setAlpha(0.3).setVisible(false);
    this.image = scene.add.image(0, 0, texture);
    const iconSize = Phaser.Math.Clamp(Math.min(w, h) * 0.6, 10, 40);
    this.icon = def.icon
      ? scene.add.text(0, 0, def.icon, { fontSize: `${iconSize}px` }).setOrigin(0.5)
      : null;
    this.view = scene.add.container(x, y, [
      this.shadow,
      this.image,
      ...(this.icon ? [this.icon] : []),
    ]);
    this.view.setRotation(angle).setDepth(y);
    this.counter = scene.add
      .text(x, y, '', {
        fontFamily: Theme.font,
        fontSize: '15px',
        fontStyle: 'bold',
        color: '#ffffff',
        stroke: '#000000',
        strokeThickness: 4,
      })
      .setOrigin(0.5)
      .setDepth(9_500)
      .setVisible(false);
  }

  get id(): string {
    return this.def.id;
  }

  get position(): Vec {
    return { x: this.body.position.x, y: this.body.position.y };
  }

  get angle(): number {
    return this.body.angle;
  }

  /** Các đỉnh của hình va chạm, tọa độ thế giới. */
  get vertices(): Vec[] {
    return (this.body.vertices ?? []) as Vec[];
  }

  /** Bán kính bao quanh (để đặt chữ, tìm đồ gần). */
  get boundingRadius(): number {
    return this.radius;
  }

  /** Điểm nắm thứ i, so với tâm món đồ, đã xoay theo món đồ. */
  grabOffset(i: number): Vec {
    return rotate(this.grabPoints[i]!, this.body.angle);
  }

  grabWorld(i: number): Vec {
    const o = this.grabOffset(i);
    return { x: this.body.position.x + o.x, y: this.body.position.y + o.y };
  }

  freeGrabPoints(): number[] {
    return this.grabPoints.map((_, i) => i).filter((i) => !this.carriers.has(i));
  }

  get pinned(): boolean {
    return this.body.isStatic;
  }

  setPinned(pinned: boolean): void {
    if (this.body.isStatic === pinned) return;
    this.scene.matter.body.setStatic(this.body, pinned);
    if (!pinned) {
      // setStatic(false) khôi phục khối lượng gốc của Matter; đặt lại theo data cho chắc.
      this.scene.matter.body.setMass(this.body, this.def.mass * KG_TO_MASS);
    }
  }

  get lifted(): boolean {
    return this.carryState === 'lifted';
  }

  /** Vật vừa bị ném: bay gần như không ma sát sàn trong `ms`. */
  setAirborne(ms: number): void {
    this.airborneMs = ms;
    this.body.frictionAir = AIRBORNE_FRICTION;
  }

  get airborne(): boolean {
    return this.airborneMs > 0;
  }

  /** Gọi đầu mỗi bước logic để lưu vị trí cũ cho nội suy. */
  beforeStep(dtMs: number): void {
    this.prevPos = this.position;
    this.prevAngle = this.body.angle;
    if (this.airborneMs > 0) {
      this.airborneMs -= dtMs;
      if (this.airborneMs <= 0) this.body.frictionAir = floorFrictionAir(this.def.friction);
    }
  }

  render(alpha: number): void {
    const p = this.position;
    const x = Phaser.Math.Linear(this.prevPos.x, p.x, alpha);
    const y = Phaser.Math.Linear(this.prevPos.y, p.y, alpha);
    const angle = this.prevAngle + (this.body.angle - this.prevAngle) * alpha;
    this.view
      .setPosition(x, y)
      .setRotation(angle)
      .setDepth(y + (this.lifted ? 30 : 0));

    // Nhấc lên: hình nhích lên trên màn hình (không theo góc xoay), bóng ở dưới.
    const up = this.lifted ? rotate({ x: 0, y: -LIFT_HEIGHT }, -angle) : { x: 0, y: 0 };
    this.image.setPosition(up.x, up.y);
    this.icon?.setPosition(up.x, up.y);
    const down = rotate({ x: 0, y: 3 }, -angle);
    this.shadow.setVisible(this.lifted).setPosition(down.x, down.y);

    const n = this.carriers.size;
    const need = this.def.requiredGrabbers;
    if (need > 1 && n > 0) {
      this.counter
        .setVisible(true)
        .setText(`${n}/${need} 👐`)
        .setColor(n >= need ? '#7CFC8A' : '#ffffff')
        .setPosition(x, y);
    } else {
      this.counter.setVisible(false);
    }
  }

  destroy(): void {
    this.scene.matter.world.remove(this.body);
    this.view.destroy();
    this.counter.destroy();
  }
}
