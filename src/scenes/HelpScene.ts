import Phaser from 'phaser';
import { t } from '../data/i18n';
import { DEFAULT_LAYOUTS, KEYBOARD_LAYOUTS, keyLabel } from '../systems/input/keyboard';
import { MenuInput } from '../ui/menuInput';
import { GAME_HEIGHT, GAME_WIDTH, Theme } from '../ui/theme';
import { SceneKeys } from './keys';

/** Nút tay cầm (Xbox / PlayStation) cho từng hành động. */
const PAD_LABELS: Record<string, string> = {
  move: '🕹 / ✚',
  grab: 'A / ✕',
  throw: 'B / ○',
  dash: 'X / □',
  ping: 'Y / △',
  pause: 'Start',
};

/** Hướng dẫn: cách chơi và bảng điều khiển (theo phím đang dùng, kể cả phím đã đổi). */
export class HelpScene extends Phaser.Scene {
  constructor() {
    super(SceneKeys.Help);
  }

  create(): void {
    this.cameras.main.setBackgroundColor(Theme.bg);
    const text = (
      x: number,
      y: number,
      s: string,
      size: number,
      color: string = Theme.text,
      originX = 0.5,
    ) =>
      this.add
        .text(x, y, s, { fontFamily: Theme.font, fontSize: `${size}px`, color })
        .setOrigin(originX, 0.5);

    text(GAME_WIDTH / 2, 50, t('help.title'), 44, Theme.accent).setFontStyle('bold');

    // Bảng điều khiển.
    const cols = [400, 640, 900];
    const top = 120;
    const rowH = 40;
    const g = this.add.graphics();
    g.fillStyle(0x2b2838, 1).fillRoundedRect(60, top - 26, GAME_WIDTH - 120, rowH * 7 + 10, 12);
    text(
      cols[0]!,
      top,
      t('keys.player', { n: 1, layout: t(DEFAULT_LAYOUTS[0]!.nameKey) }),
      18,
      Theme.muted,
    );
    text(
      cols[1]!,
      top,
      t('keys.player', { n: 2, layout: t(DEFAULT_LAYOUTS[1]!.nameKey) }),
      18,
      Theme.muted,
    );
    text(cols[2]!, top, t('help.gamepad'), 18, Theme.muted);
    const keys = (codes: readonly string[]) => codes.map(keyLabel).join(' / ') || '—';
    const rows: [string, string, string][] = [
      ['move', move(0), move(1)],
      ...(['grab', 'throw', 'dash', 'ping'] as const).map(
        (a) =>
          [a, keys(KEYBOARD_LAYOUTS[0]![a]), keys(KEYBOARD_LAYOUTS[1]![a])] as [
            string,
            string,
            string,
          ],
      ),
      ['pause', 'Esc', 'Esc'],
    ];
    rows.forEach(([action, k1, k2], r) => {
      const y = top + rowH * (r + 1);
      text(110, y, t(`help.action.${action}`), 20, Theme.text, 0);
      text(cols[0]!, y, k1, 20, Theme.accent);
      text(cols[1]!, y, k2, 20, Theme.accent);
      text(cols[2]!, y, PAD_LABELS[action]!, 20, Theme.accent);
    });

    // Cách chơi.
    text(GAME_WIDTH / 2, top + rowH * 7 + 44, t('help.howTitle'), 26, Theme.accent).setFontStyle(
      'bold',
    );
    text(110, top + rowH * 7 + 150, t('help.how'), 19, Theme.text, 0).setLineSpacing(8);

    text(GAME_WIDTH / 2, GAME_HEIGHT - 26, t('help.back'), 16, Theme.muted);
    const back = () => this.scene.start(SceneKeys.Menu);
    new MenuInput(this, (a) => {
      if (a === 'back' || a === 'confirm') back();
    });
    this.input.on('pointerup', back);
  }
}

function move(layout: number): string {
  const l = KEYBOARD_LAYOUTS[layout]!;
  return [l.up, l.left, l.down, l.right].map((c) => keyLabel(c[0]!)).join(' ');
}
