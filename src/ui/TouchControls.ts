import { t } from '../data/i18n';
import { Btn } from '../systems/input/InputFrame';
import {
  pressButton,
  resetTouch,
  STICK_RADIUS,
  stickVector,
  TOUCH_BUTTONS,
  touchState,
} from '../systems/input/touch';

const CSS = `
.bm-touch { position: fixed; inset: 0; pointer-events: none; z-index: 10;
  user-select: none; -webkit-user-select: none; -webkit-touch-callout: none;
  font-family: Nunito, "Segoe UI", Roboto, Arial, sans-serif; }
.bm-touch .zone { position: absolute; left: 0; bottom: 0; width: 46vw; height: 72vh;
  pointer-events: auto; touch-action: none; }
.bm-touch .base, .bm-touch .knob { position: absolute; border-radius: 50%; pointer-events: none;
  transform: translate(-50%, -50%); }
.bm-touch .base { width: ${STICK_RADIUS * 2}px; height: ${STICK_RADIUS * 2}px;
  background: #ffffff1a; border: 2px solid #ffffff55; }
.bm-touch .knob { width: 54px; height: 54px; background: #ffb347cc; border: 2px solid #fff8; }
.bm-touch .btn { position: absolute; border-radius: 50%; pointer-events: auto; touch-action: none;
  display: flex; align-items: center; justify-content: center; text-align: center;
  color: #f4efe6; font-weight: 700; background: #1d1b26aa; border: 2px solid #ffffff66;
  box-sizing: border-box; line-height: 1.05; }
.bm-touch .btn.on { background: #ffb347cc; color: #1d1b26; }
.bm-touch .pause { position: absolute; top: 10px; right: 10px; width: 46px; height: 46px;
  pointer-events: auto; touch-action: none; border-radius: 12px; background: #1d1b26aa;
  border: 2px solid #ffffff55; color: #f4efe6; font-size: 22px;
  display: flex; align-items: center; justify-content: center; }
`;

/** Vị trí nút (tính từ góc dưới phải, px CSS) và kích thước. */
const LAYOUT: Record<number, { right: number; bottom: number; size: number; font: number }> = {
  [Btn.Grab]: { right: 26, bottom: 34, size: 96, font: 18 },
  [Btn.Throw]: { right: 132, bottom: 22, size: 70, font: 14 },
  [Btn.Dash]: { right: 24, bottom: 140, size: 70, font: 14 },
  [Btn.Ping]: { right: 118, bottom: 116, size: 58, font: 13 },
};

/**
 * Cần ảo (nửa trái màn hình: đặt ngón tay ở đâu thì tâm cần ở đó) và các nút Nắm / Ném /
 * Lao / Ping bên phải, nút tạm dừng góc trên. Vẽ bằng HTML phủ lên canvas để cảm ứng nhiều
 * ngón ổn định và không phụ thuộc tỉ lệ co giãn của canvas. Ghi trạng thái vào `touchState`.
 */
export class TouchControls {
  private readonly root: HTMLDivElement;
  private readonly base: HTMLDivElement;
  private readonly knob: HTMLDivElement;
  private readonly buttons: { el: HTMLDivElement; btn: number; key: string }[] = [];
  private stickId: number | null = null;
  /** Bấm nút tạm dừng (màn chơi đang hiện đặt vào). */
  onPause: (() => void) | null = null;
  private center = { x: 0, y: 0 };

  constructor(onPauseTap: () => void) {
    if (!document.getElementById('bm-touch-css')) {
      const style = document.createElement('style');
      style.id = 'bm-touch-css';
      style.textContent = CSS;
      document.head.appendChild(style);
    }
    this.root = div('bm-touch');
    const zone = div('zone');
    this.base = div('base');
    this.knob = div('knob');
    this.root.append(zone, this.base, this.knob);
    this.hideStick();

    zone.addEventListener('pointerdown', (e) => {
      if (this.stickId !== null) return;
      e.preventDefault();
      capture(zone, e.pointerId);
      this.stickId = e.pointerId;
      this.center = { x: e.clientX, y: e.clientY };
      this.moveStick(e.clientX, e.clientY);
    });
    zone.addEventListener('pointermove', (e) => {
      if (e.pointerId === this.stickId) this.moveStick(e.clientX, e.clientY);
    });
    const release = (e: PointerEvent) => {
      if (e.pointerId !== this.stickId) return;
      this.stickId = null;
      touchState.x = 0;
      touchState.y = 0;
      this.hideStick();
    };
    zone.addEventListener('pointerup', release);
    zone.addEventListener('pointercancel', release);

    for (const { btn, key } of TOUCH_BUTTONS) {
      const l = LAYOUT[btn]!;
      const el = div('btn');
      Object.assign(el.style, {
        right: `${l.right}px`,
        bottom: `${l.bottom}px`,
        width: `${l.size}px`,
        height: `${l.size}px`,
        fontSize: `${l.font}px`,
      });
      const down = (e: PointerEvent) => {
        e.preventDefault();
        capture(el, e.pointerId);
        pressButton(btn, true);
        el.classList.add('on');
      };
      const up = () => {
        pressButton(btn, false);
        el.classList.remove('on');
      };
      el.addEventListener('pointerdown', down);
      el.addEventListener('pointerup', up);
      el.addEventListener('pointercancel', up);
      this.buttons.push({ el, btn, key });
      this.root.appendChild(el);
    }

    const pause = div('pause');
    pause.textContent = '⏸';
    pause.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      onPauseTap();
    });
    this.root.appendChild(pause);
    this.root.style.display = 'none';
    document.body.appendChild(this.root);
    // Ngăn menu chuột phải / kính lúp khi giữ ngón tay lâu.
    this.root.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  show(): void {
    for (const b of this.buttons) b.el.textContent = t(b.key);
    this.root.style.display = '';
  }

  hide(): void {
    this.root.style.display = 'none';
    this.stickId = null;
    this.hideStick();
    for (const b of this.buttons) b.el.classList.remove('on');
    resetTouch();
  }

  private moveStick(x: number, y: number): void {
    const v = stickVector(x - this.center.x, y - this.center.y);
    touchState.x = v.x;
    touchState.y = v.y;
    this.place(this.base, this.center.x, this.center.y);
    this.place(this.knob, this.center.x + v.x * STICK_RADIUS, this.center.y + v.y * STICK_RADIUS);
  }

  private place(el: HTMLElement, x: number, y: number): void {
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    el.style.display = '';
  }

  private hideStick(): void {
    this.base.style.display = 'none';
    this.knob.style.display = 'none';
  }
}

/** Giữ ngón tay cho phần tử này kể cả khi trượt ra ngoài (trình duyệt không cho thì thôi). */
function capture(el: HTMLElement, pointerId: number): void {
  try {
    el.setPointerCapture(pointerId);
  } catch {
    // Con trỏ không còn hoạt động (vd. sự kiện giả lập): bỏ qua.
  }
}

function div(cls: string): HTMLDivElement {
  const d = document.createElement('div');
  d.className = cls;
  return d;
}

let instance: TouchControls | null = null;

/** Bảng điều khiển cảm ứng dùng chung (tạo khi cần lần đầu). */
export function touchControls(): TouchControls {
  instance ??= new TouchControls(() => instance?.onPause?.());
  return instance;
}
