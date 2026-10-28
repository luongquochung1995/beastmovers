import Phaser from 'phaser';
import { CONFIG_KEY } from '../data/config';
import type { GameConfig } from '../data/types';
import type { GameData } from '../data/validate';
import { World } from '../sim/World';
import { FixedLoop } from '../systems/FixedLoop';
import type { Vec } from '../systems/geometry';
import { ClientInputSender, HostInputHub, LocalSlotSource } from '../net/inputLink';
import { LoopbackNetwork } from '../net/LoopbackNetwork';
import type { NetContext } from '../net/netContext';
import { OnlineGame } from '../net/OnlineGame';
import { parseNetOptions } from '../net/netOptions';
import type { Snapshot } from '../net/snapshot';
import { snapshotWorld } from '../net/worldSnapshot';
import type { LevelRuntime } from '../sim/LevelRuntime';
import type { SimSlot, SlotSource } from '../sim/SimSlot';
import { Btn, isDown } from '../systems/input/InputFrame';
import type { InputManager } from '../systems/input/InputManager';
import { Random } from '../systems/Random';
import { Theme } from '../ui/theme';
import type { HudScene } from './HudScene';
import { RegistryKeys, SceneKeys } from './keys';

/** Máy khách online: không có ô nào chạy mô phỏng trên máy này. */
const EMPTY_SOURCE: SlotSource = { slots: [], poll: () => [], destroy: () => {} };

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
  /** Nguồn ô người chơi cho mô phỏng (chơi chung máy, hoặc đi qua mạng). */
  protected slotSource!: SlotSource;
  private sender: ClientInputSender | null = null;
  /** Đang chơi online (null: chơi chung máy). */
  protected online: OnlineGame | null = null;
  /** Mô tả chế độ mạng cho bảng debug (null = chơi chung máy trực tiếp). */
  netInfo: string | null = null;
  /** Bảng debug đang bật (F1). */
  debugVisible = false;
  /** Số bước logic đã chạy trong khung hình vừa rồi (cho bảng debug). */
  lastSteps = 0;
  private lastNow = 0;
  /**
   * Chỉ cho người mới vào sau khi mọi nút Nắm/Start của thiết bị chưa tham gia đã nhả:
   * Enter vừa bấm ở menu cũng là nút Nắm của bố cục phím mũi tên.
   */
  private joinArmed = false;

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
    this.joinArmed = false;
    this.lastNow = performance.now();
    this.cameras.main.setBackgroundColor(Theme.bg);

    // Online: phiên chuyển từ lobby sang qua registry.
    const net = this.registry.get(RegistryKeys.Net) as NetContext | null | undefined;
    this.online = net
      ? new OnlineGame(
          net,
          this.config,
          this.inputs,
          this.gameData.items.map((i) => i.id),
        )
      : null;

    this.world = new World(this, this.gameData, this.config, new Random());
    this.buildLevel();

    // Chưa ai tham gia thì người dùng WASD tự vào làm người chơi 1.
    if (this.inputs.slots.every((s) => s === null)) this.inputs.join('kb0');
    this.setupSlotSource();

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
    // Tạm dừng xong: không tính khoảng thời gian đã dừng vào vòng lặp logic.
    this.events.on(Phaser.Scenes.Events.RESUME, () => (this.lastNow = performance.now()));
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scene.stop(SceneKeys.Hud);
      this.world.destroy();
    });
  }

  /**
   * Chơi chung máy: dùng thẳng InputManager. `?net=loopback`: input của máy này đi vòng
   * qua mạng giả (độ trễ, mất gói) tới bộ gom input của host, y như máy khách online.
   */
  private setupSlotSource(): void {
    const opts = parseNetOptions(window.location.search);
    this.sender = null;
    this.netInfo = null;
    const online = this.online;
    if (online) {
      this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => online.destroy());
      if (online.isHost) {
        online.attachHost(this.world);
        this.slotSource = online.slotSource!;
        // Nhân vật của mọi người có ngay từ đầu (máy khách vào chậm vẫn có chỗ).
        for (const slot of online.allSlots()) this.spawnPlayer(slot);
      } else {
        this.slotSource = EMPTY_SOURCE;
      }
      return;
    }
    if (opts.mode === 'loopback') {
      const net = new LoopbackNetwork({
        latencyMs: opts.lagMs,
        jitterMs: opts.jitterMs,
        loss: opts.loss,
      });
      const hub = new HostInputHub(net.join('host'), this.config.maxPlayers);
      const link = net.join('local');
      this.sender = new ClientInputSender(link, 'host', this.inputs, this.config.net.inputHz);
      this.slotSource = hub;
      this.netInfo = `loopback ${opts.lagMs}ms ±${opts.jitterMs} loss ${opts.loss}`;
      this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
        link.close();
        hub.destroy();
      });
      return;
    }
    this.slotSource = new LocalSlotSource(this.inputs);
    for (const slot of this.slotSource.slots) if (slot) this.spawnPlayer(slot.index);
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
    // Máy khách online: thế giới được đặt theo bộ đệm snapshot + dự đoán, vẽ đúng chỗ đó.
    const client = this.online && !this.online.isHost;
    if (client) this.online!.renderFrame(frameMs);
    this.world.render(client ? 1 : this.loop.alpha, frameMs);
    this.online?.renderExtras();
    if (this.online) this.netInfo = this.online.info();
    this.afterRender(frameMs);
  }

  /** Sau khi vẽ thế giới (camera, hiệu ứng…). */
  protected afterRender(_frameMs: number): void {}

  /** Mọi logic game chạy ở đây, đúng `logicHz` lần mỗi giây. */
  protected fixedUpdate(dt: number): void {
    // Máy khách online không chạy mô phỏng: gửi input, áp snapshot của host.
    if (this.online && !this.online.isHost) {
      this.online.clientStep(dt);
      this.logicTicks++;
      return;
    }
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
    const allowJoin = this.allowJoin() && !this.online && this.joinArmed;
    this.sender?.tick(dt, allowJoin);
    for (const slot of this.slotSource.poll(allowJoin)) this.spawnPlayer(slot.index);
    this.world.step(dt, this.controlSlots());
    this.logicTicks++;
    this.online?.hostStep(dt, () => this.snapshot());
  }

  /** Có cho người mới vào giữa chừng không. */
  protected allowJoin(): boolean {
    return true;
  }

  /** Input đưa vào mô phỏng (lớp con có thể khóa điều khiển, vd. khi hết giờ). */
  protected controlSlots(): readonly (SimSlot | null)[] {
    return this.slotSource.slots;
  }

  private spawnPlayer(index: number): void {
    if (this.world.players.some((p) => p.slotIndex === index)) return;
    const p = this.spawnPointFor(index);
    this.world.addPlayer(index, p.x, p.y, this.online?.lookOf(index));
  }

  /** Màn chơi đang chạy (null ở sandbox). */
  protected levelRuntime(): LevelRuntime | null {
    return null;
  }

  /** Ảnh chụp trạng thái để gửi cho máy khách. */
  snapshot(): Snapshot {
    return snapshotWorld(this.world, this.levelRuntime(), (s) => this.online?.ackOf(s) ?? 0);
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
