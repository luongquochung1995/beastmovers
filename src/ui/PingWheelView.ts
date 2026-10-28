import Phaser from 'phaser';
import type { Vec } from '../systems/geometry';
import { PING_ICONS, WHEEL_ANGLES, WHEEL_PINGS, type WheelPing } from '../systems/ping';
import { pingLabel } from './PingLayer';
import { Theme } from './theme';

/** Vòng hình elip (chữ nằm ngang nên cần rộng hơn cao). */
const RX = 140;
const RY = 88;

/** Vòng ping vẽ quanh người đang giữ nút Ping; ô đang chọn sáng lên. */
export class PingWheelView {
  private readonly bg: Phaser.GameObjects.Graphics;
  private readonly labels: Phaser.GameObjects.Text[];

  constructor(scene: Phaser.Scene) {
    this.bg = scene.add.graphics().setDepth(9_500);
    this.labels = WHEEL_PINGS.map((k) =>
      scene.add
        .text(0, 0, `${PING_ICONS[k]}\n${pingLabel(k, 0)}`, {
          fontFamily: Theme.font,
          fontSize: '14px',
          fontStyle: 'bold',
          align: 'center',
          color: Theme.text,
          backgroundColor: '#000000c0',
          padding: { x: 6, y: 3 },
        })
        .setOrigin(0.5)
        .setDepth(9_501),
    );
    this.hide();
  }

  show(at: Vec, choice: WheelPing | null): void {
    this.bg
      .clear()
      .fillStyle(0x000000, 0.35)
      .fillEllipse(at.x, at.y, (RX + 60) * 2, (RY + 34) * 2);
    this.bg.lineStyle(2, 0xffb347, 0.6).strokeEllipse(at.x, at.y, (RX + 60) * 2, (RY + 34) * 2);
    WHEEL_PINGS.forEach((k, i) => {
      const a = ((WHEEL_ANGLES[k] - 90) * Math.PI) / 180;
      const on = k === choice;
      this.labels[i]!.setPosition(at.x + Math.cos(a) * RX, at.y + Math.sin(a) * RY)
        .setColor(on ? '#1d1b26' : Theme.text)
        .setBackgroundColor(on ? Theme.accent : '#000000c0')
        .setScale(on ? 1.15 : 1)
        .setVisible(true);
    });
  }

  hide(): void {
    this.bg.clear();
    for (const l of this.labels) l.setVisible(false);
  }

  destroy(): void {
    this.bg.destroy();
    for (const l of this.labels) l.destroy();
  }
}
