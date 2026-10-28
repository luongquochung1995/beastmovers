import Phaser from 'phaser';
import { CONFIG_KEY } from '../data/config';
import { getLocale, t } from '../data/i18n';
import { loadSettings, saveSettings } from '../data/settings';
import type { GameConfig } from '../data/types';
import type { GameData } from '../data/validate';
import { playerTextureKey } from '../entities/playerStyles';
import {
  DEFAULT_NAMES,
  HATS,
  Lobby,
  type LobbySeat,
  type LocalSeat,
  NAME_MAX,
  nextFreeColor,
} from '../net/lobby';
import type { NetContext } from '../net/netContext';
import { openTransport, type TransportKind } from '../net/openTransport';
import { generateRoomCode, inviteLink, normalizeRoomCode, ROOM_CODE_LENGTH } from '../net/room';
import { RoomSession } from '../net/session';
import { TrysteroTransport } from '../net/TrysteroTransport';
import { Btn, isDown, justPressed } from '../systems/input/InputFrame';
import type { InputManager } from '../systems/input/InputManager';
import { GAME_HEIGHT, GAME_WIDTH, Theme } from '../ui/theme';
import { RegistryKeys, SceneKeys } from './keys';

/** `create`: tạo phòng mới; `join` có `code`: vào thẳng phòng đó (link mời); không có gì: màn chọn. */
export type OnlineSceneData = { mode?: 'create' } | { mode: 'join'; code: string };

const BAD = '#ff7b7b';
const GOOD = '#7CFC8A';
const CARD_W = 580;
const CARD_H = 74;

/**
 * Chơi online: tạo phòng / vào phòng bằng mã hoặc link, bắt tay (P20), rồi lobby (P21):
 * 8 ô người chơi (tên, màu, mũ, nguồn input, ping), sẵn sàng, host chọn màn, đuổi người,
 * bắt đầu.
 */
export class OnlineScene extends Phaser.Scene {
  private session: RoomSession | null = null;
  private lobby: Lobby | null = null;
  private kind: TransportKind = 'trystero';
  private code = '';
  private typed = '';
  /** Đang sửa tên người chơi chung máy thứ `local` (null: không sửa). */
  private editing: { local: number; text: string; el: HTMLInputElement } | null = null;
  private ui!: Phaser.GameObjects.Container;
  private pings = new Map<string, number>();
  private pingTimer: Phaser.Time.TimerEvent | null = null;
  private onPaste: ((e: ClipboardEvent) => void) | null = null;
  private inputs!: InputManager;
  private gameData!: GameData;
  private config!: GameConfig;
  /** Đã chuyển phiên sang màn chơi: không đóng kết nối khi rời scene. */
  private handedOff = false;
  private localKey = '';
  private error: string | null = null;
  /**
   * Chỉ cho người chơi chung máy vào sau khi mọi nút Nắm/Start đã nhả: Enter vừa bấm để
   * tạo phòng hay xác nhận tên cũng là nút Nắm của bố cục phím mũi tên.
   */
  private joinArmed = false;

  constructor() {
    super(SceneKeys.Online);
  }

  create(data: OnlineSceneData): void {
    this.cameras.main.setBackgroundColor(Theme.bg);
    this.config = this.registry.get(CONFIG_KEY) as GameConfig;
    this.gameData = this.registry.get(RegistryKeys.Data) as GameData;
    this.inputs = this.registry.get(RegistryKeys.Input) as InputManager;
    this.session = null;
    this.lobby = null;
    this.typed = '';
    this.editing = null;
    this.pings = new Map();
    this.handedOff = false;
    this.localKey = '';
    this.error = null;
    this.ui = this.add.container(0, 0);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.cleanup());

    this.input.keyboard?.on('keydown', (e: KeyboardEvent) => this.onKey(e));
    this.onPaste = (e) => this.typeCode(e.clipboardData?.getData('text') ?? '', true);
    document.addEventListener('paste', this.onPaste);

