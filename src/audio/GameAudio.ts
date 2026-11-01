import type Phaser from 'phaser';
import type { World } from '../sim/World';
import type { GameEvent } from '../systems/EventBus';
import type { Vec } from '../systems/geometry';
import { WHEEL_PINGS } from '../systems/ping';
import { music } from './music';
import { Sfx } from './sfx';

/** Cùng một tiếng không phát lại trong khoảng này (ms), tránh ồn khi nhiều va chạm dồn. */
const MIN_GAP_MS: Partial<Record<string, number>> = {
  bump: 90,
  scrape: 250,
  thud: 60,
  crack: 60,
  grab: 40,
  release: 40,
};

/**
 * Âm thanh của màn chơi: nghe sự kiện trên `world.bus` và phát tiếng tương ứng, lệch trái/phải
 * theo vị trí trên màn hình. Online, máy khách phát lại sự kiện của host đúng lúc hình vẽ tới
 * (P24) nên mọi máy nghe giống nhau.
 */
export class GameAudio {
  private readonly last = new Map<string, number>();

  constructor(
    private readonly world: World,
    private readonly camera: Phaser.Cameras.Scene2D.Camera,
  ) {
    world.bus.onAny((e) => this.onEvent(e));
  }

  private posOfItem(uid: number): Vec | null {
    return this.world.items.find((i) => i.uid === uid)?.position ?? null;
  }

  private posOfSlot(slot: number): Vec | null {
    return this.world.players.find((p) => p.slotIndex === slot)?.position ?? null;
  }

  /** Lệch trái/phải theo vị trí so với giữa khung hình. */
  private pan(at: Vec | null): number {
    if (!at) return 0;
    const cam = this.camera;
    const half = cam.width / cam.zoom / 2 || 1;
    return Math.max(-0.8, Math.min(0.8, (at.x - cam.midPoint.x) / half));
  }

  private ok(key: string): boolean {
    const gap = MIN_GAP_MS[key];
    if (!gap) return true;
    const now = performance.now();
    if (now - (this.last.get(key) ?? -Infinity) < gap) return false;
    this.last.set(key, now);
    return true;
  }

  private sizeOf(uid: number): number {
    const m = this.world.items.find((i) => i.uid === uid)?.def.mass ?? 10;
    return Math.min(1, Math.log10(1 + m) / Math.log10(500));
  }

  private fragile(uid: number): boolean {
    return this.world.items.find((i) => i.uid === uid)?.def.fragile === true;
  }

  private onEvent(e: GameEvent): void {
    const at =
      'item' in e
        ? this.posOfItem(e.item)
        : 'slot' in e && e.slot !== null
          ? this.posOfSlot(e.slot)
          : null;
    const v = { pan: this.pan(at) };
    const play = (key: string, fn: () => void) => {
      if (this.ok(key)) fn();
    };
    switch (e.type) {
      case 'itemGrabbed':
        return play('grab', () => Sfx.grab(v));
      case 'itemReleased':
        return play('release', () => Sfx.release(v));
      case 'itemThrown':
        return play('throw', () => Sfx.throw(v));
      case 'itemDropped':
        return play('thud', () => Sfx.thud({ ...v, size: this.sizeOf(e.item) }));
      case 'bigLiftStart':
        return play('heave', () => Sfx.heave(v));
      case 'bigLiftFail':
        return play('fail', () => Sfx.fail(v));
      case 'itemScrape':
        return play('scrape', () => Sfx.scrape(v));
      case 'itemDamaged':
        return play('crack', () => Sfx.crack(v));
      case 'itemBroken':
        return play('broken', () => (this.fragile(e.item) ? Sfx.shatter(v) : Sfx.crunch(v)));
      case 'wallHit':
        return play('bump', () => Sfx.bump({ ...v, gain: Math.min(1, 0.4 + e.speed / 10) }));
      case 'behavior':
        return this.behavior(e.name, v);
      case 'catEscaped':
      case 'catCaught':
        return play('meow', () => Sfx.meow(v));
      case 'catScratch':
        return play('hiss', () => Sfx.hiss(v));
      case 'itemLoaded':
        return play('loaded', () => Sfx.loaded(v));
      case 'itemUnloaded':
        return play('unloaded', () => Sfx.unloaded(v));
      case 'truckFull':
        return play('buzzer', () => Sfx.buzzer(v));
      case 'handbrake':
        return play('ratchet', () => Sfx.ratchet(v));
      case 'requiredChanged':
        return play('huh', () => Sfx.huh(v));
      case 'levelStart':
        music.play('level');
        return play('horn', () => Sfx.horn({ gain: 0.7 }));
      case 'timeLow':
        music.play('hurry');
        return play('alarm', () => Sfx.alarm({}));
      case 'levelEnd':
        music.stop();
        Sfx.horn({});
        return Sfx.engine({ at: 0.4 });
      case 'zoneSpawned': {
        const zv = { pan: this.pan({ x: e.x, y: e.y }) };
        if (e.kind === 'water') return play('splash', () => Sfx.splash(zv));
        if (e.kind === 'soil') return play('soil', () => Sfx.soil(zv));
        return;
      }
      case 'playerTripped':
        return play('oof', () => Sfx.oof(v));
      case 'ping':
        return play('ping', () =>
          Sfx.ping({ ...v, pitch: 3 + Math.max(0, WHEEL_PINGS.indexOf(e.kind as never)) * 2 }),
        );
      default:
        return;
    }
  }

  private behavior(name: string, v: { pan: number }): void {
    switch (name) {
      case 'keysSoundOnHit':
        return Sfx.piano(v);
      case 'spawnOnImpact':
        return Sfx.rolling(v);
      case 'treadmillBelt':
        return Sfx.motor(v);
      case 'dropOnRelease':
        return Sfx.thud({ ...v, size: 1 });
      case 'paparazziAI':
        return Sfx.camera(v);
      default:
        return;
    }
  }
}
