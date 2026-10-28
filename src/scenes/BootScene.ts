import Phaser from 'phaser';
import { applyUrlOverrides, CONFIG_KEY } from '../data/config';
import { detectLocale, LOCALES, setDictionary, setLocale } from '../data/i18n';
import { fetchText, loadGameData } from '../data/loader';
import { loadSettings } from '../data/settings';
import { ensurePlayerTextures } from '../entities/playerStyles';
import { roomFromUrl } from '../net/room';
import { KNOWN_BEHAVIORS } from '../systems/behaviors/names';
import { InputManager } from '../systems/input/InputManager';
import { applySavedSettings } from '../ui/prefs';
import { GAME_HEIGHT, GAME_WIDTH, Theme } from '../ui/theme';
import { RegistryKeys, SceneKeys } from './keys';

/** Tải và kiểm tra toàn bộ data; data hỏng thì sang màn hình lỗi, ngược lại sang Menu. */
export class BootScene extends Phaser.Scene {
  constructor() {
    super(SceneKeys.Boot);
  }

  create(): void {
    this.cameras.main.setBackgroundColor(Theme.bg);
    this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2, '…', {
        fontFamily: Theme.font,
        fontSize: '32px',
        color: Theme.muted,
      })
      .setOrigin(0.5);
    void this.load$();
  }

  private async load$(): Promise<void> {
    const [result] = await Promise.all([
      loadGameData(fetchText(), { knownBehaviors: KNOWN_BEHAVIORS }),
      loadFonts(),
    ]);
    applySavedSettings();
    const locale = detectLocale({
      urlLang: new URLSearchParams(window.location.search).get('lang'),
      saved: loadSettings().language ?? null,
      browserLanguages: navigator.languages,
    });
    setLocale(locale);
    document.documentElement.lang = locale;

    if (!result.ok) {
      // Vẫn cố nạp chữ giao diện (nếu đọc được) để màn hình lỗi hiện đúng ngôn ngữ.
      await this.loadDictionariesBestEffort();
      this.scene.start(SceneKeys.Error, { issues: result.issues });
      return;
    }

    const { data, hash } = result;
    for (const l of LOCALES) setDictionary(l, data.i18n[l]);
    const config = applyUrlOverrides(data.config);
    this.registry.set(CONFIG_KEY, config);
    this.registry.set(RegistryKeys.Data, data);
    this.registry.set(RegistryKeys.DataHash, hash);
    console.info(`[data] ${data.items.length} items, ${data.levels.length} levels · hash ${hash}`);

    // Một InputManager dùng chung cho cả game để người chơi đã tham gia được giữ qua các màn.
    this.registry.set(RegistryKeys.Input, new InputManager(config.maxLocalPlayers));
    ensurePlayerTextures(this);
    // Mở bằng link mời `?room=ABC123` thì vào thẳng phòng đó.
    const room = roomFromUrl(window.location.search);
    if (room) this.scene.start(SceneKeys.Online, { mode: 'join', code: room });
    else this.scene.start(SceneKeys.Menu);
  }

  private async loadDictionariesBestEffort(): Promise<void> {
    const read = fetchText();
    await Promise.all(
      LOCALES.map(async (l) => {
        try {
          setDictionary(l, JSON.parse(await read(`i18n/${l}.json`)) as Record<string, string>);
        } catch {
          // File ngôn ngữ cũng hỏng: màn hình lỗi sẽ hiện mã lỗi thô.
        }
      }),
    );
  }
}

/**
 * Canvas không tự vẽ lại khi font tải xong, nên phải chờ font (cả phần chữ có dấu) trước khi
 * vẽ chữ đầu tiên. Lỗi hoặc quá 3 giây thì dùng font dự phòng của hệ thống.
 */
async function loadFonts(): Promise<void> {
  if (!document.fonts) return;
  const sample = 'Aa Ữữ Đđ ệ';
  const load = Promise.all([
    document.fonts.load('400 20px Nunito', sample),
    document.fonts.load('700 20px Nunito', sample),
  ]).catch(() => []);
  await Promise.race([load, new Promise((r) => setTimeout(r, 3000))]);
}
