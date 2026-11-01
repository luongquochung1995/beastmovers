import Phaser from 'phaser';

export type PlayerSymbol =
  'circle' | 'triangle' | 'square' | 'diamond' | 'star' | 'cross' | 'hexagon' | 'ring';

export interface PlayerStyle {
  /** Khóa i18n của tên màu. */
  nameKey: string;
  color: number;
  symbol: PlayerSymbol;
}

/**
 * 8 màu nhân vật. Mỗi màu có một ký hiệu riêng in trên người,
 * để người mù màu vẫn phân biệt được.
 */
export const PLAYER_STYLES: readonly PlayerStyle[] = [
  { nameKey: 'color.orange', color: 0xff9f43, symbol: 'circle' },
  { nameKey: 'color.blue', color: 0x4aa3ff, symbol: 'triangle' },
  { nameKey: 'color.purple', color: 0xa77bff, symbol: 'square' },
  { nameKey: 'color.green', color: 0x5ccf6b, symbol: 'diamond' },
  { nameKey: 'color.pink', color: 0xff6fb5, symbol: 'star' },
  { nameKey: 'color.yellow', color: 0xffd93d, symbol: 'cross' },
  { nameKey: 'color.red', color: 0xff5a5a, symbol: 'hexagon' },
  { nameKey: 'color.white', color: 0xe8e8f0, symbol: 'ring' },
];

export const PLAYER_RADIUS = 20;

/** Màu da và viền của nhân vật (kiểu đầu to, nét viền đậm). */
export const SKIN = 0xf2b48c;
export const OUTLINE = 0x2a2320;

/**
 * Kích thước texture nhân vật và vị trí các phần (px, gốc tọa độ ở góc trên trái).
 * Điểm neo (tâm thân vật lý) ở `ANCHOR_Y`; đầu nằm phía trên, nhô ra ngoài vòng va chạm.
 */
const TEX_W = 56;
const TEX_H = 64;
const CX = TEX_W / 2;
const HEAD_Y = 22;
export const HEAD_R = 17;
const ANCHOR_Y = 46;
/** Tâm đầu so với điểm neo (dùng để vẽ mắt / tai theo hướng nhìn). */
export const HEAD_OFFSET_Y = HEAD_Y - ANCHOR_Y;
/** Điểm neo của ảnh nhân vật (`setOrigin`). */
export const PLAYER_ORIGIN = { x: 0.5, y: ANCHOR_Y / TEX_H } as const;

/** Ảnh nhân vật trong game: chưa có mắt (mắt và tai vẽ theo hướng đi). */
export function playerBodyTextureKey(styleIndex: number): string {
  return `player-body-${styleIndex}`;
}

/** Ảnh nhân vật cho menu, lobby, kết quả: nhìn thẳng, có mắt. */
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

/** Thân: áo màu của người chơi (kèm ký hiệu riêng), bóng dưới chân, đầu to màu da. */
function drawBody(g: Phaser.GameObjects.Graphics, style: PlayerStyle): void {
  // Bóng
  g.fillStyle(0x000000, 0.25);
  g.fillEllipse(CX, TEX_H - 6, 34, 10);
  // Áo
  const dark = Phaser.Display.Color.IntegerToColor(style.color).darken(30).color;
  g.fillStyle(style.color, 1);
  g.fillRoundedRect(CX - 12, 34, 24, 22, 7);
  g.lineStyle(3, OUTLINE, 1);
  g.strokeRoundedRect(CX - 12, 34, 24, 22, 7);
  g.lineStyle(2, dark, 1).lineBetween(CX - 9, 52, CX + 9, 52);
  drawSymbol(g, style.symbol, CX, 45);
  // Đầu
  g.fillStyle(SKIN, 1);
  g.fillCircle(CX, HEAD_Y, HEAD_R);
  g.lineStyle(3, OUTLINE, 1);
  g.strokeCircle(CX, HEAD_Y, HEAD_R);
  // Má hồng nhẹ
  g.fillStyle(0xe8897a, 0.35);
  g.fillCircle(CX + 9, HEAD_Y + 7, 3.5);
  g.fillCircle(CX - 9, HEAD_Y + 7, 3.5);
}

/** Vẽ sẵn texture nhân vật cho từng màu (chỉ làm một lần). */
export function ensurePlayerTextures(scene: Phaser.Scene): void {
  PLAYER_STYLES.forEach((style, i) => {
    if (scene.textures.exists(playerTextureKey(i))) return;
    const g = scene.make.graphics({}, false);
    drawBody(g, style);
    g.generateTexture(playerBodyTextureKey(i), TEX_W, TEX_H);
    // Bản cho menu: thêm tai hai bên và hai mắt đen nhìn thẳng.
    for (const s of [-1, 1]) drawEar(g, CX + s * (HEAD_R - 1), HEAD_Y + 2);
    for (const s of [-1, 1]) drawEye(g, CX + s * 5, HEAD_Y);
    g.generateTexture(playerTextureKey(i), TEX_W, TEX_H);
    g.destroy();
  });
}

/** Tai: nửa hình tròn màu da, viền đậm. */
export function drawEar(g: Phaser.GameObjects.Graphics, x: number, y: number): void {
  g.fillStyle(SKIN, 1).fillCircle(x, y, 5);
  g.lineStyle(2.5, OUTLINE, 1).strokeCircle(x, y, 5);
}

/** Mắt: hình chữ nhật đứng màu đen, bo tròn. */
export function drawEye(g: Phaser.GameObjects.Graphics, x: number, y: number, h = 10): void {
  g.fillStyle(0x16120f, 1).fillRoundedRect(x - 2.5, y - h / 2, 5, h, 2.5);
}
