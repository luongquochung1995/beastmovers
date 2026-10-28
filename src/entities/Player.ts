import Phaser from 'phaser';
import { Btn, frameAxis, type InputFrame, justPressed } from '../systems/input/InputFrame';
import {
  createMotorState,
  knockDown,
  type MotorEvent,
  type MotorParams,
  type MotorState,
  stepMotor,
  type Vec,
} from '../systems/PlayerMotor';
import { t } from '../data/i18n';
import { Theme } from '../ui/theme';
import { PLAYER_RADIUS, PLAYER_STYLES, playerTextureKey } from './playerStyles';

/**
 * Nhân vật: thân vật lý Matter (hình tròn, không xoay) + phần hình ảnh vẽ riêng.
 * Hình ảnh được nội suy giữa hai bước logic nên vẫn mượt khi FPS khác 60.
 */
export class Player {
  readonly body: MatterJS.BodyType;
  motor: MotorState = createMotorState();
  private readonly view: Phaser.GameObjects.Container;
  private readonly sprite: Phaser.GameObjects.Image;
  private readonly eyes: Phaser.GameObjects.Graphics;
  private readonly label: Phaser.GameObjects.Text;
  private prevPos: Vec;
  private wobble = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    readonly slotIndex: number,
    readonly styleIndex: number,
    readonly name: string,
    x: number,
    y: number,
    private readonly params: MotorParams,
    private readonly random: () => number,
  ) {
    this.body = scene.matter.add.circle(x, y, PLAYER_RADIUS, {
      label: 'player',
      friction: 0,
      frictionAir: 0,
      restitution: 0.3,
      density: 0.004,
    });
    scene.matter.body.setInertia(this.body, Infinity); // không xoay
    this.prevPos = { x, y };

    const style = PLAYER_STYLES[styleIndex]!;
    this.sprite = scene.add.image(0, 0, playerTextureKey(styleIndex));
    this.eyes = scene.add.graphics();
    this.label = scene.add
      .text(0, -PLAYER_RADIUS - 16, name, {
        fontFamily: Theme.font,
        fontSize: '15px',
        fontStyle: 'bold',
        color: '#ffffff',
        backgroundColor: Phaser.Display.Color.IntegerToColor(style.color).darken(25).rgba,
        padding: { x: 5, y: 1 },
      })
      .setOrigin(0.5);
    this.view = scene.add.container(x, y, [this.sprite, this.eyes, this.label]).setDepth(y);
  }

  get position(): Vec {
    return { x: this.body.position.x, y: this.body.position.y };
  }

  /**
   * Chạy mỗi bước logic, trước `world.step`. Đang khiêng đồ thì không lao được,
   * và vận tốc sẽ bị bộ điều khiển khiêng ghi đè sau đó.
   */
  fixedUpdate(
    prev: InputFrame,
    cur: InputFrame,
    dtMs: number,
    carrying = false,
    /** Thông số di chuyển riêng cho bước này (vd. đang đứng trên vũng nước thì trơn hơn). */
    params: MotorParams = this.params,
  ): MotorEvent[] {
    this.prevPos = this.position;
    const result = stepMotor(
      this.motor,
      { move: frameAxis(cur), dashPressed: justPressed(prev, cur, Btn.Dash), carrying },
      this.body.velocity,
      dtMs,
      params,
      this.random,
    );
    this.motor = result.state;
    this.scene.matter.body.setVelocity(this.body, result.velocity);
    for (const e of result.events) this.onEvent(e);
    return result.events;
  }

  /** Vào nhóm va chạm của món đồ đang nắm (để không va vào nó), hoặc 0 để trở lại bình thường. */
  setCollisionGroup(group: number): void {
    this.body.collisionFilter.group = group;
  }

  setVelocity(v: Vec): void {
    this.scene.matter.body.setVelocity(this.body, v);
  }

  knockDown(): void {
    if (this.motor.mode === 'fallen') return;
    this.motor = knockDown(this.motor);
    this.popText(t('player.ouch'));
  }

  /** Vẽ, gọi mỗi khung hình. `alpha` là vị trí giữa bước logic trước và bước kế tiếp. */
  render(alpha: number, dtMs: number): void {
    const p = this.position;
    const x = Phaser.Math.Linear(this.prevPos.x, p.x, alpha);
    const y = Phaser.Math.Linear(this.prevPos.y, p.y, alpha);
    this.view.setPosition(x, y).setDepth(y);

    const m = this.motor;
    this.eyes.clear();
    if (m.mode === 'fallen') {
      // Nằm bẹp, xám đi, mắt chữ x.
      this.sprite.setAngle(0).setScale(1.25, 0.7).setTint(0xb0b0b0);
      this.eyes.lineStyle(2.5, 0x1d1b26, 1);
      for (const s of [-1, 1]) {
        const cx = s * 7;
        const cy = -3;
        this.eyes.lineBetween(cx - 3, cy - 3, cx + 3, cy + 3);
        this.eyes.lineBetween(cx - 3, cy + 3, cx + 3, cy - 3);
      }
      return;
    }
    this.sprite.clearTint();

    const speed = Math.hypot(this.body.velocity.x, this.body.velocity.y);
    this.wobble += dtMs * (m.running ? 0.025 : 0.016) * Math.min(1, speed);
    const amp = m.mode === 'dashing' ? 0 : m.running ? 12 : 7;
    const bob = speed > 0.2 ? Math.sin(this.wobble) : 0;
    this.sprite
      .setAngle(bob * amp)
      .setScale(
        m.mode === 'dashing' ? 1.15 : 1,
        m.mode === 'dashing' ? 0.85 : 1 + Math.abs(bob) * 0.04,
      );

    // Mắt nhìn theo hướng đi.
    const ex = m.facing.x * 7;
    const ey = m.facing.y * 6 - 5;
    const side = { x: -m.facing.y, y: m.facing.x };
    for (const s of [-1, 1]) {
      const px = ex + side.x * 6 * s;
      const py = ey + side.y * 4 * s;
      this.eyes.fillStyle(0xffffff, 1).fillCircle(px, py, 4.5);
      this.eyes
        .fillStyle(0x1d1b26, 1)
        .fillCircle(px + m.facing.x * 1.5, py + m.facing.y * 1.5, 2.2);
    }
  }

  private onEvent(e: MotorEvent): void {
    if (e === 'tripped') this.popText(t('player.trip'));
  }

  popText(text: string): void {
    const t = this.scene.add
      .text(this.view.x, this.view.y - PLAYER_RADIUS - 30, text, {
        fontFamily: Theme.font,
        fontSize: '18px',
        fontStyle: 'bold',
        color: Theme.accent,
        stroke: '#000000',
        strokeThickness: 4,
      })
      .setOrigin(0.5)
      .setDepth(9_000);
    this.scene.tweens.add({
      targets: t,
      y: t.y - 30,
      alpha: 0,
      duration: 900,
      onComplete: () => t.destroy(),
    });
  }

  destroy(): void {
    this.scene.matter.world.remove(this.body);
    this.view.destroy();
  }
}
