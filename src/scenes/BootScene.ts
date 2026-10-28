import Phaser from 'phaser';
import { applyUrlOverrides, CONFIG_KEY, type GameConfig } from '../data/config';
import {
  detectLocale,
  type Dictionary,
  i18nPath,
  LOCALES,
  setDictionary,
  setLocale,
} from '../data/i18n';
import { loadSettings } from '../data/settings';
import { ensurePlayerTextures } from '../entities/playerStyles';
import { InputManager } from '../systems/input/InputManager';
import { RegistryKeys, SceneKeys } from './keys';

/** Tải data cần thiết rồi chuyển sang Menu. */
export class BootScene extends Phaser.Scene {
  constructor() {
    super(SceneKeys.Boot);
  }

  preload(): void {
    this.load.json(CONFIG_KEY, 'data/config.json');
    for (const locale of LOCALES) this.load.json(`i18n-${locale}`, i18nPath(locale));
  }

  create(): void {
    const raw = this.cache.json.get(CONFIG_KEY) as GameConfig;
    const config = applyUrlOverrides(raw);
    this.registry.set(CONFIG_KEY, config);

    for (const locale of LOCALES) {
      setDictionary(locale, this.cache.json.get(`i18n-${locale}`) as Dictionary);
    }
    const locale = detectLocale({
      urlLang: new URLSearchParams(window.location.search).get('lang'),
      saved: loadSettings().language ?? null,
      browserLanguages: navigator.languages,
    });
    setLocale(locale);
    document.documentElement.lang = locale;

    // Một InputManager dùng chung cho cả game để người chơi đã tham gia được giữ qua các màn.
    this.registry.set(RegistryKeys.Input, new InputManager(config.maxLocalPlayers));
    ensurePlayerTextures(this);
    this.scene.start(SceneKeys.Menu);
  }
}
