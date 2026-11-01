# Chơi thử và cân bằng (P39)

Mục tiêu: mỗi nhóm **1, 2, 4, 6, 8 người** chơi ít nhất **2 buổi**, ghi lại số liệu và cảm nhận, rồi
chỉnh `items.json` / `levels.json` (khối lượng, ma sát, độ bền, thời gian, mốc sao). Phase xong khi
mọi nhóm đều muốn "chơi thêm một màn nữa".

## Chuẩn bị

- Mở game (link GitHub Pages, hoặc `npm run dev` trong mạng nội bộ). Mọi máy cùng phiên bản (góc dưới
  menu: `v0.1.0 · data xxxxxxxx` phải giống nhau).
- Nhóm 1–4 người: 1 máy, bàn phím + tay cầm (hoặc mỗi người 1 điện thoại chơi online).
- Nhóm 6–8 người: chơi online, mỗi người 1 máy / điện thoại, host là máy mạnh nhất.
- **Trước buổi:** Cài đặt → "Xóa tiến trình" trên các máy (để mở khóa giống người mới) — *không* xóa
  nhật ký chơi thử. Hoặc dùng trình duyệt ẩn danh.
- Người quan sát: không giúp, không giải thích (trừ khi kẹt quá 2 phút); ghi lại theo bảng dưới.

## Màn cho từng nhóm

| Nhóm | Màn nên chơi (theo thứ tự) |
|---|---|
| 1 người | 1 (có hướng dẫn), 2, 3 |
| 2 người | 1, 4, 5, 6 |
| 4 người | 4, 7, 8, 9, 10 |
| 6 người | 7, 11, 12, 13, 14 |
| 8 người | 1 (co giãn 8 người), 12, 15, 16 |

## Trong lúc chơi — ghi lại

- Chỗ người chơi **không hiểu phải làm gì** (HUD, đồ bắt buộc, khiêng nhiều người, ping, phanh tay).
- Chỗ **bực mình**: kẹt cửa quá lâu, camera, vấp ngã, mèo, paparazzi, bị đẩy, nút khó bấm (điện thoại).
- Chỗ **cười / la hét** (đó là điều game muốn tạo ra).
- Màn nào **quá dễ / quá khó**, hết giờ còn bao nhiêu.
- Lỗi: đồ kẹt tường, rơi khỏi bản đồ, lệch đồng bộ online, âm thanh lạ.

## Sau mỗi màn — hỏi nhanh (1–5 điểm)

1. Vui không?
2. Khó không? (1 = quá dễ, 3 = vừa, 5 = quá khó)
3. Có hiểu phải làm gì không?
4. Có muốn chơi thêm một màn nữa không? (có / không)
5. Điều gì làm bạn khó chịu nhất?

## Sau buổi — gom số liệu

Mỗi máy: **Cài đặt → 📋 Xuất nhật ký chơi thử** → file `beast-movers-playtest-YYYY-MM-DD.json`
(thư mục Tải về). File có `summary` (theo màn × số người: số lần, tỉ lệ qua màn, sao, thời gian, số
đồ vỡ trung bình) và `runs` (từng lần chơi). Nhật ký chỉ nằm trên máy, không gửi đi đâu.

## Câu hỏi cân bằng còn mở (ghi từ các phase trước)

| Vấn đề | Ở đâu | Hướng chỉnh |
|---|---|---|
| 1 người vẫn bắt được mèo (bot phản xạ hoàn hảo) — "bắt buộc phối hợp" chưa chắc | P11, màn 3, 8 | `items.json › cat.ai.speed`, `dodgeChance` |
| Vấp khi chạy: trung bình ~33 giây chạy mới vấp 1 lần | P04 | `config.json › runTripChance` |
| Bể cá 25 kg vẫn ném được | P07 | `items.json › fish_tank.throwable` |
| Sofa qua cửa 100 px phải xoay — người thật có làm được không | P31, màn 4 | rộng cửa trong `tools/make-maps.py` |
| Mốc sao tính bằng công thức, chưa ai chơi thật | P31–P35 | `tools/make-levels.py` (hàm `stars`, `auto_scaling`) |
| Paparazzi chưa làm chậm bot rõ rệt | P34, màn 16 | `paparazziAI` (tốc độ, khoảng né) |
| Co giãn 1 ↔ 8 người có "vừa sức" không | P35 | `scaling` trong `levels.json` |
| Vòng ping: bấm nhanh / giữ 0,22 giây có tự nhiên không | P30 | `WHEEL_HOLD_MS` trong `src/systems/ping.ts` |
| Cầu thang 55% tốc độ có quá chậm không | P33, màn 10 | `STAIRS_SPEED` trong `src/sim/World.ts` |
| Nút cảm ứng: kích thước, vị trí, độ trễ | điện thoại | `LAYOUT` trong `src/ui/TouchControls.ts` |

## Bảng ghi buổi chơi

| Ngày | Nhóm | Màn | Qua? | Sao | Còn giờ | Vui (1–5) | Khó (1–5) | Chơi tiếp? | Ghi chú |
|---|---|---|---|---|---|---|---|---|---|
| | | | | | | | | | |
