# Changelog

## 1.0.0-rc.1 — 2026-11-01 (bản ứng viên phát hành)

Bản đầy đủ tính năng đầu tiên. Còn chờ chơi thử với người thật (P39) và kiểm thử Firefox / Safari /
tay cầm thật (P40) trước khi gọi là 1.0.0.

### Chơi

- 1–8 người: chơi chung máy (bàn phím + tay cầm, tối đa 4) hoặc online P2P qua WebRTC bằng mã phòng /
  link mời (tối đa 8, mỗi máy có thể 1–4 người). Không tài khoản, không server riêng.
- Khiêng nhiều người: đồ cần 1–8 người, luật `free` / `drag` / `strict`; buông giữa chừng là rơi.
- Vật lý "ngu": tủ lạnh trượt, gương nứt rồi vỡ, chậu cây đổ đất, bể cá tràn nước, máy chạy bộ hất
  người, bi và tạ lăn, piano kêu khi va, mèo chạy trốn / cào / nhảy khỏi thùng.
- Xe tải: sức chứa, đồ xếp ẩu rơi ra, phanh tay khi đỗ dốc, xe chạy đi lúc hết giờ.
- 5 chủ nhà (Bà Tư, Chú Bảy, Diva Lan Na, Anh Khoa Startup, Chị Hạnh Mèo), mỗi người 55 câu thoại
  tiếng Anh + tiếng Việt, độ hài lòng ảnh hưởng điểm.
- 16 màn từ Solo tới Full nhà (8 người), có hướng dẫn ở màn 1; mưa (sân trơn), dốc, cầu thang,
  chủ nhà đổi ý, paparazzi.
- Co giãn theo số người: đông hơn thì thêm đồ thưởng, bớt giờ, mốc sao cao hơn, xe rộng hơn.
- Điểm, 1–3 sao, danh hiệu cuối màn; mở màn theo số người và số sao.
- Ping nhanh: bấm nhanh để gọi người khiêng đồ đang thiếu, giữ để mở vòng ping (5 lệnh).

### Giao diện

- Menu, cài đặt (âm lượng, nhạc nền, rung màn hình, toàn màn hình, đổi phím, ngôn ngữ, xóa tiến trình),
  hướng dẫn, tạm dừng; đi hết mọi menu bằng tay cầm.
- Tiếng Anh và tiếng Việt, đổi ngay trong game; font Nunito đủ dấu.
- Điện thoại / máy tính bảng: cần ảo + nút cảm ứng, nhắc xoay ngang.
- Âm thanh và nhạc nền tổng hợp bằng Web Audio, hiệu ứng hạt.
- Lưu tiến trình trong trình duyệt (sao, kỷ lục, tên, màu, cài đặt).

### Kỹ thuật

- TypeScript + Vite + Phaser 3 + Matter.js; host chạy vật lý, máy khách nội suy + dự đoán chuyển
  động; snapshot nhị phân ~4 KB/s mỗi máy khách với 8 người.
- Nội dung (đồ, màn, chủ nhà, thoại, chữ giao diện) nằm trong JSON, được kiểm tra khi tải.
- Nhật ký chơi thử xuất ra JSON (Cài đặt) để cân bằng.
