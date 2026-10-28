/** FNV-1a 32 bit, ra 8 ký tự hex. Đủ để so hai máy có dùng cùng data hay không (P20). */
export function fnv1a(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/** Hash của nhiều file, không phụ thuộc thứ tự đọc. */
export function hashFiles(files: Record<string, string>): string {
  return fnv1a(
    Object.keys(files)
      .sort()
      .map((name) => `${name}\n${files[name]}`)
      .join('\n\u0000\n'),
  );
}
