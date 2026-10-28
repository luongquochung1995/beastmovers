import Phaser from 'phaser';
import { CONFIG_KEY } from '../data/config';
import { t } from '../data/i18n';
import type { GameConfig } from '../data/types';
import { openTransport, type TransportKind } from '../net/openTransport';
import { generateRoomCode, inviteLink, normalizeRoomCode, ROOM_CODE_LENGTH } from '../net/room';
import { RoomSession } from '../net/session';
import { TrysteroTransport } from '../net/TrysteroTransport';
import { GAME_HEIGHT, GAME_WIDTH, Theme } from '../ui/theme';
import { RegistryKeys, SceneKeys } from './keys';

/** `create`: tạo phòng mới; `join` có `code`: vào thẳng phòng đó (link mời); không có gì: màn chọn. */
export type OnlineSceneData = { mode?: 'create' } | { mode: 'join'; code: string };

/**
 * Phòng chơi online (P20): tạo phòng, vào phòng bằng mã hoặc link, bắt tay kiểm tra
 * phiên bản + data. Lobby đầy đủ (màu, sẵn sàng, chọn màn) làm ở P21.
 */
export class OnlineScene extends Phaser.Scene {
  private session: RoomSession | null = null;
  private kind: TransportKind = 'trystero';
  private code = '';
  private typed = '';
  private ui!: Phaser.GameObjects.Container;
  private pings = new Map<string, number>();
  private pingTimer: Phaser.Time.TimerEvent | null = null;
  private onPaste: ((e: ClipboardEvent) => void) | null = null;

  constructor() {
    super(SceneKeys.Online);
  }

