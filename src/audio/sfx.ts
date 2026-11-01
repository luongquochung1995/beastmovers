import { burst, note, tone, type Voice } from './synth';

/**
 * Các tiếng trong game, mỗi tiếng một kiểu dễ nhận ra để "tắt hình chỉ nghe tiếng vẫn đoán
 * được chuyện gì đang xảy ra". `size` 0..1 cho tiếng va chạm: đồ càng nặng càng trầm, càng to.
 */
export const Sfx = {
  /** Nắm đồ: "bóp" nhẹ. */
  grab: (v: Voice) =>
    tone({ ...v, type: 'triangle', freq: 520, to: 760, dur: 0.07, gain: 0.25 * (v.gain ?? 1) }),
  /** Buông đồ: "bóp" trầm hơn. */
  release: (v: Voice) =>
    tone({ ...v, type: 'triangle', freq: 420, to: 260, dur: 0.08, gain: 0.2 * (v.gain ?? 1) }),
  /** Ném: tiếng gió vút. */
  throw: (v: Voice) =>
    burst({
      ...v,
      filter: 'bandpass',
      freq: 600,
      to: 2400,
      q: 2,
      dur: 0.22,
      attack: 0.03,
      gain: 0.35 * (v.gain ?? 1),
    }),
  /** Rơi / đập: thình (trầm theo khối lượng). */
  thud: (v: Voice & { size: number }) => {
    const s = Math.max(0, Math.min(1, v.size));
    tone({
      ...v,
      type: 'sine',
      freq: 140 - 80 * s,
      to: 45,
      dur: 0.18 + 0.25 * s,
      gain: (0.45 + 0.5 * s) * (v.gain ?? 1),
    });
    burst({
      ...v,
      filter: 'lowpass',
      freq: 900 - 500 * s,
      to: 120,
      dur: 0.12 + 0.2 * s,
      gain: (0.3 + 0.4 * s) * (v.gain ?? 1),
    });
  },
  /** Đụng tường: cộc ngắn. */
  bump: (v: Voice) => {
    tone({ ...v, type: 'square', freq: 110, to: 70, dur: 0.07, gain: 0.18 * (v.gain ?? 1) });
    burst({ ...v, filter: 'lowpass', freq: 700, dur: 0.06, gain: 0.25 * (v.gain ?? 1) });
  },
  /** Kéo lê cào sàn: rè rè. */
  scrape: (v: Voice) =>
    burst({
      ...v,
      filter: 'bandpass',
      freq: 380,
      q: 3,
      dur: 0.35,
      attack: 0.05,
      gain: 0.25 * (v.gain ?? 1),
    }),
  /** Nứt (mất 1 nấc độ bền). */
  crack: (v: Voice) => {
    burst({ ...v, filter: 'highpass', freq: 2500, dur: 0.05, gain: 0.4 * (v.gain ?? 1) });
    tone({ ...v, type: 'square', freq: 1800, to: 900, dur: 0.04, gain: 0.08 * (v.gain ?? 1) });
  },
  /** Vỡ kính: xoảng + leng keng. */
  shatter: (v: Voice) => {
    burst({
      ...v,
      filter: 'highpass',
      freq: 3000,
      to: 1500,
      dur: 0.45,
      gain: 0.55 * (v.gain ?? 1),
    });
    for (let i = 0; i < 7; i++)
      tone({
        ...v,
        at: (v.at ?? 0) + 0.03 + Math.random() * 0.35,
        type: 'sine',
        freq: 2400 + Math.random() * 2600,
        dur: 0.12,
        gain: 0.12 * (v.gain ?? 1),
      });
  },
  /** Vỡ đồ không phải kính: rắc rắc. */
  crunch: (v: Voice) => {
    for (let i = 0; i < 4; i++)
      burst({
        ...v,
        at: (v.at ?? 0) + i * 0.05,
        filter: 'bandpass',
        freq: 900 + i * 300,
        q: 2,
        dur: 0.07,
        gain: 0.35 * (v.gain ?? 1),
      });
  },
  /** Nước đổ / tràn: ào. */
  splash: (v: Voice) => {
    burst({
      ...v,
      filter: 'bandpass',
      freq: 1200,
      to: 400,
      q: 0.8,
      dur: 0.5,
      attack: 0.02,
      gain: 0.45 * (v.gain ?? 1),
    });
    for (let i = 0; i < 4; i++)
      tone({
        ...v,
        at: (v.at ?? 0) + 0.1 + i * 0.07,
        type: 'sine',
        freq: 700 + Math.random() * 500,
        to: 1400,
        dur: 0.06,
        gain: 0.08 * (v.gain ?? 1),
      });
  },
  /** Đất đổ: lạo xạo. */
  soil: (v: Voice) =>
    burst({ ...v, filter: 'lowpass', freq: 1500, to: 300, dur: 0.4, gain: 0.35 * (v.gain ?? 1) }),
  /** Phím đàn piano (va vào đàn). */
  piano: (v: Voice) => {
    const base = Math.floor(Math.random() * 6) - 12;
    [0, 4, 7, 11].forEach((k, i) =>
      tone({
        ...v,
        at: (v.at ?? 0) + i * 0.035,
        type: 'triangle',
        freq: note(base + k + Math.floor(Math.random() * 3)),
        dur: 0.9,
        gain: 0.16 * (v.gain ?? 1),
      }),
    );
  },
  /** Bi / tạ lăn: lộc cộc. */
  rolling: (v: Voice) => {
    for (let i = 0; i < 6; i++)
      tone({
        ...v,
        at: (v.at ?? 0) + i * 0.08 + Math.random() * 0.04,
        type: 'square',
        freq: 300 + Math.random() * 400,
        dur: 0.03,
        gain: 0.08 * (v.gain ?? 1),
      });
  },
  /** Băng chuyền máy chạy bộ: rè đều. */
  motor: (v: Voice) =>
    tone({
      ...v,
      type: 'sawtooth',
      freq: 70,
      to: 120,
      dur: 0.8,
      attack: 0.1,
      gain: 0.12 * (v.gain ?? 1),
    }),
  /** Mèo kêu. */
  meow: (v: Voice) => {
    tone({
      ...v,
      type: 'sawtooth',
      freq: 650,
      to: 900,
      dur: 0.12,
      attack: 0.03,
      gain: 0.12 * (v.gain ?? 1),
    });
    tone({
      ...v,
      at: (v.at ?? 0) + 0.11,
      type: 'sawtooth',
      freq: 900,
      to: 480,
      dur: 0.22,
      gain: 0.12 * (v.gain ?? 1),
    });
  },
  /** Mèo khè (cào). */
  hiss: (v: Voice) =>
    burst({
      ...v,
      filter: 'highpass',
      freq: 3500,
      dur: 0.35,
      attack: 0.02,
      gain: 0.3 * (v.gain ?? 1),
    }),
  /** Đồ lên xe: ting ting vui. */
  loaded: (v: Voice) => {
    tone({ ...v, type: 'triangle', freq: note(3), dur: 0.12, gain: 0.25 * (v.gain ?? 1) });
    tone({
      ...v,
      at: (v.at ?? 0) + 0.09,
      type: 'triangle',
      freq: note(10),
      dur: 0.2,
      gain: 0.25 * (v.gain ?? 1),
    });
  },
  /** Đồ rơi khỏi xe: tụt. */
  unloaded: (v: Voice) =>
    tone({
      ...v,
      type: 'triangle',
      freq: note(5),
      to: note(-4),
      dur: 0.25,
      gain: 0.22 * (v.gain ?? 1),
    }),
  /** Xe đầy: bíp báo lỗi. */
  buzzer: (v: Voice) => {
    tone({ ...v, type: 'square', freq: 180, dur: 0.15, gain: 0.12 * (v.gain ?? 1) });
    tone({
      ...v,
      at: (v.at ?? 0) + 0.18,
      type: 'square',
      freq: 150,
      dur: 0.2,
      gain: 0.12 * (v.gain ?? 1),
    });
  },
  /** Phanh tay: cạch cạch. */
  ratchet: (v: Voice) => {
    for (let i = 0; i < 4; i++)
      burst({
        ...v,
        at: (v.at ?? 0) + i * 0.045,
        filter: 'highpass',
        freq: 2000,
        dur: 0.025,
        gain: 0.3 * (v.gain ?? 1),
      });
  },
  /** Còi xe tải. */
  horn: (v: Voice) => {
    tone({ ...v, type: 'sawtooth', freq: 233, dur: 0.5, attack: 0.02, gain: 0.12 * (v.gain ?? 1) });
    tone({ ...v, type: 'sawtooth', freq: 294, dur: 0.5, attack: 0.02, gain: 0.1 * (v.gain ?? 1) });
  },
  /** Xe nổ máy chạy đi. */
  engine: (v: Voice) => {
    tone({
      ...v,
      type: 'sawtooth',
      freq: 45,
      to: 90,
      dur: 2.2,
      attack: 0.2,
      gain: 0.18 * (v.gain ?? 1),
    });
    burst({
      ...v,
      filter: 'lowpass',
      freq: 250,
      dur: 2.2,
      attack: 0.3,
      gain: 0.25 * (v.gain ?? 1),
    });
  },
  /** Nhấc đồ to (đủ người): "hự" đi lên. */
  heave: (v: Voice) =>
    [0, 4, 7].forEach((k, i) =>
      tone({
        ...v,
        at: (v.at ?? 0) + i * 0.07,
        type: 'triangle',
        freq: note(-12 + k),
        dur: 0.25,
        gain: 0.2 * (v.gain ?? 1),
      }),
    ),
  /** Buông giữa chừng: "uầy" đi xuống. */
  fail: (v: Voice) => {
    tone({
      ...v,
      type: 'sawtooth',
      freq: note(-5),
      to: note(-9),
      dur: 0.3,
      gain: 0.12 * (v.gain ?? 1),
    });
    tone({
      ...v,
      at: (v.at ?? 0) + 0.3,
      type: 'sawtooth',
      freq: note(-9),
      to: note(-17),
      dur: 0.5,
      gain: 0.12 * (v.gain ?? 1),
    });
  },
  /** Vấp ngã: "oái". */
  oof: (v: Voice) =>
    tone({ ...v, type: 'triangle', freq: 330, to: 140, dur: 0.22, gain: 0.25 * (v.gain ?? 1) }),
  /** Ping: chuông, cao độ theo loại. */
  ping: (v: Voice & { pitch: number }) => {
    tone({ ...v, type: 'sine', freq: note(v.pitch), dur: 0.3, gain: 0.25 * (v.gain ?? 1) });
    tone({
      ...v,
      at: (v.at ?? 0) + 0.08,
      type: 'sine',
      freq: note(v.pitch + 7),
      dur: 0.35,
      gain: 0.2 * (v.gain ?? 1),
    });
  },
  /** Còn 1 phút: chuông báo. */
  alarm: (v: Voice) => {
    for (let i = 0; i < 3; i++)
      tone({
        ...v,
        at: (v.at ?? 0) + i * 0.22,
        type: 'square',
        freq: note(14),
        dur: 0.12,
        gain: 0.1 * (v.gain ?? 1),
      });
  },
  /** Chủ nhà đổi ý: "ơ?". */
  huh: (v: Voice) =>
    tone({
      ...v,
      type: 'triangle',
      freq: note(0),
      to: note(7),
      dur: 0.25,
      gain: 0.2 * (v.gain ?? 1),
    }),
  /** Chụp ảnh (paparazzi). */
  camera: (v: Voice) => {
    burst({ ...v, filter: 'highpass', freq: 3000, dur: 0.04, gain: 0.35 * (v.gain ?? 1) });
    burst({
      ...v,
      at: (v.at ?? 0) + 0.07,
      filter: 'bandpass',
      freq: 1800,
      dur: 0.05,
      gain: 0.25 * (v.gain ?? 1),
    });
  },
} as const;
