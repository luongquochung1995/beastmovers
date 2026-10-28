import Phaser from 'phaser';
import { getLocale, t } from '../data/i18n';
import { clearProgress, loadSettings, saveSettings, volumeOf } from '../data/settings';
import { MenuInput } from '../ui/menuInput';
import { MenuList } from '../ui/MenuList';
import { isFullscreen, stepVolume, switchLanguage, toggleFullscreen } from '../ui/prefs';
import { GAME_HEIGHT, GAME_WIDTH, Theme } from '../ui/theme';
import { SceneKeys } from './keys';

/** `from`: scene quay về khi bấm "Quay lại" (mặc định menu chính). */
export interface SettingsSceneData {
  from?: string;
}

/** Cài đặt: âm lượng, rung màn hình, toàn màn hình, ngôn ngữ, đổi phím, xóa tiến trình. */
export class SettingsScene extends Phaser.Scene {
  private note!: Phaser.GameObjects.Text;
  private confirmClear = false;
  private from: string = SceneKeys.Menu;

  constructor() {
    super(SceneKeys.Settings);
  }

  create(data: SettingsSceneData = {}): void {
    this.from = data.from ?? SceneKeys.Menu;
    this.confirmClear = false;
    this.cameras.main.setBackgroundColor(Theme.bg);
    const cx = GAME_WIDTH / 2;
    this.add
      .text(cx, 80, t('settings.title'), {
        fontFamily: Theme.font,
        fontSize: '52px',
        fontStyle: 'bold',
        color: Theme.accent,
      })
      .setOrigin(0.5);

    const onOff = (on: boolean) => t(on ? 'settings.on' : 'settings.off');
    const list = new MenuList(
      this,
      [
        {
          label: () => t('settings.volume', { v: Math.round(volumeOf(loadSettings()) * 100) }),
          onAdjust: (dir) => stepVolume(dir),
        },
        {
          label: () => t('settings.shake', { v: onOff(loadSettings().screenShake !== false) }),
          onAdjust: () => saveSettings({ screenShake: loadSettings().screenShake === false }),
        },
        {
          label: () => t('settings.fullscreen', { v: onOff(isFullscreen()) }),
          onAdjust: () => void this.fullscreen(list),
        },
        {
          label: () => t('settings.language', { v: t(`language.${getLocale()}`) }),
          onAdjust: () => {
            switchLanguage();
            this.scene.restart(data);
          },
        },
        {
          label: () => t('settings.keys'),
          onConfirm: () => this.scene.start(SceneKeys.Keys, { from: this.from }),
          gapBefore: 12,
        },
        {
          label: () => t(this.confirmClear ? 'settings.clearConfirm' : 'settings.clear'),
          onConfirm: () => this.clear(),
        },
        { label: () => t('settings.back'), onConfirm: () => this.back(), gapBefore: 12 },
      ],
      cx,
      190,
      62,
    );
    this.note = this.add
      .text(cx, GAME_HEIGHT - 70, '', {
        fontFamily: Theme.font,
        fontSize: '18px',
        color: Theme.muted,
      })
      .setOrigin(0.5);
    this.add
      .text(cx, GAME_HEIGHT - 30, t('settings.hint'), {
        fontFamily: Theme.font,
        fontSize: '15px',
        color: Theme.muted,
      })
      .setOrigin(0.5);

    new MenuInput(this, (a) => {
      if (a === 'back') this.back();
      else {
        // Rời mục "Xóa tiến trình" thì bỏ bước xác nhận.
        const before = list.focus;
        list.handle(a);
        if (list.focus !== before && this.confirmClear) {
          this.confirmClear = false;
          list.refresh();
        }
      }
    });
    // Trạng thái toàn màn hình đổi bằng F11/Esc của trình duyệt.
    const onFs = () => list.refresh();
    document.addEventListener('fullscreenchange', onFs);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () =>
      document.removeEventListener('fullscreenchange', onFs),
    );
  }

  private async fullscreen(list: MenuList): Promise<void> {
    const ok = await toggleFullscreen();
    if (!this.sys.isActive()) return;
    this.note.setText(ok ? '' : t('settings.fullscreenFailed'));
    list.refresh();
  }

  private clear(): void {
    if (!this.confirmClear) {
      this.confirmClear = true;
      return;
    }
    this.confirmClear = false;
    clearProgress();
    this.note.setText(t('settings.cleared'));
  }

  private back(): void {
    this.scene.start(this.from);
  }
}
