/**
 * Bộ sinh số ngẫu nhiên có seed (mulberry32).
 * Logic game dùng bộ này thay cho Math.random để cùng seed thì ra cùng kết quả (dễ test, dễ debug).
 */
export class Random {
  private state: number;

  constructor(seed = Date.now()) {
    this.state = seed >>> 0;
  }

  /** Số thực trong [0, 1). */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  chance(p: number): boolean {
    return this.next() < p;
  }
}
