import { t } from '../data/i18n';
import type { LevelDef } from '../data/types';
import { type BuiltLevel, buildLevel, playerSpawn } from '../sim/levelSetup';
import { LevelRuntime } from '../sim/LevelRuntime';
import { EMPTY_FRAME } from '../systems/input/InputFrame';
import type { PlayerSlot } from '../systems/input/InputManager';
import type { Vec } from '../systems/geometry';
import { GameHud } from '../ui/GameHud';
import { GAME_HEIGHT, GAME_WIDTH, Theme } from '../ui/theme';
import type { HudScene } from './HudScene';
import { RegistryKeys, SceneKeys } from './keys';
import { PlayScene } from './PlayScene';

/** Màn chơi: dựng hoàn toàn từ `levels.json` + bản đồ Tiled. */
export class GameScene extends PlayScene {
  protected built!: BuiltLevel;
  runtime!: LevelRuntime;
  private leaving = false;
  private hud: GameHud | null = null;
  private lastFrameMs = 0;

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
    this.built = buildLevel(this.world, level, map);
    this.runtime = new LevelRuntime(this.world, this.built, this.gameData);
    this.leaving = false;
    const cam = this.cameras.main;
    cam.setBounds(0, 0, map.width, map.height);
    cam.setZoom(Math.min(GAME_WIDTH / map.width, GAME_HEIGHT / map.height));
    cam.centerOn(map.width / 2, map.height / 2);
  }

  override createHud(hud: HudScene): void {
    this.hud = new GameHud(hud, this.runtime, this.world);
    hud.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT - 14, t('game.hint'), {
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

  override updateHud(): void {
    this.hud?.update(this.lastFrameMs);
  }

  protected override afterRender(frameMs: number): void {
    this.lastFrameMs = frameMs;
    this.runtime.render(this.loop.alpha);
  }

  /** Esc: kết thúc sớm (xe chạy luôn). */
  protected onExit(): void {
    this.runtime.finishNow();
  }

  protected override fixedUpdate(dt: number): void {
    super.fixedUpdate(dt);
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
  protected override controlSlots(): readonly (PlayerSlot | null)[] {
    if (!this.runtime.locked) return super.controlSlots();
    return super.controlSlots().map((s) => s && { ...s, prev: EMPTY_FRAME, cur: EMPTY_FRAME });
  }

  private showResult(): void {
    this.scene.start(SceneKeys.Result, this.runtime.result());
  }
}
