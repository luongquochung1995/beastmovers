/** Mã phòng: 6 ký tự, bỏ các ký tự dễ nhầm (0, O, 1, I, L) để đọc cho nhau qua điện thoại. */
export const ROOM_CODE_LENGTH = 6;
export const ROOM_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function generateRoomCode(random: () => number = Math.random): string {
  let code = '';
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
    code += ROOM_ALPHABET[Math.floor(random() * ROOM_ALPHABET.length)];
  }
  return code;
}

/** Chuẩn hóa mã người dùng gõ (bỏ khoảng trắng và gạch, viết hoa); `null` nếu không hợp lệ. */
export function normalizeRoomCode(input: string): string | null {
  const code = input.replace(/[\s-]/g, '').toUpperCase();
  if (code.length !== ROOM_CODE_LENGTH) return null;
  for (const ch of code) if (!ROOM_ALPHABET.includes(ch)) return null;
  return code;
}

/** Mã phòng trong URL (`?room=ABC123`), hoặc `null`. */
export function roomFromUrl(search: string): string | null {
  const raw = new URLSearchParams(search).get('room');
  return raw === null ? null : normalizeRoomCode(raw);
}

/** Link mời: giữ nguyên đường dẫn trang, thay toàn bộ query bằng `?room=` (bỏ debug…). */
export function inviteLink(href: string, code: string): string {
  const url = new URL(href);
  url.search = '';
  url.hash = '';
  url.searchParams.set('room', code);
  return url.toString();
}
