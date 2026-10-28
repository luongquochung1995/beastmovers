import Phaser from 'phaser';
import type { NavAction } from './menuInput';
import { Theme } from './theme';

export interface MenuItem {
  /** Chữ hiện ra (gọi lại mỗi lần vẽ, để đổi theo giá trị/ngôn ngữ). */
  label: () => string;
  onConfirm?: () => void;
  /** Trái/phải trên mục này (chỉnh âm lượng, bật/tắt…). */
  onAdjust?: (dir: -1 | 1) => void;
  enabled?: () => boolean;
  fontSize?: number;
  /** Khoảng cách thêm phía trên mục này (tách nhóm). */
  gapBefore?: number;
}

const FOCUS_BG = '#4a4366';
const IDLE_BG = '#3a3550';
const DISABLED_BG = '#2b2838';

/**
 * Danh sách nút dọc, điều khiển được bằng phím, tay cầm (qua `handle`) và chuột.
 * Mục đang chọn có viền sáng và dấu ▸; mục có `onAdjust` hiện thêm ◀ ▶.
 */
export class MenuList {
  focus = 0;
  private readonly texts: Phaser.GameObjects.Text[] = [];

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly items: MenuItem[],
    x: number,
    y: number,
    gap: number,
  ) {
    let cy = y;
    items.forEach((item, i) => {
      cy += item.gapBefore ?? 0;
      const txt = scene.add
        .text(x, cy, '', {
          fontFamily: Theme.font,
          fontSize: `${item.fontSize ?? 26}px`,
          color: Theme.text,
          padding: { x: 22, y: 9 },
          align: 'center',
        })
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true })
        .on('pointerover', () => this.setFocus(i))
        .on('pointerup', (p: Phaser.Input.Pointer) => {
          this.setFocus(i);
          // Bấm vào nửa trái/phải của mục chỉnh được thì giảm/tăng.
          if (item.onAdjust && !item.onConfirm) {
            item.onAdjust(p.x < txt.x ? -1 : 1);
            this.refresh();
          } else this.handle('confirm');
        });
      this.texts.push(txt);
      cy += gap;
    });
    this.focus = items.findIndex((it) => this.isEnabled(it));
    this.refresh();
  }

  private isEnabled(item: MenuItem): boolean {
    return item.enabled?.() ?? true;
  }

  setFocus(i: number): void {
    if (i === this.focus || !this.items[i] || !this.isEnabled(this.items[i])) return;
    this.focus = i;
    this.refresh();
  }

  /** Xử lý một hành động điều hướng. Trả về false nếu không dùng (vd. `back`). */
  handle(action: NavAction): boolean {
    const item = this.items[this.focus];
    switch (action) {
      case 'up':
      case 'down':
        this.move(action === 'up' ? -1 : 1);
        return true;
      case 'left':
      case 'right':
        if (!item?.onAdjust) return false;
        item.onAdjust(action === 'left' ? -1 : 1);
        this.refresh();
        return true;
      case 'confirm':
        if (!item || !this.isEnabled(item)) return false;
        if (item.onConfirm) item.onConfirm();
        else item.onAdjust?.(1);
        if (this.scene.sys.isActive()) this.refresh();
        return true;
      default:
        return false;
    }
  }

  private move(dir: -1 | 1): void {
    const n = this.items.length;
    for (let k = 1; k <= n; k++) {
      const i = (this.focus + dir * k + n * k) % n;
      if (this.isEnabled(this.items[i]!)) {
        this.focus = i;
        break;
      }
    }
    this.refresh();
  }

  refresh(): void {
    this.items.forEach((item, i) => {
      const txt = this.texts[i]!;
      if (!txt.active) return;
      const enabled = this.isEnabled(item);
      const focused = i === this.focus;
      const label = item.label();
      const shown = item.onAdjust ? `◀  ${label}  ▶` : label;
      txt
        .setText(focused ? `▸ ${shown} ◂` : shown)
        .setColor(!enabled ? Theme.muted : focused ? Theme.accent : Theme.text)
        .setBackgroundColor(!enabled ? DISABLED_BG : focused ? FOCUS_BG : IDLE_BG);
    });
  }
}
