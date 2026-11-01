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

/**
 * Trình duyệt chỉ cho phát tiếng sau khi người chơi bấm phím / chạm / bấm chuột: lần đầu có
 * thao tác thì đánh thức AudioContext (nhạc menu bắt đầu nghe được từ lúc đó).
 */
export function unlockAudioOnGesture(target: Window = window): void {
  const unlock = () => {
    const c = audioContext();
    if (c?.state === 'running') {
      target.removeEventListener('pointerdown', unlock);
      target.removeEventListener('keydown', unlock);
    }
  };
  target.addEventListener('pointerdown', unlock);
  target.addEventListener('keydown', unlock);
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
