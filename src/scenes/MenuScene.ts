import Phaser from 'phaser';
import { getLocale, nextLocale, setLocale, t } from '../data/i18n';
import { saveSettings } from '../data/settings';
import { GAME_HEIGHT, GAME_TITLE, GAME_WIDTH, Theme } from '../ui/theme';
import { RegistryKeys, SceneKeys } from './keys';

export class MenuScene extends Phaser.Scene {
  constructor() {
    super(SceneKeys.Menu);
  }

  create(): void {
    this.cameras.main.setBackgroundColor(Theme.bg);
    const cx = GAME_WIDTH / 2;

    this.add
      .text(cx, 170, GAME_TITLE, {
        fontFamily: Theme.font,
        fontSize: '80px',
        fontStyle: 'bold',
        color: Theme.accent,
      })
      .setOrigin(0.5);

    this.add
      .text(cx, 250, t('menu.tagline'), {
        fontFamily: Theme.font,
        fontSize: '24px',
        color: Theme.text,
      })
      .setOrigin(0.5);

    this.button(cx, 390, t('menu.start'), '32px', () => this.scene.start(SceneKeys.Game));
    this.button(cx, 470, t('menu.online'), '28px', () => this.scene.start(SceneKeys.Online, {}));
    this.button(cx, 540, t('menu.inputTest'), '22px', () => this.scene.start(SceneKeys.InputTest));
    this.button(cx, 597, t('menu.sandbox'), '22px', () => this.scene.start(SceneKeys.Sandbox));
    this.button(cx, 654, t('menu.language'), '22px', () => this.switchLanguage());

    this.add
      .text(
        cx,
        GAME_HEIGHT - 30,
        `v${__APP_VERSION__} · ${t('menu.dataVersion', { hash: this.registry.get(RegistryKeys.DataHash) as string })}`,
        {
          fontFamily: Theme.font,
          fontSize: '14px',
          color: Theme.muted,
        },
      )
      .setOrigin(0.5);

    this.input.keyboard?.once('keydown-ENTER', () => this.scene.start(SceneKeys.Game));
    this.input.keyboard?.once('keydown-SPACE', () => this.scene.start(SceneKeys.Game));
    this.input.keyboard?.once('keydown-I', () => this.scene.start(SceneKeys.InputTest));
    this.input.keyboard?.once('keydown-L', () => this.switchLanguage());
    this.input.keyboard?.once('keydown-S', () => this.scene.start(SceneKeys.Sandbox));
    this.input.keyboard?.once('keydown-O', () => this.scene.start(SceneKeys.Online, {}));
  }

  private button(x: number, y: number, label: string, fontSize: string, onClick: () => void) {
    const text = this.add
      .text(x, y, label, {
        fontFamily: Theme.font,
        fontSize,
        color: Theme.text,
        backgroundColor: '#3a3550',
        padding: { x: 22, y: 10 },
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true })
      .on('pointerover', () => text.setColor(Theme.accent))
      .on('pointerout', () => text.setColor(Theme.text))
      .on('pointerup', onClick);
    return text;
  }

  private switchLanguage(): void {
    const locale = nextLocale(getLocale());
    setLocale(locale);
    saveSettings({ language: locale });
    document.documentElement.lang = locale;
    this.scene.restart();
  }
}