    if (data.mode === 'join') this.open(data.code, 'client');
    else if (data.mode === 'create') this.open(generateRoomCode(), 'host');
    else this.drawChoose();
  }

  /** Cho kiểm thử tự động đọc trạng thái phòng. */
  debugState() {
    const s = this.session;
    return (
      s && {
        code: this.code,
        kind: this.kind,
        role: s.role,
        selfId: s.transport.selfId,
        state: s.state,
        hostId: s.hostId,
        members: s.members,
        peers: s.transport.peers(),
        lobby: this.lobby?.state ?? null,
        kicked: this.lobby?.kicked ?? false,
      }
    );
  }

  private open(code: string, role: 'host' | 'client'): void {
    this.code = code;
    const { transport, kind } = openTransport(this.config.net, code, window.location.search);
    this.kind = kind;
    this.session = new RoomSession(
      transport,
      role,
      {
        version: __APP_VERSION__,
        dataHash: this.registry.get(RegistryKeys.DataHash) as string,
        maxPlayers: this.config.maxPlayers,
      },
      Math.max(1, this.localSlots().length),
    );
    this.session.onChange(() => {
      if (this.session?.state.kind === 'joined' && !this.lobby) this.startLobby();
      this.redraw();
    });
    if (transport instanceof TrysteroTransport) {
      transport.onError((err) => {
        this.error = err;
        this.redraw();
      });
      this.pingTimer = this.time.addEvent({
        delay: 2000,
        loop: true,
        callback: () => this.measurePings(transport),
      });
    }
    // Đưa mã phòng lên thanh địa chỉ để tải lại trang vẫn về đúng phòng.
    if (role === 'client') {
      history.replaceState(null, '', inviteLink(window.location.href, code) + this.keepParams());
    }
    if (role === 'host') this.startLobby();
    this.redraw();
  }

  private startLobby(): void {
    const session = this.session!;
    const lobby = new Lobby(session, this.gameData.levels[0]!.id, this.config.maxPlayers);
    this.lobby = lobby;
    this.joinArmed = false;
    lobby.onChange(() => {
      if (lobby.started && !this.handedOff) this.enterGame(lobby);
      else this.redraw();
    });
    this.syncLocalSeats(true);
  }

  /** Người chơi chung máy trên máy này (chưa ai thì người dùng WASD tự vào). */
  private localSlots() {
    if (this.inputs.slots.every((s) => s === null)) this.inputs.join('kb0');
    return this.inputs.slots.filter((s) => s !== null);
  }

  private syncLocalSeats(force = false): void {
    if (!this.lobby) return;
    const slots = this.localSlots();
    const key = slots.map((s) => `${s.index}:${s.source.id}`).join(',');
    if (!force && key === this.localKey) return;
    this.localKey = key;
    const saved = loadSettings().playerName;
    const names = DEFAULT_NAMES[getLocale()];
    const seats: LocalSeat[] = slots.map((s, i) => {
      const existing = this.mySeat(s.index);
      const name =
        existing?.name ??
        (i === 0 && saved ? saved : names[Math.floor(Math.random() * names.length)]!);
      return { local: s.index, source: s.source.kind, name };
    });
    this.lobby.setLocalSeats(seats);
  }

  override update(): void {
    if (!this.lobby || this.handedOff) return;
    // Người chơi chung máy bấm Nắm/Start để vào; nút của từng người đổi màu/mũ/sẵn sàng.
    if (!this.joinArmed) {
      this.joinArmed = !this.inputs
        .allSources()
        .some((src) => src.isConnected() && isDown(src.read(), Btn.Grab | Btn.Start));
    }
    const joined = this.inputs.poll(this.joinArmed && this.editing === null);
    if (joined.length) this.syncLocalSeats();
    if (this.editing) return;
    for (const slot of this.inputs.slots) {
      if (!slot || joined.includes(slot)) continue;
      if (justPressed(slot.prev, slot.cur, Btn.Throw)) this.cycleColor(slot.index);
      if (justPressed(slot.prev, slot.cur, Btn.Dash)) this.cycleHat(slot.index);
      if (justPressed(slot.prev, slot.cur, Btn.Grab)) this.toggleReady();
      if (justPressed(slot.prev, slot.cur, Btn.Start)) this.tryStart();
    }
  }

  private mySeat(local: number): LobbySeat | undefined {
    return this.lobby?.mySeats().find((s) => s.local === local);
  }

  private cycleColor(local: number): void {
    const seat = this.mySeat(local);
    if (!seat || !this.lobby) return;
    this.lobby.setLook(local, { color: nextFreeColor(this.lobby.state.seats, seat.color, seat) });
  }

  private cycleHat(local: number): void {
    const seat = this.mySeat(local);
    if (seat) this.lobby?.setLook(local, { hat: (seat.hat + 1) % HATS.length });
  }

  private toggleReady(): void {
    const lobby = this.lobby;
    if (!lobby || lobby.isHost) return;
    lobby.setReady(!lobby.isReady(this.session!.transport.selfId));
  }

  private currentLevel() {
    const id = this.lobby?.state.levelId;
    return this.gameData.levels.find((l) => l.id === id) ?? this.gameData.levels[0]!;
  }

  private cycleLevel(dir: number): void {
    const lobby = this.lobby;
    if (!lobby?.isHost) return;
    const levels = this.gameData.levels;
    const i = levels.findIndex((l) => l.id === lobby.state.levelId);
    lobby.setLevel(levels[(i + dir + levels.length) % levels.length]!.id);
  }

  private tryStart(): void {
    const lobby = this.lobby;
    if (!lobby?.isHost) return;
    const level = this.currentLevel();
    if (lobby.startBlock(level.minPlayers, level.maxPlayers) === null) lobby.start();
  }

  /** Mọi máy nhận lệnh bắt đầu: chuyển phiên online sang màn chơi. */
  private enterGame(lobby: Lobby): void {
    this.handedOff = true;
    const ctx: NetContext = {
      session: this.session!,
      lobby,
      kind: this.kind,
      code: this.code,
      roster: lobby.started!,
    };
    this.registry.set(RegistryKeys.Net, ctx);
    this.registry.set(RegistryKeys.LevelId, lobby.started!.levelId);
    this.scene.start(SceneKeys.Game);
  }

  /** Giữ các tham số kiểm thử và ngôn ngữ (`transport`, `relay`, `debug`, `lang`) khi đổi URL. */
  private keepParams(): string {
    const p = new URLSearchParams(window.location.search);
    let extra = '';
    for (const k of ['transport', 'relay', 'debug', 'lang']) {
      const v = p.get(k);
      if (v !== null) extra += `&${k}${v ? `=${encodeURIComponent(v)}` : ''}`;
    }
    return extra;
  }

  private measurePings(transport: TrysteroTransport): void {
    for (const peer of transport.peers()) {
      transport
        .ping(peer)
        .then((ms) => {
          this.pings.set(peer, Math.round(ms));
          this.redraw();
        })
        .catch(() => {});
    }
  }

  // ---- Vẽ ----

  private redraw(): void {
    if (!this.scene.isActive() || this.handedOff) return;
    if (!this.session) this.drawChoose();
    else if (this.lobby && this.session.state.kind === 'joined' && !this.lobby.kicked)
      this.drawLobby();
    else this.drawStatus();
  }

  private clear(): void {
    this.ui.removeAll(true);
  }

  private text(
    x: number,
    y: number,
    s: string,
    size: number,
    color: string = Theme.text,
    originX = 0.5,
  ) {
    const txt = this.add
      .text(x, y, s, { fontFamily: Theme.font, fontSize: `${size}px`, color, align: 'center' })
      .setOrigin(originX, 0.5);
    this.ui.add(txt);
    return txt;
  }

  private button(
    x: number,
    y: number,
    label: string,
    onClick: () => void,
    size = 26,
    enabled = true,
  ) {
    const b = this.text(x, y, label, size, enabled ? Theme.text : Theme.muted)
      .setBackgroundColor(enabled ? '#3a3550' : '#2b2838')
      .setPadding(18, 8, 18, 8);
    if (enabled) {
      b.setInteractive({ useHandCursor: true })
        .on('pointerover', () => b.setColor(Theme.accent))
        .on('pointerout', () => b.setColor(Theme.text))
        .on('pointerup', onClick);
    }
    return b;
  }

  private clickable<T extends Phaser.GameObjects.Text | Phaser.GameObjects.Image>(
    obj: T,
    onClick: () => void,
  ): T {
    obj.setInteractive({ useHandCursor: true }).on('pointerup', onClick);
    return obj;
  }

  private drawChoose(): void {
    this.clear();
    const cx = GAME_WIDTH / 2;
    this.text(cx, 120, t('online.title'), 54, Theme.accent);
    this.button(cx, 240, t('online.create'), () => this.open(generateRoomCode(), 'host'));
    this.text(cx, 340, t('online.enterCode'), 24, Theme.muted);
    const boxes = Array.from({ length: ROOM_CODE_LENGTH }, (_, i) => this.typed[i] ?? '·');
    this.text(cx, 400, boxes.join(' '), 52);
    this.text(cx, 470, t('online.codeHint'), 18, Theme.muted);
    this.text(cx, GAME_HEIGHT - 40, t('online.backHint'), 18, Theme.muted);
  }

  /** Đang kết nối, bị từ chối, bị đuổi, host rời… */
  private drawStatus(): void {
    this.clear();
    const cx = GAME_WIDTH / 2;
    this.text(cx, 70, t('online.room'), 26, Theme.muted);
    this.text(cx, 125, this.code.split('').join(' '), 64, Theme.accent);
    this.text(cx, 190, inviteLink(window.location.href, this.code), 18, Theme.muted);
    const status = this.statusText();
    this.text(cx, 300, status.text, 24, status.color);
    this.text(cx, GAME_HEIGHT - 40, this.footer(t('online.leaveHint')), 18, Theme.muted);
  }

  private footer(hint: string): string {
    return `${hint}  ·  ${t(`online.via.${this.kind}`)}`;
  }

  private drawLobby(): void {
    this.clear();
    const lobby = this.lobby!;
    const selfId = this.session!.transport.selfId;
    const level = this.currentLevel();

    // Đầu trang: mã phòng + link mời, màn chơi.
    this.text(40, 42, `${t('online.room')}  ${this.code}`, 34, Theme.accent, 0);
    const link = inviteLink(window.location.href, this.code);
    this.text(40, 82, link, 16, Theme.muted, 0);
    this.button(40, 122, t('online.copyLink'), () => this.copyLink(link), 18).setOrigin(0, 0.5);

    const lx = GAME_WIDTH - 260;
    this.text(lx, 36, t('lobby.level'), 18, Theme.muted);
    this.text(lx, 70, level.name[getLocale()], 26);
    this.text(
      lx,
      102,
      t('lobby.levelPlayers', { min: level.minPlayers, max: level.maxPlayers }),
      16,
      Theme.muted,
    );
    if (lobby.isHost && this.gameData.levels.length > 1) {
      this.clickable(this.text(lx - 190, 70, '◀', 30, Theme.accent), () => this.cycleLevel(-1));
      this.clickable(this.text(lx + 190, 70, '▶', 30, Theme.accent), () => this.cycleLevel(1));
    }

    // 8 ô người chơi, 2 cột.
    for (let i = 0; i < this.config.maxPlayers; i++) {
      const x = 40 + (i % 2) * (CARD_W + 40);
      const y = 170 + Math.floor(i / 2) * (CARD_H + 12);
      this.drawSeat(x, y, lobby.state.seats[i], i);
    }

    // Chân trang: sẵn sàng / bắt đầu, hướng dẫn.
    const fy = GAME_HEIGHT - 92;
    const cx = GAME_WIDTH / 2;
    if (lobby.isHost) {
      const block = lobby.startBlock(level.minPlayers, level.maxPlayers);
      this.button(cx, fy, t('lobby.start'), () => this.tryStart(), 28, block === null);
      const msg =
        block === null
          ? t('lobby.canStart')
          : t(`lobby.block.${block}`, { min: level.minPlayers, max: level.maxPlayers });
      this.text(cx, fy + 44, msg, 18, block === null ? GOOD : Theme.muted);
    } else {
      const ready = lobby.isReady(selfId);
      const label = ready ? t('lobby.notReady') : t('lobby.ready');
      this.button(cx, fy, label, () => this.toggleReady(), 28);
      const msg = ready ? t('lobby.waitHost') : t('lobby.pressReady');
      this.text(cx, fy + 44, msg, 18, ready ? GOOD : Theme.muted);
    }
    const help = `${t(lobby.isHost ? 'lobby.helpHost' : 'lobby.help')}  ·  ${t('online.leaveHint')}`;
    this.text(cx, GAME_HEIGHT - 18, this.footer(help), 15, Theme.muted);
    if (this.error) this.text(cx, fy - 44, t('online.error', { error: this.error }), 18, BAD);
  }

  private drawSeat(x: number, y: number, seat: LobbySeat | undefined, index: number): void {
    const lobby = this.lobby!;
    const selfId = this.session!.transport.selfId;
    const mine = seat?.peer === selfId;
    const g = this.add.graphics();
    g.fillStyle(mine ? 0x3a3550 : 0x2b2838, 1).fillRoundedRect(x, y, CARD_W, CARD_H, 10);
    this.ui.add(g);
    const cy = y + CARD_H / 2;
    this.text(x + 18, cy, `${index + 1}`, 18, Theme.muted);
    if (!seat) {
      this.text(x + 60, cy, t('lobby.empty'), 20, Theme.muted, 0);
      return;
    }
    // Hình nhân vật theo màu + mũ; bấm để đổi (chỉ ô của mình).
    const img = this.add.image(x + 62, cy + 6, playerTextureKey(seat.color));
    this.ui.add(img);
    const hat = this.text(x + 62, cy - 20, HATS[seat.hat] || (mine ? '＋' : ''), 22, Theme.muted);
    if (mine) {
      this.clickable(img, () => this.cycleColor(seat.local));
      this.clickable(hat, () => this.cycleHat(seat.local));
    }
    const editing = mine && this.editing?.local === seat.local;
    const label = editing ? `${this.editing!.text}▏` : seat.name;
    const name = this.text(x + 100, cy - 12, label, 22, editing ? Theme.accent : Theme.text, 0);
    if (mine && !editing) this.clickable(name, () => this.startEdit(seat.local));

    const isHostSeat = seat.peer === lobby.state.hostId;
    const ping = this.pings.get(seat.peer);
    const info = [
      seat.source === 'gamepad' ? '🎮' : '⌨️',
      isHostSeat ? `👑 ${t('online.host')}` : '',
      mine ? t('online.you') : '',
      !mine && ping !== undefined ? `${ping} ms` : '',
    ].filter(Boolean);
    this.text(x + 100, cy + 16, info.join('  ·  '), 15, Theme.muted, 0);

    const ready = lobby.isReady(seat.peer);
    const readyText = ready ? `✔ ${t('lobby.isReady')}` : '…';
    this.text(x + CARD_W - 90, cy, readyText, 18, ready ? GOOD : Theme.muted);
    if (lobby.isHost && !isHostSeat) {
      this.clickable(this.text(x + CARD_W - 22, cy, '✖', 20, BAD), () => lobby.kick(seat.peer));
    }
  }

  private statusText(): { text: string; color: string } {
    const s = this.session!;
    if (this.error) return { text: t('online.error', { error: this.error }), color: BAD };
    if (this.lobby?.kicked) return { text: t('online.kicked'), color: BAD };
    switch (s.state.kind) {
      case 'connecting':
        return { text: t('online.connecting'), color: Theme.text };
      case 'joined':
        return { text: t('online.joined'), color: GOOD };
      case 'rejected': {
        const st = s.state;
        if (st.reason === 'version')
          return {
            text: t('online.rejectVersion', { host: st.hostVersion, you: __APP_VERSION__ }),
            color: BAD,
          };
        if (st.reason === 'data') {
          const mine = this.registry.get(RegistryKeys.DataHash) as string;
          return { text: t('online.rejectData', { host: st.hostDataHash, you: mine }), color: BAD };
        }
        if (st.reason === 'kicked') return { text: t('online.kicked'), color: BAD };
        return { text: t('online.rejectFull', { max: this.config.maxPlayers }), color: BAD };
      }
      case 'noHost':
        return { text: t('online.noHost'), color: BAD };
      case 'hostLeft':
        return { text: t('online.hostLeft'), color: BAD };
    }
  }

  private copyLink(link: string): void {
    const flash = (msg: string) => {
      const txt = this.text(260, 122, msg, 16, GOOD, 0);
      this.time.delayedCall(1500, () => txt.destroy());
    };
    navigator.clipboard?.writeText(link).then(
      () => flash(t('online.copied')),
      () => flash(t('online.copyFailed')),
    );
  }

  // ---- Bàn phím ----

  /**
   * Sửa tên bằng một ô `<input>` ẩn để bộ gõ tiếng Việt (Telex/VNI, IME của hệ điều hành)
   * và dán chữ hoạt động bình thường; chữ đang gõ được vẽ lại trong canvas.
   */
  private startEdit(local: number): void {
    const seat = this.mySeat(local);
    if (!seat || this.editing) return;
    const el = document.createElement('input');
    el.value = seat.name;
    el.maxLength = NAME_MAX * 2;
    el.setAttribute('aria-label', t('lobby.nameLabel'));
    Object.assign(el.style, { position: 'fixed', left: '0', top: '0', width: '1px', opacity: '0' });
    document.body.appendChild(el);
    el.focus();
    el.select();
    this.editing = { local, text: seat.name, el };
    this.joinArmed = false;
    el.addEventListener('input', () => {
      if (!this.editing) return;
      this.editing.text = [...el.value].slice(0, NAME_MAX).join('');
      this.redraw();
    });
    el.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter' && !e.isComposing) this.endEdit(true);
      else if (e.key === 'Escape') this.endEdit(false);
    });
    el.addEventListener('blur', () => this.endEdit(true));
    this.redraw();
  }

  private endEdit(commit: boolean): void {
    const ed = this.editing;
    if (!ed) return;
    this.editing = null;
    this.joinArmed = false;
    ed.el.remove();
    const name = ed.text.trim();
    if (commit && name) {
      this.lobby?.setLook(ed.local, { name });
      if (ed.local === this.firstLocal()) saveSettings({ playerName: name });
    }
    this.redraw();
  }

  private onKey(e: KeyboardEvent): void {
    // Đang sửa tên: phím đi vào ô nhập.
    if (this.editing) return;
    if (e.key === 'Escape') {
      this.leave();
      return;
    }
    if (this.lobby) {
      const actions: Record<string, () => void> = {
        KeyC: () => this.cycleColor(this.firstLocal()),
        KeyH: () => this.cycleHat(this.firstLocal()),
        KeyN: () => this.startEdit(this.firstLocal()),
        KeyR: () => this.toggleReady(),
        KeyP: () => this.tryStart(),
        BracketLeft: () => this.cycleLevel(-1),
        BracketRight: () => this.cycleLevel(1),
      };
      actions[e.code]?.();
      return;
    }
    if (this.session) return;
    if (e.key === 'Backspace') {
      this.typed = this.typed.slice(0, -1);
      this.drawChoose();
    } else if (e.key === 'Enter' && this.typed.length === 0) {
      this.open(generateRoomCode(), 'host');
    } else if (e.key.length === 1) {
      this.typeCode(e.key, false);
    }
  }

  private firstLocal(): number {
    return this.lobby?.mySeats()[0]?.local ?? 0;
  }

  /** Gõ hoặc dán mã; đủ 6 ký tự hợp lệ thì vào phòng ngay. */
  private typeCode(input: string, replace: boolean): void {
    if (this.session) return;
    // Dán cả link mời cũng được.
    const fromLink = /[?&]room=([^&#\s]+)/.exec(input)?.[1];
    const raw = (replace ? '' : this.typed) + (fromLink ?? input);
    const clean = raw
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '')
      .slice(0, ROOM_CODE_LENGTH);
    this.typed = clean;
    const code = normalizeRoomCode(clean);
    if (code) this.open(code, 'client');
    else this.drawChoose();
  }

  private leave(): void {
    // Bỏ `?room=` khỏi URL để về menu không bị đưa lại vào phòng.
    const url = new URL(window.location.href);
    url.searchParams.delete('room');
    history.replaceState(null, '', url.toString());
    this.scene.start(SceneKeys.Menu);
  }

  private cleanup(): void {
    this.editing?.el.remove();
    this.editing = null;
    if (!this.handedOff) this.session?.close();
    this.session = null;
    this.lobby = null;
    this.pingTimer?.remove();
    this.pingTimer = null;
    if (this.onPaste) document.removeEventListener('paste', this.onPaste);
    this.onPaste = null;
    this.input.keyboard?.removeAllListeners('keydown');
  }
}
