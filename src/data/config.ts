import type { GameConfig } from './types';

export type { GameConfig } from './types';

/** Khóa trong registry của Phaser. */
export const CONFIG_KEY = 'config';

/** `?debug=1` trên URL bật chế độ debug mà không cần sửa file data. */
export function applyUrlOverrides(config: GameConfig, search = window.location.search): GameConfig {
  const params = new URLSearchParams(search);
  const debug = params.get('debug');
  if (debug === null) return config;
  return { ...config, debug: debug !== '0' && debug !== 'false' };
}
