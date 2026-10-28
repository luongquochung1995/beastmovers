import Phaser from 'phaser';
import { CONFIG_KEY } from '../data/config';
import type { GameConfig } from '../data/types';
import type { GameData } from '../data/validate';
import { World } from '../sim/World';
import { FixedLoop } from '../systems/FixedLoop';
import type { Vec } from '../systems/geometry';
import type { InputManager, PlayerSlot } from '../systems/input/InputManager';
import { Random } from '../systems/Random';
import { Theme } from '../ui/theme';
import type { HudScene } from './HudScene';
import { RegistryKeys, SceneKeys } from './keys';

/**
 * Phần chung của mọi scene có mô phỏng (màn chơi, sandbox): vòng lặp cố định,
 * input, người chơi vào giữa chừng. HUD và bảng debug nằm ở HudScene chạy song song
 * (không bị camera của màn chơi zoom/di chuyển theo).
 */
export abstract class PlayScene extends Phaser.Scene {
  world!: World;
  protected loop!: FixedLoop;
  protected inputs!: InputManager;
  protected config!: GameConfig;
  protected gameData!: GameData;
  protected logicTicks = 0;
  /** Bảng debug đang bật (F1). */
  debugVisible = false;
  /** Số bước logic đã chạy trong khung hình vừa rồi (cho bảng debug). */
  lastSteps = 0;
  private lastNow = 0;

  /** Dựng tường, sàn, đồ vật. */
  protected abstract buildLevel(): void;
  /** Vị trí xuất hiện của người chơi ô `slotIndex`. */
  protected abstract spawnPointFor(slotIndex: number): Vec;
  /** Nhấn Esc. */
  protected abstract onExit(): void;

  /** HUD riêng của màn (lớp con ghi đè). Gọi một lần khi HudScene được tạo. */
  createHud(_hud: HudScene): void {}
  /** Cập nhật HUD mỗi khung hình. */
  updateHud(_hud: HudScene): void {}

  create(): void {
    this.config = this.registry.get(CONFIG_KEY) as GameConfig;
    this.gameData = this.registry.get(RegistryKeys.Data) as GameData;
    this.inputs = this.registry.get(RegistryKeys.Input) as InputManager;
    this.loop = new FixedLoop(this.config.logicHz);
    this.logicTicks = 0;
    this.lastNow = performance.now();
    this.cameras.main.setBackgroundColor(Theme.bg);

    this.world = new World(this, this.gameData, this.config, new Random());
    this.buildLevel();

    // Chưa ai tham gia thì người dùng WASD tự vào làm người chơi 1.
    if (this.inputs.slots.every((s) => s === null)) this.inputs.join('kb0');
    for (const slot of this.inputs.slots) if (slot) this.spawnPlayer(slot);

    this.debugVisible = this.config.debug;
    this.world.debugDraw = this.debugVisible;
    this.setPhysicsDebug(this.debugVisible);
    this.input.keyboard?.on('keydown-F1', (e: KeyboardEvent) => {
      e.preventDefault();
      this.debugVisible = !this.debugVisible;
      this.world.debugDraw = this.debugVisible;
      this.setPhysicsDebug(this.debugVisible);
    });
    // Phím T (chỉ khi bật debug): cho mọi người vấp ngã để thử hoạt ảnh.
    this.input.keyboard?.on('keydown-T', () => {
      if (this.debugVisible) this.world.players.forEach((p) => p.knockDown());
    });
    this.input.keyboard?.once('keydown-ESC', () => this.onExit());

    this.scene.launch(SceneKeys.Hud, { playKey: this.scene.key });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scene.stop(SceneKeys.Hud);
      this.world.destroy();
    });
  }

  private setPhysicsDebug(on: boolean): void {
    const world = this.matter.world;
    world.drawDebug = on;
    world.debugGraphic?.setVisible(on);
  }

  override update(): void {
    // Dùng đồng hồ thật thay cho `delta` của Phaser: delta đó đã bị làm mượt và giới hạn,
    // nên khi FPS thấp logic sẽ chạy chậm hơn 60 Hz.
    const now = performance.now();
    const frameMs = now - this.lastNow;
    this.lastSteps = this.loop.advance(frameMs, (dt) => this.fixedUpdate(dt));
    this.lastNow = now;
    this.world.render(this.loop.alpha, frameMs);
    this.afterRender(frameMs);
  }

  /** Sau khi vẽ thế giới (camera, hiệu ứng…). */
  protected afterRender(_frameMs: number): void {}

  /** Mọi logic game chạy ở đây, đúng `logicHz` lần mỗi giây. */
  protected fixedUpdate(dt: number): void {
    for (const slot of this.inputs.poll(this.allowJoin())) this.spawnPlayer(slot);
    this.world.step(dt, this.controlSlots());
    this.logicTicks++;
  }

  /** Có cho người mới vào giữa chừng không. */
  protected allowJoin(): boolean {
    return true;
  }

  /** Input đưa vào mô phỏng (lớp con có thể khóa điều khiển, vd. khi hết giờ). */
  protected controlSlots(): readonly (PlayerSlot | null)[] {
    return this.inputs.slots;
  }

  private spawnPlayer(slot: PlayerSlot): void {
    const p = this.spawnPointFor(slot.index);
    this.world.addPlayer(slot.index, p.x, p.y);
  }

  /** Dùng cho kiểm thử tự động (Playwright) khi bật `?debug`. */
  debugApi() {
    const world = this.world;
    return {
      snapshot: () => world.snapshot(),
      spawn: (id: string, x: number, y: number, angle = 0) => world.spawnItem(id, x, y, angle).uid,
      teleport: (slot: number, x: number, y: number) => {
        const p = world.players.find((pl) => pl.slotIndex === slot);
        if (p) this.matter.body.setPosition(p.body, { x, y }, false);
      },
      /** Đặt món đồ `uid` tới (x, y), đứng yên. */
      placeItem: (uid: number, x: number, y: number) => {
        const item = world.items.find((i) => i.uid === uid);
        if (!item) return;
        this.matter.body.setPosition(item.body, { x, y }, false);
        this.matter.body.setVelocity(item.body, { x: 0, y: 0 });
      },
      /** Đưa người chơi tới sát điểm nắm thứ `point` của món đồ `uid`, quay mặt vào đó. */
      moveToGrabPoint: (slot: number, uid: number, point: number) => {
        const p = world.players.find((pl) => pl.slotIndex === slot);
        const item = world.items.find((i) => i.uid === uid);
        if (!p || !item) return;
        const gp = item.grabWorld(point);
        const c = item.position;
        const len = Math.hypot(gp.x - c.x, gp.y - c.y) || 1;
        const out = { x: (gp.x - c.x) / len, y: (gp.y - c.y) / len };
        this.matter.body.setPosition(p.body, { x: gp.x + out.x * 22, y: gp.y + out.y * 22 }, false);
        this.matter.body.setVelocity(p.body, { x: 0, y: 0 });
      },
    };
  }
}
