import Phaser from 'phaser';
import type { ItemDef } from '../data/types';
import type { Vec } from '../systems/geometry';
import { resolveGrabPoints } from '../systems/grabPoints';
import { ensureItemTexture } from './itemTextures';

/** Đổi kg sang khối lượng Matter. Nhân vật (~75 kg) có khối lượng Matter khoảng 5. */
export const KG_TO_MASS = 1 / 15;

/** Ma sát sàn trong data (0..1) → `frictionAir` của Matter (nhìn từ trên xuống nên sàn = lực cản). */
export function floorFrictionAir(friction: number): number {
  return 0.02 + friction * 0.25;
}

/** Một món đồ trong nhà: thân vật lý Matter + phần hình ảnh vẽ riêng (nội suy giữa hai bước logic). */
export class Item {
  private static nextUid = 1;

  readonly uid = Item.nextUid++;
  readonly body: MatterJS.BodyType;
  /** Điểm nắm theo tọa độ của món đồ (chưa xoay). */
  readonly grabPoints: readonly Vec[];
  durability: number;
  broken = false;

  protected readonly view: Phaser.GameObjects.Container;
  protected readonly image: Phaser.GameObjects.Image;
  private readonly icon: Phaser.GameObjects.Text | null;
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
    const options: Phaser.Types.Physics.Matter.MatterBodyConfig = {
      label: 'item',
      angle,
      friction: 0.05,
      frictionAir: floorFrictionAir(def.friction),
      restitution: def.restitution ?? 0.2,
    };
    this.body =
      def.shape === 'circle'
        ? scene.matter.add.circle(x, y, w / 2, options)
        : scene.matter.add.rectangle(x, y, w, h, options);
    scene.matter.body.setMass(this.body, def.mass * KG_TO_MASS);
    this.grabPoints = resolveGrabPoints(def);
    this.durability = def.durability;
    this.prevPos = { x, y };
    this.prevAngle = angle;

    this.image = scene.add.image(0, 0, ensureItemTexture(scene, def));
    const iconSize = Phaser.Math.Clamp(Math.min(w, h) * 0.6, 10, 40);
    this.icon = def.icon
      ? scene.add.text(0, 0, def.icon, { fontSize: `${iconSize}px` }).setOrigin(0.5)
      : null;
    this.view = scene.add.container(x, y, this.icon ? [this.image, this.icon] : [this.image]);
    this.view.setRotation(angle).setDepth(y);
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

  /** Gọi đầu mỗi bước logic để lưu vị trí cũ cho nội suy. */
  beforeStep(): void {
    this.prevPos = this.position;
    this.prevAngle = this.body.angle;
  }

  render(alpha: number): void {
    const p = this.position;
    const x = Phaser.Math.Linear(this.prevPos.x, p.x, alpha);
    const y = Phaser.Math.Linear(this.prevPos.y, p.y, alpha);
    this.view
      .setPosition(x, y)
      .setRotation(this.prevAngle + (this.body.angle - this.prevAngle) * alpha)
      .setDepth(y);
  }

  destroy(): void {
    this.scene.matter.world.remove(this.body);
    this.view.destroy();
  }
}