  create(data: OnlineSceneData): void {
    this.cameras.main.setBackgroundColor(Theme.bg);
    this.session = null;
    this.typed = '';
    this.pings = new Map();
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
      }
    );
  }

  private open(code: string, role: 'host' | 'client'): void {
    const config = this.registry.get(CONFIG_KEY) as GameConfig;
    this.code = code;
    const { transport, kind } = openTransport(config.net, code, window.location.search);
    this.kind = kind;
    this.session = new RoomSession(
      transport,
      role,
      {
        version: __APP_VERSION__,
        dataHash: this.registry.get(RegistryKeys.DataHash) as string,
        maxPlayers: config.maxPlayers,
      },
      1,
    );
    this.session.onChange(() => this.drawRoom());
    if (transport instanceof TrysteroTransport) {
      transport.onError((err) => this.drawRoom(err));
      this.pingTimer = this.time.addEvent({
        delay: 2000,
        loop: true,
        callback: () => this.measurePings(transport),
      });
    }
    // Đưa mã phòng lên thanh địa chỉ để tải lại trang vẫn về đúng phòng.
    if (role === 'client')
      history.replaceState(null, '', inviteLink(window.location.href, code) + this.keepParams());
    this.drawRoom();
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
          if (this.scene.isActive()) this.drawRoom();
        })
        .catch(() => {});
    }
  }

  // ---- Vẽ ----

  private clear(): void {
    this.ui.removeAll(true);
  }

  private text(x: number, y: number, s: string, size: number, color: string = Theme.text) {
    const txt = this.add
      .text(x, y, s, { fontFamily: Theme.font, fontSize: `${size}px`, color, align: 'center' })
      .setOrigin(0.5);
    this.ui.add(txt);
    return txt;
  }

  private button(x: number, y: number, label: string, onClick: () => void) {
    const b = this.text(x, y, label, 26)
      .setBackgroundColor('#3a3550')
      .setPadding(22, 10, 22, 10)
      .setInteractive({ useHandCursor: true })
      .on('pointerover', () => b.setColor(Theme.accent))
      .on('pointerout', () => b.setColor(Theme.text))
      .on('pointerup', onClick);
    return b;
  }

  private drawChoose(): void {
    this.clear();
    const cx = GAME_WIDTH / 2;
    this.text(cx, 120, t('online.title'), 54, Theme.accent);
    this.button(cx, 240, t('online.create'), () => this.open(generateRoomCode(), 'host'));
    this.text(cx, 340, t('online.enterCode'), 24, Theme.muted);
    const boxes = Array.from({ length: ROOM_CODE_LENGTH }, (_, i) => this.typed[i] ?? '·').join(
      ' ',
    );
    this.text(cx, 400, boxes, 52);
    this.text(cx, 470, t('online.codeHint'), 18, Theme.muted);
    this.text(cx, GAME_HEIGHT - 40, t('online.backHint'), 18, Theme.muted);
  }

  private drawRoom(error?: string): void {
    const s = this.session;
    if (!s || !this.scene.isActive()) return;
    this.clear();
    const cx = GAME_WIDTH / 2;
    this.text(cx, 70, t('online.room'), 26, Theme.muted);
    this.text(cx, 125, this.code.split('').join(' '), 64, Theme.accent);
    const link = inviteLink(window.location.href, this.code);
    this.text(cx, 190, link, 18, Theme.muted);
    if (s.isHost) {
      this.button(cx, 240, t('online.copyLink'), () => {
        navigator.clipboard?.writeText(link).then(
          () => this.flash(t('online.copied')),
          () => this.flash(link),
        );
      });
    }

    const status = this.statusText(error);
    this.text(cx, 300, status.text, 24, status.color);

    if (s.state.kind === 'joined') {
      this.text(cx, 355, t('online.players', { n: s.totalSeats, max: this.maxPlayers() }), 22);
      s.members.forEach((m, i) => {
        const tags = [
          m.id === s.hostId ? t('online.host') : '',
          m.id === s.transport.selfId ? t('online.you') : '',
        ].filter(Boolean);
        const ping = this.pings.get(m.id);
        const line = `${m.id.slice(0, 8)}  ·  ${t('online.seats', { n: m.seats })}${tags.length ? `  ·  ${tags.join(', ')}` : ''}${ping !== undefined ? `  ·  ${ping} ms` : ''}`;
        this.text(
          cx,
          400 + i * 32,
          line,
          20,
          m.id === s.transport.selfId ? Theme.accent : Theme.text,
        );
      });
    }
    this.text(
      cx,
      GAME_HEIGHT - 40,
      `${t('online.leaveHint')}  ·  ${t(`online.via.${this.kind}`)}`,
      18,
      Theme.muted,
    );
  }

  private statusText(error?: string): { text: string; color: string } {
    const s = this.session!;
    const bad = '#ff7b7b';
    if (error) return { text: t('online.error', { error }), color: bad };
    switch (s.state.kind) {
      case 'connecting':
        return { text: t('online.connecting'), color: Theme.text };
      case 'joined':
        return {
          text: s.isHost
            ? s.members.length > 1
              ? t('online.waitingLobby')
              : t('online.waitingPlayers')
            : t('online.joined'),
          color: '#7CFC8A',
        };
      case 'rejected': {
        const st = s.state;
        if (st.reason === 'version')
          return {
            text: t('online.rejectVersion', { host: st.hostVersion, you: __APP_VERSION__ }),
            color: bad,
          };
        if (st.reason === 'data') {
          const mine = this.registry.get(RegistryKeys.DataHash) as string;
          return { text: t('online.rejectData', { host: st.hostDataHash, you: mine }), color: bad };
        }
        return { text: t('online.rejectFull', { max: this.maxPlayers() }), color: bad };
      }
      case 'noHost':
        return { text: t('online.noHost'), color: bad };
      case 'hostLeft':
        return { text: t('online.hostLeft'), color: bad };
    }
  }

  private flash(msg: string): void {
    const txt = this.text(GAME_WIDTH / 2, 270, msg, 18, '#7CFC8A');
    this.time.delayedCall(1500, () => txt.destroy());
  }

  private maxPlayers(): number {
    return (this.registry.get(CONFIG_KEY) as GameConfig).maxPlayers;
  }

  // ---- Bàn phím ----

  private onKey(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      this.leave();
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
    this.session?.close();
    this.session = null;
    this.pingTimer?.remove();
    this.pingTimer = null;
    if (this.onPaste) document.removeEventListener('paste', this.onPaste);
    this.onPaste = null;
    this.input.keyboard?.removeAllListeners('keydown');
  }
}
