import { describe, expect, it } from 'vitest';
import { rainPuddles } from '../src/systems/rain';

const yard = { rect: { x: 1000, y: 0, w: 600, h: 900 }, color: 0, outdoor: true };
const room = { rect: { x: 0, y: 0, w: 1000, h: 900 }, color: 0, outdoor: false };
const bed = { x: 1200, y: 300, w: 260, h: 220 };

describe('Modifier mưa', () => {
  it('vũng nước chỉ ở sân ngoài trời, không vào thùng xe, cùng màn thì cùng vị trí', () => {
    const a = rainPuddles('lv05_rainy_day', { floors: [room, yard] }, bed);
    const b = rainPuddles('lv05_rainy_day', { floors: [room, yard] }, bed);
    expect(a).toEqual(b);
    expect(a.length).toBeGreaterThan(8);
    for (const p of a) {
      expect(p.x - p.radius).toBeGreaterThanOrEqual(1000);
      expect(p.x + p.radius).toBeLessThanOrEqual(1600);
      const inBed = p.x > bed.x && p.x < bed.x + bed.w && p.y > bed.y && p.y < bed.y + bed.h;
      expect(inBed).toBe(false);
    }
    expect(rainPuddles('other', { floors: [yard] }, null)).not.toEqual(a);
  });
});
