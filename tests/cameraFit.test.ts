import { describe, expect, it } from 'vitest';
import { edgeIndicator, fitCamera, wholeMapZoom } from '../src/systems/cameraFit';

const base = {
  view: { w: 1280, h: 720 },
  map: { w: 1600, h: 960 },
  padding: 200,
  maxZoom: 1.2,
  hudTop: 56,
};

describe('fitCamera', () => {
  it('một người: zoom gần nhất, tâm ở người đó (dời lên vì thanh HUD)', () => {
    const r = fitCamera({ ...base, points: [{ x: 500, y: 400 }] });
    expect(r.zoom).toBe(1.2);
    expect(r.center.x).toBe(500);
    expect(r.center.y).toBeCloseTo(400 - 56 / 2.4);
  });

  it('hai người ở hai góc bản đồ: zoom ra vừa đủ thấy cả bản đồ, không xa hơn', () => {
    const r = fitCamera({
      ...base,
      points: [
        { x: 50, y: 50 },
        { x: 1550, y: 900 },
      ],
    });
    expect(r.zoom).toBeCloseTo(wholeMapZoom(base.view, base.map, base.hudTop));
  });

  it('người càng xa nhau zoom càng nhỏ', () => {
    const near = fitCamera({
      ...base,
      points: [
        { x: 400, y: 400 },
        { x: 600, y: 400 },
      ],
    });
    const far = fitCamera({
      ...base,
      points: [
        { x: 200, y: 400 },
        { x: 1200, y: 400 },
      ],
    });
    expect(far.zoom).toBeLessThan(near.zoom);
  });

  it('không có ai: thấy cả bản đồ', () => {
    expect(fitCamera({ ...base, points: [] }).zoom).toBeCloseTo(
      wholeMapZoom(base.view, base.map, 56),
    );
  });
});

describe('edgeIndicator', () => {
  const area = { x: 0, y: 56, w: 1280, h: 664 };
  it('trong khung thì không có mũi tên', () => {
    expect(edgeIndicator({ x: 640, y: 400 }, area, 30)).toBeNull();
  });
  it('ngoài bên phải: mũi tên ở mép phải, chỉ sang phải', () => {
    const r = edgeIndicator({ x: 2000, y: 388 }, area, 30)!;
    expect(r.pos.x).toBeCloseTo(1250);
    expect(r.angle).toBeCloseTo(0);
  });
  it('ngoài phía trên: mũi tên nằm dưới thanh HUD', () => {
    const r = edgeIndicator({ x: 640, y: -500 }, area, 30)!;
    expect(r.pos.y).toBeCloseTo(86);
  });
});
