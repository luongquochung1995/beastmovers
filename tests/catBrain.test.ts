import { describe, expect, it } from 'vitest';
import {
  type CatParams,
  type CatSenses,
  createCatState,
  DEFAULT_CAT,
  fleeDirection,
  pickHideSpot,
  stepCat,
  stunCat,
} from '../src/systems/catBrain';

const params: CatParams = { ...DEFAULT_CAT, speed: 3.6, fleeRadius: 130 };
const DT = 1000 / 60;
const rnd = () => 0.5;
const senses = (over: Partial<CatSenses> = {}): CatSenses => ({
  pos: { x: 100, y: 100 },
  threats: [],
  hideSpots: [],
  canHide: true,
  ...over,
});

describe('catBrain', () => {
  it('không ai gần thì lang thang chậm', () => {
    const { state, velocity } = stepCat(createCatState(), senses(), DT, params, rnd);
    expect(state.mode).toBe('wander');
    expect(Math.hypot(velocity.x, velocity.y)).toBeLessThanOrEqual(params.wanderSpeed + 1e-9);
  });

  it('có người lại gần thì chạy ra xa với tốc độ chạy', () => {
    const { state, velocity } = stepCat(
      createCatState(),
      senses({ threats: [{ x: 60, y: 100 }] }),
      DT,
      params,
      rnd,
    );
    expect(state.mode).toBe('flee');
    expect(velocity.x).toBeGreaterThan(0);
    expect(Math.hypot(velocity.x, velocity.y)).toBeCloseTo(params.speed);
  });

  it('bị kẹp giữa hai người thì chạy ngang', () => {
    const d = fleeDirection({ x: 100, y: 100 }, [
      { x: 50, y: 100 },
      { x: 150, y: 100 },
      { x: 100, y: 50 },
    ]);
    expect(d.y).toBeGreaterThan(0.9);
  });

  it('chạy tới chỗ nấp an toàn hơn rồi nằm im', () => {
    const spot = { x: 300, y: 100 };
    let st = createCatState();
    const threats = [{ x: 40, y: 100 }];
    let r = stepCat(st, senses({ threats, hideSpots: [spot] }), DT, params, rnd);
    expect(r.state.mode).toBe('hide');
    expect(r.velocity.x).toBeGreaterThan(0);
    st = r.state;
    r = stepCat(st, senses({ pos: spot, threats, hideSpots: [spot] }), DT, params, rnd);
    expect(r.velocity).toEqual({ x: 0, y: 0 });
  });

  it('không chọn chỗ nấp ở phía có người', () => {
    expect(
      pickHideSpot({ x: 100, y: 100 }, [{ x: 200, y: 100 }], [{ x: 220, y: 100 }], 320),
    ).toBeNull();
  });

  it('đang nấp mà người tới sát thì bỏ chạy', () => {
    const spot = { x: 300, y: 100 };
    const hiding = { ...createCatState(), mode: 'hide' as const, hideTarget: spot };
    const r = stepCat(
      hiding,
      senses({ pos: spot, threats: [{ x: 260, y: 100 }], hideSpots: [spot], canHide: false }),
      DT,
      params,
      rnd,
    );
    expect(r.state.mode).toBe('flee');
  });

  it('bị lao trúng thì choáng, hết choáng thì chạy', () => {
    let st = stunCat(createCatState());
    const near = senses({ threats: [{ x: 80, y: 100 }] });
    let r = stepCat(st, near, DT, params, rnd);
    expect(r.velocity).toEqual({ x: 0, y: 0 });
    for (let i = 0; i < 80; i++) {
      r = stepCat(st, near, DT, params, rnd);
      st = r.state;
    }
    expect(st.mode).toBe('flee');
  });
});

describe('né cú lao', () => {
  const dasher = { id: 0, pos: { x: 40, y: 100 }, dir: { x: 1, y: 0 } };
  it('né được thì lạng vuông góc với hướng lao', () => {
    const r = stepCat(
      createCatState(),
      senses({ threats: [dasher.pos], dashers: [dasher] }),
      DT,
      params,
      () => 0,
    );
    expect(Math.abs(r.velocity.y)).toBeGreaterThan(params.speed);
    expect(Math.abs(r.velocity.x)).toBeLessThan(1e-9);
  });
  it('không kịp né thì chạy như thường, và giữ nguyên kết quả cho cả cú lao', () => {
    let st = createCatState();
    const s = senses({ threats: [dasher.pos], dashers: [dasher] });
    let r = stepCat(st, s, DT, params, () => 0.99);
    expect(r.velocity.x).toBeGreaterThan(0);
    st = r.state;
    r = stepCat(st, s, DT, params, () => 0);
    expect(r.velocity.x).toBeGreaterThan(0);
  });
  it('người lao đi hướng khác thì không cần né', () => {
    const away = { ...dasher, dir: { x: -1, y: 0 } };
    const r = stepCat(
      createCatState(),
      senses({ threats: [away.pos], dashers: [away] }),
      DT,
      params,
      () => 0,
    );
    expect(r.velocity.x).toBeGreaterThan(0);
  });
});
