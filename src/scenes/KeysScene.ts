import Phaser from 'phaser';
import { t } from '../data/i18n';
import { loadSettings, saveSettings } from '../data/settings';
import {
  applyKeyBindings,
  DEFAULT_LAYOUTS,
  KEY_ACTIONS,
  type KeyAction,
  type KeyBindings,
  keyLabel,
  primaryKey,
  rebindKey,
  RESERVED_KEYS,
} from '../systems/input/keyboard';
import { MenuInput, type NavAction } from '../ui/menuInput';
import { GAME_HEIGHT, GAME_WIDTH, Theme } from '../ui/theme';
import { SceneKeys } from './keys';

const ROW_H = 46;
const TOP = 160;
const COL_X = [560, 820];
const FOCUS_BG = '#4a4366';
const IDLE_BG = '#3a3550';

/**
 * Đổi phím cho hai bố cục bàn phím (người 1, người 2). Chọn ô rồi bấm phím mới;
 * phím đã dùng ở chỗ khác thì hai bên đổi chỗ cho nhau. Tay cầm dùng nút cố định.
 */
export class KeysScene extends Phaser.Scene {
  private bindings: KeyBindings = [];
  private row = 0;
  private col = 0;
  private waiting = false;
  private cells: Phaser.GameObjects.Text[][] = [];
  private extra: Phaser.GameObjects.Text[] = [];
  private status!: Phaser.GameObjects.Text;
  private from: string = SceneKeys.Menu;

  constructor() {
    super(SceneKeys.Keys);
  }

  create(data: { from?: string } = {}): void {
    this.from = data.from ?? SceneKeys.Menu;
    this.bindings = loadSettings().keys ?? [];
    this.row = 0;
    this.col = 0;
    this.waiting = false;
    this.cameras.main.setBackgroundColor(Theme.bg);
    const text = (x: number, y: number, s: string, size: number, color: string = Theme.text) =>
      this.add
        .text(x, y, s, { fontFamily: Theme.font, fontSize: `${size}px`, color })
        .setOrigin(0.5);

    text(GAME_WIDTH / 2, 56, t('keys.title'), 44, Theme.accent).setFontStyle('bold');
    DEFAULT_LAYOUTS.forEach((l, i) =>
      text(
        COL_X[i]!,
        TOP - 44,
        t('keys.player', { n: i + 1, layout: t(l.nameKey) }),
        20,
        Theme.muted,
      ),
    );
    this.cells = KEY_ACTIONS.map((action, r) => {
      const y = TOP + r * ROW_H;
      text(330, y, t(`keys.action.${action}`), 22).setOrigin(1, 0.5);
      return DEFAULT_LAYOUTS.map((_, c) =>
        text(COL_X[c]!, y, '', 22)
          .setPadding(18, 6, 18, 6)
          .setInteractive({ useHandCursor: true })
          .on('pointerover', () => this.select(r, c))
          .on('pointerup', () => this.startWaiting()),
      );
    });
    const by = TOP + KEY_ACTIONS.length * ROW_H + 24;
    this.extra = [t('keys.reset'), t('settings.back')].map((label, i) =>
      text(GAME_WIDTH / 2, by + i * 54, label, 22)
        .setPadding(18, 8, 18, 8)
        .setInteractive({ useHandCursor: true })
        .on('pointerover', () => this.select(KEY_ACTIONS.length + i, this.col))
        .on('pointerup', () => this.confirm()),
    );
    this.status = text(GAME_WIDTH / 2, GAME_HEIGHT - 52, '', 18, Theme.muted);
    text(GAME_WIDTH / 2, GAME_HEIGHT - 22, t('keys.hint'), 15, Theme.muted);

    new MenuInput(
      this,
      (a) => this.nav(a),
      (e) => this.onKey(e),
    );
    this.redraw();
  }

  private select(row: number, col: number): void {
    if (this.waiting) return;
    this.row = row;
    this.col = col;
    this.redraw();
  }

  private nav(a: NavAction): void {
    if (this.waiting) {
      // Tay cầm không gán được phím bàn phím: B để hủy.
      if (a === 'back') this.cancelWaiting();
      return;
    }
    const rows = KEY_ACTIONS.length + this.extra.length;
    if (a === 'up') this.row = (this.row + rows - 1) % rows;
    else if (a === 'down') this.row = (this.row + 1) % rows;
    else if (a === 'left' || a === 'right') this.col = (this.col + 1) % COL_X.length;
    else if (a === 'confirm') return this.confirm();
    else if (a === 'back') return this.back();
    this.status.setText('');
    this.redraw();
  }

  private confirm(): void {
    if (this.row < KEY_ACTIONS.length) return this.startWaiting();
    if (this.row === KEY_ACTIONS.length) {
      this.bindings = [];
      this.save();
      this.status.setText(t('keys.resetDone'));
      this.redraw();
    } else this.back();
  }

  private startWaiting(): void {
    if (this.row >= KEY_ACTIONS.length) return;
    this.waiting = true;
    this.status.setText(t('keys.press')).setColor(Theme.accent);
    this.redraw();
  }

  /** Đang chờ phím mới: bắt mọi phím (trừ Esc = hủy, phím dành riêng thì báo). */
  private onKey(e: KeyboardEvent): boolean {
    if (!this.waiting) return false;
    if (e.repeat) return true; // phím Enter vừa bấm để chọn ô vẫn đang giữ
    if (e.code === 'Escape') {
      this.cancelWaiting();
      return true;
    } else if (RESERVED_KEYS.has(e.code) || !e.code) {
      this.status.setText(t('keys.reserved', { key: keyLabel(e.code || e.key) }));
    } else {
      const action = KEY_ACTIONS[this.row] as KeyAction;
      this.bindings = rebindKey(this.bindings, this.col, action, e.code);
      this.save();
      this.waiting = false;
      this.status.setText('').setColor(Theme.muted);
    }
    this.redraw();
    return true;
  }

  private cancelWaiting(): void {
    this.waiting = false;
    this.status.setText('').setColor(Theme.muted);
    this.redraw();
  }

  private save(): void {
    // Chỉ lưu khác biệt so với mặc định để sau này đổi mặc định vẫn có tác dụng.
    const diff = DEFAULT_LAYOUTS.map((def, i) => {
      const out: Record<string, string> = {};
      for (const a of KEY_ACTIONS) {
        const k = primaryKey(this.bindings, i, a);
        if (k !== def[a][0]) out[a] = k;
      }
      return out;
    });
    const empty = diff.every((d) => Object.keys(d).length === 0);
    saveSettings({ keys: empty ? [] : diff });
    applyKeyBindings(this.bindings);
  }

  private redraw(): void {
    KEY_ACTIONS.forEach((action, r) => {
      DEFAULT_LAYOUTS.forEach((_, c) => {
        const focused = r === this.row && c === this.col;
        const cell = this.cells[r]![c]!;
        const label =
          focused && this.waiting ? '…' : keyLabel(primaryKey(this.bindings, c, action));
        cell
          .setText(label)
          .setColor(focused ? Theme.accent : Theme.text)
          .setBackgroundColor(focused ? FOCUS_BG : IDLE_BG);
      });
    });
    this.extra.forEach((txt, i) => {
      const focused = this.row === KEY_ACTIONS.length + i;
      txt
        .setColor(focused ? Theme.accent : Theme.text)
        .setBackgroundColor(focused ? FOCUS_BG : IDLE_BG);
    });
  }

  private back(): void {
    this.scene.start(SceneKeys.Settings, { from: this.from });
  }
}
