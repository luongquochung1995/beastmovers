import Phaser from 'phaser';
import { t } from '../data/i18n';
import { localPlayerName, saveLocalPlayerName } from '../data/settings';
import { cleanName, NAME_MAX } from '../net/lobby';
import { MenuInput } from '../ui/menuInput';
import { promptText, type TextPrompt } from '../ui/textPrompt';
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
      // Đặt tên cho từng người chơi trên máy (tên hiện ngay trên đầu nhân vật).
      for (const p of game.world.players) {
        items.push({
          label: () =>
            this.editing?.slot === p.slotIndex
              ? `✏️ ${this.editing.text}▏`
              : t('pause.rename', { n: p.slotIndex + 1, name: localPlayerName(p.slotIndex) }),
          onConfirm: () => this.rename(p.slotIndex, list),
          fontSize: 20,
        });
      }
      items.push({ label: () => t('pause.restart'), onConfirm: () => game.restartLevel() });
      items.push({
        label: () => t('pause.levels'),
        onConfirm: () => game.quitTo(SceneKeys.LevelSelect),
      });
    } else {
      items.push({ label: () => t('pause.leave'), onConfirm: () => game.quitTo(SceneKeys.Menu) });
    }
    const list: MenuList = new MenuList(this, items, cx, 300, items.length > 5 ? 48 : 60);
    new MenuInput(this, (a) => {
      if (this.editing) return; // đang gõ tên: phím đi vào ô nhập
      if (a === 'back') resume();
      else list.handle(a);
    });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.editing?.prompt.close(true));
    this.editing = null;
  }

  private editing: { slot: number; text: string; prompt: TextPrompt } | null = null;

  private rename(slot: number, list: MenuList): void {
    const game = this.scene.get(SceneKeys.Game) as GameScene;
    const initial = localPlayerName(slot);
    const prompt = promptText({
      initial,
      maxLength: NAME_MAX,
      label: t('lobby.nameLabel'),
      onChange: (text) => {
        if (this.editing) this.editing.text = text;
        list.refresh();
      },
      onDone: (text) => {
        this.editing = null;
        if (text) {
          const name = cleanName(text);
          saveLocalPlayerName(slot, name);
          game.world.players.find((pl) => pl.slotIndex === slot)?.setName(name);
        }
        if (this.sys.isActive()) list.refresh();
      },
    });
    this.editing = { slot, text: initial, prompt };
    list.refresh();
  }
}
