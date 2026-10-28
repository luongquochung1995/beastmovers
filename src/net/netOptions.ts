/** Chế độ mạng chọn qua URL (để thử nghiệm). */
export interface NetOptions {
  /** `local`: chơi chung máy trực tiếp; `loopback`: input đi vòng qua mạng giả. */
  mode: 'local' | 'loopback';
  lagMs: number;
  jitterMs: number;
  loss: number;
}

const num = (v: string | null, fallback: number, max: number) => {
  const n = v === null ? NaN : Number(v);
  return Number.isFinite(n) ? Math.max(0, Math.min(max, n)) : fallback;
};

/** `?net=loopback&lag=100&jitter=20&loss=0.05` */
export function parseNetOptions(search: string): NetOptions {
  const p = new URLSearchParams(search);
  return {
    mode: p.get('net') === 'loopback' ? 'loopback' : 'local',
    lagMs: num(p.get('lag'), 100, 2000),
    jitterMs: num(p.get('jitter'), 0, 1000),
    loss: num(p.get('loss'), 0, 0.9),
  };
}
