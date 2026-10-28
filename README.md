# Dọn Nhà Kiểu Gì Đây?!

Game co-op chuyển nhà 1–8 người, chơi ngay trên trình duyệt, không cần cài đặt.
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

Mở địa chỉ Vite in ra (mặc định http://localhost:5173). Thêm `?debug=1` vào URL để bật chế độ debug.

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
| Esc           | Kết thúc màn / quay lại                                    |
| F1            | Bật/tắt debug (FPS, số bước logic mỗi giây, khung va chạm) |
| T             | Khi bật debug: cho mọi người vấp ngã                       |

## Cấu trúc

```
public/data/   Dữ liệu game (JSON)
src/scenes/    Boot, Menu, Game, Result
src/systems/   Logic game (vòng lặp cố định 60 Hz, …)
src/entities/  Nhân vật, đồ vật, mèo, chủ nhà, xe tải
src/net/       Chơi online
src/data/      Kiểu dữ liệu và đọc JSON
src/ui/        HUD, menu, overlay
tests/         Unit test
```

## Deploy GitHub Pages

Workflow `.github/workflows/deploy.yml` tự build và deploy mỗi khi push lên nhánh `main`.
Trên GitHub, vào **Settings → Pages → Build and deployment** và chọn **Source: GitHub Actions**.
