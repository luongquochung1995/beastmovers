import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';
import { ErrorScene } from './scenes/ErrorScene';
import { GameScene } from './scenes/GameScene';
import { HudScene } from './scenes/HudScene';
import { InputTestScene } from './scenes/InputTestScene';
import { MenuScene } from './scenes/MenuScene';
import { OnlineScene } from './scenes/OnlineScene';
import { ResultScene } from './scenes/ResultScene';
import { SandboxScene } from './scenes/SandboxScene';
import { GAME_HEIGHT, GAME_WIDTH, Theme } from './ui/theme';

const game = new Phaser.Game({
  type: Phaser.AUTO,
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
  ],
});

// Cho kiểm thử tự động truy cập game khi chạy dev hoặc có `?debug` trên URL.
if (import.meta.env.DEV || new URLSearchParams(window.location.search).has('debug')) {
  (window as unknown as { __game: Phaser.Game }).__game = game;
}
