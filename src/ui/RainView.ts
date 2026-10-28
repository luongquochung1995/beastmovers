import Phaser from 'phaser';

const DROPS = 140;
/** Tốc độ rơi (px màn hình mỗi giây) và độ nghiêng của hạt mưa. */
const FALL = 900;
const SLANT = 0.25;
const LEN = 18;

/**
 * Mưa (modifier `rain`): hạt mưa rơi xiên phủ khung hình và một lớp xanh mờ. Chỉ để nhìn,
 * vẽ trong HUD (không bị camera zoom), không ảnh hưởng mô phỏng.
 */
export class RainView {
  private readonly g: Phaser.GameObjects.Graphics;
  private readonly drops: { x: number; y: number; v: number }[] = [];

  constructor(
    scene: Phaser.Scene,
    private readonly w: number,
    private readonly h: number,
  ) {
    scene.add.rectangle(0, 0, w, h, 0x1a3350, 0.18).setOrigin(0).setDepth(-10);
    this.g = scene.add.graphics().setDepth(-9);
    for (let i = 0; i < DROPS; i++) {
      this.drops.push({ x: Math.random() * w, y: Math.random() * h, v: 0.7 + Math.random() * 0.6 });
    }
  }

  update(frameMs: number): void {
    const dt = Math.min(frameMs, 100) / 1000;
    const g = this.g.clear().lineStyle(1.5, 0xb3e5fc, 0.45);
    for (const d of this.drops) {
      d.y += FALL * d.v * dt;
      d.x -= FALL * d.v * SLANT * dt;
      if (d.y > this.h) {
        d.y -= this.h + LEN;
        d.x = Math.random() * (this.w + this.h * SLANT);
      }
      g.lineBetween(d.x, d.y, d.x + LEN * SLANT, d.y - LEN);
    }
  }
}
