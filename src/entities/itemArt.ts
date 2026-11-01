import Phaser from 'phaser';

/**
 * Hình vẽ tay (bằng code) cho từng món đồ, cùng kiểu với nhân vật: viền nâu đậm, màu tươi,
 * vệt sáng, vài món có mặt cười dễ thương. Nhìn từ trên xuống, vẽ gọn trong khung `w × h`
 * (tâm ở `cx, cy`). Món chưa có hình ở đây thì dùng khối màu + emoji (`icon` trong data).
 */
type G = Phaser.GameObjects.Graphics;
type Draw = (g: G, cx: number, cy: number, w: number, h: number) => void;

const OUT = 0x2a2320;
const SKIN = 0xf2b48c;
const LINE = 3;

const shade = (c: number, amt: number) =>
  amt >= 0
    ? Phaser.Display.Color.IntegerToColor(c).lighten(amt).color
    : Phaser.Display.Color.IntegerToColor(c).darken(-amt).color;

/** Hình chữ nhật bo góc có viền. */
function box(g: G, x: number, y: number, w: number, h: number, color: number, r = 6, lw = LINE) {
  g.fillStyle(color, 1).fillRoundedRect(x, y, w, h, Math.min(r, w / 2, h / 2));
  g.lineStyle(lw, OUT, 1).strokeRoundedRect(x, y, w, h, Math.min(r, w / 2, h / 2));
}

function circle(g: G, x: number, y: number, r: number, color: number, lw = LINE) {
  g.fillStyle(color, 1).fillCircle(x, y, r);
  if (lw > 0) g.lineStyle(lw, OUT, 1).strokeCircle(x, y, r);
}

/** Vệt sáng trắng mờ góc trên trái. */
function shine(g: G, x: number, y: number, w: number, h: number) {
  g.fillStyle(0xffffff, 0.35).fillRoundedRect(x, y, w, h, Math.min(h / 2, 4));
}

/** Mặt cười: hai mắt chấm, má hồng, miệng chữ w. */
function face(g: G, cx: number, cy: number, s = 1) {
  g.fillStyle(OUT, 1);
  g.fillEllipse(cx - 6 * s, cy - 2 * s, 3.6 * s, 5 * s);
  g.fillEllipse(cx + 6 * s, cy - 2 * s, 3.6 * s, 5 * s);
  g.fillStyle(0xff8a80, 0.55);
  g.fillCircle(cx - 10 * s, cy + 3 * s, 2.6 * s);
  g.fillCircle(cx + 10 * s, cy + 3 * s, 2.6 * s);
  g.lineStyle(1.8 * s, OUT, 1);
  g.beginPath();
  g.arc(cx - 2 * s, cy + 3 * s, 2 * s, 0, Math.PI);
  g.arc(cx + 2 * s, cy + 3 * s, 2 * s, 0, Math.PI);
  g.strokePath();
}

function fishShape(g: G, x: number, y: number, s: number, color: number, flip = false) {
  const d = flip ? -1 : 1;
  g.fillStyle(color, 1).fillEllipse(x, y, 12 * s, 7 * s);
  g.fillTriangle(x - d * 5 * s, y, x - d * 10 * s, y - 4 * s, x - d * 10 * s, y + 4 * s);
  g.lineStyle(1.2, OUT, 1).strokeEllipse(x, y, 12 * s, 7 * s);
  g.fillStyle(OUT, 1).fillCircle(x + d * 3 * s, y - 1 * s, 1 * s);
}

