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
import { popText } from '../ui/popText';
import { Theme } from '../ui/theme';
import {
  drawEar,
  drawEye,
  HEAD_OFFSET_Y,
  HEAD_R,
  PLAYER_ORIGIN,
  PLAYER_RADIUS,
  PLAYER_STYLES,
  playerBodyTextureKey,
} from './playerStyles';

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
  /** Hướng nhìn ngang gần nhất (1 phải, -1 trái) để vẽ mặt nghiêng khi đi lên/xuống. */
  private side = 1;
  private readonly label: Phaser.GameObjects.Text;
  private readonly labelY: number;
  /** Chiều cao món đồ đang đỡ trên đầu (0: không đỡ gì) — tên nâng lên trên món đồ. */
  carryLift = 0;
  /** Máy khách online: uid món đang nắm theo host (-1: không). */
  remoteHold = -1;
  /** Thanh mana dưới chân (ẩn khi đầy). */
  private readonly manaBar: Phaser.GameObjects.Graphics;
  /** Còn bao lâu thanh mana nháy đỏ (vừa bấm Lao mà không đủ mana). */
  private manaFlashMs = 0;
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
    /** Mũ (emoji) chọn trong lobby online, '' = không đội. */
    hat = '',
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
    this.sprite = scene.add
      .image(0, 0, playerBodyTextureKey(styleIndex))
      .setOrigin(PLAYER_ORIGIN.x, PLAYER_ORIGIN.y);
    this.eyes = scene.add.graphics();
    this.labelY = HEAD_OFFSET_Y - HEAD_R - (hat ? 26 : 12);
    this.label = scene.add
      .text(0, this.labelY, name, {
        fontFamily: Theme.font,
        fontSize: '15px',
        fontStyle: 'bold',
        color: '#ffffff',
        backgroundColor: Phaser.Display.Color.IntegerToColor(style.color).darken(25).rgba,
        padding: { x: 5, y: 1 },
      })
      .setOrigin(0.5);
    this.manaBar = scene.add.graphics();
    const parts: Phaser.GameObjects.GameObject[] = [
      this.sprite,
      this.eyes,
      this.manaBar,
      this.label,
    ];
    if (hat) {
      parts.push(
        scene.add
          .text(0, HEAD_OFFSET_Y - HEAD_R + 6, hat, { fontSize: '22px' })
          .setOrigin(0.5, 0.8),
      );
    }
    this.view = scene.add.container(x, y, parts).setDepth(y);
  }

  get position(): Vec {
    return { x: this.body.position.x, y: this.body.position.y };
  }

  /** Vị trí đang vẽ (đã nội suy). */
  get viewPosition(): Vec {
    return { x: this.view.x, y: this.view.y };
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
    this.popText({ key: 'player.ouch' });
  }

  /** Vẽ, gọi mỗi khung hình. `alpha` là vị trí giữa bước logic trước và bước kế tiếp. */
  render(alpha: number, dtMs: number): void {
    const p = this.position;
    const x = Phaser.Math.Linear(this.prevPos.x, p.x, alpha);
    const y = Phaser.Math.Linear(this.prevPos.y, p.y, alpha);
    this.view.setPosition(x, y).setDepth(y);

    this.label.setY(this.labelY - this.carryLift);
    const m = this.motor;
    this.drawManaBar(dtMs);
    this.eyes.clear();
    const hy = HEAD_OFFSET_Y;
    if (m.mode === 'fallen') {
      // Nằm bẹp, xám đi, mắt chữ x.
      this.sprite.setAngle(0).setScale(1.2, 0.75).setTint(0xb0b0b0);
      this.eyes.lineStyle(3, 0x16120f, 1);
      for (const sx of [-1, 1]) {
        const cx = sx * 6;
        const cy = hy * 0.75;
        this.eyes.lineBetween(cx - 3, cy - 3, cx + 3, cy + 3);
        this.eyes.lineBetween(cx - 3, cy + 3, cx + 3, cy - 3);
      }
      return;
    }
    this.sprite.clearTint();

    const speed = Math.hypot(this.body.velocity.x, this.body.velocity.y);
    this.wobble += dtMs * (m.running ? 0.025 : 0.016) * Math.min(1, speed);
    const amp = m.mode === 'dashing' ? 0 : m.running ? 10 : 6;
    const bob = speed > 0.2 ? Math.sin(this.wobble) : 0;
    const angle = bob * amp;
    this.sprite
      .setAngle(angle)
      .setScale(
        m.mode === 'dashing' ? 1.12 : 1,
        m.mode === 'dashing' ? 0.88 : 1 + Math.abs(bob) * 0.04,
      );
    this.eyes.setAngle(angle);

    // Nhìn nghiêng theo hướng đi (tai phía sau, mắt phía trước); đi lên thì thấy gáy.
    const f = m.facing;
    if (Math.abs(f.x) > 0.35) this.side = f.x > 0 ? 1 : -1;
    const away = f.y < -0.6 && Math.abs(f.x) < 0.5;
    const front = f.y > 0.6 && Math.abs(f.x) < 0.5;
    if (front || away) {
      for (const sx of [-1, 1]) drawEar(this.eyes, sx * (HEAD_R - 1), hy + 2);
      if (front) for (const sx of [-1, 1]) drawEye(this.eyes, sx * 5, hy + 1);
      return;
    }
    const sd = this.side;
    drawEar(this.eyes, -sd * (HEAD_R - 1), hy + 2);
    const ey = hy + f.y * 4;
    drawEye(this.eyes, sd * 4, ey);
    drawEye(this.eyes, sd * 11, ey, 9);
  }

  private onEvent(e: MotorEvent): void {
    if (e === 'tripped') this.popText({ key: 'player.trip' });
    if (e === 'noMana') {
      this.manaFlashMs = 450;
      this.popText('💤');
    }
  }

  /**
   * Thanh mana dưới chân: chỉ hiện khi chưa đầy (hoặc đang nháy đỏ vì thiếu mana). Vạch trắng
   * là mức đủ cho một lần lao.
   */
  private drawManaBar(dtMs: number): void {
    const g = this.manaBar.clear();
    const { maxMana, dashManaCost } = this.params;
    const mana = this.motor.mana;
    this.manaFlashMs = Math.max(0, this.manaFlashMs - dtMs);
    if (mana >= maxMana - 0.01 && this.manaFlashMs <= 0) return;
    const w = 34;
    const h = 5;
    const x = -w / 2;
    const y = PLAYER_RADIUS + 1;
    const flash = this.manaFlashMs > 0 && Math.floor(this.manaFlashMs / 90) % 2 === 0;
    g.fillStyle(0x16120f, 0.85).fillRoundedRect(x - 1, y - 1, w + 2, h + 2, 3);
    const k = Math.max(0, Math.min(1, mana / maxMana));
    const enough = mana >= dashManaCost;
    g.fillStyle(flash ? 0xff5a5a : enough ? 0x4fc3f7 : 0x2f6f8f, 1).fillRoundedRect(
      x,
      y,
      w * k,
      h,
      2,
    );
    const tick = x + (w * dashManaCost) / maxMana;
    g.fillStyle(0xffffff, 0.8).fillRect(tick - 0.5, y - 1, 1, h + 2);
  }

  /**
   * Máy khách online: đặt vị trí, vận tốc (cho hoạt ảnh lắc lư) và trạng thái theo host
   * (hoặc theo dự đoán của máy này). Vẽ đúng chỗ này, không nội suy thêm.
   */
  applyRemote(s: {
    x: number;
    y: number;
    vx: number;
    vy: number;
    fx: number;
    fy: number;
    mode: MotorState['mode'];
    run: boolean;
    mana: number;
  }): void {
    const mb = this.scene.matter.body;
    mb.setVelocity(this.body, { x: s.vx, y: s.vy });
    mb.setPosition(this.body, { x: s.x, y: s.y }, false);
    this.prevPos = { x: s.x, y: s.y };
    this.motor = {
      ...this.motor,
      mode: s.mode,
      running: s.run,
      facing: { x: s.fx, y: s.fy },
      mana: s.mana,
    };
  }

  /** Đổi tên hiện trên đầu (người chơi tự đặt tên khi đang chơi). */
  setName(name: string): void {
    this.label.setText(name);
  }

  /** Máy khách: đứng yên ở vị trí hiện tại (không nội suy tiếp). */
  settle(): void {
    this.prevPos = this.position;
  }

  /** Chữ nổi trên đầu; trong màn chơi đi qua `world.fx` (để máy khách online cũng thấy). */
  onPop: ((text: string | { key: string }) => void) | null = null;

  popText(text: string | { key: string }): void {
    if (this.onPop) this.onPop(text);
    else {
      const s = typeof text === 'string' ? text : t(text.key);
      popText(this.scene, this.view.x, this.view.y - PLAYER_RADIUS - 30, s);
    }
  }

  destroy(): void {
    this.scene.matter.world.remove(this.body);
    this.view.destroy();
  }
}
