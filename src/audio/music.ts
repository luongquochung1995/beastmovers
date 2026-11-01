/**
 * Nhạc nền tổng hợp (không cần file): vòng lặp kiểu chiptune — bass, hợp âm rải, giai điệu,
 * hi-hat. Ba bài: menu (thong thả), màn chơi (nhún nhảy), còn 1 phút (nhanh, dồn dập).
 * Lên lịch trước 0,2 giây theo đồng hồ của Web Audio nên không bị giật khi game chậm.
 */
import { audioContext } from './mixer';
import { burst, note, tone } from './synth';

export type SongId = 'menu' | 'level' | 'hurry';

interface Song {
  bpm: number;
  /** Mỗi ô nhịp 8 bước (móc đơn): gốc hợp âm (nửa cung so với La 440) + loại. */
  bars: { root: number; minor?: boolean }[];
  /** Giai điệu: mỗi bước một nốt (nửa cung so với La 440) hoặc null (nghỉ). */
  melody: (number | null)[];
  hats: boolean;
  /** Nhạc nhẹ hơn (menu). */
  soft?: boolean;
}

const _ = null;
const LEVEL_MELODY = [
  8,
  _,
  12,
  _,
  15,
  12,
  8,
  _,
  5,
  _,
  8,
  _,
  12,
  _,
  10,
  _,
  13,
  _,
  12,
  10,
  8,
  _,
  10,
  _,
  12,
  _,
  15,
  _,
  17,
  15,
  12,
  _,
];
const SONGS: Record<SongId, Song> = {
  menu: {
    bpm: 92,
    bars: [{ root: -21 }, { root: -24, minor: true }, { root: -28 }, { root: -26 }],
    melody: [
      3,
      _,
      _,
      7,
      _,
      _,
      10,
      _,
      12,
      _,
      _,
      10,
      _,
      7,
      _,
      _,
      8,
      _,
      _,
      7,
      _,
      _,
      3,
      _,
      5,
      _,
      _,
      _,
      7,
      _,
      _,
      _,
    ],
    hats: false,
    soft: true,
  },
  level: {
    bpm: 124,
    bars: [{ root: -28 }, { root: -31, minor: true }, { root: -35 }, { root: -33 }],
    melody: LEVEL_MELODY,
    hats: true,
  },
  hurry: {
    bpm: 158,
    bars: [{ root: -28 }, { root: -31, minor: true }, { root: -35 }, { root: -33 }],
    melody: LEVEL_MELODY,
    hats: true,
  },
};

const LOOKAHEAD_S = 0.2;
const TICK_MS = 50;

class MusicPlayer {
  private song: SongId | null = null;
  private step = 0;
  private nextAt = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private bus: GainNode | null = null;
  enabled = true;

  /** Đổi bài (bài đang phát thì giữ nguyên, không phát lại từ đầu). */
  play(id: SongId): void {
    if (this.song === id) return;
    this.song = id;
    this.step = 0;
    const ctx = audioContext();
    if (!ctx) return;
    this.nextAt = ctx.currentTime + 0.05;
    this.bus ??= this.makeBus(ctx);
    this.timer ??= setInterval(() => this.tick(), TICK_MS);
  }

  stop(): void {
    this.song = null;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  get current(): SongId | null {
    return this.song;
  }

  private makeBus(ctx: AudioContext): GainNode {
    const g = ctx.createGain();
    g.gain.value = 0.35;
    g.connect(ctx.destination);
    return g;
  }

  private tick(): void {
    const ctx = audioContext();
    if (!ctx || !this.song || !this.bus) return;
    // Bị treo lâu (tab ẩn, trình duyệt chưa cho phát tiếng): bắt đầu lại từ bây giờ.
    if (this.nextAt < ctx.currentTime - 0.5) this.nextAt = ctx.currentTime + 0.05;
    const song = SONGS[this.song];
    const stepS = 60 / song.bpm / 2;
    while (this.nextAt < ctx.currentTime + LOOKAHEAD_S) {
      if (this.enabled) this.playStep(song, this.step, this.nextAt - ctx.currentTime, stepS);
      this.step = (this.step + 1) % (song.bars.length * 8);
      this.nextAt += stepS;
    }
  }

  private playStep(song: Song, step: number, at: number, stepS: number): void {
    const bus = this.bus;
    const bar = song.bars[Math.floor(step / 8)]!;
    const s = step % 8;
    const soft = song.soft ? 0.6 : 1;
    // Bass: gốc ở phách 1, 3; quãng tám / quãng năm ở giữa.
    const bassNote = [0, null, 12, null, 0, null, 7, null][s];
    if (bassNote !== null && bassNote !== undefined)
      tone(
        {
          at,
          type: 'triangle',
          freq: note(bar.root + bassNote),
          dur: stepS * 1.6,
          gain: 0.5 * soft,
        },
        bus,
      );
    // Hợp âm rải.
    const third = bar.minor ? 3 : 4;
    const arp = [12, 12 + third, 19, 12 + third][s % 4]!;
    tone(
      { at, type: 'square', freq: note(bar.root + arp + 12), dur: stepS * 0.8, gain: 0.07 * soft },
      bus,
    );
    // Giai điệu.
    const m = song.melody[step];
    if (m !== null && m !== undefined)
      tone(
        {
          at,
          type: song.soft ? 'triangle' : 'square',
          freq: note(m),
          dur: stepS * 1.8,
          gain: 0.16 * soft,
        },
        bus,
      );
    // Hi-hat + trống.
    if (song.hats) {
      burst({ at, filter: 'highpass', freq: 7000, dur: 0.03, gain: s % 2 ? 0.08 : 0.14 }, bus);
      if (s === 0 || s === 4)
        tone({ at, type: 'sine', freq: 120, to: 45, dur: 0.15, gain: 0.5 }, bus);
      if (s === 2 || s === 6)
        burst({ at, filter: 'bandpass', freq: 1800, dur: 0.1, gain: 0.2 }, bus);
    }
  }
}

/** Nhạc nền dùng chung cho cả game. */
export const music = new MusicPlayer();
