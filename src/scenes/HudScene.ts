import Phaser from 'phaser';
import { DebugOverlay } from '../ui/DebugOverlay';
import { GAME_WIDTH } from '../ui/theme';
import { SceneKeys } from './keys';
import type { PlayScene } from './PlayScene';

/**
 * Lớp giao diện chạy song song phía trên màn chơi/sandbox. Có camera riêng nên không bị
 * camera của màn chơi zoom hay di chuyển. Chứa bảng debug, nhật ký sự kiện và HUD của màn.
 */
export class HudScene extends Phaser.Scene {
  play!: PlayScene;
  private debug!: DebugOverlay;
  private eventLog!: Phaser.GameObjects.Text;
  private eventLines: string[] = [];

  constructor() {
    super(SceneKeys.Hud);
  }

  create(data: { playKey: string }): void {
    this.play = this.scene.get(data.playKey) as PlayScene;
    this.debug = new DebugOverlay(
      this,
      this.play.debugVisible,
      () => this.play.world.scene.matter.world.getAllBodies().length,
    );
    this.eventLines = [];
    this.eventLog = this.add
      .text(GAME_WIDTH - 8, 150, '', {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#c8f7c5',
        backgroundColor: '#000000aa',
        padding: { x: 6, y: 4 },
        align: 'right',
      })
      .setOrigin(1, 0)
      .setDepth(10_000);
    this.play.world.bus.onAny((e) => {
      const what = 'itemId' in e ? ` ${e.itemId}` : 'kind' in e ? ` ${e.kind}` : '';
      const extra = 'durability' in e ? ` ♥${e.durability}` : 'speed' in e ? ` v${e.speed}` : '';
      this.eventLines.push(`${this.play.world.bus.tick} ${e.type}${what}${extra}`);
      if (this.eventLines.length > 10) this.eventLines.shift();
      if (this.eventLog.active) this.eventLog.setText(this.eventLines);
    });
    this.play.createHud(this);
  }

  override update(): void {
    const on = this.play.debugVisible;
    this.debug.setVisible(on);
    this.eventLog.setVisible(on);
    this.debug.update(this.play.lastSteps);
    this.play.updateHud(this);
  }
}
