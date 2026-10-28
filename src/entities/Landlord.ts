import Phaser from 'phaser';
import type { LandlordDef } from '../data/types';
import { moodFace } from '../systems/dialogue';
import { dist, type Vec } from '../systems/geometry';
import { Theme } from '../ui/theme';

const RADIUS = 22;
const SPEED = 1.3;
const BUBBLE_MS = 3200;
const BUBBLE_WIDTH = 240;
/** Đi mãi mà trong khoảng này không nhích được bao nhiêu thì coi là kẹt (bị đồ chắn). */
const STUCK_CHECK_MS = 1500;
const STUCK_MIN_MOVE = 12;

/**
 * Chủ nhà: đi tuần theo đường vẽ trong bản đồ, dừng lại nhìn ngó, hay đứng chắn lối.
 * Thân nặng nên người chơi khó đẩy. Nói bằng bong bóng thoại.
 */
export class Landlord {
  readonly body: MatterJS.BodyType;
  satisfaction: number;
  /** Câu đang nói (để debug/kiểm thử). */
  line = '';
  private target = 0;
  private waitMs = 0;
  private bubbleMs = 0;
  private stuckMs = 0;
  private stuckFrom: Vec;
  private prevPos: Vec;
  private readonly view: Phaser.GameObjects.Container;
  private readonly mood: Phaser.GameObjects.Text;
  private readonly bubble: Phaser.GameObjects.Container;
  private readonly bubbleBg: Phaser.GameObjects.Graphics;
  private readonly bubbleText: Phaser.GameObjects.Text;

  constructor(
    private readonly scene: Phaser.Scene,
    readonly def: LandlordDef,
    private readonly path: readonly Vec[],
    start: Vec,
    private readonly random: () => number,
    name: string,
  ) {
    this.satisfaction = def.startSatisfaction;
    this.body = scene.matter.add.circle(start.x, start.y, RADIUS, {
      label: 'landlord',
      // Ma sát thấp để đi đúng tốc độ; vẫn nặng nên người chơi khó đẩy.
      frictionAir: 0.05,
      density: 0.006,
    });
    scene.matter.body.setInertia(this.body, Infinity);
    this.prevPos = { ...start };
    this.stuckFrom = { ...start };

    const color = def.color ? parseInt(def.color.slice(1), 16) : 0xb39ddb;
    const dark = Phaser.Display.Color.IntegerToColor(color).darken(35).color;
    const disc = scene.add.circle(0, 0, RADIUS, color).setStrokeStyle(3, dark);
    const icon = scene.add.text(0, 2, def.icon ?? '🧓', { fontSize: '28px' }).setOrigin(0.5);
    const tag = scene.add
      .text(0, -RADIUS - 14, name, {
        fontFamily: Theme.font,
        fontSize: '14px',
        fontStyle: 'bold',
        color: '#ffffff',
        backgroundColor: Phaser.Display.Color.IntegerToColor(dark).rgba,
        padding: { x: 5, y: 1 },
      })
      .setOrigin(0.5);
    this.mood = scene.add
      .text(RADIUS - 2, -RADIUS + 2, moodFace(this.satisfaction), { fontSize: '18px' })
      .setOrigin(0.5);
    this.view = scene.add.container(start.x, start.y, [disc, icon, tag, this.mood]);

    this.bubbleBg = scene.add.graphics();
    this.bubbleText = scene.add
      .text(0, 0, '', {
        fontFamily: Theme.font,
        fontSize: '16px',
        color: '#1d1b26',
        wordWrap: { width: BUBBLE_WIDTH - 20 },
        align: 'center',
      })
      .setOrigin(0.5, 1);
    this.bubble = scene.add
      .container(0, 0, [this.bubbleBg, this.bubbleText])
      .setDepth(9_700)
      .setVisible(false);
    this.waitMs = 1000;
  }

  get position(): Vec {
    return { x: this.body.position.x, y: this.body.position.y };
  }

  say(text: string): void {
    this.line = text;
    this.bubbleMs = BUBBLE_MS;
    this.bubbleText.setText(text);
    const w = Math.min(BUBBLE_WIDTH, this.bubbleText.width + 20);
    const h = this.bubbleText.height + 14;
    this.bubbleBg
      .clear()
      .fillStyle(0xffffff, 0.96)
      .fillRoundedRect(-w / 2, -h - 6, w, h, 10)
      .fillTriangle(-8, -7, 8, -7, 0, 4)
      .lineStyle(2, 0x1d1b26, 0.8)
      .strokeRoundedRect(-w / 2, -h - 6, w, h, 10);
    this.bubbleText.setPosition(0, -13);
    this.bubble.setVisible(true);
  }

  /** Mỗi bước logic: đi tới điểm kế tiếp trên đường tuần, tới nơi thì đứng một lúc. */
  step(dt: number): void {
    this.prevPos = this.position;
    if (this.bubbleMs > 0) this.bubbleMs -= dt;
    const mb = this.scene.matter.body;
    if (this.path.length === 0) return;
    if (this.waitMs > 0) {
      this.waitMs -= dt;
      mb.setVelocity(this.body, { x: this.body.velocity.x * 0.8, y: this.body.velocity.y * 0.8 });
      return;
    }
    const goal = this.path[this.target]!;
    const d = dist(this.position, goal);
    if (d < 8) {
      this.nextWaypoint(1500 + this.random() * 2000);
      return;
    }
    // Bị đồ đạc chắn đường: bỏ qua điểm này, đi tiếp điểm sau.
    this.stuckMs += dt;
    if (this.stuckMs >= STUCK_CHECK_MS) {
      const moved = dist(this.position, this.stuckFrom);
      this.stuckMs = 0;
      this.stuckFrom = this.position;
      if (moved < STUCK_MIN_MOVE) {
        this.nextWaypoint(500);
        return;
      }
    }
    const v = {
      x: ((goal.x - this.position.x) / d) * SPEED,
      y: ((goal.y - this.position.y) / d) * SPEED,
    };
    const cur = this.body.velocity;
    mb.setVelocity(this.body, { x: cur.x + (v.x - cur.x) * 0.3, y: cur.y + (v.y - cur.y) * 0.3 });
  }

  private nextWaypoint(waitMs: number): void {
    this.target = (this.target + 1) % this.path.length;
    this.waitMs = waitMs;
    this.stuckMs = 0;
    this.stuckFrom = this.position;
  }

  /** Máy khách online: vị trí và độ hài lòng theo host. */
  applyRemote(x: number, y: number, satisfaction: number): void {
    this.prevPos = this.position;
    this.scene.matter.body.setPosition(this.body, { x, y }, false);
    this.satisfaction = satisfaction;
  }

  /** Máy khách: bong bóng thoại tự tắt theo thời gian (không có `step`). */
  tickBubble(dt: number): void {
    if (this.bubbleMs > 0) this.bubbleMs -= dt;
  }

  render(alpha: number): void {
    const p = this.position;
    const x = Phaser.Math.Linear(this.prevPos.x, p.x, alpha);
    const y = Phaser.Math.Linear(this.prevPos.y, p.y, alpha);
    this.view.setPosition(x, y).setDepth(y);
    this.mood.setText(moodFace(this.satisfaction));
    this.bubble.setPosition(x, y - RADIUS - 26).setVisible(this.bubbleMs > 0);
  }
}
