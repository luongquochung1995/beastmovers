import Phaser from 'phaser';
import { getLocale, t } from '../data/i18n';
import type { LevelRuntime } from '../sim/LevelRuntime';
import type { World } from '../sim/World';
import { moodFace } from '../systems/dialogue';
import { formatClock, TIME_LOW_MS } from '../systems/levelClock';
import { GAME_HEIGHT, GAME_WIDTH, Theme } from './theme';

const PANEL = 0x24212f;
const PANEL_ALPHA = 0.88;
const GOOD = '#7CFC8A';
const BAD = '#ff8a80';
const BAR_W = 190;
const OBJECTIVE_MS = 7000;

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
  private shownMs = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly runtime: LevelRuntime,
    private readonly world: World,
  ) {
    const text = (
      x: number,
      y: number,
      s: string,
      style: Phaser.Types.GameObjects.Text.TextStyle,
    ) => scene.add.text(x, y, s, { fontFamily: Theme.font, color: Theme.text, ...style });

    // Thanh trên cùng
    scene.add.rectangle(0, 0, GAME_WIDTH, 56, PANEL, PANEL_ALPHA).setOrigin(0);

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
    this.objective = scene.add.container(GAME_WIDTH / 2, GAME_HEIGHT * 0.32, [bg, msg]);
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

    // Dòng mục tiêu: hiện vài giây đầu màn rồi mờ dần.
    this.shownMs += frameMs;
    const a = Phaser.Math.Clamp((OBJECTIVE_MS - this.shownMs) / 800, 0, 1);
    this.objective.setAlpha(a).setVisible(a > 0);
  }
}
