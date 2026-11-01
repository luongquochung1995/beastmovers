/**
 * Bộ tổng hợp âm thanh nhỏ trên Web Audio: không cần file âm thanh (game chỉ có data JSON +
 * code). Mỗi hàm tạo một tiếng ngắn rồi tự dọn. Lỗi (trình duyệt chặn tiếng, không có Web Audio)
 * thì im lặng.
 */
import { audioContext, masterVolume } from './mixer';

export interface Voice {
  /** Độ lớn 0..1 (trước âm lượng chung). */
  gain?: number;
  /** -1 (trái) .. 1 (phải). */
  pan?: number;
  /** Trễ (giây) so với bây giờ. */
  at?: number;
}

let noiseBuf: AudioBuffer | null = null;

function noise(ctx: AudioContext): AudioBuffer {
  if (!noiseBuf || noiseBuf.sampleRate !== ctx.sampleRate) {
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  return noiseBuf;
}

/** Đầu ra chung của một tiếng: âm lượng + vị trí trái/phải. */
function out(ctx: AudioContext, v: Voice, bus: AudioNode | null): GainNode | null {
  const vol = (v.gain ?? 1) * masterVolume();
  if (vol <= 0.001) return null;
  const g = ctx.createGain();
  g.gain.value = vol;
  let node: AudioNode = g;
  if (v.pan && ctx.createStereoPanner) {
    const p = ctx.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, v.pan));
    g.connect(p);
    node = p;
  }
  node.connect(bus ?? ctx.destination);
  return g;
}

export interface ToneOpts extends Voice {
  type?: OscillatorType;
  freq: number;
  /** Tần số cuối (trượt), mặc định giữ nguyên. */
  to?: number;
  dur: number;
  attack?: number;
}

/** Một nốt có đường bao (lên nhanh, tắt dần). */
export function tone(o: ToneOpts, bus: AudioNode | null = null): void {
  try {
    const ctx = audioContext();
    if (!ctx) return;
    const dst = out(ctx, o, bus);
    if (!dst) return;
    const t = ctx.currentTime + (o.at ?? 0);
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = o.type ?? 'sine';
    osc.frequency.setValueAtTime(o.freq, t);
    if (o.to) osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.to), t + o.dur);
    const a = o.attack ?? 0.005;
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(1, t + a);
    env.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
    osc.connect(env).connect(dst);
    osc.start(t);
    osc.stop(t + o.dur + 0.02);
  } catch {
    // im lặng
  }
}

export interface NoiseOpts extends Voice {
  dur: number;
  /** Bộ lọc: lowpass (ầm), bandpass (sột soạt), highpass (xì, kính). */
  filter?: BiquadFilterType;
  freq?: number;
  to?: number;
  q?: number;
  attack?: number;
}

/** Tiếng ồn có lọc: va chạm, bụi, nước, kính vỡ. */
export function burst(o: NoiseOpts, bus: AudioNode | null = null): void {
  try {
    const ctx = audioContext();
    if (!ctx) return;
    const dst = out(ctx, o, bus);
    if (!dst) return;
    const t = ctx.currentTime + (o.at ?? 0);
    const src = ctx.createBufferSource();
    src.buffer = noise(ctx);
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = o.filter ?? 'lowpass';
    f.frequency.setValueAtTime(o.freq ?? 1000, t);
    if (o.to) f.frequency.exponentialRampToValueAtTime(Math.max(1, o.to), t + o.dur);
    f.Q.value = o.q ?? 1;
    const env = ctx.createGain();
    const a = o.attack ?? 0.003;
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(1, t + a);
    env.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
    src.connect(f).connect(env).connect(dst);
    src.start(t, Math.random() * 0.5);
    src.stop(t + o.dur + 0.02);
  } catch {
    // im lặng
  }
}

/** Tần số của nốt nhạc (0 = La 440 Hz, tính theo nửa cung). */
export function note(semitonesFromA4: number): number {
  return 440 * Math.pow(2, semitonesFromA4 / 12);
}
