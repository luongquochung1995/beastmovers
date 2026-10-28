import Phaser from 'phaser';
import { getLocale, t } from '../data/i18n';
import type { GameData } from '../data/validate';
import { PLAYER_STYLES, playerTextureKey } from '../entities/playerStyles';
import type { NetContext } from '../net/netContext';
import type { LevelResult } from '../sim/LevelRuntime';
import { moodFace } from '../systems/dialogue';
import { loadSave, recordLevelResult } from '../data/settings';
import { MenuInput } from '../ui/menuInput';
import { GAME_HEIGHT, GAME_WIDTH, Theme } from '../ui/theme';
import { RegistryKeys, SceneKeys } from './keys';

const STAR_ON = '#ffd54f';
const STAR_OFF = '#4a4560';
const GOOD = '#7CFC8A';
const BAD = '#ff8a80';

/** Màn kết quả: qua màn/thua, sao, bảng điểm, danh hiệu từng người. */
export class ResultScene extends Phaser.Scene {
  constructor() {
    super(SceneKeys.Result);
  }

  create(r: LevelResult): void {
    this.cameras.main.setBackgroundColor(Theme.bg);
    const data = this.registry.get(RegistryKeys.Data) as GameData;
    const level = data.levels.find((l) => l.id === r.levelId);
    const cx = GAME_WIDTH / 2;
    const text = (
      x: number,
      y: number,
      s: string,
      style: Phaser.Types.GameObjects.Text.TextStyle,
    ) => this.add.text(x, y, s, { fontFamily: Theme.font, color: Theme.text, ...style });

    text(cx, 36, level?.name[getLocale()] ?? r.levelId, {
      fontSize: '18px',
      color: Theme.muted,
    }).setOrigin(0.5);
    text(cx, 74, t('result.title'), {
      fontSize: '44px',
      fontStyle: 'bold',
      color: Theme.accent,
    }).setOrigin(0.5);
    text(cx, 132, t(r.passed ? 'result.passed' : 'result.failed'), {
      fontSize: '30px',
      fontStyle: 'bold',
      color: r.passed ? GOOD : BAD,
    }).setOrigin(0.5);
    text(cx, 168, t('result.required', { loaded: r.requiredLoaded, total: r.requiredTotal }), {
      fontSize: '16px',
      color: Theme.muted,
    }).setOrigin(0.5);

    // Sao hiện lần lượt.
    for (let i = 0; i < 3; i++) {
      const on = i < r.score.stars;
      const star = text(cx + (i - 1) * 64, 222, '★', {
        fontSize: '56px',
        color: on ? STAR_ON : STAR_OFF,
      })
        .setOrigin(0.5)
        .setScale(on ? 0 : 1);
      if (on)
        this.tweens.add({
          targets: star,
          scale: 1,
          delay: 300 + i * 280,
          duration: 260,
          ease: 'Back.Out',
        });
    }

    // Lưu tiến trình (online: mỗi máy tự lưu theo kết quả host gửi về). Chỉ tính khi qua màn.
    const prev = loadSave().levels[r.levelId];
    if (r.passed) {
      recordLevelResult(r.levelId, {
        stars: r.score.stars,
        score: r.score.total,
        players: r.players.length,
      });
    }
    const record = r.passed && (!prev || r.score.total > prev.bestScore);
    if (record || prev) {
      text(
        cx + 120,
        222,
        record
          ? t('result.newBest')
          : t('result.best', { score: prev!.bestScore.toLocaleString(getLocale()) }),
        { fontSize: '18px', fontStyle: 'bold', color: record ? STAR_ON : Theme.muted },
      ).setOrigin(0, 0.5);
    }

    // Bảng điểm.
    const left = 150;
    const right = 600;
    let y = 290;
    const row = (label: string, value: number, sign: '+' | '−', color: string) => {
      text(left, y, label, { fontSize: '19px' });
      text(right, y, `${sign} ${value.toLocaleString(getLocale())}`, {
        fontSize: '19px',
        color,
        fontStyle: 'bold',
      }).setOrigin(1, 0);
      y += 38;
    };
    const s = r.score;
    row(t('result.loadedValue'), s.loadedValue, '+', GOOD);
    row(t('result.repairCosts'), s.repairCosts, '−', s.repairCosts ? BAD : Theme.muted);
    row(
      `${t('result.satisfactionBonus')} ${moodFace(r.satisfaction)} ${r.satisfaction}%`,
      s.satisfactionBonus,
      '+',
      GOOD,
    );
    row(t('result.requiredBonus'), s.requiredBonus, '+', s.requiredBonus ? GOOD : Theme.muted);
    this.add.rectangle(left, y + 4, right - left, 2, 0x4a4560).setOrigin(0);
    y += 18;
    text(left, y, t('result.total'), { fontSize: '26px', fontStyle: 'bold' });
    text(right, y, s.total.toLocaleString(getLocale()), {
      fontSize: '30px',
      fontStyle: 'bold',
      color: Theme.accent,
    }).setOrigin(1, 0);
    if (level) {
      text(
        right,
        y + 40,
        t('result.starGoals', { a: level.stars[0]!, b: level.stars[1]!, c: level.stars[2]! }),
        {
          fontSize: '13px',
          color: Theme.muted,
        },
      ).setOrigin(1, 0);
    }

    // Danh hiệu từng người.
    const px = 690;
    let py = 284;
    const gap = Math.min(96, 390 / Math.max(1, r.players.length));
    // Online: màu và tên theo lobby.
    const net = this.registry.get(RegistryKeys.Net) as NetContext | null | undefined;
    for (const p of r.players) {
      const seat = net?.roster.seats[p.slot];
      const styleIndex = seat?.color ?? p.slot;
      const style = PLAYER_STYLES[styleIndex]!;
      const name = seat?.name ?? `P${p.slot + 1}`;
      this.add.image(px + 24, py + 24, playerTextureKey(styleIndex)).setScale(gap < 70 ? 0.8 : 1);
      text(px + 60, py, `${name} · ${t(`title.${p.title}`)}`, {
        fontSize: '19px',
        fontStyle: 'bold',
        color: Phaser.Display.Color.IntegerToColor(style.color).lighten(10).rgba,
      });
      text(px + 60, py + 26, t(`titleDesc.${p.title}`, { n: titleCount(p) }), {
        fontSize: '14px',
        color: Theme.muted,
      });
      text(
        px + 60,
        py + 46,
        t('result.stats', {
          carried: Math.round(p.stats.carriedMs / 1000),
          throws: p.stats.throws,
          broken: p.stats.broken,
        }),
        { fontSize: '13px', color: Theme.muted },
      );
      py += gap;
    }

    text(cx, GAME_HEIGHT - 28, t(net ? 'result.footerOnline' : 'result.footer'), {
      fontSize: '18px',
      color: Theme.muted,
    }).setOrigin(0.5);
    if (net) {
      // Online: rời phòng về menu (chơi tiếp cùng phòng: làm sau).
      const leave = () => {
        net.session.close();
        this.registry.set(RegistryKeys.Net, null);
        const url = new URL(window.location.href);
        url.searchParams.delete('room');
        history.replaceState(null, '', url.toString());
        this.scene.start(SceneKeys.Menu);
      };
      this.input.keyboard?.once('keydown-ENTER', leave);
      this.input.keyboard?.once('keydown-ESC', leave);
      new MenuInput(this, (a) => (a === 'confirm' || a === 'back') && leave(), undefined, false);
      return;
    }
    const replay = () => this.scene.start(SceneKeys.Game);
    const menu = () => this.scene.start(SceneKeys.LevelSelect);
    this.input.keyboard?.once('keydown-ENTER', replay);
    this.input.keyboard?.once('keydown-ESC', menu);
    // Tay cầm: A chơi lại, B về menu.
    new MenuInput(
      this,
      (a) => (a === 'confirm' ? replay() : a === 'back' && menu()),
      undefined,
      false,
    );
  }
}

/** Con số đi kèm mô tả danh hiệu. */
function titleCount(p: LevelResult['players'][number]): number {
  const s = p.stats;
  switch (p.title) {
    case 'clumsy':
      return s.broken;
    case 'catWhisperer':
      return s.catsCaught;
    case 'firstToLetGo':
      return s.letGo;
    case 'thrower':
      return s.throws;
    case 'backbone':
    case 'spectator':
      return Math.round(s.carriedMs / 1000);
    default:
      return s.loaded;
  }
}