const ART: Record<string, Draw> = {
  box(g, cx, cy, w, h) {
    const x = cx - w / 2;
    const y = cy - h / 2;
    box(g, x, y, w, h, 0xd4a26a, 5);
    // Băng keo dọc + nếp nắp thùng
    g.fillStyle(0xe9c48f, 1).fillRect(cx - 4, y + 2, 8, h - 4);
    g.lineStyle(1.5, shade(0xd4a26a, -25), 1).lineBetween(
      x + 3,
      cy - h * 0.18,
      x + w - 3,
      cy - h * 0.18,
    );
    face(g, cx, cy + 5, 0.8);
  },
  mirror(g, cx, cy, w) {
    // Gương cầm tay: mặt gương tròn khung gỗ + cán cầm.
    const r = 11;
    const mx = cx - w / 2 + r + 1;
    box(g, mx + r - 2, cy - 3, w - 2 * r - 1, 6, 0xa47148, 3, 2);
    g.fillStyle(0x8a5a35, 1).fillCircle(cx + w / 2 - 3, cy, 3.2);
    circle(g, mx, cy, r, 0xa47148, 2.5);
    circle(g, mx, cy, r - 3, 0xcfeefc, 1.5);
    g.lineStyle(2, 0xffffff, 0.95).lineBetween(mx - 4, cy + 3, mx + 1, cy - 4);
    g.lineStyle(1.5, 0xffffff, 0.8).lineBetween(mx - 1, cy + 5, mx + 4, cy - 2);
  },
  plant(g, cx, cy, w) {
    const r = w / 2;
    circle(g, cx, cy, r, 0xd9774c);
    circle(g, cx, cy, r * 0.72, 0x5d4037, 0);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.3;
      const lx = cx + Math.cos(a) * r * 0.42;
      const ly = cy + Math.sin(a) * r * 0.42;
      g.fillStyle(i % 2 ? 0x66bb6a : 0x43a047, 1).fillEllipse(lx, ly, r * 0.75, r * 0.5);
      g.lineStyle(1.5, OUT, 1).strokeEllipse(lx, ly, r * 0.75, r * 0.5);
    }
    circle(g, cx, cy, r * 0.22, 0xffeb3b, 1.5);
  },
  teddy(g, cx, cy, w) {
    const r = w / 2 - 2;
    circle(g, cx - r * 0.7, cy - r * 0.7, r * 0.42, 0xb5835a, 2);
    circle(g, cx + r * 0.7, cy - r * 0.7, r * 0.42, 0xb5835a, 2);
    circle(g, cx, cy, r, 0xb5835a, 2.5);
    g.fillStyle(0xe8c9a6, 1).fillEllipse(cx, cy + r * 0.3, r * 0.9, r * 0.65);
    g.fillStyle(OUT, 1)
      .fillCircle(cx - r * 0.35, cy - r * 0.15, 1.6)
      .fillCircle(cx + r * 0.35, cy - r * 0.15, 1.6);
    g.fillCircle(cx, cy + r * 0.2, 1.8);
    g.fillStyle(0xff8a80, 0.6)
      .fillCircle(cx - r * 0.6, cy + r * 0.2, 1.8)
      .fillCircle(cx + r * 0.6, cy + r * 0.2, 1.8);
  },
  fridge(g, cx, cy, w, h) {
    const x = cx - w / 2;
    const y = cy - h / 2;
    box(g, x, y, w, h, 0xeef3f7, 8);
    g.lineStyle(2, OUT, 1).lineBetween(x + 2, y + h * 0.36, x + w - 2, y + h * 0.36);
    g.fillStyle(0x90a4ae, 1).fillRoundedRect(x + w - 10, y + 6, 4, h * 0.22, 2);
    g.fillRoundedRect(x + w - 10, y + h * 0.42, 4, h * 0.3, 2);
    shine(g, x + 5, y + 5, w * 0.35, 5);
    // Nam châm tủ lạnh
    circle(g, x + 10, y + h * 0.2, 3, 0xff7043, 1.5);
    circle(g, x + 18, y + h * 0.16, 2.5, 0x66bb6a, 1.5);
    face(g, cx - 3, y + h * 0.66, 1);
  },
  sofa(g, cx, cy, w, h) {
    const x = cx - w / 2;
    const y = cy - h / 2;
    const c = 0x9c6ab0;
    box(g, x, y, w, h, shade(c, -20), 10);
    box(g, x + 4, y + 3, w - 8, h * 0.32, shade(c, -8), 8);
    box(g, x + 2, y + h * 0.3, 16, h * 0.68, c, 7);
    box(g, x + w - 18, y + h * 0.3, 16, h * 0.68, c, 7);
    const sw = (w - 40) / 3;
    for (let i = 0; i < 3; i++)
      box(g, x + 20 + i * sw, y + h * 0.38, sw - 2, h * 0.56, shade(c, 10), 6, 2);
    // Gối ôm
    g.fillStyle(0xffd54f, 1).fillRoundedRect(x + 24, y + h * 0.42, 16, 14, 4);
    g.lineStyle(2, OUT, 1).strokeRoundedRect(x + 24, y + h * 0.42, 16, 14, 4);
  },
  cat(g, cx, cy, w) {
    const r = w / 2;
    const orange = 0xf4a261;
    // Đuôi cong bên phải
    g.lineStyle(5, OUT, 1).beginPath();
    g.arc(cx + r * 0.9, cy + r * 0.35, r * 0.55, Math.PI * 0.6, Math.PI * 1.7, false);
    g.strokePath();
    g.lineStyle(3, orange, 1).beginPath();
    g.arc(cx + r * 0.9, cy + r * 0.35, r * 0.55, Math.PI * 0.6, Math.PI * 1.7, false);
    g.strokePath();
    // Bốn chân (bàn chân trắng)
    for (const [px, py] of [
      [-0.55, 0.95],
      [-0.15, 1.05],
      [0.25, 1.05],
      [0.62, 0.92],
    ] as const) {
      g.fillStyle(orange, 1).fillRoundedRect(cx + px * r - 2.5, cy + py * r - 5, 5, 7, 2);
      g.lineStyle(1.5, OUT, 1).strokeRoundedRect(cx + px * r - 2.5, cy + py * r - 5, 5, 7, 2);
      g.fillStyle(0xfff3e0, 1).fillEllipse(cx + px * r, cy + py * r + 1.5, 5, 2.6);
    }
    // Thân
    g.fillStyle(orange, 1).fillEllipse(cx + r * 0.05, cy + r * 0.45, r * 1.75, r * 1.05);
    g.lineStyle(2, OUT, 1).strokeEllipse(cx + r * 0.05, cy + r * 0.45, r * 1.75, r * 1.05);
    g.lineStyle(1.5, 0xd9773a, 1).lineBetween(cx - 2, cy + r * 0.2, cx - 2, cy + r * 0.6);
    g.lineBetween(cx + 3, cy + r * 0.2, cx + 3, cy + r * 0.6);
    // Đầu + tai
    const hy = cy - r * 0.35;
    const hr = r * 0.62;
    g.fillStyle(orange, 1);
    g.fillTriangle(
      cx - hr * 0.95,
      hy - hr * 0.1,
      cx - hr * 0.8,
      hy - hr * 1.2,
      cx - hr * 0.2,
      hy - hr * 0.8,
    );
    g.fillTriangle(
      cx + hr * 0.95,
      hy - hr * 0.1,
      cx + hr * 0.8,
      hy - hr * 1.2,
      cx + hr * 0.2,
      hy - hr * 0.8,
    );
    g.lineStyle(1.8, OUT, 1);
    g.strokeTriangle(
      cx - hr * 0.95,
      hy - hr * 0.1,
      cx - hr * 0.8,
      hy - hr * 1.2,
      cx - hr * 0.2,
      hy - hr * 0.8,
    );
    g.strokeTriangle(
      cx + hr * 0.95,
      hy - hr * 0.1,
      cx + hr * 0.8,
      hy - hr * 1.2,
      cx + hr * 0.2,
      hy - hr * 0.8,
    );
    circle(g, cx, hy, hr, orange, 2);
    g.fillStyle(OUT, 1)
      .fillEllipse(cx - hr * 0.38, hy, 2, 3)
      .fillEllipse(cx + hr * 0.38, hy, 2, 3);
    g.fillStyle(0xff8a80, 1).fillTriangle(
      cx - 1.3,
      hy + hr * 0.3,
      cx + 1.3,
      hy + hr * 0.3,
      cx,
      hy + hr * 0.45,
    );
    g.lineStyle(0.9, OUT, 0.8);
    for (const sd of [-1, 1]) {
      g.lineBetween(cx + sd * hr * 0.3, hy + hr * 0.4, cx + sd * hr * 1.2, hy + hr * 0.25);
      g.lineBetween(cx + sd * hr * 0.3, hy + hr * 0.5, cx + sd * hr * 1.2, hy + hr * 0.65);
    }
  },
  cat_carrier(g, cx, cy, w, h) {
    const x = cx - w / 2;
    const y = cy - h / 2;
    box(g, x, y, w, h, 0x90caf9, 7);
    box(g, x + w * 0.22, y + 4, w * 0.56, h - 8, 0x3d4a55, 4, 2);
    g.lineStyle(1.8, 0xb0bec5, 1);
    for (let i = 1; i < 4; i++)
      g.lineBetween(
        x + w * 0.22 + (i * w * 0.56) / 4,
        y + 5,
        x + w * 0.22 + (i * w * 0.56) / 4,
        y + h - 5,
      );
    g.fillStyle(0xffd54f, 1)
      .fillCircle(x + 6, cy, 2.5)
      .fillCircle(x + w - 6, cy, 2.5);
  },
  fish_tank(g, cx, cy, w, h) {
    const x = cx - w / 2;
    const y = cy - h / 2;
    box(g, x, y, w, h, 0x4fc3f7, 4);
    g.fillStyle(0xf6d58e, 1).fillRect(x + 2, y + h - 7, w - 4, 5);
    fishShape(g, cx - 6, cy - 2, 0.9, 0xff8a65);
    fishShape(g, cx + 10, cy + 3, 0.7, 0xffd54f, true);
    g.lineStyle(1.2, 0xffffff, 0.9)
      .strokeCircle(x + w - 8, y + 6, 2)
      .strokeCircle(x + w - 12, y + 10, 1.5);
    shine(g, x + 3, y + 3, w * 0.3, 3);
  },
  treadmill(g, cx, cy, w, h) {
    const x = cx - w / 2;
    const y = cy - h / 2;
    box(g, x, y, w, h, 0x78909c, 6);
    box(g, x + 6, y + 6, w - 32, h - 12, 0x37474f, 3, 2);
    g.lineStyle(1.5, 0x546e7a, 1);
    for (let i = 1; i < 8; i++)
      g.lineBetween(x + 6 + (i * (w - 32)) / 8, y + 7, x + 6 + (i * (w - 32)) / 8, y + h - 7);
    box(g, x + w - 24, y + 3, 20, h - 6, 0xcfd8dc, 4, 2);
    circle(g, x + w - 14, cy, 4, 0xef5350, 1.5);
  },
  upright_piano(g, cx, cy, w, h) {
    const x = cx - w / 2;
    const y = cy - h / 2;
    box(g, x, y, w, h, 0x6d4c41, 6);
    shine(g, x + 5, y + 4, w * 0.4, 4);
    box(g, x + 4, y + h * 0.58, w - 8, h * 0.36, 0xfafafa, 2, 2);
    g.fillStyle(OUT, 1);
    const kw = (w - 8) / 14;
    for (let i = 1; i < 14; i++) {
      g.fillRect(x + 4 + i * kw - 0.5, y + h * 0.58, 1, h * 0.36);
      if (i % 7 !== 3 && i % 7 !== 0) g.fillRect(x + 4 + i * kw - 2, y + h * 0.58, 4, h * 0.2);
    }
  },
  safe(g, cx, cy, w, h) {
    const x = cx - w / 2;
    const y = cy - h / 2;
    box(g, x, y, w, h, 0x78909c, 6);
    box(g, x + 5, y + 5, w - 10, h - 10, 0x607d8b, 4, 2);
    circle(g, cx - 3, cy + 2, w * 0.18, 0xcfd8dc, 2.5);
    g.lineStyle(2, OUT, 1).lineBetween(cx - 3, cy + 2, cx - 3, cy + 2 - w * 0.14);
    g.fillStyle(0xffd54f, 1).fillRoundedRect(cx + w * 0.22, cy - 2, 5, 12, 2);
    g.fillStyle(OUT, 1)
      .fillEllipse(cx - 9, y + 13, 3, 4)
      .fillEllipse(cx + 3, y + 13, 3, 4);
    g.lineStyle(2, OUT, 1)
      .lineBetween(cx - 12, y + 9, cx - 6, y + 11)
      .lineBetween(cx + 6, y + 9, cx, y + 11);
  },
  pool_table(g, cx, cy, w, h) {
    const x = cx - w / 2;
    const y = cy - h / 2;
    box(g, x, y, w, h, 0x8d5a3b, 10);
    box(g, x + 10, y + 10, w - 20, h - 20, 0x2e9e4f, 4, 2);
    for (const [px, py] of [
      [x + 11, y + 11],
      [cx, y + 9],
      [x + w - 11, y + 11],
      [x + 11, y + h - 11],
      [cx, y + h - 9],
      [x + w - 11, y + h - 11],
    ] as const)
      circle(g, px, py, 5, 0x1b1b1b, 0);
    const balls = [0xffffff, 0xffd54f, 0xef5350, 0x42a5f5, 0x8e24aa, 0xff9800];
    balls.forEach((c, i) =>
      circle(g, cx + 20 + (i % 3) * 9 - (i > 2 ? 4 : 0), cy - 6 + Math.floor(i / 3) * 9, 4, c, 1.5),
    );
    g.lineStyle(3, 0xe0b97a, 1).lineBetween(x + 20, cy + 14, cx - 4, cy + 4);
  },
  weight_rack(g, cx, cy, w, h) {
    const x = cx - w / 2;
    const y = cy - h / 2;
    box(g, x, y, w, h, 0x455a64, 5);
    g.fillStyle(0x263238, 1).fillRect(x + 6, cy - 2, w - 12, 4);
    for (let i = 0; i < 5; i++) {
      const px = x + 16 + i * ((w - 32) / 4);
      circle(g, px, cy - h * 0.18, h * 0.16, i % 2 ? 0xef5350 : 0x90a4ae, 2);
      circle(g, px, cy + h * 0.2, h * 0.16, i % 2 ? 0x90a4ae : 0xef5350, 2);
    }
  },
  giant_aquarium(g, cx, cy, w, h) {
    const x = cx - w / 2;
    const y = cy - h / 2;
    box(g, x, y, w, h, 0x29b6f6, 6);
    g.fillStyle(0xf6d58e, 1).fillRect(x + 3, y + h - 10, w - 6, 7);
    for (let i = 0; i < 5; i++) {
      const sx = x + 14 + i * (w / 5);
      g.lineStyle(3, 0x43a047, 1).lineBetween(sx, y + h - 8, sx + 4, y + h - 26);
    }
    circle(g, x + w * 0.7, y + h - 12, 7, 0x9e9e9e, 2);
    fishShape(g, cx - 30, cy - 8, 1.3, 0xff8a65);
    fishShape(g, cx + 10, cy - 14, 1, 0xffd54f, true);
    fishShape(g, cx + 40, cy + 2, 1.1, 0xba68c8);
    g.lineStyle(1.3, 0xffffff, 0.9)
      .strokeCircle(x + 20, y + 14, 2.5)
      .strokeCircle(x + 24, y + 8, 1.6);
    shine(g, x + 4, y + 4, w * 0.25, 4);
  },
  grand_piano(g, cx, cy, w, h) {
    const x = cx - w / 2;
    const y = cy - h / 2;
    // Thân đàn cong một bên (kiểu đàn cánh) + nắp bóng loáng.
    const r = { tl: 10, bl: 10, tr: h * 0.5, br: h * 0.22 };
    g.fillStyle(0x1f1f24, 1).fillRoundedRect(x, y, w, h, r);
    g.lineStyle(LINE, OUT, 1).strokeRoundedRect(x, y, w, h, r);
    g.lineStyle(2, 0x55555f, 1).strokeRoundedRect(x + 26, y + 7, w - 34, h - 14, {
      tl: 6,
      bl: 6,
      tr: h * 0.42,
      br: h * 0.16,
    });
    shine(g, x + w * 0.35, y + 12, w * 0.3, 5);
    box(g, x + 4, y + 8, 16, h - 16, 0xfafafa, 2, 2);
    g.fillStyle(OUT, 1);
    for (let i = 1; i < 12; i++) {
      const ky = y + 8 + (i * (h - 16)) / 12;
      g.fillRect(x + 4, ky - 0.5, 16, 1);
      if (i % 7 !== 3 && i % 7 !== 0) g.fillRect(x + 4, ky - 2, 9, 4);
    }
    circle(g, x + w * 0.62, cy, 4, 0xffd54f, 1.5);
  },
  statue(g, cx, cy, w, h) {
    const x = cx - w / 2;
    const y = cy - h / 2;
    box(g, x, y, w, h, 0xbdbdbd, 6);
    box(g, cx - w * 0.28, cy - h * 0.38, w * 0.56, h * 0.76, 0x9e9e9e, 10);
    g.fillStyle(0x757575, 1).fillRect(cx - w * 0.26, cy - h * 0.3, w * 0.52, 6);
    g.fillStyle(OUT, 1)
      .fillRect(cx - 9, cy - 6, 6, 3)
      .fillRect(cx + 3, cy - 6, 6, 3);
    g.fillStyle(0x8a8a8a, 1).fillRoundedRect(cx - 3, cy - 4, 6, 14, 3);
    g.lineStyle(2, OUT, 1).lineBetween(cx - 7, cy + 16, cx + 7, cy + 16);
  },
  food(g, cx, cy, w) {
    circle(g, cx, cy + 1, w / 2 - 1, 0xef5350, 2);
    g.fillStyle(0x43a047, 1).fillEllipse(cx + 3, cy - w / 2 + 2, 6, 3);
    g.fillStyle(0xffffff, 0.5).fillCircle(cx - 2, cy - 1, 1.6);
  },
  fish(g, cx, cy, w) {
    fishShape(g, cx + 1, cy, w / 13, 0xffa726);
  },
  ball(g, cx, cy, w) {
    circle(g, cx, cy, w / 2 - 1, 0xffffff, 1.5);
    g.fillStyle(0x42a5f5, 1).fillRect(cx - w / 2 + 2, cy - 2, w - 4, 4);
    g.fillStyle(0xffffff, 1).fillCircle(cx, cy, 2);
  },
  dumbbell(g, cx, cy, w) {
    g.fillStyle(0x9e9e9e, 1).fillRect(cx - w / 2 + 3, cy - 1.5, w - 6, 3);
    box(g, cx - w / 2 + 1, cy - 6, 5, 12, 0x546e7a, 2, 1.5);
    box(g, cx + w / 2 - 6, cy - 6, 5, 12, 0x546e7a, 2, 1.5);
  },
  book(g, cx, cy, w, h) {
    box(g, cx - w / 2, cy - h / 2, w, h, 0x7986cb, 3, 2);
    g.fillStyle(0xffffff, 1).fillRect(cx + w / 2 - 5, cy - h / 2 + 2, 3, h - 4);
    g.fillStyle(0xffd54f, 1).fillRect(cx - w / 2 + 4, cy - 3, w - 12, 3);
  },
  paparazzi(g, cx, cy, w) {
    const r = w / 2 - 1;
    circle(g, cx, cy, r, SKIN, 2.5);
    // Mũ lưỡi trai + kính râm + máy ảnh to
    g.fillStyle(0xe53935, 1).fillEllipse(cx, cy - r * 0.55, r * 1.6, r * 0.8);
    g.lineStyle(2, OUT, 1).strokeEllipse(cx, cy - r * 0.55, r * 1.6, r * 0.8);
    g.fillStyle(OUT, 1).fillRoundedRect(cx - r * 0.7, cy - r * 0.15, r * 0.6, r * 0.35, 2);
    g.fillRoundedRect(cx + r * 0.1, cy - r * 0.15, r * 0.6, r * 0.35, 2);
    box(g, cx - r * 0.55, cy + r * 0.3, r * 1.1, r * 0.6, 0x37474f, 3, 2);
    circle(g, cx, cy + r * 0.6, r * 0.22, 0x90caf9, 1.5);
  },
};

/** Món đồ này có hình vẽ riêng không (không thì dùng khối màu + emoji). */
export function hasItemArt(id: string): boolean {
  return id in ART;
}

/** Vẽ món đồ `id` vào `g` trong khung `w × h` tâm `(cx, cy)`. Trả về false nếu chưa có hình. */
export function drawItemArt(
  g: G,
  id: string,
  cx: number,
  cy: number,
  w: number,
  h: number,
): boolean {
  const draw = ART[id];
  if (!draw) return false;
  draw(g, cx, cy, w, h);
  return true;
}
