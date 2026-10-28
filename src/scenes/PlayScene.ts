import Phaser from 'phaser';
import { CONFIG_KEY } from '../data/config';
import type { GameConfig } from '../data/types';
import type { GameData } from '../data/validate';
import { World } from '../sim/World';
import { FixedLoop } from '../systems/FixedLoop';
import type { Vec } from '../systems/geometry';
import type { InputManager, PlayerSlot } from '../systems/input/InputManager';
import { Random } from '../systems/Random';
import { DebugOverlay } from '../ui/DebugOverlay';
import { GAME_WIDTH, Theme } from '../ui/theme';
import { RegistryKeys } from './keys';

/**
 * Phần chung của mọi scene có mô phỏng (màn chơi, sandbox): vòng lặp cố định,
 * input, người chơi vào giữa chừng, debug overlay. Lớp con chỉ dựng màn và HUD.
 */
export abstract class PlayScene extends Phaser.Scene {
  protected world!: World;
  protected loop!: FixedLoop;
  protected debug!: DebugOverlay;
  protected inputs!: InputManager;
  protected config!: GameConfig;
  protected gameData!: GameData;
  protected logicTicks = 0;
  private lastNow = 0;
  private eventLog!: Phaser.GameObjects.Text;
  private readonly eventLines: string[] = [];

  /** Dựng tường, sàn, đồ vật. */
  protected abstract buildLevel(): void;
  /** Vị trí xuất hiện của người chơi ô `slotIndex`. */
  protected abstract spawnPointFor(slotIndex: number): Vec;
  /** Nhấn Esc. */
  protected abstract onExit(): void;

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

    this.debug = new DebugOverlay(this, this.config.debug);
    this.world.debugDraw = this.config.debug;
    // Nhật ký sự kiện gần nhất (chỉ hiện khi bật debug).
    this.eventLines.length = 0;
    this.eventLog = this.add
      .text(GAME_WIDTH - 8, 100, '', {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#c8f7c5',
        backgroundColor: '#000000aa',
        padding: { x: 6, y: 4 },
        align: 'right',
      })
      .setOrigin(1, 0)
      .setDepth(10_000)
      .setVisible(this.config.debug);
    this.world.bus.onAny((e) => {
      const what = 'itemId' in e ? ` ${e.itemId}` : 'kind' in e ? ` ${e.kind}` : '';
      const extra = 'durability' in e ? ` ♥${e.durability}` : 'speed' in e ? ` v${e.speed}` : '';
      this.eventLines.push(`${this.world.bus.tick} ${e.type}${what}${extra}`);
      if (this.eventLines.length > 10) this.eventLines.shift();
      this.eventLog.setText(this.eventLines);
    });
    this.input.keyboard?.on('keydown-F1', (e: KeyboardEvent) => {
      e.preventDefault();
      this.debug.setVisible(!this.debug.visible);
      this.world.debugDraw = this.debug.visible;
      this.eventLog.setVisible(this.debug.visible);
    });
    // Phím T (chỉ khi bật debug): cho mọi người vấp ngã để thử hoạt ảnh.
    this.input.keyboard?.on('keydown-T', () => {
      if (this.debug.visible) this.world.players.forEach((p) => p.knockDown());
    });
    this.input.keyboard?.once('keydown-ESC', () => this.onExit());
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.world.destroy());
  }

  override update(): void {
    // Dùng đồng hồ thật thay cho `delta` của Phaser: delta đó đã bị làm mượt và giới hạn,
    // nên khi FPS thấp logic sẽ chạy chậm hơn 60 Hz.
    const now = performance.now();
    const frameMs = now - this.lastNow;
    const steps = this.loop.advance(frameMs, (dt) => this.fixedUpdate(dt));
    this.lastNow = now;
    this.world.render(this.loop.alpha, frameMs);
    this.debug.update(steps);
  }

  /** Mọi logic game chạy ở đây, đúng `logicHz` lần mỗi giây. */
  protected fixedUpdate(dt: number): void {
    for (const slot of this.inputs.poll(true)) this.spawnPlayer(slot);
    this.world.step(dt, this.inputs.slots);
    this.logicTicks++;
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
