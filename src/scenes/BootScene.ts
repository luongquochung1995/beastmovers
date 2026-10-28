import Phaser from 'phaser';
import { applyUrlOverrides, CONFIG_KEY, type GameConfig } from '../data/config';
import { InputManager } from '../systems/input/InputManager';
import { ensurePlayerTextures } from '../entities/playerStyles';
import { RegistryKeys, SceneKeys } from './keys';

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
    const config = applyUrlOverrides(raw);
    this.registry.set(CONFIG_KEY, config);
    // Một InputManager dùng chung cho cả game để người chơi đã tham gia được giữ qua các màn.
    this.registry.set(RegistryKeys.Input, new InputManager(config.maxLocalPlayers));
    ensurePlayerTextures(this);
    this.scene.start(SceneKeys.Menu);
  }
}
