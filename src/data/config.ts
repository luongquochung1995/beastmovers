/** Cấu hình chung đọc từ `public/data/config.json`. Validate đầy đủ sẽ làm ở P05. */
export interface NetConfig {
  transport: string;
  fallbackTransport: string;
  appId: string;
  iceServers: { urls: string }[];
  inputHz: number;
  snapshotHz: number;
  interpolationDelayMs: number;
  reconnectGraceSec: number;
}

export interface GameConfig {
  maxPlayers: number;
  maxLocalPlayers: number;
  logicHz: number;
  runTripChance: number;
  throwForce: number;
  grabRange: number;
  net: NetConfig;
  debug: boolean;
}

export const CONFIG_KEY = 'config';

/** `?debug=1` trên URL bật chế độ debug mà không cần sửa file data. */
export function applyUrlOverrides(config: GameConfig, search = window.location.search): GameConfig {
  const params = new URLSearchParams(search);
  const debug = params.get('debug');
  if (debug === null) return config;
  return { ...config, debug: debug !== '0' && debug !== 'false' };
}
