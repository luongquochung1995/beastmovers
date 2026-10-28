import { t } from '../data/i18n';
import type { LevelDef } from '../data/types';
import { type BuiltLevel, buildLevel, playerSpawn } from '../sim/levelSetup';
import type { Vec } from '../systems/geometry';
import { GAME_HEIGHT, GAME_WIDTH, Theme } from '../ui/theme';
import type { HudScene } from './HudScene';
import { RegistryKeys, SceneKeys } from './keys';
import { PlayScene } from './PlayScene';

export interface ResultData {
  logicTicks: number;
  seconds: number;
}

/** Màn chơi: dựng hoàn toàn từ `levels.json` + bản đồ Tiled. */
export class GameScene extends PlayScene {
  protected built!: BuiltLevel;

  constructor() {
    super(SceneKeys.Game);
  }

  /** Màn đang chơi: `levelId` trong registry, mặc định màn đầu tiên. */
  protected get levelDef(): LevelDef {
    const id = this.registry.get(RegistryKeys.LevelId) as string | undefined;
    return this.gameData.levels.find((l) => l.id === id) ?? this.gameData.levels[0]!;
  }

  protected buildLevel(): void {
    const level = this.levelDef;
    const map = this.gameData.maps[level.map]!;
    this.built = buildLevel(this.world, level, map);
    const cam = this.cameras.main;
    cam.setBounds(0, 0, map.width, map.height);
    cam.setZoom(Math.min(GAME_WIDTH / map.width, GAME_HEIGHT / map.height));
    cam.centerOn(map.width / 2, map.height / 2);
  }

  override createHud(hud: HudScene): void {
    hud.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT - 14, t('game.hint'), {
        fontFamily: Theme.font,
        fontSize: '14px',
        color: Theme.muted,
        backgroundColor: '#00000088',
        padding: { x: 8, y: 3 },
      })
      .setOrigin(0.5, 1);
  }

  protected spawnPointFor(slotIndex: number): Vec {
    return playerSpawn(this.levelDef, slotIndex);
  }

  protected onExit(): void {
    const data: ResultData = {
      logicTicks: this.logicTicks,
      seconds: this.logicTicks / this.config.logicHz,
    };
    this.scene.start(SceneKeys.Result, data);
  }
}
