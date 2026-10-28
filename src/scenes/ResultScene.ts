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
      .text(cx, 150, t('result.title'), {
        fontFamily: Theme.font,
        fontSize: '56px',
        fontStyle: 'bold',
        color: Theme.accent,
      })
      .setOrigin(0.5);

    this.add
      .text(cx, 250, t(data.passed ? 'result.passed' : 'result.failed'), {
        fontFamily: Theme.font,
        fontSize: '36px',
        fontStyle: 'bold',
        color: data.passed ? '#7CFC8A' : '#ff8a80',
      })
      .setOrigin(0.5);
    this.add
      .text(
        cx,
        320,
        [
          t('result.required', { loaded: data.requiredLoaded, total: data.requiredTotal }),
          t('result.played', { seconds: Math.round(data.seconds) }),
        ].join('\n'),
        { fontFamily: Theme.font, fontSize: '24px', color: Theme.text, align: 'center' },
      )
      .setOrigin(0.5, 0);

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
