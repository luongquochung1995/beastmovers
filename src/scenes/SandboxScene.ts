import Phaser from 'phaser';
import { getLocale, t } from '../data/i18n';
import type { ItemDef } from '../data/types';
import type { Vec } from '../systems/geometry';
import { GAME_HEIGHT, GAME_WIDTH, Theme } from '../ui/theme';
import { SceneKeys } from './keys';
import { PlayScene } from './PlayScene';
import { SCENARIOS } from './sandboxScenarios';

const PANEL_W = 270;
const ROOM = { x: PANEL_W + 30, y: 30, w: GAME_WIDTH - PANEL_W - 60, h: GAME_HEIGHT - 90 };

/** Sandbox: thả thử từng món đồ trong data, thử va chạm và (sau này) từng hành vi. */
export class SandboxScene extends PlayScene {
  private selected = 0;
  private paletteTexts: Phaser.GameObjects.Text[] = [];
  private info!: Phaser.GameObjects.Text;

  constructor() {
    super(SceneKeys.Sandbox);
  }

  private get defs(): ItemDef[] {
    return this.gameData.items;
  }

  protected buildLevel(): void {
    this.world.addRoom(ROOM);
    // Một bức tường ngăn có cửa để thử khiêng qua cửa hẹp.
    const wallX = ROOM.x + ROOM.w * 0.62;
    this.world.addWall({ x: wallX, y: ROOM.y, w: 16, h: ROOM.h * 0.38 });
    this.world.addWall({ x: wallX, y: ROOM.y + ROOM.h * 0.62, w: 16, h: ROOM.h * 0.38 });

    // Chỗ nấp của mèo: giữa các bức tường (góc phòng là ngõ cụt, nấp ở đó dễ bị dồn bắt).
    this.world.hideSpots = [
      { x: ROOM.x + 25, y: ROOM.y + ROOM.h / 2 },
      { x: (ROOM.x + wallX) / 2, y: ROOM.y + 25 },
      { x: (ROOM.x + wallX) / 2, y: ROOM.y + ROOM.h - 25 },
      { x: ROOM.x + ROOM.w - 25, y: ROOM.y + ROOM.h / 2 },
    ];
    this.add.rectangle(0, 0, PANEL_W, GAME_HEIGHT, 0x24212f).setOrigin(0).setDepth(8_000);
    this.add
      .text(16, 12, t('sandbox.title'), {
        fontFamily: Theme.font,
        fontSize: '22px',
        fontStyle: 'bold',
        color: Theme.accent,
      })
      .setDepth(8_001);

    const locale = getLocale();
    this.paletteTexts = this.defs.map((def, i) =>
      this.add
        .text(
          16,
          48 + i * 22,
          `${def.icon ?? '▪'} ${def.name[locale]}  👐${def.requiredGrabbers}`,
          {
            fontFamily: Theme.font,
            fontSize: '15px',
            color: Theme.text,
          },
        )
        .setDepth(8_001)
        .setInteractive({ useHandCursor: true })
        .on('pointerup', () => this.select(i)),
    );
    this.info = this.add
      .text(16, GAME_HEIGHT - 150, '', {
        fontFamily: Theme.font,
        fontSize: '13px',
        color: Theme.muted,
        wordWrap: { width: PANEL_W - 24 },
      })
      .setDepth(8_001);
    this.add
      .text(ROOM.x + ROOM.w / 2, GAME_HEIGHT - 36, t('sandbox.help'), {
        fontFamily: Theme.font,
        fontSize: '14px',
        color: Theme.muted,
      })
      .setOrigin(0.5)
      .setDepth(9_000);

    this.input.mouse?.disableContextMenu();
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => this.onPointer(pointer));
    this.input.on('wheel', (_p: unknown, _o: unknown, _dx: number, dy: number) =>
      this.select(this.selected + Math.sign(dy)),
    );
    this.input.keyboard?.on('keydown-OPEN_BRACKET', () => this.select(this.selected - 1));
    this.input.keyboard?.on('keydown-CLOSED_BRACKET', () => this.select(this.selected + 1));
    this.input.keyboard?.on('keydown-C', () => {
      this.world.clearItems();
      this.world.clearZones();
    });
    this.add
      .text(ROOM.x + ROOM.w / 2, GAME_HEIGHT - 10, t('sandbox.scenarios'), {
        fontFamily: Theme.font,
        fontSize: '12px',
        color: Theme.muted,
      })
      .setOrigin(0.5, 1)
      .setDepth(9_000);
    for (const sc of SCENARIOS) {
      this.input.keyboard?.on(`keydown-${sc.key}`, () => this.runScenario(sc.setup));
    }
    this.select(0);
  }

  private runScenario(setup: (typeof SCENARIOS)[number]['setup']): void {
    this.world.clearItems();
    this.world.clearZones();
    setup(this.world);
  }

  private select(i: number): void {
    const n = this.defs.length;
    this.selected = ((i % n) + n) % n;
    this.paletteTexts.forEach((txt, k) =>
      txt
        .setColor(k === this.selected ? Theme.accent : Theme.text)
        .setFontStyle(k === this.selected ? 'bold' : ''),
    );
    const def = this.defs[this.selected]!;
    const behaviors = (def.behaviors ?? []).map((b) => (typeof b === 'string' ? b : b.type));
    this.info.setText(
      [
        `${def.name[getLocale()]} (${def.id})`,
        t('sandbox.stats', {
          mass: def.mass,
          people: def.requiredGrabbers,
          rule: { key: `liftRule.${def.liftRule}` },
          durability: def.durability,
        }),
        behaviors.length ? `⚙ ${behaviors.join(', ')}` : '',
      ].join('\n'),
    );
  }

  private onPointer(pointer: Phaser.Input.Pointer): void {
    const p = { x: pointer.worldX, y: pointer.worldY };
    if (p.x < PANEL_W) return;
    if (pointer.rightButtonDown()) {
      const item = this.world.itemAt(p);
      if (item) this.world.removeItem(item);
      return;
    }
    const inside = p.x > ROOM.x && p.x < ROOM.x + ROOM.w && p.y > ROOM.y && p.y < ROOM.y + ROOM.h;
    if (inside) this.world.spawnItem(this.defs[this.selected]!.id, p.x, p.y);
  }

  protected spawnPointFor(slotIndex: number): Vec {
    return {
      x: ROOM.x + 60 + (slotIndex % 4) * 50,
      y: ROOM.y + ROOM.h - 60 - Math.floor(slotIndex / 4) * 50,
    };
  }

  protected onExit(): void {
    this.scene.start(SceneKeys.Menu);
  }
}
