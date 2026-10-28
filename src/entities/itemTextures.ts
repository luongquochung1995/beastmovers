import Phaser from 'phaser';
import type { ItemDef } from '../data/types';

const PAD = 4;

export const itemTextureKey = (id: string) => `item-${id}`;

const toInt = (hex: string | undefined) => (hex ? parseInt(hex.slice(1), 16) : 0x9e9e9e);

/** Hình tạm cho đồ chưa có sprite: khối màu bo góc (hoặc hình tròn) có viền đậm. */
export function ensureItemTexture(scene: Phaser.Scene, def: ItemDef): string {
  const key = itemTextureKey(def.id);
  if (scene.textures.exists(key)) return key;
  const { w, h } = def.size;
  const color = toInt(def.color);
  const dark = Phaser.Display.Color.IntegerToColor(color).darken(35).color;
  const light = Phaser.Display.Color.IntegerToColor(color).lighten(15).color;
  const g = scene.make.graphics({}, false);
  const cx = w / 2 + PAD;
  const cy = h / 2 + PAD;
  if (def.shape === 'circle') {
    g.fillStyle(color, 1).fillCircle(cx, cy, w / 2);
    g.fillStyle(light, 0.6).fillCircle(cx - w * 0.15, cy - w * 0.15, w * 0.18);
    g.lineStyle(2.5, dark, 1).strokeCircle(cx, cy, w / 2);
  } else {
    const r = Math.min(8, w / 4, h / 4);
    g.fillStyle(color, 1).fillRoundedRect(PAD, PAD, w, h, r);
    g.fillStyle(light, 0.5).fillRoundedRect(PAD + 3, PAD + 3, w - 6, Math.min(8, h / 3), r / 2);
    g.lineStyle(2.5, dark, 1).strokeRoundedRect(PAD, PAD, w, h, r);
  }
  g.generateTexture(key, w + PAD * 2, h + PAD * 2);
  g.destroy();
  return key;
}
