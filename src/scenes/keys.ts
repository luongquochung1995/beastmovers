export const SceneKeys = {
  Boot: 'Boot',
  Error: 'Error',
  Menu: 'Menu',
  InputTest: 'InputTest',
  Sandbox: 'Sandbox',
  Game: 'Game',
  Result: 'Result',
} as const;

/** Khóa trong `scene.registry`. */
export const RegistryKeys = {
  Input: 'input',
  /** `GameData` đã kiểm tra. */
  Data: 'data',
  /** Hash của data (8 ký tự hex). */
  DataHash: 'dataHash',
} as const;
