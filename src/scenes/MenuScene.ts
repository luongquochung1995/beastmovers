import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH, Theme } from '../ui/theme';
import { SceneKeys } from './keys';

export class MenuScene extends Phaser.Scene {
  constructor() {
    super(SceneKeys.Menu);
  }

  create(): void {
    this.cameras.main.setBackgroundColor(Theme.bg);
    const cx = GAME_WIDTH / 2;

    this.add
      .text(cx, 220, 'Dọn Nhà Kiểu Gì Đây?!', {
        fontFamily: Theme.font,
        fontSize: '64px',
        fontStyle: 'bold',
        color: Theme.accent,
      })
      .setOrigin(0.5);

    this.add
      .text(cx, 300, 'Xin chào! 1–8 người · 1 xe tải · 10 phút', {
        fontFamily: Theme.font,
        fontSize: '24px',
        color: Theme.text,
      })
      .setOrigin(0.5);

    const start = this.add
      .text(cx, 440, '▶  Bắt đầu  (Enter)', {
        fontFamily: Theme.font,
        fontSize: '32px',
        color: Theme.text,
        backgroundColor: '#3a3550',
        padding: { x: 24, y: 12 },
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true })
      .on('pointerover', () => start.setColor(Theme.accent))
      .on('pointerout', () => start.setColor(Theme.text))
      .on('pointerup', () => this.startGame());

    this.add
      .text(cx, GAME_HEIGHT - 30, `v${__APP_VERSION__}`, {
        fontFamily: Theme.font,
        fontSize: '14px',
        color: Theme.muted,
      })
      .setOrigin(0.5);

    this.input.keyboard?.once('keydown-ENTER', () => this.startGame());
    this.input.keyboard?.once('keydown-SPACE', () => this.startGame());
  }

  private startGame(): void {
    this.scene.start(SceneKeys.Game);
  }
}
