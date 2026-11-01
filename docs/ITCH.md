# Trang itch.io

## Đưa game lên itch.io

1. Lấy gói web: trên GitHub → **Actions** → lần chạy mới nhất của "Deploy GitHub Pages" → phần
   **Artifacts** → tải `beast-movers-web` (file zip chứa `index.html` ở gốc).
   Hoặc trên máy: `npm run build`, rồi nén **nội dung** thư mục `dist/` (không nén cả thư mục).
2. itch.io → **Upload new project**:
   - Kind of project: **HTML**
   - Upload file zip, tick **This file will be played in the browser**
   - Viewport: **1280 × 720**, tick **Mobile friendly** (orientation: Landscape),
     tick **Fullscreen button**
   - Classification: Games · Genre: Party / Simulation · Tags: co-op, multiplayer, physics,
     local-multiplayer, party, funny, vietnamese
3. Dán phần mô tả dưới đây, thêm ảnh trong `docs/images/` (ảnh bìa: `public/og.png`).

Lưu ý: link mời trong game trỏ theo địa chỉ đang mở, nên bản itch.io và bản GitHub Pages là hai nơi
chơi riêng (mời bạn cùng mở đúng một link). Hai nơi phải cùng phiên bản thì mới vào chung phòng được.

## Mô tả (English)

**Beast Movers** — co-op moving chaos for 1–8 players, right in your browser.

One truck. A fridge that slides like it's on ice. A mirror that cracks if you look at it wrong.
A cat that does not want to move. And a landlord who comments on everything.

- **Big furniture needs big teams** — a grand piano needs all 8 of you to lift. Let go halfway and… crash.
- **Play together however you like** — up to 4 on one computer (keyboard + gamepads), or up to 8 online
  with an invite link. No account, no download.
- **16 houses** from a tiny studio to a celebrity villa (with paparazzi), rain, hills, stairs, six cats.
- **Ping without voice chat** — tap to call for help, hold for the ping wheel.
- Works on phones and tablets (landscape). English and Vietnamese.

Controls: WASD / arrow keys / gamepad; grab, throw, dash, ping. Esc / Start to pause.

## Mô tả (Tiếng Việt)

**Beast Movers** — game co-op chuyển nhà 1–8 người, chơi ngay trên trình duyệt.

Một xe tải. Tủ lạnh trượt như trên băng. Cái gương nhìn sai là nứt. Con mèo không chịu đi.
Và bà chủ nhà cái gì cũng phải nói một câu.

- **Đồ to phải đông người** — đàn grand piano cần đủ 8 người nhấc. Một người buông là… rầm.
- **Chơi kiểu nào cũng được** — tối đa 4 người chung một máy (bàn phím + tay cầm), hoặc 8 người online
  bằng link mời. Không tài khoản, không cài đặt.
- **16 căn nhà** từ phòng trọ tới biệt thự người nổi tiếng (có paparazzi), mưa, dốc, cầu thang, 6 con mèo.
- **Ping thay voice chat** — bấm nhanh để gọi người, giữ để mở vòng ping.
- Chơi được trên điện thoại / máy tính bảng (cầm ngang). Tiếng Việt và tiếng Anh.
