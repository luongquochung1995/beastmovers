import Phaser from 'phaser';
import { getLocale, t } from '../data/i18n';
import { PLAYER_STYLES } from '../entities/playerStyles';
import type { LevelRuntime } from '../sim/LevelRuntime';
import { edgeIndicator } from '../systems/cameraFit';
import { PING_ICONS } from '../systems/ping';
import type { World } from '../sim/World';
import { moodFace } from '../systems/dialogue';
import { formatClock, TIME_LOW_MS } from '../systems/levelClock';
import type { Vec } from '../systems/geometry';
import { Tutorial } from '../systems/tutorial';
import { GAME_HEIGHT, GAME_WIDTH, Theme } from './theme';

const PANEL = 0x24212f;
const PANEL_ALPHA = 0.88;
const GOOD = '#7CFC8A';
const BAD = '#ff8a80';
const BAR_W = 190;
const OBJECTIVE_MS = 7000;
/** Chiều cao thanh HUD trên cùng (px màn hình). */
export const HUD_TOP = 56;
const ARROW_MARGIN = 28;
/** Đi xa chỗ xuất hiện hơn mức này thì tính là đã biết di chuyển (bước hướng dẫn `move`). */
const TUTORIAL_MOVE_PX = 80;

/** Màu thanh hài lòng: đỏ → vàng → xanh. */
function satisfactionColor(v: number): number {
  if (v < 30) return 0xff6b6b;
  if (v < 60) return 0xffd54f;
  return 0x7cfc8a;
}

/**
 * HUD của màn chơi (vẽ trong HudScene): đồng hồ, độ hài lòng của chủ nhà, sức chứa xe,
 * danh sách đồ bắt buộc, dòng mục tiêu đầu màn.
 */
