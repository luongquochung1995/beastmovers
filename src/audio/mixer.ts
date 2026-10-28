/**
 * Âm lượng chung cho mọi tiếng trong game (Web Audio). Đọc từ cài đặt lúc khởi động,
 * đổi trong màn Cài đặt.
 */
let master = 0.8;
let ctx: AudioContext | null = null;

export function setMasterVolume(volume: number): void {
  master = Math.max(0, Math.min(1, volume));
}

export function masterVolume(): number {
  return master;
}

/** AudioContext dùng chung; null nếu trình duyệt không có Web Audio. */
export function audioContext(): AudioContext | null {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}
