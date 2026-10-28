import Phaser from 'phaser';
import { t } from '../data/i18n';
import { Theme } from './theme';

export interface DebugStats {
  fps: number;
  logicStepsPerSec: number;
  bodies: number;
}

declare global {
  interface Window {
    /** Chỉ số debug cho kiểm thử tự động (Playwright). */
    __debugStats?: DebugStats;
  }
}

/** Góc trên trái: FPS vẽ hình, số bước logic mỗi giây, số vật thể. Bật/tắt bằng F1. */
export class DebugOverlay {
  private readonly text: Phaser.GameObjects.Text;
  private stepsThisWindow = 0;
  private windowStart = 0;
  private stats: DebugStats = { fps: 0, logicStepsPerSec: 0, bodies: 0 };

  constructor(
    private readonly scene: Phaser.Scene,
    visible: boolean,
  ) {
    this.text = scene.add
      .text(8, 8, '', {
        fontFamily: 'monospace',
        fontSize: '14px',
        color: Theme.text,
        backgroundColor: '#000000aa',
        padding: { x: 6, y: 4 },
      })
      .setScrollFactor(0)
      .setDepth(10_000);
    this.setVisible(visible);
    this.windowStart = performance.now();
  }

  get visible(): boolean {
    return this.text.visible;
  }

  setVisible(visible: boolean): void {
    this.text.setVisible(visible);
    const world = this.scene.matter?.world;
    if (world) {
      world.drawDebug = visible;
      world.debugGraphic?.setVisible(visible);
    }
  }

  /** Gọi mỗi khung hình với số bước logic vừa chạy. */
  update(stepsThisFrame: number): void {
    this.stepsThisWindow += stepsThisFrame;
    const now = performance.now();
    const elapsed = now - this.windowStart;
    if (elapsed >= 1000) {
      this.stats = {
        fps: Math.round(this.scene.game.loop.actualFps),
        logicStepsPerSec: Math.round((this.stepsThisWindow * 1000) / elapsed),
        bodies: this.scene.matter?.world.getAllBodies().length ?? 0,
      };
      this.stepsThisWindow = 0;
      this.windowStart = now;
      window.__debugStats = this.stats;
    }
    if (this.text.visible) {
      const rows: [string, number][] = [
        [t('debug.fps'), this.stats.fps],
        [t('debug.logic'), this.stats.logicStepsPerSec],
        [t('debug.bodies'), this.stats.bodies],
      ];
      const width = Math.max(...rows.map(([label]) => label.length));
      this.text.setText([
        ...rows.map(([label, value]) => `${label.padEnd(width)} : ${value}`),
        t('debug.toggle'),
      ]);
    }
  }
}
