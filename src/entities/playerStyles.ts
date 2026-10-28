import Phaser from 'phaser';

export type PlayerSymbol =
  'circle' | 'triangle' | 'square' | 'diamond' | 'star' | 'cross' | 'hexagon' | 'ring';

export interface PlayerStyle {
  name: string;
  color: number;
  symbol: PlayerSymbol;
}

/**
 * 8 màu nhân vật. Mỗi màu có một ký hiệu riêng in trên người,
 * để người mù màu vẫn phân biệt được.
 */
export const PLAYER_STYLES: readonly PlayerStyle[] = [
  { name: 'Cam', color: 0xff9f43, symbol: 'circle' },
  { name: 'Xanh dương', color: 0x4aa3ff, symbol: 'triangle' },
  { name: 'Tím', color: 0xa77bff, symbol: 'square' },
  { name: 'Xanh lá', color: 0x5ccf6b, symbol: 'diamond' },
  { name: 'Hồng', color: 0xff6fb5, symbol: 'star' },
  { name: 'Vàng', color: 0xffd93d, symbol: 'cross' },
  { name: 'Đỏ', color: 0xff5a5a, symbol: 'hexagon' },
  { name: 'Trắng', color: 0xe8e8f0, symbol: 'ring' },
];

export const PLAYER_RADIUS = 20;
const PAD = 4;

export function playerTextureKey(styleIndex: number): string {
  return `player-${styleIndex}`;
}

function drawSymbol(g: Phaser.GameObjects.Graphics, symbol: PlayerSymbol, cx: number, cy: number) {
  const r = 6;
  g.fillStyle(0xffffff, 0.9);
  g.lineStyle(2.5, 0xffffff, 0.9);
  switch (symbol) {
    case 'circle':
      g.fillCircle(cx, cy, r);
      break;
    case 'triangle':
      g.fillTriangle(cx, cy - r, cx + r, cy + r * 0.8, cx - r, cy + r * 0.8);
      break;
    case 'square':
      g.fillRect(cx - r * 0.85, cy - r * 0.85, r * 1.7, r * 1.7);
      break;
    case 'diamond':
      g.fillPoints(
        [
          { x: cx, y: cy - r },
          { x: cx + r, y: cy },
          { x: cx, y: cy + r },
          { x: cx - r, y: cy },
        ],
        true,
      );
      break;
    case 'star': {
      const pts: { x: number; y: number }[] = [];
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        const rr = i % 2 === 0 ? r * 1.1 : r * 0.45;
        pts.push({ x: cx + Math.cos(a) * rr, y: cy + Math.sin(a) * rr });
      }
      g.fillPoints(pts, true);
      break;
    }
    case 'cross':
      g.fillRect(cx - r, cy - 2, r * 2, 4);
      g.fillRect(cx - 2, cy - r, 4, r * 2);
      break;
    case 'hexagon': {
      const pts: { x: number; y: number }[] = [];
      for (let i = 0; i < 6; i++) {
        const a = (i * Math.PI) / 3;
        pts.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
      }
      g.fillPoints(pts, true);
      break;
    }
    case 'ring':
      g.strokeCircle(cx, cy, r * 0.8);
      break;
  }
}

/** Vẽ sẵn texture thân nhân vật cho từng màu (chỉ làm một lần). */
export function ensurePlayerTextures(scene: Phaser.Scene): void {
  const size = (PLAYER_RADIUS + PAD) * 2;
  PLAYER_STYLES.forEach((style, i) => {
    const key = playerTextureKey(i);
    if (scene.textures.exists(key)) return;
    const c = size / 2;
    const g = scene.make.graphics({}, false);
    const dark = Phaser.Display.Color.IntegerToColor(style.color).darken(35).color;
    g.fillStyle(0x000000, 0.25);
    g.fillEllipse(c, c + PLAYER_RADIUS * 0.75, PLAYER_RADIUS * 1.8, PLAYER_RADIUS * 0.7);
    g.fillStyle(style.color, 1);
    g.fillCircle(c, c, PLAYER_RADIUS);
    g.lineStyle(3, dark, 1);
    g.strokeCircle(c, c, PLAYER_RADIUS);
    drawSymbol(g, style.symbol, c, c + PLAYER_RADIUS * 0.4);
    g.generateTexture(key, size, size);
    g.destroy();
  });
}
