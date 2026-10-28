import Phaser from 'phaser';
import { CONFIG_KEY, type GameConfig } from '../data/config';
import { t } from '../data/i18n';
import { Player } from '../entities/Player';
import { PLAYER_STYLES } from '../entities/playerStyles';
import { FixedLoop } from '../systems/FixedLoop';
import type { InputManager, PlayerSlot } from '../systems/input/InputManager';
import { DEFAULT_MOTOR, type MotorParams } from '../systems/PlayerMotor';
import { Random } from '../systems/Random';
import { DebugOverlay } from '../ui/DebugOverlay';
import { GAME_HEIGHT, GAME_WIDTH, Theme } from '../ui/theme';
import { RegistryKeys, SceneKeys } from './keys';

export interface ResultData {
  logicTicks: number;
  seconds: number;
}

const MARGIN = 40;
const SPAWNS: [number, number][] = [
  [300, 300],
  [380, 300],
  [300, 400],
  [380, 400],
];

/**
 * Màn chơi. Hiện là bản đồ trống có vài thùng để thử nhân vật (P04).
 * Đồ đạc, xe tải, chủ nhà sẽ thêm từ mốc B và C.
 */
export class GameScene extends Phaser.Scene {
  private loop!: FixedLoop;
  private debug!: DebugOverlay;
  private inputs!: InputManager;
  private random!: Random;
  private motorParams!: MotorParams;
  private players: Player[] = [];
  private readonly playerByBody = new Map<MatterJS.BodyType, Player>();
  private logicTicks = 0;
  private lastNow = 0;

  constructor() {
    super(SceneKeys.Game);
  }

  create(): void {
    const config = this.registry.get(CONFIG_KEY) as GameConfig;
    this.inputs = this.registry.get(RegistryKeys.Input) as InputManager;
    this.loop = new FixedLoop(config.logicHz);
    this.random = new Random();
    this.motorParams = { ...DEFAULT_MOTOR, tripChancePerSec: config.runTripChance };
    this.players = [];
    this.playerByBody.clear();
    this.logicTicks = 0;
    this.lastNow = performance.now();

    this.cameras.main.setBackgroundColor(Theme.bg);
    this.add
      .rectangle(MARGIN, MARGIN, GAME_WIDTH - MARGIN * 2, GAME_HEIGHT - MARGIN * 2, Theme.floor)
      .setOrigin(0)
      .setDepth(-1000);
    this.matter.world.setBounds(MARGIN, MARGIN, GAME_WIDTH - MARGIN * 2, GAME_HEIGHT - MARGIN * 2);
    this.spawnTestBoxes();

    // Chưa ai tham gia thì người dùng WASD tự vào làm người chơi 1.
    if (this.inputs.slots.every((s) => s === null)) this.inputs.join('kb0');
    for (const slot of this.inputs.slots) if (slot) this.spawnPlayer(slot);

    this.matter.world.on('collisionstart', this.onCollision, this);

    this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT - 20, t('game.hint'), {
        fontFamily: Theme.font,
        fontSize: '15px',
        color: Theme.muted,
      })
      .setOrigin(0.5)
      .setDepth(9_000);

    this.debug = new DebugOverlay(this, config.debug);
    this.input.keyboard?.on('keydown-F1', (e: KeyboardEvent) => {
      e.preventDefault();
      this.debug.setVisible(!this.debug.visible);
    });
    // Phím T (chỉ khi bật debug): cho mọi người vấp ngã để thử hoạt ảnh.
    this.input.keyboard?.on('keydown-T', () => {
      if (this.debug.visible) this.players.forEach((p) => p.knockDown());
    });
    this.input.keyboard?.once('keydown-ESC', () => this.finish());
    // Phaser có thể đã hủy world trước khi sự kiện này chạy (world bị hủy thì listener cũng mất theo).
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.matter.world?.off('collisionstart', this.onCollision, this);
    });
  }

  override update(): void {
    // Dùng đồng hồ thật thay cho `delta` của Phaser: delta đó đã bị làm mượt và giới hạn,
    // nên khi FPS thấp logic sẽ chạy chậm hơn 60 Hz.
    const now = performance.now();
    const frameMs = now - this.lastNow;
    const steps = this.loop.advance(frameMs, (dt) => this.fixedUpdate(dt));
    this.lastNow = now;
    for (const p of this.players) p.render(this.loop.alpha, frameMs);
    this.debug.update(steps);
  }

  /** Mọi logic game chạy ở đây, đúng `logicHz` lần mỗi giây. */
  private fixedUpdate(dt: number): void {
    for (const slot of this.inputs.poll(true)) this.spawnPlayer(slot);
    for (const p of this.players) {
      const slot = this.inputs.slots[p.slotIndex];
      if (slot) p.fixedUpdate(slot.prev, slot.cur, dt);
    }
    this.matter.world.step(dt);
    this.logicTicks++;
  }

  private spawnPlayer(slot: PlayerSlot): void {
    const [x, y] = SPAWNS[slot.index % SPAWNS.length]!;
    const style = PLAYER_STYLES[slot.index]!;
    const player = new Player(
      this,
      slot.index,
      slot.index,
      `P${slot.index + 1}`,
      x,
      y,
      this.motorParams,
      () => this.random.next(),
    );
    this.players.push(player);
    this.playerByBody.set(player.body, player);
    const text = t('game.playerJoined', {
      color: { key: style.nameKey },
      n: slot.index + 1,
      source: slot.source.label,
    });
    console.info(`[game] ${text}`);
  }

  /** Người đang lao đâm vào người khác thì người kia ngã. */
  private onCollision(event: Phaser.Physics.Matter.Events.CollisionStartEvent): void {
    for (const pair of event.pairs) {
      const a = this.playerByBody.get(pair.bodyA);
      const b = this.playerByBody.get(pair.bodyB);
      if (!a || !b) continue;
      if (a.motor.mode === 'dashing' && b.motor.mode !== 'dashing') b.knockDown();
      else if (b.motor.mode === 'dashing' && a.motor.mode !== 'dashing') a.knockDown();
    }
  }

  private spawnTestBoxes(): void {
    const boxes: [number, number, number, number][] = [
      [700, 250, 90, 60],
      [900, 450, 60, 60],
      [600, 520, 120, 50],
      [1050, 220, 70, 90],
    ];
    for (const [x, y, w, h] of boxes) {
      const rect = this.add.rectangle(x, y, w, h, 0x8d6e63).setStrokeStyle(3, 0x5d4037);
      this.matter.add.gameObject(rect, { frictionAir: 0.12, density: 0.006 });
    }
  }

  private finish(): void {
    const data: ResultData = {
      logicTicks: this.logicTicks,
      seconds: this.logicTicks / (1000 / this.loop.stepMs),
    };
    this.scene.start(SceneKeys.Result, data);
  }

  /** Dùng cho kiểm thử tự động. */
  debugSnapshot() {
    return this.players.map((p) => ({
      slot: p.slotIndex,
      x: Math.round(p.position.x),
      y: Math.round(p.position.y),
      mode: p.motor.mode,
      running: p.motor.running,
    }));
  }
}
