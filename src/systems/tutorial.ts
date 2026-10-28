/**
 * Hướng dẫn trong màn (màn 1): danh sách bước ghi trong `levels.json`, mỗi bước là một dòng
 * chữ (khóa i18n) hiện tới khi người chơi làm được việc `until`.
 */
export const TUTORIAL_TRIGGERS = [
  /** Một người chơi trên máy đi được một đoạn. */
  'move',
  'itemGrabbed',
  'itemThrown',
  'itemLoaded',
  'ping',
  'bigLiftStart',
] as const;
export type TutorialTrigger = (typeof TUTORIAL_TRIGGERS)[number];

export interface TutorialStep {
  text: string;
  until: TutorialTrigger;
}

export class Tutorial {
  index = 0;

  constructor(readonly steps: readonly TutorialStep[]) {}

  get current(): TutorialStep | null {
    return this.steps[this.index] ?? null;
  }

  get done(): boolean {
    return this.index >= this.steps.length;
  }

  /** Báo một việc vừa xảy ra; trả về true nếu sang bước mới. */
  trigger(what: string): boolean {
    if (this.current?.until !== what) return false;
    this.index++;
    return true;
  }
}
