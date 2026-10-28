import type { LocalizedText } from '../../data/i18n';
import { frameFromGamepad } from './gamepad';
import { EMPTY_FRAME, Btn, type InputFrame, isDown } from './InputFrame';
import { frameFromKeys, KEYBOARD_LAYOUTS, KeyboardTracker } from './keyboard';

export type InputSourceKind = 'keyboard' | 'gamepad';

export interface InputSource {
  readonly id: string;
  readonly kind: InputSourceKind;
  readonly label: LocalizedText;
  isConnected(): boolean;
  read(): InputFrame;
}

/** Một ô người chơi trên máy này. */
export interface PlayerSlot {
  readonly index: number;
  readonly source: InputSource;
  prev: InputFrame;
  cur: InputFrame;
  connected: boolean;
}

type PadLike = Pick<Gamepad, 'index' | 'id' | 'axes' | 'buttons' | 'connected'>;
type GetPads = () => readonly (PadLike | null)[];

const defaultGetPads: GetPads = () =>
  typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : [];

class KeyboardSource implements InputSource {
  readonly kind = 'keyboard';
  readonly id: string;
  readonly label: LocalizedText;

  constructor(
    private readonly tracker: KeyboardTracker,
    private readonly layoutIndex: number,
  ) {
    const layout = KEYBOARD_LAYOUTS[layoutIndex]!;
    this.id = `kb${layoutIndex}`;
    this.label = { key: 'source.keyboard', params: { layout: { key: layout.nameKey } } };
  }

  isConnected(): boolean {
    return true;
  }

  read(): InputFrame {
    return frameFromKeys(this.tracker.active, KEYBOARD_LAYOUTS[this.layoutIndex]!);
  }
}

class GamepadSource implements InputSource {
  readonly kind = 'gamepad';
  readonly id: string;
  readonly label: LocalizedText;

  constructor(
    private readonly padIndex: number,
    private readonly getPads: GetPads,
  ) {
    this.id = `pad${padIndex}`;
    this.label = { key: 'source.gamepad', params: { n: padIndex + 1 } };
  }

  private pad(): PadLike | null {
    const pad = this.getPads()[this.padIndex];
    return pad && pad.connected ? pad : null;
  }

  isConnected(): boolean {
    return this.pad() !== null;
  }

  read(): InputFrame {
    const pad = this.pad();
    return pad ? frameFromGamepad(pad.axes, pad.buttons) : { ...EMPTY_FRAME };
  }
}

/** Nút dùng để "tham gia" một ô người chơi. */
const JOIN_BUTTONS = Btn.Grab | Btn.Start;

/**
 * Gán tối đa `maxSlots` người chơi trên một máy, mỗi người một nguồn input
 * (bàn phím WASD, bàn phím mũi tên hoặc một tay cầm).
 * Tay cầm được phát hiện bằng cách hỏi `getGamepads()` mỗi khung hình, nên cắm/rút lúc nào cũng được.
 */
export class InputManager {
  readonly slots: (PlayerSlot | null)[];
  private readonly sources = new Map<string, InputSource>();
  private readonly tracker: KeyboardTracker | null;
  private readonly getPads: GetPads;

  constructor(
    maxSlots: number,
    options: { tracker?: KeyboardTracker | null; getPads?: GetPads } = {},
  ) {
    this.slots = Array.from({ length: maxSlots }, () => null);
    this.tracker = options.tracker === undefined ? new KeyboardTracker() : options.tracker;
    this.getPads = options.getPads ?? defaultGetPads;
    if (this.tracker) {
      KEYBOARD_LAYOUTS.forEach((_, i) => this.addSource(new KeyboardSource(this.tracker!, i)));
    }
  }

  private addSource(source: InputSource): void {
    this.sources.set(source.id, source);
  }

  /** Danh sách nguồn input hiện có (kể cả chưa được gán). */
  allSources(): InputSource[] {
    return [...this.sources.values()];
  }

  private discoverGamepads(): void {
    for (const pad of this.getPads()) {
      if (pad && pad.connected && !this.sources.has(`pad${pad.index}`)) {
        this.addSource(new GamepadSource(pad.index, this.getPads));
      }
    }
  }

  private isAssigned(source: InputSource): boolean {
    return this.slots.some((s) => s?.source === source);
  }

  /** Gán một nguồn input vào ô trống đầu tiên. Trả về ô vừa gán, hoặc null nếu hết chỗ / đã gán. */
  join(sourceId: string): PlayerSlot | null {
    const source = this.sources.get(sourceId);
    if (!source || this.isAssigned(source)) return null;
    const index = this.slots.indexOf(null);
    if (index < 0) return null;
    const frame = source.read();
    // prev = cur để nút vừa dùng để tham gia không bị tính là "vừa nhấn" ở khung đầu.
    const slot: PlayerSlot = { index, source, prev: frame, cur: frame, connected: true };
    this.slots[index] = slot;
    return slot;
  }

  leave(index: number): void {
    if (index >= 0 && index < this.slots.length) this.slots[index] = null;
  }

  /**
   * Gọi một lần mỗi bước logic: đọc input cho mọi ô, phát hiện tay cầm mới.
   * Nếu `allowJoin` bật, nguồn chưa gán mà nhấn nút Nắm/Start sẽ được gán vào ô trống.
   * Trả về các ô vừa tham gia.
   */
  poll(allowJoin = false): PlayerSlot[] {
    this.discoverGamepads();

    for (const slot of this.slots) {
      if (!slot) continue;
      slot.prev = slot.cur;
      slot.connected = slot.source.isConnected();
      slot.cur = slot.connected ? slot.source.read() : { ...EMPTY_FRAME };
    }

    const joined: PlayerSlot[] = [];
    if (allowJoin) {
      for (const source of this.sources.values()) {
        if (this.isAssigned(source) || !source.isConnected()) continue;
        if (isDown(source.read(), JOIN_BUTTONS)) {
          const slot = this.join(source.id);
          if (slot) joined.push(slot);
        }
      }
    }
    this.tracker?.endPoll();
    return joined;
  }

  destroy(): void {
    this.tracker?.destroy();
  }
}
