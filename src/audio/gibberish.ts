/**
 * Tiếng lẩm bẩm vô nghĩa ("gibberish") cho chủ nhà: chuỗi tiếng "bíp" ngắn với cao độ ngẫu nhiên
 * quanh giọng của nhân vật. Dùng Web Audio, không cần file âm thanh.
 * Trình duyệt chỉ cho phát tiếng sau khi người chơi đã bấm phím/chuột; lỗi thì bỏ qua im lặng.
 */
let ctx: AudioContext | null = null;

export function speakGibberish(text: string, pitch: number, volume = 0.05): void {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    const syllables = Math.min(14, Math.max(3, Math.round(text.length / 4)));
    let t = ctx.currentTime + 0.02;
    for (let i = 0; i < syllables; i++) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = 210 * pitch * (0.8 + Math.random() * 0.5);
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(volume, t + 0.01);
      gain.gain.linearRampToValueAtTime(0, t + 0.065);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.07);
      t += 0.075 + Math.random() * 0.02;
    }
  } catch {
    // Không có Web Audio hoặc bị chặn: im lặng.
  }
}
