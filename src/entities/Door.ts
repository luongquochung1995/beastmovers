import Phaser from 'phaser';
import type { MapRect } from '../data/map';
import type { Vec } from '../systems/geometry';

/** Cửa mở tối đa (rad), khoảng 110°. */
const MAX_OPEN = 1.9;
/** Lực lò xo kéo cửa khép lại mỗi bước. */
const CLOSE_SPRING = 0.0015;

/**
 * Cánh cửa có bản lề: thân Matter nhẹ, ghim vào bản lề bằng constraint.
 * Người hay đồ đẩy vào thì cửa xoay mở, rồi tự khép lại từ từ.
 */
export class Door {
  readonly body: MatterJS.BodyType;
  readonly hinge: Vec;
  /** Tâm cánh cửa lúc đóng. */
  private readonly restCenter: Vec;
  private readonly view: Phaser.GameObjects.Rectangle;

  constructor(
    private readonly scene: Phaser.Scene,
    rect: MapRect,
    hingeAt: 'start' | 'end',
  ) {
    const cx = rect.x + rect.w / 2;
    const cy = rect.y + rect.h / 2;
    const vertical = rect.h >= rect.w;
    this.hinge = vertical
      ? { x: cx, y: hingeAt === 'start' ? rect.y : rect.y + rect.h }
      : { x: hingeAt === 'start' ? rect.x : rect.x + rect.w, y: cy };
    this.restCenter = { x: cx, y: cy };
    this.body = scene.matter.add.rectangle(cx, cy, rect.w, rect.h, {
      label: 'door',
      frictionAir: 0.08,
      friction: 0.05,
      density: 0.0008,
    });
    scene.matter.add.worldConstraint(this.body, 0, 1, {
      pointA: { x: this.hinge.x, y: this.hinge.y },
      pointB: { x: this.hinge.x - cx, y: this.hinge.y - cy },
      label: 'hinge',
    });
    this.view = scene.add
      .rectangle(cx, cy, rect.w, rect.h, 0x8d6e63)
      .setStrokeStyle(2, 0x4e342e)
      .setDepth(-400);
    scene.add.circle(this.hinge.x, this.hinge.y, 4, 0x4e342e).setDepth(-399);
  }

  /** Máy khách online: xoay cửa quanh bản lề tới góc host báo. */
  applyRemote(angle: number): void {
    const mb = this.scene.matter.body;
    const c = this.restCenter;
    const off = { x: c.x - this.hinge.x, y: c.y - this.hinge.y };
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    mb.setAngle(this.body, angle, false);
    mb.setPosition(
      this.body,
      { x: this.hinge.x + off.x * cos - off.y * sin, y: this.hinge.y + off.x * sin + off.y * cos },
      false,
    );
  }

  get angle(): number {
    return this.body.angle;
  }

  /** Mỗi bước logic: lò xo khép cửa, giới hạn góc mở. */
  step(): void {
    const mb = this.scene.matter.body;
    const a = this.body.angle;
    mb.setAngularVelocity(this.body, this.body.angularVelocity - a * CLOSE_SPRING);
    if (Math.abs(a) > MAX_OPEN) {
      mb.setAngle(this.body, Math.sign(a) * MAX_OPEN, false);
      mb.setAngularVelocity(this.body, 0);
    }
  }

  render(): void {
    this.view.setPosition(this.body.position.x, this.body.position.y).setRotation(this.body.angle);
  }
}
