# Beast Movers

Game co-op chuyển nhà 1–8 người, chơi ngay trên trình duyệt, không cần cài đặt.
Hỗ trợ **tiếng Anh** và **tiếng Việt**.

_Co-op moving chaos for 1–8 players, right in your browser. Available in English and Vietnamese._

Kế hoạch và tiến độ từng phase: [docs/PLAN.md](docs/PLAN.md).

## Yêu cầu

- Node.js 22+

## Chạy khi phát triển

```bash
npm install
```

```bash
npm run dev
```

Mở địa chỉ Vite in ra (mặc định http://localhost:5173). Tham số URL hữu ích:

- `?debug=1`: bật chế độ debug
- `?lang=en` hoặc `?lang=vi`: chọn ngôn ngữ

## Build bản phát hành

```bash
npm run build
```

Kết quả nằm trong `dist/`: toàn file tĩnh, đưa lên GitHub Pages, Netlify hay itch.io đều chạy (dùng đường dẫn tương đối).

```bash
npm run preview
```

## Lệnh khác

| Lệnh                | Việc                      |
| ------------------- | ------------------------- |
| `npm test`          | Chạy unit test (Vitest)   |
| `npm run lint`      | Kiểm tra code (ESLint)    |
| `npm run typecheck` | Kiểm tra kiểu TypeScript  |
| `npm run format`    | Định dạng code (Prettier) |

## Điều khiển hiện tại

Tối đa 4 người trên một máy: 2 người chung bàn phím + tay cầm (Gamepad API). Ai chưa vào thì nhấn **Nắm** để tham gia, kể cả giữa màn.

| Hành động      | Người WASD | Người mũi tên         | Tay cầm          |
| -------------- | ---------- | --------------------- | ---------------- |
| Di chuyển      | W A S D    | Mũi tên               | Cần trái / D-pad |
| Nắm / tham gia | Space      | Enter / Numpad 0      | A                |
| Ném            | E          | Shift phải / Numpad 1 | B                |
| Lao            | Q          | Ctrl phải / Numpad 2  | X                |
| Ping           | F          | Numpad 3              | Y                |

Giữ một hướng khoảng 0,6 giây thì nhân vật chuyển sang chạy (chạy có thể vấp ngã). Lao vào người khác làm họ ngã.

| Phím chung    | Việc                                                       |
| ------------- | ---------------------------------------------------------- |
| Enter / Space | Bắt đầu (ở menu)                                           |
| I             | Màn thử điều khiển (ở menu)                                |
| L             | Đổi ngôn ngữ English ↔ Tiếng Việt (ở menu)                 |
| Esc           | Kết thúc màn / quay lại                                    |
| F1            | Bật/tắt debug (FPS, số bước logic mỗi giây, khung va chạm) |
| T             | Khi bật debug: cho mọi người vấp ngã                       |

## Thêm hoặc sửa ngôn ngữ

- Mọi chữ hiển thị nằm trong `public/data/i18n/<mã>.json`, dạng khóa phẳng (`"menu.start": "…"`), tham số viết `{ten}`.
- Thêm ngôn ngữ mới: tạo file JSON cùng bộ khóa với `en.json` và thêm mã vào `LOCALES` trong `src/data/i18n.ts`.
- `npm test` kiểm tra mọi file ngôn ngữ có đủ khóa, đúng tham số, và mọi khóa dùng trong code đều tồn tại.
- Ngôn ngữ được chọn theo thứ tự: `?lang=` → lựa chọn đã lưu → ngôn ngữ trình duyệt → tiếng Anh.

## Cấu trúc

```
public/data/        Dữ liệu game (JSON)
public/data/i18n/   Chữ hiển thị theo ngôn ngữ (en.json, vi.json)
src/scenes/         Boot, Menu, InputTest, Game, Result
src/systems/        Logic game (vòng lặp cố định 60 Hz, input, di chuyển…)
src/entities/       Nhân vật, đồ vật, mèo, chủ nhà, xe tải
src/net/            Chơi online
src/data/           Kiểu dữ liệu, đọc JSON, i18n, cài đặt
src/ui/             HUD, menu, overlay
tests/              Unit test
```

## Deploy GitHub Pages

Workflow `.github/workflows/deploy.yml` tự build và deploy mỗi khi push lên nhánh `main`.
Trên GitHub, vào **Settings → Pages → Build and deployment** và chọn **Source: GitHub Actions**.
