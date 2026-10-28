import Phaser from 'phaser';
import { applyUrlOverrides, CONFIG_KEY, type GameConfig } from '../data/config';
import { SceneKeys } from './keys';

/** Tải data cần thiết rồi chuyển sang Menu. */
export class BootScene extends Phaser.Scene {
  constructor() {
    super(SceneKeys.Boot);
  }

  preload(): void {
    this.load.json(CONFIG_KEY, 'data/config.json');
  }

  create(): void {
    const raw = this.cache.json.get(CONFIG_KEY) as GameConfig;
    this.registry.set(CONFIG_KEY, applyUrlOverrides(raw));
    this.scene.start(SceneKeys.Menu);
  }
}