export class GameHud {
  private readonly timer: Phaser.GameObjects.Text;
  private readonly face: Phaser.GameObjects.Text;
  private readonly satBar: Phaser.GameObjects.Rectangle;
  private readonly satText: Phaser.GameObjects.Text;
  private readonly truckText: Phaser.GameObjects.Text;
  private readonly truckBar: Phaser.GameObjects.Rectangle;
  private readonly reqTitle: Phaser.GameObjects.Text;
  private readonly reqPanel: Phaser.GameObjects.Rectangle;
  private reqRows: Phaser.GameObjects.Text[] = [];
  private readonly objective: Phaser.GameObjects.Container;
  private readonly objectiveBg: Phaser.GameObjects.Rectangle;
  private readonly objectiveText: Phaser.GameObjects.Text;
  /** Hướng dẫn từng bước (màn có `tutorial`); null khi không có hoặc đã xong. */
  private tutorial: Tutorial | null = null;
  private readonly startPos = new Map<number, Vec>();
  private readonly arrows: Phaser.GameObjects.Graphics;
  private readonly arrowLabels: Phaser.GameObjects.Text[] = [];
  private shownMs = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly runtime: LevelRuntime,
    private readonly world: World,
    private readonly camera: Phaser.Cameras.Scene2D.Camera,
  ) {
    const text = (
      x: number,
      y: number,
      s: string,
      style: Phaser.Types.GameObjects.Text.TextStyle,
    ) => scene.add.text(x, y, s, { fontFamily: Theme.font, color: Theme.text, ...style });

    // Thanh trên cùng
    scene.add.rectangle(0, 0, GAME_WIDTH, HUD_TOP, PANEL, PANEL_ALPHA).setOrigin(0);
    this.arrows = scene.add.graphics().setDepth(100);

    // Trái: chủ nhà
    const ll = runtime.landlord;
    this.face = text(14, 8, moodFace(ll.satisfaction), { fontSize: '30px' });
    text(56, 7, ll.def.name[getLocale()], { fontSize: '14px', color: Theme.muted });
    scene.add.rectangle(56, 30, BAR_W, 14, 0x3a3550).setOrigin(0);
    this.satBar = scene.add.rectangle(56, 30, BAR_W, 14, 0x7cfc8a).setOrigin(0);
    this.satText = text(56 + BAR_W + 8, 26, '', { fontSize: '15px', fontStyle: 'bold' });

    // Giữa: đồng hồ
    this.timer = text(GAME_WIDTH / 2, 28, '', { fontSize: '34px', fontStyle: 'bold' }).setOrigin(
      0.5,
    );

    // Phải: xe tải
    const tx = GAME_WIDTH - 14 - BAR_W;
    this.truckText = text(tx, 7, '', { fontSize: '14px', color: Theme.muted });
    scene.add.rectangle(tx, 30, BAR_W, 14, 0x3a3550).setOrigin(0);
    this.truckBar = scene.add.rectangle(tx, 30, BAR_W, 14, 0xffb347).setOrigin(0);

    // Danh sách đồ bắt buộc
    this.reqPanel = scene.add.rectangle(10, 66, 250, 40, PANEL, PANEL_ALPHA).setOrigin(0);
    this.reqTitle = text(20, 72, t('hud.required'), {
      fontSize: '14px',
      fontStyle: 'bold',
      color: Theme.accent,
    });

    // Mục tiêu đầu màn
    const msg = text(0, 0, t('hud.objective'), {
      fontSize: '22px',
      fontStyle: 'bold',
      align: 'center',
      wordWrap: { width: 640 },
    }).setOrigin(0.5);
    const bg = scene.add
      .rectangle(0, 0, msg.width + 40, msg.height + 24, 0x000000, 0.7)
      .setStrokeStyle(2, 0xffb347);
    // Đặt gần đáy màn hình để không che người chơi (camera luôn đặt người chơi ở giữa).
    this.objective = scene.add.container(GAME_WIDTH / 2, GAME_HEIGHT - 90, [bg, msg]);
    this.objectiveBg = bg;
    this.objectiveText = msg;

    const steps = runtime.built.level.tutorial;
    if (steps) {
      this.tutorial = new Tutorial(steps);
      world.bus.onAny((e) => this.advanceTutorial(e.type));
      this.showStep();
    }
  }

  private setBanner(s: string): void {
    this.objectiveText.setText(s);
    this.objectiveBg.setSize(this.objectiveText.width + 40, this.objectiveText.height + 24);
  }

  private showStep(): void {
    const tut = this.tutorial!;
    const step = tut.current;
    if (!step) {
      // Xong hướng dẫn: nhắc mục tiêu của màn rồi mờ dần như thường.
      this.tutorial = null;
      this.shownMs = 0;
      this.setBanner(`${t('tutorial.done')}
${t('hud.objective')}`);
      return;
    }
    this.setBanner(`${tut.index + 1}/${tut.steps.length} · ${t(step.text)}`);
    this.scene.tweens.add({ targets: this.objective, scale: { from: 1.12, to: 1 }, duration: 220 });
  }

  private advanceTutorial(what: string): void {
    if (this.tutorial?.trigger(what)) this.showStep();
  }

  /** Người chơi ở ngoài khung hình: mũi tên màu ở mép màn hình chỉ về phía họ. */
  private drawOffscreenArrows(): void {
    const g = this.arrows.clear();
    const view = this.camera.worldView;
    const zoom = this.camera.zoom;
    const area = { x: 0, y: HUD_TOP, w: GAME_WIDTH, h: GAME_HEIGHT - HUD_TOP };
    let n = 0;
    // Người chơi, rồi các ping đang hiện (ping ở ngoài khung hình cũng có mũi tên).
    const targets = [
      ...this.world.players.map((p) => ({
        pos: p.position,
        style: p.styleIndex,
        label: `P${p.slotIndex + 1}`,
      })),
      ...this.world.pingLayer.markers.map((m) => ({
        pos: m.pos,
        style: m.style,
        label: PING_ICONS[m.kind],
      })),
    ];
    for (const target of targets) {
      const screen = { x: (target.pos.x - view.x) * zoom, y: (target.pos.y - view.y) * zoom };
      const ind = edgeIndicator(screen, area, ARROW_MARGIN);
      if (!ind) continue;
      const color = PLAYER_STYLES[target.style]!.color;
      const { x, y } = ind.pos;
      const a = ind.angle;
      const tip = { x: x + Math.cos(a) * 16, y: y + Math.sin(a) * 16 };
      const l = { x: x + Math.cos(a + 2.4) * 12, y: y + Math.sin(a + 2.4) * 12 };
      const r = { x: x + Math.cos(a - 2.4) * 12, y: y + Math.sin(a - 2.4) * 12 };
      g.fillStyle(color, 1).fillTriangle(tip.x, tip.y, l.x, l.y, r.x, r.y);
      g.lineStyle(2, 0x000000, 0.8).strokeTriangle(tip.x, tip.y, l.x, l.y, r.x, r.y);
      const label =
        this.arrowLabels[n] ??
        this.scene.add
          .text(0, 0, '', {
            fontFamily: Theme.font,
            fontSize: '13px',
            fontStyle: 'bold',
            color: '#ffffff',
            stroke: '#000000',
            strokeThickness: 3,
          })
          .setOrigin(0.5)
          .setDepth(101);
      this.arrowLabels[n] = label;
      label
        .setText(target.label)
        .setPosition(x - Math.cos(a) * 14, y - Math.sin(a) * 14)
        .setVisible(true);
      n++;
    }
    for (let i = n; i < this.arrowLabels.length; i++) this.arrowLabels[i]!.setVisible(false);
  }

  update(frameMs: number): void {
    const rt = this.runtime;

    // Đồng hồ
    const left = rt.clock.timeLeftMs;
    if (rt.locked) {
      this.timer.setText(t('hud.truckLeaving')).setColor(Theme.accent).setScale(1);
    } else {
      const low = left <= TIME_LOW_MS;
      this.timer.setText(formatClock(left)).setColor(low ? BAD : Theme.text);
      // Dưới 1 phút: nhịp đập theo từng giây.
      this.timer.setScale(
        low ? 1 + 0.08 * Math.max(0, Math.sin(((left % 1000) / 1000) * Math.PI)) : 1,
      );
    }

    // Chủ nhà
    const sat = rt.landlord.satisfaction;
    this.face.setText(moodFace(sat));
    this.satBar.setSize((BAR_W * sat) / 100, 14).setFillStyle(satisfactionColor(sat));
    this.satText.setText(`${Math.round(sat)}%`);

    // Xe tải
    const truck = this.world.truck;
    if (truck) {
      this.truckText.setText(t('hud.truck', { used: truck.used, capacity: truck.capacity }));
      this.truckBar.setSize(Math.min(1, truck.used / truck.capacity) * BAR_W, 14);
      this.truckBar.setFillStyle(truck.used >= truck.capacity ? 0xff6b6b : 0xffb347);
    }

    // Đồ bắt buộc
    const status = rt.requiredStatus();
    while (this.reqRows.length < status.length) {
      this.reqRows.push(
        this.scene.add.text(20, 0, '', {
          fontFamily: Theme.font,
          fontSize: '15px',
          color: Theme.text,
        }),
      );
    }
    while (this.reqRows.length > status.length) this.reqRows.pop()!.destroy();
    const locale = getLocale();
    status.forEach((s, i) => {
      const def = s.item.def;
      const need = def.requiredGrabbers > 1 ? `  👐${def.requiredGrabbers}` : '';
      const broken = s.item.broken ? ` (${t('hud.broken')})` : '';
      this.reqRows[i]!.setText(
        `${s.loaded ? '✓' : '○'} ${def.icon ?? ''} ${def.name[locale]}${need}${broken}`,
      )
        .setColor(s.loaded ? GOOD : s.item.broken ? BAD : Theme.text)
        .setPosition(20, 96 + i * 22);
    });
    const done = status.filter((s) => s.loaded).length;
    this.reqTitle.setText(`${t('hud.required')}  ${done}/${status.length}`);
    this.reqPanel.setSize(250, 36 + status.length * 22);

    this.drawOffscreenArrows();

    // Hướng dẫn: giữ dòng chữ tới khi làm xong bước đó.
    if (this.tutorial) {
      for (const p of this.world.players) {
        const start = this.startPos.get(p.slotIndex);
        if (!start) this.startPos.set(p.slotIndex, p.position);
        else if (Math.hypot(p.position.x - start.x, p.position.y - start.y) > TUTORIAL_MOVE_PX)
          this.advanceTutorial('move');
      }
      this.objective.setAlpha(1).setVisible(true);
      return;
    }
    // Dòng mục tiêu: hiện vài giây đầu màn rồi mờ dần.
    this.shownMs += frameMs;
    const a = Phaser.Math.Clamp((OBJECTIVE_MS - this.shownMs) / 800, 0, 1);
    this.objective.setAlpha(a).setVisible(a > 0);
  }
}
