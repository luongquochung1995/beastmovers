import Phaser from 'phaser';
import { PLAYER_STYLES, playerTextureKey } from '../entities/playerStyles';
import { t, tText } from '../data/i18n';
import { Btn, type BtnName, frameAxis, isDown } from '../systems/input/InputFrame';
import type { InputManager } from '../systems/input/InputManager';
import { GAME_HEIGHT, GAME_WIDTH, Theme } from '../ui/theme';
import { RegistryKeys, SceneKeys } from './keys';

const BUTTON_LABELS: [BtnName, string][] = [
  ['Grab', 'button.grab'],
  ['Throw', 'button.throw'],
  ['Dash', 'button.dash'],
  ['Ping', 'button.ping'],
  ['Start', 'button.start'],
];

interface Panel {
  title: Phaser.GameObjects.Text;
  source: Phaser.GameObjects.Text;
  stick: Phaser.GameObjects.Graphics;
  buttons: Phaser.GameObjects.Text[];
  avatar: Phaser.GameObjects.Image;
}

/** Màn thử điều khiển: hiện trạng thái input của từng người chơi trên máy. */
export class InputTestScene extends Phaser.Scene {
  private input$!: InputManager;
  private panels: Panel[] = [];
  private sourcesText!: Phaser.GameObjects.Text;

  constructor() {
    super(SceneKeys.InputTest);
  }

  create(): void {
    this.input$ = this.registry.get(RegistryKeys.Input) as InputManager;
    this.cameras.main.setBackgroundColor(Theme.bg);
    this.panels = [];

    this.add
      .text(GAME_WIDTH / 2, 50, t('inputTest.title'), {
        fontFamily: Theme.font,
        fontSize: '40px',
        fontStyle: 'bold',
        color: Theme.accent,
      })
      .setOrigin(0.5);
    this.add
      .text(GAME_WIDTH / 2, 100, t('inputTest.joinHint'), {
        fontFamily: Theme.font,
        fontSize: '18px',
        color: Theme.text,
      })
      .setOrigin(0.5);

    const w = 280;
    const gap = 20;
    const left = (GAME_WIDTH - (w * 4 + gap * 3)) / 2;
    for (let i = 0; i < this.input$.slots.length; i++) {
      const x = left + i * (w + gap);
      const y = 140;
      this.add.rectangle(x, y, w, 420, 0x2b2838).setOrigin(0).setStrokeStyle(2, 0x3a3550);
      const title = this.add.text(x + w / 2, y + 20, t('inputTest.player', { n: i + 1 }), {
        fontFamily: Theme.font,
        fontSize: '22px',
        fontStyle: 'bold',
        color: Theme.text,
      });
      title.setOrigin(0.5, 0);
      const avatar = this.add.image(x + w / 2, y + 90, playerTextureKey(i)).setScale(1.4);
      const source = this.add
        .text(x + w / 2, y + 130, '', {
          fontFamily: Theme.font,
          fontSize: '16px',
          color: Theme.muted,
        })
        .setOrigin(0.5, 0);
      const stick = this.add.graphics({ x: x + w / 2, y: y + 230 });
      const buttons = BUTTON_LABELS.map(([, labelKey], b) =>
        this.add.text(x + 20 + (b % 3) * 82, y + 310 + Math.floor(b / 3) * 44, t(labelKey), {
          fontFamily: Theme.font,
          fontSize: '16px',
          color: Theme.text,
          backgroundColor: '#3a3550',
          padding: { x: 10, y: 6 },
          fixedWidth: 74,
          align: 'center',
        }),
      );
      this.panels.push({ title, source, stick, buttons, avatar });
    }

    this.sourcesText = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT - 70, '', {
        fontFamily: Theme.font,
        fontSize: '16px',
        color: Theme.muted,
      })
      .setOrigin(0.5);
    this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT - 35, t('inputTest.footer'), {
        fontFamily: Theme.font,
        fontSize: '16px',
        color: Theme.muted,
      })
      .setOrigin(0.5);

    this.input.keyboard?.once('keydown-ESC', () => this.scene.start(SceneKeys.Menu));
    this.input.keyboard?.on('keydown-DELETE', () =>
      this.input$.slots.forEach((_, i) => this.input$.leave(i)),
    );
  }

  override update(): void {
    this.input$.poll(true);
    this.input$.slots.forEach((slot, i) => {
      const panel = this.panels[i]!;
      const style = PLAYER_STYLES[i]!;
      panel.avatar.setAlpha(slot ? 1 : 0.25);
      panel.stick.clear();
      panel.stick.lineStyle(2, 0x5a5470).strokeCircle(0, 0, 50);
      if (!slot) {
        panel.source.setText(t('inputTest.notJoined')).setColor(Theme.muted);
        panel.buttons.forEach((b) => b.setAlpha(0.3).setBackgroundColor('#3a3550'));
        return;
      }
      panel.source
        .setText(
          [t(style.nameKey), tText(slot.source.label)].join(' · ') +
            (slot.connected ? '' : ` ${t('inputTest.disconnected')}`),
        )
        .setColor(slot.connected ? Theme.text : '#ff6b6b');
      const { x, y } = frameAxis(slot.cur);
      panel.stick.fillStyle(style.color).fillCircle(x * 50, y * 50, 12);
      BUTTON_LABELS.forEach(([name], b) => {
        const down = isDown(slot.cur, Btn[name]);
        panel.buttons[b]!.setAlpha(1).setBackgroundColor(down ? '#ffb347' : '#3a3550');
      });
    });
    const free = this.input$
      .allSources()
      .filter((s) => s.isConnected() && !this.input$.slots.some((slot) => slot?.source === s))
      .map((s) => tText(s.label));
    this.sourcesText.setText(
      free.length
        ? t('inputTest.freeSources', { list: free.join(' · ') })
        : t('inputTest.allJoined'),
    );
  }
}
