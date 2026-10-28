import Phaser from 'phaser';
import { MENU_KEYS, type NavAction, NavRepeat, padNavState } from './menuNav';

export type { NavAction } from './menuNav';

const getPads = (): readonly (Gamepad | null)[] =>
  typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : [];

/**
 * Gắn điều hướng menu vào một scene: phím (nghe thẳng sự kiện DOM để các lệnh cần "cử chỉ người
 * dùng" như bật toàn màn hình chạy được) và tay cầm (đọc mỗi khung hình). Tự gỡ khi rời scene.
 * `onKey` nhận phím trước; trả về true nếu đã xử lý (vd. đang chờ người chơi bấm phím mới).
 */
export class MenuInput {
  private readonly repeat = new NavRepeat();
  enabled = true;

  constructor(
    scene: Phaser.Scene,
    private readonly onAction: (action: NavAction) => void,
    private readonly onKey?: (e: KeyboardEvent) => boolean,
    /** false: chỉ nghe tay cầm (scene đã tự xử lý phím). */
    keyboard = true,
  ) {
    const keydown = (e: KeyboardEvent) => {
      if (!this.enabled || !scene.sys.isActive()) return;
      if (this.onKey?.(e)) {
        e.preventDefault();
        return;
      }
      const action = MENU_KEYS[e.code];
      if (!action) return;
      e.preventDefault();
      // Giữ phím: trình duyệt tự lặp, chỉ cho lặp phím hướng.
      if (e.repeat && (action === 'confirm' || action === 'back')) return;
      this.onAction(action);
    };
    const update = (_time: number, delta: number) => {
      const actions = this.repeat.update(delta, padNavState(getPads()));
      if (!this.enabled) return;
      for (const a of actions) this.onAction(a);
    };
    if (keyboard) window.addEventListener('keydown', keydown);
    scene.events.on(Phaser.Scenes.Events.UPDATE, update);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      window.removeEventListener('keydown', keydown);
      scene.events.off(Phaser.Scenes.Events.UPDATE, update);
    });
  }
}
