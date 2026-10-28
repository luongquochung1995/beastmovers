import Phaser from 'phaser';
import { t } from '../data/i18n';
import type { LevelDef } from '../data/types';
import { type BuiltLevel, buildLevel, playerSpawn } from '../sim/levelSetup';
import { LevelRuntime } from '../sim/LevelRuntime';
import { Btn, EMPTY_FRAME, type InputFrame, isDown } from '../systems/input/InputFrame';
import type { SimSlot } from '../sim/SimSlot';
import type { Vec } from '../systems/geometry';
import { fitCamera } from '../systems/cameraFit';
import { SLOW_PING_MS } from '../net/OnlineGame';
import { type PingHold, stepPing, WHEEL_HOLD_MS } from '../systems/ping';
import { GameHud, HUD_TOP } from '../ui/GameHud';
import { PingWheelView } from '../ui/PingWheelView';
import { RainView } from '../ui/RainView';
import { GAME_HEIGHT, GAME_WIDTH, Theme } from '../ui/theme';
import type { HudScene } from './HudScene';
import { RegistryKeys, SceneKeys } from './keys';
import { PlayScene } from './PlayScene';

const CAMERA_PADDING = 220;
const CAMERA_MAX_ZOOM = 1.2;
/** Độ "bám" của camera mỗi khung hình 60 FPS. */
const CAMERA_LERP = 0.08;

/** Màn chơi: dựng hoàn toàn từ `levels.json` + bản đồ Tiled. */
export class GameScene extends PlayScene {
  protected built!: BuiltLevel;
  runtime!: LevelRuntime;
  private leaving = false;
  private hud: GameHud | null = null;
  private rain: RainView | null = null;
  private netPing: Phaser.GameObjects.Text | null = null;
  private netBanner: Phaser.GameObjects.Text | null = null;
  private hostGoneHandled = false;
  private lastFrameMs = 0;
  private cameraReady = false;
  /** Kiểm thử: khóa zoom camera (null = tự động). */
  cameraZoomOverride: number | null = null;
  /** Nút Start của từng tay cầm ở khung trước (bấm Start để tạm dừng). */
  private startHeld = new Map<string, boolean>();
  /** Lúc đóng menu tạm dừng: phím Esc vừa dùng để đóng không được mở lại menu. */
  private pauseClosedAt = 0;
  /** Vòng ping của người chơi trên máy này (chỉ để vẽ; ping thật do mô phỏng quyết định). */
  private wheels = new Map<number, { hold: PingHold; prev: InputFrame; view: PingWheelView }>();

  constructor() {
    super(SceneKeys.Game);
  }

  /** Màn đang chơi: `levelId` trong registry, mặc định màn đầu tiên. */
  protected get levelDef(): LevelDef {
    const id = this.registry.get(RegistryKeys.LevelId) as string | undefined;
    return this.gameData.levels.find((l) => l.id === id) ?? this.gameData.levels[0]!;
  }

  protected buildLevel(): void {
    const level = this.levelDef;
    const map = this.gameData.maps[level.map]!;
    const client = !!this.online && !this.online.isHost;
    this.built = buildLevel(this.world, level, map, !client);
    this.runtime = new LevelRuntime(this.world, this.built, this.gameData, client);
    if (client) this.online!.attachMirror(this.world, this.runtime, (s) => this.spawnPointFor(s));
    this.leaving = false;
    this.startHeld = new Map();
    this.pauseClosedAt = 0;
    this.wheels = new Map();
    this.cameras.main.setBounds(0, 0, map.width, map.height);
    this.cameraReady = false;
  }

