import Phaser from 'phaser';
import { getLocale, t } from '../data/i18n';
import { loadSave, totalStars } from '../data/settings';
import { TIERS, type LevelDef } from '../data/types';
import type { GameData } from '../data/validate';
import { playerTextureKey } from '../entities/playerStyles';
import { Btn, frameAxis, isDown, justPressed } from '../systems/input/InputFrame';
import type { InputManager } from '../systems/input/InputManager';
import { isOpen, type LevelLock, levelLock, TIER_ICONS } from '../systems/levelLock';
import { type NavAction, NavRepeat } from '../ui/menuNav';
import { GAME_HEIGHT, GAME_WIDTH, Theme } from '../ui/theme';
import { RegistryKeys, SceneKeys } from './keys';

type Filter = 'all' | LevelDef['tier'];
const FILTERS: readonly Filter[] = ['all', ...TIERS];
const COLS = 4;
const CARD_W = 288;
const CARD_H = 112;
const GAP = 14;
const GRID_TOP = 196;
const STAR_ON = '#ffd54f';
const STAR_OFF = '#4a4560';
const BAD = '#ff8a80';

/** Bộ lọc và màn đang chọn, giữ lại khi quay về từ màn chơi. */
let remembered: { filter: Filter; levelId: string | null } = { filter: 'all', levelId: null };

/**
 * Chọn màn khi chơi chung máy. Màn bị khóa nếu thiếu người (đếm người đã tham gia trên máy này)
 * hoặc thiếu sao (`unlockStars`). Người khác bấm Nắm để vào ngay ở đây, Lao để rời.
 * Điều khiển bằng input của người đã tham gia (WASD/Space, mũi tên/Enter, tay cầm) và chuột.
 */
export class LevelSelectScene extends Phaser.Scene {
  private inputs!: InputManager;
  private data$!: GameData;
  private stars = 0;
  private progress: Record<string, { stars: number }> = {};
  private filter: Filter = 'all';
  /** -1: hàng bộ lọc; ≥ 0: thẻ màn trong danh sách đã lọc. */
  private focus = 0;
  private ui!: Phaser.GameObjects.Container;
  private nav = new NavRepeat();
  private joinArmed = false;
  private message = '';

  constructor() {
    super(SceneKeys.LevelSelect);
  }

