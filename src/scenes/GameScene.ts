import { t } from '../data/i18n';
import type { LevelDef } from '../data/types';
import { type BuiltLevel, buildLevel, playerSpawn } from '../sim/levelSetup';
import { LevelRuntime } from '../sim/LevelRuntime';
import { EMPTY_FRAME } from '../systems/input/InputFrame';
import type { SimSlot } from '../sim/SimSlot';
import type { Vec } from '../systems/geometry';
import { fitCamera } from '../systems/cameraFit';
import { GameHud, HUD_TOP } from '../ui/GameHud';
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
  private lastFrameMs = 0;
  private cameraReady = false;
  /** Kiểm thử: khóa zoom camera (null = tự động). */
  cameraZoomOverride: number | null = null;

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
    this.cameras.main.setBounds(0, 0, map.width, map.height);
    this.cameraReady = false;
  }

  override createHud(hud: HudScene): void {
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
  }

  protected spawnPointFor(slotIndex: number): Vec {
    return playerSpawn(this.levelDef, slotIndex);
  }

  protected override levelRuntime(): LevelRuntime {
    return this.runtime;
  }

  override updateHud(): void {
    this.hud?.update(this.lastFrameMs);
  }

  protected override afterRender(frameMs: number): void {
    this.lastFrameMs = frameMs;
    this.runtime.render(this.loop.alpha);
    this.updateCamera(frameMs);
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

  /** Esc: kết thúc sớm (xe chạy luôn). Máy khách online không kết thúc màn của cả phòng. */
  protected onExit(): void {
    if (this.online && !this.online.isHost) return;
    this.runtime.finishNow();
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
