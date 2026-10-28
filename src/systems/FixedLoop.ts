/**
 * Vòng lặp logic bước cố định (fixed timestep).
 *
 * Logic game luôn chạy đúng `hz` lần mỗi giây, bất kể màn hình vẽ ở 30, 60 hay 144 Hz.
 * Thời gian dư được tích lũy cho khung hình sau; `alpha` cho biết đang ở đâu giữa
 * hai bước logic để phần vẽ hình có thể nội suy.
 */
export class FixedLoop {
  readonly stepMs: number;
  private accumulator = 0;

  constructor(
    hz = 60,
    /** Số bước tối đa trong một khung hình, tránh "vòng xoáy chết" khi máy bị khựng. */
    private readonly maxStepsPerFrame = 5,
  ) {
    this.stepMs = 1000 / hz;
  }

  /** Cộng thời gian thật đã trôi qua rồi chạy `step` đủ số lần cần thiết. Trả về số bước đã chạy. */
  advance(deltaMs: number, step: (stepMs: number) => void): number {
    this.accumulator += Math.max(0, deltaMs);
    let steps = 0;
    while (this.accumulator >= this.stepMs && steps < this.maxStepsPerFrame) {
      step(this.stepMs);
      this.accumulator -= this.stepMs;
      steps++;
    }
    // Máy bị khựng quá lâu: bỏ phần thời gian thừa thay vì cố chạy bù.
    if (steps === this.maxStepsPerFrame && this.accumulator >= this.stepMs) {
      this.accumulator = 0;
    }
    return steps;
  }

  /** Tỉ lệ 0..1 giữa bước logic trước và bước kế tiếp. */
  get alpha(): number {
    return this.accumulator / this.stepMs;
  }

  reset(): void {
    this.accumulator = 0;
  }
}
