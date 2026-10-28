import Phaser from 'phaser';
import { t } from '../data/i18n';
import { PLAYER_STYLES, playerTextureKey } from '../entities/playerStyles';
import type { Vec } from '../systems/geometry';
import { PING_ICONS, PING_LIFETIME_MS, type PingKind } from '../systems/ping';
import { Theme } from './theme';

/** Một ping đang hiện trên bản đồ. */
export interface PingMarker {
  slot: number;
  /** Màu/ký hiệu của người ping (PLAYER_STYLES). */
  style: number;
  kind: PingKind;
  /** Số người còn thiếu (ping `need`). */
  n: number;
  /** Vị trí hiện tại (đi theo món đồ nếu ping lên đồ). */
  pos: Vec;
  bornMs: number;
  /** uid món đồ được ping (vị trí đi theo món đồ). */
  item?: number;
}

interface View {
  marker: PingMarker;
  box: Phaser.GameObjects.Container;
  ring: Phaser.GameObjects.Graphics;
}

export function pingLabel(kind: PingKind, n: number): string {
  return t(`ping.${kind}`, { n });
}

/**
 * Vẽ ping trên bản đồ: vòng màu của người ping + ký hiệu của họ (phân biệt được cả với người
 * mù màu) + biểu tượng và chữ. Mỗi người chỉ có một ping cùng lúc (ping mới thay ping cũ).
 */
export class PingLayer {
  readonly markers: PingMarker[] = [];
  private views: View[] = [];

  constructor(private readonly scene: Phaser.Scene) {}

  add(marker: PingMarker): void {
    const old = this.views.findIndex((v) => v.marker.slot === marker.slot);
    if (old >= 0) this.remove(old);
    const ring = this.scene.add.graphics().setDepth(8_000);
    const who = this.scene.add.image(-26, 0, playerTextureKey(marker.style)).setScale(0.6);
    const label = this.scene.add
      .text(-10, 0, `${PING_ICONS[marker.kind]} ${pingLabel(marker.kind, marker.n)}`, {
        fontFamily: Theme.font,
        fontSize: '16px',
        fontStyle: 'bold',
        color: '#ffffff',
        backgroundColor: '#000000b0',
        padding: { x: 6, y: 3 },
      })
      .setOrigin(0, 0.5);
    const box = this.scene.add.container(0, 0, [who, label]).setDepth(8_001);
    this.markers.push(marker);
    this.views.push({ marker, box, ring });
    this.render();
  }

  private remove(i: number): void {
    const v = this.views[i]!;
    v.box.destroy();
    v.ring.destroy();
    this.views.splice(i, 1);
    this.markers.splice(this.markers.indexOf(v.marker), 1);
  }

  /** `follow(marker)`: vị trí mới của món đồ được ping (null: giữ nguyên). */
  render(follow?: (m: PingMarker) => Vec | null): void {
    const now = this.scene.time.now;
    for (let i = this.views.length - 1; i >= 0; i--) {
      const v = this.views[i]!;
      const age = now - v.marker.bornMs;
      if (age > PING_LIFETIME_MS) {
        this.remove(i);
        continue;
      }
      const p = follow?.(v.marker);
      if (p) v.marker.pos = p;
      const { x, y } = v.marker.pos;
      const fade = Math.min(1, (PING_LIFETIME_MS - age) / 600);
      // Vòng sóng lan ra trong 0,8 giây đầu (2 lần), sau đó giữ vòng tĩnh.
      const pulse = age < 1600 ? (age % 800) / 800 : 1;
      const color = PLAYER_STYLES[v.marker.style]?.color ?? 0xffffff;
      v.ring
        .clear()
        .lineStyle(4, color, fade * (age < 1600 ? 1 - pulse * 0.6 : 0.7))
        .strokeCircle(x, y, 14 + pulse * 22)
        .fillStyle(color, 0.25 * fade)
        .fillCircle(x, y, 12);
      v.box.setPosition(x + 6, y - 46).setAlpha(fade);
    }
  }

  destroy(): void {
    for (let i = this.views.length - 1; i >= 0; i--) this.remove(i);
  }
}
