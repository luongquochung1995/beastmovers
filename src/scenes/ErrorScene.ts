import Phaser from 'phaser';
import { t } from '../data/i18n';
import type { Issue } from '../data/schema';
import { GAME_WIDTH, Theme } from '../ui/theme';
import { SceneKeys } from './keys';

const MAX_SHOWN = 16;

/** Đổi một lỗi data thành một dòng dễ đọc. Thiếu bản dịch (vd. chính file i18n hỏng) thì hiện mã lỗi thô. */
export function formatIssue(issue: Issue): string {
  const key = `dataError.${issue.code}`;
  const translated = t(key, issue.params);
  const message =
    translated === key ? `${issue.code} ${JSON.stringify(issue.params ?? {})}` : translated;
  const where = issue.path ? `${issue.file} › ${issue.path}` : issue.file;
  return `${where}\n    ${message}`;
}

/** Màn hình khi data hỏng: liệt kê lỗi theo file và trường. */
export class ErrorScene extends Phaser.Scene {
  constructor() {
    super(SceneKeys.Error);
  }

  create(data: { issues: Issue[] }): void {
    const issues = data.issues;
    console.error(`[data] ${issues.length} error(s):\n` + issues.map(formatIssue).join('\n'));
    this.cameras.main.setBackgroundColor('#2a1518');

    const title = t('dataError.title');
    this.add
      .text(40, 30, title === 'dataError.title' ? 'Game data has errors' : title, {
        fontFamily: Theme.font,
        fontSize: '34px',
        fontStyle: 'bold',
        color: '#ff8a80',
      })
      .setName('error-title');
    const hint = t('dataError.hint');
    this.add.text(40, 80, hint === 'dataError.hint' ? '' : hint, {
      fontFamily: Theme.font,
      fontSize: '16px',
      color: Theme.muted,
      wordWrap: { width: GAME_WIDTH - 80 },
    });

    const lines = issues.slice(0, MAX_SHOWN).map(formatIssue);
    if (issues.length > MAX_SHOWN)
      lines.push(t('dataError.more', { count: issues.length - MAX_SHOWN }));
    this.add
      .text(40, 120, lines.join('\n'), {
        fontFamily: Theme.font,
        fontSize: '16px',
        color: Theme.text,
        lineSpacing: 4,
        wordWrap: { width: GAME_WIDTH - 80 },
      })
      .setName('error-list');
  }
}
