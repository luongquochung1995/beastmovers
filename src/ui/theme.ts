/** Màu và font dùng chung. Nunito (đủ dấu tiếng Việt) được nạp xong ở BootScene trước khi vẽ chữ. */
export const Theme = {
  bg: 0x1d1b26,
  floor: 0x2b2838,
  accent: '#ffb347',
  text: '#f4efe6',
  muted: '#a49fb5',
  font: 'Nunito, "Segoe UI", Roboto, "Noto Sans", Arial, sans-serif',
} as const;

/** Tên game, giữ nguyên ở mọi ngôn ngữ. */
export const GAME_TITLE = 'Beast Movers';

export const GAME_WIDTH = 1280;
export const GAME_HEIGHT = 720;
