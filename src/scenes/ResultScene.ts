import Phaser from 'phaser';
import { GAME_WIDTH, Theme } from '../ui/theme';
import type { ResultData } from './GameScene';
import { SceneKeys } from './keys';

/** Màn kết quả tạm; bảng điểm thật làm ở P16. */
export class ResultScene extends Phaser.Scene {
  constructor() {
    super(SceneKeys.Result);
  }

  create(data: ResultData): void {
    this.cameras.main.setBackgroundColor(Theme.bg);
    const cx = GAME_WIDTH / 2;

    this.add
      .text(cx, 220, 'Kết quả', {
        fontFamily: Theme.font,
        fontSize: '56px',
        fontStyle: 'bold',
        color: Theme.accent,
      })
      .setOrigin(0.5);

    this.add
      .text(cx, 320, `Đã chơi ${data.seconds.toFixed(1)} giây (${data.logicTicks} bước logic)`, {
        fontFamily: Theme.font,
        fontSize: '24px',
        color: Theme.text,
      })
      .setOrigin(0.5);

    this.add
      .text(cx, 440, 'Enter: về menu', {
        fontFamily: Theme.font,
        fontSize: '24px',
        color: Theme.muted,
      })
      .setOrigin(0.5);

    this.input.keyboard?.once('keydown-ENTER', () => this.scene.start(SceneKeys.Menu));
  }
}
