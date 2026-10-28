import Phaser from 'phaser';
import { t } from '../data/i18n';
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
      .text(cx, 220, t('result.title'), {
        fontFamily: Theme.font,
        fontSize: '56px',
        fontStyle: 'bold',
        color: Theme.accent,
      })
      .setOrigin(0.5);

    this.add
      .text(
        cx,
        320,
        t('result.played', { seconds: data.seconds.toFixed(1), ticks: data.logicTicks }),
        { fontFamily: Theme.font, fontSize: '24px', color: Theme.text },
      )
      .setOrigin(0.5);

    this.add
      .text(cx, 440, t('result.back'), {
        fontFamily: Theme.font,
        fontSize: '24px',
        color: Theme.muted,
      })
      .setOrigin(0.5);

    this.input.keyboard?.once('keydown-ENTER', () => this.scene.start(SceneKeys.Menu));
  }
}