  create(): void {
    this.cameras.main.setBackgroundColor(Theme.bg);
    this.inputs = this.registry.get(RegistryKeys.Input) as InputManager;
    this.data$ = this.registry.get(RegistryKeys.Data) as GameData;
    const save = loadSave();
    this.progress = save.levels;
    this.stars = totalStars(save.levels);
    this.nav = new NavRepeat();
    this.joinArmed = false;
    this.message = '';
    this.ui = this.add.container(0, 0);
    if (this.inputs.slots.every((s) => s === null)) this.inputs.join('kb0');

    this.filter = remembered.filter;
    const i = this.visible().findIndex((l) => l.id === remembered.levelId);
    this.focus = Math.max(0, i);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      remembered = { filter: this.filter, levelId: this.visible()[this.focus]?.id ?? null };
    });
    this.input.keyboard?.on('keydown-ESC', () => this.scene.start(SceneKeys.Menu));
    this.redraw();
  }

  /** Cho kiểm thử tự động. */
  debugState() {
    return {
      players: this.players(),
      stars: this.stars,
      filter: this.filter,
      focus: this.focus,
      levels: this.visible().map((l) => ({ id: l.id, ...this.lockOf(l) })),
    };
  }

  private players(): number {
    return this.inputs.slots.filter((s) => s !== null).length;
  }

  private visible(): LevelDef[] {
    return this.data$.levels.filter((l) => this.filter === 'all' || l.tier === this.filter);
  }

  private lockOf(level: LevelDef): LevelLock {
    return levelLock(level, this.players(), this.stars);
  }

  override update(_time: number, delta: number): void {
    if (!this.joinArmed) {
      this.joinArmed = !this.inputs
        .allSources()
        .some(
          (src) =>
            src.isConnected() &&
            !this.inputs.slots.some((s) => s?.source === src) &&
            isDown(src.read(), Btn.Grab | Btn.Start),
        );
    }
    const joined = this.inputs.poll(this.joinArmed);
    let changed = joined.length > 0;

    // Hướng: gộp mọi người đã tham gia (có lặp khi giữ). Nút: theo từng người.
    const held = new Set<NavAction>();
    const presses: NavAction[] = [];
    for (const slot of this.inputs.slots) {
      if (!slot) continue;
      const { x, y } = frameAxis(slot.cur);
      if (y < -0.5) held.add('up');
      if (y > 0.5) held.add('down');
      if (x < -0.5) held.add('left');
      if (x > 0.5) held.add('right');
      if (joined.includes(slot)) continue;
      if (justPressed(slot.prev, slot.cur, Btn.Grab) || justPressed(slot.prev, slot.cur, Btn.Start))
        presses.push('confirm');
      if (justPressed(slot.prev, slot.cur, Btn.Throw)) presses.push('back');
      // Lao: rời (luôn còn ít nhất một người).
      if (justPressed(slot.prev, slot.cur, Btn.Dash) && this.players() > 1) {
        this.inputs.leave(slot.index);
        changed = true;
      }
    }
    for (const a of [...this.nav.update(delta, held), ...presses]) {
      this.handle(a);
      changed = true;
      if (!this.sys.isActive()) return;
    }
    if (changed) this.redraw();
  }

  private handle(a: NavAction): void {
    const n = this.visible().length;
    this.message = '';
    if (a === 'back') return void this.scene.start(SceneKeys.Menu);
    if (this.focus < 0) {
      if (a === 'left' || a === 'right') this.setFilter(a === 'left' ? -1 : 1);
      else if (a === 'down' || a === 'confirm') this.focus = n > 0 ? 0 : -1;
      return;
    }
    if (a === 'left') this.focus = Math.max(0, this.focus - 1);
    else if (a === 'right') this.focus = Math.min(n - 1, this.focus + 1);
    else if (a === 'up') this.focus = this.focus < COLS ? -1 : this.focus - COLS;
    else if (a === 'down') this.focus = Math.min(n - 1, this.focus + COLS);
    else if (a === 'confirm') this.choose(this.visible()[this.focus]);
  }

  private setFilter(dir: -1 | 1): void {
    const i = FILTERS.indexOf(this.filter);
    this.filter = FILTERS[(i + dir + FILTERS.length) % FILTERS.length]!;
  }

  private choose(level: LevelDef | undefined): void {
    if (!level) return;
    const lock = this.lockOf(level);
    if (!isOpen(lock)) {
      this.message = lockText(lock);
      return;
    }
    this.registry.set(RegistryKeys.LevelId, level.id);
    this.scene.start(SceneKeys.Game);
  }

  // ---- Vẽ ----

  private text(x: number, y: number, s: string, size: number, color: string = Theme.text) {
    const txt = this.add.text(x, y, s, { fontFamily: Theme.font, fontSize: `${size}px`, color });
    this.ui.add(txt);
    return txt;
  }

  private redraw(): void {
    this.ui.removeAll(true);
    const cx = GAME_WIDTH / 2;
    this.text(cx, 44, t('levels.title'), 44, Theme.accent).setOrigin(0.5).setFontStyle('bold');
    this.text(40, 32, `⭐ ${this.stars}`, 26, STAR_ON).setOrigin(0, 0.5);

    // Người chơi trên máy (bấm Nắm để vào).
    const slots = this.inputs.slots.filter((s) => s !== null);
    slots.forEach((s, i) => {
      const img = this.add.image(GAME_WIDTH - 40 - i * 46, 34, playerTextureKey(s.index));
      img.setScale(0.9);
      this.ui.add(img);
    });
    this.text(
      GAME_WIDTH - 40,
      66,
      t('levels.players', { n: slots.length }),
      16,
      Theme.muted,
    ).setOrigin(1, 0.5);

    // Bộ lọc theo cấp.
    const tabW = 150;
    const tx0 = cx - ((FILTERS.length - 1) * (tabW + 10)) / 2;
    FILTERS.forEach((f, i) => {
      const on = f === this.filter;
      const focused = on && this.focus < 0;
      const label = f === 'all' ? t('levels.all') : `${TIER_ICONS[f]} ${t(`tier.${f}`)}`;
      const tab = this.text(tx0 + i * (tabW + 10), 120, label, 18, on ? Theme.accent : Theme.muted)
        .setOrigin(0.5)
        .setPadding(12, 6, 12, 6)
        .setBackgroundColor(focused ? '#4a4366' : on ? '#3a3550' : '#26232f')
        .setInteractive({ useHandCursor: true })
        .on('pointerup', () => {
          this.filter = f;
          this.focus = 0;
          this.redraw();
        });
      if (focused) tab.setText(`◀ ${label} ▶`);
    });

    // Thẻ màn.
    const levels = this.visible();
    const gx = (GAME_WIDTH - (COLS * CARD_W + (COLS - 1) * GAP)) / 2;
    levels.forEach((level, i) => {
      const x = gx + (i % COLS) * (CARD_W + GAP);
      const y = GRID_TOP + Math.floor(i / COLS) * (CARD_H + GAP);
      this.drawCard(level, x, y, i === this.focus, i);
    });
    if (levels.length === 0)
      this.text(cx, GRID_TOP + 60, t('levels.none'), 20, Theme.muted).setOrigin(0.5);

    if (this.message) this.text(cx, GAME_HEIGHT - 58, this.message, 20, BAD).setOrigin(0.5);
    this.text(cx, GAME_HEIGHT - 24, t('levels.hint'), 15, Theme.muted).setOrigin(0.5);
  }

  private drawCard(level: LevelDef, x: number, y: number, focused: boolean, index: number): void {
    const lock = this.lockOf(level);
    const open = isOpen(lock);
    const g = this.add.graphics();
    g.fillStyle(focused ? 0x4a4366 : 0x2b2838, open ? 1 : 0.55);
    g.fillRoundedRect(x, y, CARD_W, CARD_H, 12);
    if (focused) g.lineStyle(3, 0xffb347, 1).strokeRoundedRect(x, y, CARD_W, CARD_H, 12);
    g.setInteractive(
      new Phaser.Geom.Rectangle(x, y, CARD_W, CARD_H),
      Phaser.Geom.Rectangle.Contains,
    ).on('pointerup', () => {
      if (this.focus === index) this.choose(level);
      else this.focus = index;
      this.redraw();
    });
    this.ui.add(g);
    const dim = open ? Theme.text : Theme.muted;
    const no = this.data$.levels.indexOf(level) + 1;
    this.text(
      x + 14,
      y + 12,
      `${TIER_ICONS[level.tier]} ${no}. ${level.name[getLocale()]}`,
      19,
      dim,
    );
    this.text(
      x + 14,
      y + 44,
      t('levels.playerRange', { min: level.minPlayers, rec: level.recommendedPlayers }),
      15,
      Theme.muted,
    );
    const got = this.progress[level.id]?.stars ?? 0;
    for (let s = 0; s < 3; s++) {
      this.text(x + CARD_W - 74 + s * 22, y + 42, '★', 20, s < got ? STAR_ON : STAR_OFF);
    }
    if (!open) this.text(x + 14, y + 74, lockText(lock), 16, BAD);
  }
}

/** "🔒 Cần thêm 2 người · Cần 30 ⭐". */
export function lockText(lock: LevelLock): string {
  const parts: string[] = [];
  if (lock.needPlayers) parts.push(t('levels.needPlayers', { n: lock.needPlayers }));
  if (lock.extraPlayers) parts.push(t('levels.tooMany', { n: lock.extraPlayers }));
  if (lock.needStars) parts.push(t('levels.needStars', { n: lock.needStars }));
  return `🔒 ${parts.join(' · ')}`;
}
