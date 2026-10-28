import Phaser from 'phaser';
// Font có đủ dấu tiếng Việt, đóng gói cùng game (không tải từ máy chủ khác).
import '@fontsource/nunito/400.css';
import '@fontsource/nunito/700.css';
import { BootScene } from './scenes/BootScene';
import { ErrorScene } from './scenes/ErrorScene';
import { GameScene } from './scenes/GameScene';
import { HelpScene } from './scenes/HelpScene';
import { HudScene } from './scenes/HudScene';
import { InputTestScene } from './scenes/InputTestScene';
import { KeysScene } from './scenes/KeysScene';
import { LevelSelectScene } from './scenes/LevelSelectScene';
import { MenuScene } from './scenes/MenuScene';
import { OnlineScene } from './scenes/OnlineScene';
import { PauseScene } from './scenes/PauseScene';
import { ResultScene } from './scenes/ResultScene';
import { SandboxScene } from './scenes/SandboxScene';
import { SettingsScene } from './scenes/SettingsScene';
import { GAME_HEIGHT, GAME_WIDTH, Theme } from './ui/theme';

/**
 * `?renderer=none`: chạy game nhưng không vẽ (kiểm thử nhiều máy online trên một máy yếu):
 * dùng Canvas để vẫn tạo được texture, rồi thay vòng lặp bằng bản không vẽ của Phaser.
 */
const NO_RENDER = new URLSearchParams(window.location.search).get('renderer') === 'none';

const game = new Phaser.Game({
  type: NO_RENDER ? Phaser.CANVAS : Phaser.AUTO,
  parent: 'game',
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  backgroundColor: Theme.bg,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  physics: {
    default: 'matter',
    matter: {
      gravity: { x: 0, y: 0 }, // nhìn từ trên xuống, không có trọng lực
      autoUpdate: false, // GameScene tự gọi world.step() trong vòng lặp cố định
      debug: true, // tạo sẵn lớp vẽ debug, bật/tắt bằng F1
    },
  },
  scene: [
    BootScene,
    ErrorScene,
    MenuScene,
    InputTestScene,
    SandboxScene,
    GameScene,
    ResultScene,
    HudScene,
    OnlineScene,
    SettingsScene,
    KeysScene,
    HelpScene,
    PauseScene,
    LevelSelectScene,
  ],
});

if (NO_RENDER) {
  game.events.once(Phaser.Core.Events.READY, () => {
    game.loop.callback = (time: number, delta: number) => game.headlessStep(time, delta);
  });
}

// Cho kiểm thử tự động truy cập game khi chạy dev hoặc có `?debug` trên URL.
if (import.meta.env.DEV || new URLSearchParams(window.location.search).has('debug')) {
  (window as unknown as { __game: Phaser.Game }).__game = game;
}
