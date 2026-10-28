import Phaser from 'phaser';
import type { ZoneKind } from '../systems/EventBus';
import { dist, type Vec } from '../systems/geometry';

export interface ZoneEffect {
  /** Xác suất vấp mỗi giây khi đi (không đứng yên) trong vùng. */
  tripPerSec: number;
  /** Độ "bám" vận tốc của nhân vật trong vùng (thấp = trơn). null = như bình thường. */
  accel: number | null;
  /** Nhân hệ số ma sát sàn của đồ vật trong vùng (thấp = trượt xa hơn). */
  itemFriction: number;
}

export const ZONE_EFFECTS: Record<ZoneKind, ZoneEffect> = {
  glass: { tripPerSec: 2.5, accel: null, itemFriction: 1 },
  water: { tripPerSec: 0.15, accel: 0.04, itemFriction: 0.3 },
  soil: { tripPerSec: 0.08, accel: 0.07, itemFriction: 0.5 },
};

/** Vùng nguy hiểm trên sàn: mảnh kính, vũng nước, đất đổ. Tồn tại đến hết màn. */
export class Zone {
  private readonly view: Phaser.GameObjects.Graphics;

  constructor(
    scene: Phaser.Scene,
    readonly kind: ZoneKind,
    readonly x: number,
    readonly y: number,
    readonly radius: number,
    random: () => number,
  ) {
    const g = scene.add.graphics({ x, y }).setDepth(-900);
    const r = radius;
    if (kind === 'water') {
      g.fillStyle(0x4fc3f7, 0.35).fillEllipse(0, 0, r * 2, r * 1.6);
      g.fillStyle(0xb3e5fc, 0.35).fillEllipse(-r * 0.25, -r * 0.2, r * 0.7, r * 0.35);
    } else if (kind === 'soil') {
      for (let i = 0; i < 9; i++) {
        const a = random() * Math.PI * 2;
        const d = random() * r * 0.75;
        g.fillStyle(0x6d4c41, 0.75).fillCircle(
          Math.cos(a) * d,
          Math.sin(a) * d,
          r * (0.15 + random() * 0.2),
        );
      }
    } else {
      // Quầng sáng mờ để người chơi nhận ra vùng nguy hiểm.
      g.fillStyle(0xb3e5fc, 0.12).fillCircle(0, 0, r);
      for (let i = 0; i < 18; i++) {
        const a = random() * Math.PI * 2;
        const d = random() * r;
        const px = Math.cos(a) * d;
        const py = Math.sin(a) * d;
        const s = 3 + random() * 5;
        const rot = random() * Math.PI;
        g.fillStyle(0xe1f5fe, 0.9).fillTriangle(
          px + Math.cos(rot) * s,
          py + Math.sin(rot) * s,
          px + Math.cos(rot + 2.2) * s,
          py + Math.sin(rot + 2.2) * s,
          px + Math.cos(rot + 4) * s * 0.6,
          py + Math.sin(rot + 4) * s * 0.6,
        );
      }
    }
    this.view = g;
  }

  get effect(): ZoneEffect {
    return ZONE_EFFECTS[this.kind];
  }

  contains(p: Vec): boolean {
    return dist(p, this) <= this.radius;
  }

  destroy(): void {
    this.view.destroy();
  }
}
