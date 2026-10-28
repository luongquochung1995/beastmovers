import Phaser from 'phaser';
import { t } from '../data/i18n';
import { MenuInput } from '../ui/menuInput';
import { type MenuItem, MenuList } from '../ui/MenuList';
import { GAME_HEIGHT, GAME_WIDTH, Theme } from '../ui/theme';
import type { GameScene } from './GameScene';
import { SceneKeys } from './keys';

/**
 * Menu tạm dừng phủ lên màn chơi. Chơi chung máy: màn chơi dừng thật. Online: chỉ mở menu,
 * game vẫn chạy; host có thêm "Kết thúc màn".
 */
export class PauseScene extends Phaser.Scene {
  constructor() {
    super(SceneKeys.Pause);
  }

  create(): void {
    const game = this.scene.get(SceneKeys.Game) as GameScene;
    const online = game.onlineRole();
    this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.6).setOrigin(0);
    const cx = GAME_WIDTH / 2;
    this.add
      .text(cx, 190, t(online ? 'pause.titleOnline' : 'pause.title'), {
        fontFamily: Theme.font,
        fontSize: '48px',
        fontStyle: 'bold',
        color: Theme.accent,
      })
      .setOrigin(0.5);
    if (online) {
      this.add
        .text(cx, 240, t('pause.stillRunning'), {
          fontFamily: Theme.font,
          fontSize: '17px',
          color: Theme.muted,
        })
        .setOrigin(0.5);
    }

    const resume = () => game.closePause();
    const items: MenuItem[] = [{ label: () => t('pause.resume'), onConfirm: resume }];
    if (online !== 'client') {
      items.push({ label: () => t('pause.finish'), onConfirm: () => game.finishFromPause() });
    }
    if (!online) {
      items.push({ label: () => t('pause.restart'), onConfirm: () => game.restartLevel() });
      items.push({ label: () => t('pause.levels'), onConfirm: () => game.quitTo(SceneKeys.Menu) });
    } else {
      items.push({ label: () => t('pause.leave'), onConfirm: () => game.quitTo(SceneKeys.Menu) });
    }
    const list = new MenuList(this, items, cx, 320, 64);
    new MenuInput(this, (a) => (a === 'back' ? resume() : list.handle(a)));
  }
}
