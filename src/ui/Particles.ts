import Phaser from 'phaser';
import type { World } from '../sim/World';
import type { GameEvent } from '../systems/EventBus';

const DOT = 'pfx-dot';
const SHARD = 'pfx-shard';

interface Burst {
  tint: number | number[];
  count: number;
  speed: [number, number];
  life: number;
  scale: [number, number];
  /** Bay lên (lấp lánh) thay vì tỏa đều. */
  rise?: boolean;
  shard?: boolean;
}

const EFFECTS = {
  dust: { tint: [0xb8b0a0, 0x9e968a], count: 10, speed: [20, 70], life: 550, scale: [0.9, 0.2] },
  smallDust: { tint: [0xb8b0a0], count: 4, speed: [10, 40], life: 400, scale: [0.6, 0.1] },
  water: { tint: [0x4fc3f7, 0xb3e5fc], count: 18, speed: [60, 160], life: 600, scale: [0.7, 0.1] },
  soil: { tint: [0x6d4c41, 0x8d6e63], count: 16, speed: [40, 130], life: 650, scale: [0.8, 0.2] },
  glass: {
    tint: [0xe1f5fe, 0xffffff],
    count: 16,
    speed: [80, 220],
    life: 700,
    scale: [0.9, 0.3],
    shard: true,
  },
  sparkle: {
    tint: [0xffd54f, 0xfff59d],
    count: 9,
    speed: [30, 90],
    life: 700,
    scale: [0.7, 0],
    rise: true,
  },
} satisfies Record<string, Burst>;

/**
 * Hiệu ứng hạt (chỉ để nhìn): bụi khi va/rơi/kéo lê, mảnh vỡ theo màu món đồ, nước, đất, kính,
 * lấp lánh khi đồ lên xe. Nghe sự kiện trên `world.bus` nên online mọi máy đều thấy.
 */
export class GameParticles {
  private readonly emitters = new Map<string, Phaser.GameObjects.Particles.ParticleEmitter>();

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly world: World,
  ) {
    ensureTextures(scene);
    world.bus.onAny((e) => this.onEvent(e));
  }

  private emitter(key: string, b: Burst): Phaser.GameObjects.Particles.ParticleEmitter {
    let em = this.emitters.get(key);
    if (!em) {
      em = this.scene.add
        .particles(0, 0, b.shard ? SHARD : DOT, {
          speed: { min: b.speed[0], max: b.speed[1] },
          angle: b.rise ? { min: 240, max: 300 } : { min: 0, max: 360 },
          rotate: b.shard ? { min: 0, max: 360 } : 0,
          lifespan: b.life,
          scale: { start: b.scale[0], end: b.scale[1] },
          alpha: { start: 1, end: 0 },
          tint: b.tint,
          emitting: false,
        })
        .setDepth(5_000);
      this.emitters.set(key, em);
    }
    return em;
  }

  private puff(key: keyof typeof EFFECTS, x: number, y: number, count?: number): void {
    const b = EFFECTS[key];
    this.emitter(key, b).explode(count ?? b.count, x, y);
  }

  private itemAt(uid: number) {
    return this.world.items.find((i) => i.uid === uid);
  }

  private onEvent(e: GameEvent): void {
    const item = 'item' in e ? this.itemAt(e.item) : undefined;
    const p = item?.position;
    switch (e.type) {
      case 'itemDropped':
        if (p) this.puff('dust', p.x, p.y, 8 + Math.round(Math.min(1, item.def.mass / 300) * 14));
        return;
      case 'wallHit':
        if (p) this.puff('smallDust', p.x, p.y, 6);
        return;
      case 'itemScrape':
        if (p) this.puff('smallDust', p.x, p.y);
        return;
      case 'itemBroken': {
        if (!p) return;
        const color = item.def.color ? parseInt(item.def.color.slice(1), 16) : 0xbcaaa4;
        // Mảnh vỡ theo màu món đồ (mỗi màu một emitter).
        const key = `debris-${color}`;
        this.emitter(key, { ...EFFECTS.glass, tint: [color, 0xffffff], shard: true }).explode(
          18,
          p.x,
          p.y,
        );
        if (item.def.fragile) this.puff('glass', p.x, p.y);
        return;
      }
      case 'zoneSpawned':
        if (e.kind === 'water') this.puff('water', e.x, e.y);
        else if (e.kind === 'soil') this.puff('soil', e.x, e.y);
        else this.puff('glass', e.x, e.y, 10);
        return;
      case 'playerTripped': {
        const pl = this.world.players.find((x) => x.slotIndex === e.slot);
        if (pl) this.puff('smallDust', pl.position.x, pl.position.y, 6);
        return;
      }
      case 'itemLoaded':
        if (p) this.puff('sparkle', p.x, p.y);
        return;
      default:
        return;
    }
  }
}

function ensureTextures(scene: Phaser.Scene): void {
  if (!scene.textures.exists(DOT)) {
    const g = scene.make.graphics({}, false);
    g.fillStyle(0xffffff, 1).fillCircle(6, 6, 6);
    g.generateTexture(DOT, 12, 12);
    g.destroy();
  }
  if (!scene.textures.exists(SHARD)) {
    const g = scene.make.graphics({}, false);
    g.fillStyle(0xffffff, 1).fillTriangle(0, 10, 5, 0, 10, 8);
    g.generateTexture(SHARD, 10, 10);
    g.destroy();
  }
}