  override createHud(hud: HudScene): void {
    this.rain = this.levelDef.modifiers.includes('rain')
      ? new RainView(hud, GAME_WIDTH, GAME_HEIGHT)
      : null;
    this.hud = new GameHud(hud, this.runtime, this.world, this.cameras.main);
    hud.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT - 14, t(this.online ? 'game.hintOnline' : 'game.hint'), {
        fontFamily: Theme.font,
        fontSize: '14px',
        color: Theme.muted,
        backgroundColor: '#00000088',
        padding: { x: 8, y: 3 },
      })
      .setOrigin(0.5, 1);
    if (this.online) {
      const style = {
        fontFamily: Theme.font,
        fontSize: '15px',
        color: Theme.text,
        backgroundColor: '#000000aa',
        padding: { x: 8, y: 4 },
      };
      this.netPing = hud.add.text(GAME_WIDTH - 8, HUD_TOP + 8, '', style).setOrigin(1, 0);
      this.netBanner = hud.add
        .text(GAME_WIDTH / 2, HUD_TOP + 40, '', { ...style, fontSize: '20px', align: 'center' })
        .setOrigin(0.5, 0)
        .setVisible(false);
    }
  }

  /** Online: độ trễ, cảnh báo mạng chậm, mất kết nối / host thoát. */
  private updateNetHud(): void {
    const online = this.online;
    if (!online || !this.netPing || !this.netBanner) return;
    const ping = online.pingMs();
    const slow = ping !== null && ping > SLOW_PING_MS;
    const [up, all] = online.peersOnline();
    const who = online.isHost ? `${t('net.hostTag')} · ${up}/${all}  ` : '';
    this.netPing
      .setText(
        `${who}📶 ${ping === null ? '…' : `${ping} ms`}${slow ? `  ⚠ ${t('net.slow')}` : ''}`,
      )
      .setColor(slow ? '#ff7b7b' : Theme.text);
    const st = online.status();
    let msg = '';
    if (st.kind === 'stalled') msg = `⚠ ${t('net.stalled')}`;
    else if (st.kind === 'reconnecting') msg = `⚠ ${t('net.reconnecting', { s: st.secondsLeft })}`;
    else if (st.kind === 'hostGone') {
      msg = `${t(st.quit ? 'online.hostLeft' : 'online.hostLost')}\n${t('net.backToMenu')}`;
      if (!this.hostGoneHandled) {
        this.hostGoneHandled = true;
        this.input.keyboard?.once('keydown-ENTER', () => this.leaveOnline());
      }
    }
    this.netBanner.setText(msg).setVisible(msg !== '');
  }

  /** Rời phòng online, về menu. */
  leaveOnline(): void {
    const net = this.online?.ctx;
    net?.session.close();
    this.registry.set(RegistryKeys.Net, null);
    const url = new URL(window.location.href);
    url.searchParams.delete('room');
    history.replaceState(null, '', url.toString());
    this.scene.start(SceneKeys.Menu);
  }

  protected spawnPointFor(slotIndex: number): Vec {
    return playerSpawn(this.levelDef, slotIndex);
  }

  protected override levelRuntime(): LevelRuntime {
    return this.runtime;
  }

  override updateHud(): void {
    this.rain?.update(this.lastFrameMs);
    this.hud?.update(this.lastFrameMs);
    this.updateNetHud();
  }

  protected override afterRender(frameMs: number): void {
    this.lastFrameMs = frameMs;
    this.runtime.render(this.loop.alpha);
    this.updateCamera(frameMs);
    this.updateWheels(frameMs);
  }

  /** Người chơi trên máy này giữ nút Ping: hiện vòng ping quanh nhân vật của họ. */
  private updateWheels(frameMs: number): void {
    for (const slot of this.inputs.slots) {
      if (!slot) continue;
      let w = this.wheels.get(slot.index);
      if (!w) {
        w = { hold: { heldMs: 0, choice: null }, prev: slot.cur, view: new PingWheelView(this) };
        this.wheels.set(slot.index, w);
      }
      stepPing(w.hold, w.prev, slot.cur, frameMs);
      w.prev = slot.cur;
      const global = this.online ? this.online.globalSlotOf(slot.index) : slot.index;
      const player = this.world.players.find((p) => p.slotIndex === global);
      if (player && w.hold.heldMs >= WHEEL_HOLD_MS && !this.runtime.locked)
        w.view.show(player.viewPosition, w.hold.choice);
      else w.view.hide();
    }
  }

  /** Camera chung: ôm mọi người chơi trên máy, trượt mượt tới khung hình mới. */
  private updateCamera(frameMs: number): void {
    const cam = this.cameras.main;
    const map = this.built.map;
    // Online: camera ôm người chơi trên máy này (mỗi máy một góc nhìn riêng).
    const own = this.online?.ownSlots();
    const players = own
      ? this.world.players.filter((p) => own.includes(p.slotIndex))
      : this.world.players;
    const fit = fitCamera({
      points: (players.length ? players : this.world.players).map((p) => p.position),
      view: { w: GAME_WIDTH, h: GAME_HEIGHT },
      map: { w: map.width, h: map.height },
      padding: CAMERA_PADDING,
      maxZoom: CAMERA_MAX_ZOOM,
      hudTop: HUD_TOP,
    });
    const zoom = this.cameraZoomOverride ?? fit.zoom;
    // Lần đầu đặt thẳng, sau đó trượt theo (không phụ thuộc FPS).
    const k = this.cameraReady ? 1 - Math.pow(1 - CAMERA_LERP, frameMs / 16.67) : 1;
    this.cameraReady = true;
    cam.setZoom(cam.zoom + (zoom - cam.zoom) * k);
    const cx = cam.midPoint.x + (fit.center.x - cam.midPoint.x) * k;
    const cy = cam.midPoint.y + (fit.center.y - cam.midPoint.y) * k;
    cam.centerOn(cx, cy);
  }

  /** Esc: mở menu tạm dừng (host đã thoát thì về menu). */
  protected onExit(): void {
    this.input.keyboard?.once('keydown-ESC', () => this.onExit());
    if (this.online?.status().kind === 'hostGone') return this.leaveOnline();
    if (performance.now() - this.pauseClosedAt < 300) return;
    this.openPause();
  }

  override update(): void {
    // Tay cầm đã tham gia bấm Start: tạm dừng. Đọc trước khi chạy logic để cú bấm Start
    // dùng để tham gia không bị tính luôn là tạm dừng.
    for (const src of this.inputs.allSources()) {
      if (src.kind !== 'gamepad') continue;
      const down = src.isConnected() && isDown(src.read(), Btn.Start);
      const joined = this.inputs.slots.some((s) => s?.source === src);
      if (down && !this.startHeld.get(src.id) && joined) this.openPause();
      this.startHeld.set(src.id, down);
    }
    super.update();
  }

  /** null: chơi chung máy. */
  onlineRole(): 'host' | 'client' | null {
    if (!this.online) return null;
    return this.online.isHost ? 'host' : 'client';
  }

  openPause(): void {
    if (this.scene.isActive(SceneKeys.Pause) || this.leaving || this.runtime.locked) return;
    // Chơi chung máy thì dừng hẳn; online thì game vẫn chạy.
    if (!this.online) {
      this.scene.pause();
      this.scene.pause(SceneKeys.Hud);
    }
    this.scene.launch(SceneKeys.Pause);
    this.scene.bringToTop(SceneKeys.Pause);
  }

  closePause(): void {
    this.scene.stop(SceneKeys.Pause);
    this.pauseClosedAt = performance.now();
    if (!this.online) {
      this.scene.resume(SceneKeys.Hud);
      this.scene.resume();
    }
  }

  /** Kết thúc sớm: xe chạy luôn (máy khách online không kết thúc màn của cả phòng). */
  finishFromPause(): void {
    this.closePause();
    if (!this.online || this.online.isHost) this.runtime.finishNow();
  }

  restartLevel(): void {
    this.scene.stop(SceneKeys.Pause);
    this.scene.restart();
  }

  quitTo(key: string): void {
    this.scene.stop(SceneKeys.Pause);
    if (this.online) this.leaveOnline();
    else this.scene.start(key);
  }

  protected override fixedUpdate(dt: number): void {
    super.fixedUpdate(dt);
    if (this.online && !this.online.isHost) {
      this.runtime.landlord.tickBubble(dt);
      const result = this.online.result;
      if (result && !this.leaving) {
        this.leaving = true;
        this.time.delayedCall(0, () => this.scene.start(SceneKeys.Result, result));
      }
      return;
    }
    this.runtime.step(dt);
    if (this.runtime.done && !this.leaving) {
      this.leaving = true;
      // Chuyển scene sau khung hình này (không đổi scene giữa vòng lặp logic).
      this.time.delayedCall(0, () => this.showResult());
    }
  }

  protected override allowJoin(): boolean {
    return !this.runtime.locked;
  }

  /** Hết giờ: mọi người buông tay điều khiển (input rỗng). */
  protected override controlSlots(): readonly (SimSlot | null)[] {
    if (!this.runtime.locked) return super.controlSlots();
    return super.controlSlots().map((s) => s && { ...s, prev: EMPTY_FRAME, cur: EMPTY_FRAME });
  }

  private showResult(): void {
    const result = this.runtime.result();
    this.online?.sendResult(result);
    this.scene.start(SceneKeys.Result, result);
  }
}
