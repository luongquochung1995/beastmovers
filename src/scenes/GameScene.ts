import { t } from '../data/i18n';
import type { Vec } from '../systems/geometry';
import { GAME_HEIGHT, GAME_WIDTH, Theme } from '../ui/theme';
import { SceneKeys } from './keys';
import { PlayScene } from './PlayScene';

export interface ResultData {
  logicTicks: number;
  seconds: number;
}

const ROOM = { x: 40, y: 40, w: GAME_WIDTH - 80, h: GAME_HEIGHT - 100 };

/**
 * Màn chơi. Hiện là một căn phòng thử với vài món đồ lấy từ data.
 * Bản đồ thật dựng từ `levels.json` sẽ làm ở P12.
 */
export class GameScene extends PlayScene {
  constructor() {
    super(SceneKeys.Game);
  }

  protected buildLevel(): void {
    this.world.addRoom(ROOM);
    const spawns: [string, number, number, number?][] = [
      ['box', 600, 200],
      ['box', 650, 200],
      ['box', 625, 250],
      ['mirror', 760, 160],
      ['plant', 820, 420],
      ['teddy', 560, 420],
      ['sofa', 950, 200, 0.2],
      ['fridge', 1000, 480],
    ];
    for (const [id, x, y, angle] of spawns) this.world.spawnItem(id, x, y, angle ?? 0);

    this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT - 20, t('game.hint'), {
        fontFamily: Theme.font,
        fontSize: '15px',
        color: Theme.muted,
      })
      .setOrigin(0.5)
      .setDepth(9_000);
  }

  protected spawnPointFor(slotIndex: number): Vec {
    return { x: 200 + (slotIndex % 2) * 60, y: 300 + Math.floor(slotIndex / 2) * 60 };
  }

  protected onExit(): void {
    const data: ResultData = {
      logicTicks: this.logicTicks,
      seconds: this.logicTicks / this.config.logicHz,
    };
    this.scene.start(SceneKeys.Result, data);
  }
}
