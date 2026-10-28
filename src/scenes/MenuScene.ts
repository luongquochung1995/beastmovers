import Phaser from 'phaser';
import { t } from '../data/i18n';
import { MenuInput } from '../ui/menuInput';
import { MenuList } from '../ui/MenuList';
import { switchLanguage } from '../ui/prefs';
import { GAME_HEIGHT, GAME_TITLE, GAME_WIDTH, Theme } from '../ui/theme';
import { RegistryKeys, SceneKeys } from './keys';

/** Mục đang chọn ở menu chính, giữ lại khi quay về từ màn khác. */
let lastFocus = 0;

export class MenuScene extends Phaser.Scene {
  constructor() {
    super(SceneKeys.Menu);
  }

  create(): void {
    this.cameras.main.setBackgroundColor(Theme.bg);
    const cx = GAME_WIDTH / 2;

    this.add
      .text(cx, 110, GAME_TITLE, {
        fontFamily: Theme.font,
        fontSize: '84px',
        fontStyle: 'bold',
        color: Theme.accent,
      })
      .setOrigin(0.5);
    this.add
      .text(cx, 178, t('menu.tagline'), {
        fontFamily: Theme.font,
        fontSize: '22px',
        color: Theme.text,
      })
      .setOrigin(0.5);

    const go = (key: string, data?: object) => () => this.scene.start(key, data);
    const list = new MenuList(
      this,
      [
        { label: () => t('menu.local'), onConfirm: go(SceneKeys.LevelSelect), fontSize: 30 },
        { label: () => t('menu.createRoom'), onConfirm: go(SceneKeys.Online, { mode: 'create' }) },
        { label: () => t('menu.joinRoom'), onConfirm: go(SceneKeys.Online, {}) },
        { label: () => t('menu.settings'), onConfirm: go(SceneKeys.Settings), gapBefore: 6 },
        { label: () => t('menu.help'), onConfirm: go(SceneKeys.Help) },
        { label: () => t('menu.language'), onConfirm: () => this.switchLanguage() },
        { label: () => t('menu.inputTest'), onConfirm: go(SceneKeys.InputTest), fontSize: 18 },
        { label: () => t('menu.sandbox'), onConfirm: go(SceneKeys.Sandbox), fontSize: 18 },
      ],
      cx,
      244,
      52,
    );
    list.setFocus(lastFocus);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => (lastFocus = list.focus));

    // Phím tắt cũ vẫn dùng được.
    const hotkeys: Record<string, () => void> = {
      KeyL: () => this.switchLanguage(),
      KeyI: go(SceneKeys.InputTest),
      KeyO: go(SceneKeys.Online, {}),
    };
    new MenuInput(
      this,
      (a) => list.handle(a),
      (e) => {
        const fn = hotkeys[e.code];
        fn?.();
        return !!fn;
      },
    );

    this.add
      .text(cx, GAME_HEIGHT - 46, t('menu.navHint'), {
        fontFamily: Theme.font,
        fontSize: '15px',
        color: Theme.muted,
      })
      .setOrigin(0.5);
    this.add
      .text(
        cx,
        GAME_HEIGHT - 22,
        `v${__APP_VERSION__} · ${t('menu.dataVersion', { hash: this.registry.get(RegistryKeys.DataHash) as string })}`,
        { fontFamily: Theme.font, fontSize: '13px', color: Theme.muted },
      )
      .setOrigin(0.5);
  }

  private switchLanguage(): void {
    switchLanguage();
    this.scene.restart();
  }
}
