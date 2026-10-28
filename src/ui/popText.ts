import Phaser from 'phaser';
import { Theme } from './theme';

/** Chữ nổi lên rồi mờ dần (tiếng kêu, thông báo nhỏ trên đầu nhân vật/đồ vật). */
export function popText(
  scene: Phaser.Scene,
  x: number,
  y: number,
  text: string,
  color: string = Theme.accent,
  size = 18,
): void {
  const t = scene.add
    .text(x, y, text, {
      fontFamily: Theme.font,
      fontSize: `${size}px`,
      fontStyle: 'bold',
      color,
      stroke: '#000000',
      strokeThickness: 4,
    })
    .setOrigin(0.5)
    .setDepth(9_600);
  scene.tweens.add({
    targets: t,
    y: y - 30,
    alpha: 0,
    duration: 900,
    onComplete: () => t.destroy(),
  });
}
