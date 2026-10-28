import Phaser from 'phaser';
import { CONFIG_KEY, type GameConfig } from '../data/config';
import { FixedLoop } from '../systems/FixedLoop';
import { DebugOverlay } from '../ui/DebugOverlay';
import { GAME_HEIGHT, GAME_WIDTH, Theme } from '../ui/theme';
import { SceneKeys } from './keys';

export interface ResultData {
  logicTicks: number;
  seconds: number;
}

/**
 * Màn chơi. Hiện là màn tạm: vài thùng trôi trên sàn để kiểm tra vật lý chạy theo bước cố định.
 * Nhân vật, đồ đạc thật sẽ thêm từ P04 trở đi.
 */
export class GameScene extends Phaser.Scene {
  private loop!: FixedLoop;
  private debug!: DebugOverlay;
  private logicTicks = 0;
  private lastNow = 0;

  constructor() {
    super(SceneKeys.Game);
  }

  create(): void {
    const config = this.registry.get(CONFIG_KEY) as GameConfig;
    this.loop = new FixedLoop(config.logicHz);
    this.logicTicks = 0;
    this.lastNow = performance.now();

    this.cameras.main.setBackgroundColor(Theme.bg);
    const margin = 40;
    this.add
      .rectangle(margin, margin, GAME_WIDTH - margin * 2, GAME_HEIGHT - margin * 2, Theme.floor)
      .setOrigin(0);
    this.matter.world.setBounds(margin, margin, GAME_WIDTH - margin * 2, GAME_HEIGHT - margin * 2);

    this.spawnTestBoxes(12);

    this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT - 20, 'Esc: kết thúc màn  ·  F1: debug', {
        fontFamily: Theme.font,
        fontSize: '16px',
        color: Theme.muted,
      })
      .setOrigin(0.5);

    this.debug = new DebugOverlay(this, config.debug);
    this.input.keyboard?.on('keydown-F1', (e: KeyboardEvent) => {
      e.preventDefault();
      this.debug.setVisible(!this.debug.visible);
    });
    this.input.keyboard?.once('keydown-ESC', () => this.finish());
  }

  override update(): void {
    // Dùng đồng hồ thật thay cho `delta` của Phaser: delta đó đã bị làm mượt và giới hạn,
    // nên khi FPS thấp logic sẽ chạy chậm hơn 60 Hz.
    const now = performance.now();
    const steps = this.loop.advance(now - this.lastNow, (dt) => this.fixedUpdate(dt));
    this.lastNow = now;
    this.debug.update(steps);
  }

  /** Mọi logic game chạy ở đây, đúng `logicHz` lần mỗi giây. */
  private fixedUpdate(dt: number): void {
    this.matter.world.step(dt);
    this.logicTicks++;
  }

  private spawnTestBoxes(count: number): void {
    const colors = [0xffb347, 0x7ec8e3, 0xb39ddb, 0x9ccc65];
    for (let i = 0; i < count; i++) {
      const size = Phaser.Math.Between(30, 70);
      const x = Phaser.Math.Between(150, GAME_WIDTH - 150);
      const y = Phaser.Math.Between(150, GAME_HEIGHT - 150);
      const box = this.add.rectangle(x, y, size, size, colors[i % colors.length]);
      const go = this.matter.add.gameObject(box, {
        restitution: 0.9,
        frictionAir: 0.005,
        friction: 0,
      }) as Phaser.Physics.Matter.Sprite;
      go.setVelocity(Phaser.Math.FloatBetween(-4, 4), Phaser.Math.FloatBetween(-4, 4));
    }
  }

  private finish(): void {
    const data: ResultData = {
      logicTicks: this.logicTicks,
      seconds: this.logicTicks / (1000 / this.loop.stepMs),
    };
    this.scene.start(SceneKeys.Result, data);
  }
}
