import type { InputFrame } from '../systems/input/InputFrame';

/**
 * Một ô người chơi như mô phỏng nhìn thấy: số ô toàn cục (0..7) và input của bước trước/bước này.
 * Không quan tâm input đến từ bàn phím máy này hay từ máy khác qua mạng.
 */
export interface SimSlot {
  readonly index: number;
  prev: InputFrame;
  cur: InputFrame;
  connected: boolean;
}

/** Nguồn ô người chơi cho mô phỏng (chơi chung máy, hoặc host gom input từ mạng). */
export interface SlotSource {
  /** Ô theo số thứ tự toàn cục; null = trống. */
  readonly slots: readonly (SimSlot | null)[];
  /** Gọi mỗi bước logic: cập nhật input, trả về các ô vừa có người vào. */
  poll(allowJoin: boolean): SimSlot[];
  destroy(): void;
}
