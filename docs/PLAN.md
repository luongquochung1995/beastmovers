# Beast Movers — Game co-op chuyển nhà

> 1–8 người, 1 chiếc xe tải, 10 phút. Đồ đạc có vật lý "ngu": tủ lạnh trượt, gương dễ vỡ, mèo chạy lung tung. Chủ nhà là NPC chuyên chê bai. Có những món đồ **phải đủ người mới khiêng nổi**.

---

## 0. Phạm vi (bắt buộc)

| Yêu cầu | Nội dung |
|---|---|
| **Nền tảng** | Game web, chơi trực tiếp trên trình duyệt (Chrome, Edge, Firefox, Safari), **không cần cài đặt** |
| **Kiến trúc** | **Chỉ có data và giao diện**: toàn bộ logic chạy phía client, **không tự viết hay vận hành backend, server game hoặc database** |
| **Data** | Nội dung game (đồ vật, màn chơi, chủ nhà, câu thoại) nằm trong file **JSON tĩnh** |
| **Lưu tiến trình** | `localStorage` của trình duyệt (sao, màn đã mở, cài đặt, tên người chơi) |
| **Số người chơi** | **1–8 người** |
| **Chơi chung máy** | 1–4 người trên một máy (bàn phím và/hoặc tay cầm qua Gamepad API) |
| **Chơi online** | Tối đa **8 người** qua mạng, kết nối **P2P bằng WebRTC**; trình duyệt của chủ phòng (host) chạy vật lý |
| **Kết hợp** | Một máy trong phòng online có thể có 1–4 người chơi chung, miễn tổng ≤ 8 |
| **Triển khai** | Build ra file tĩnh, host trên GitHub Pages / Netlify / Vercel / itch.io |
| **Ngôn ngữ** | **Tiếng Anh và tiếng Việt**. Chọn trong menu (phím L), lưu lại cho lần sau; lần đầu tự nhận theo ngôn ngữ trình duyệt; `?lang=en` / `?lang=vi` trên URL. Mọi chữ trong game lấy từ file JSON, không ghi cứng trong code |
| **Ngoài phạm vi** | Tài khoản, bảng xếp hạng online, matchmaking ghép người lạ, voice chat, chuyển host khi host thoát, mua bán trong game |

### Lưu ý về online khi "không có server"
WebRTC cần một bước **signaling** (trao đổi thông tin kết nối) trước khi hai trình duyệt nói chuyện trực tiếp được. Để giữ đúng phạm vi "không tự chạy server", game dùng **dịch vụ signaling công cộng, miễn phí** qua thư viện phía client:
- **Lựa chọn chính: Trystero.** Signaling qua mạng công cộng (Nostr / BitTorrent tracker / MQTT), không cần server riêng.
- **Dự phòng: PeerJS** với PeerServer Cloud miễn phí.
- **STUN:** server STUN công cộng (vd. `stun:stun.l.google.com:19302`).
- **TURN** (khi mạng chặn P2P, vd. NAT đối xứng, mạng công ty): dùng gói miễn phí của một dịch vụ TURN. Thông tin cấu hình nằm trong `config.json`. Nếu không có TURN thì khoảng 10–15% người chơi có thể không vào được phòng, và game phải báo lỗi rõ ràng.

Sau khi kết nối xong, toàn bộ dữ liệu game đi **trực tiếp giữa các trình duyệt**, không qua server nào.

---

## 1. Tổng quan

- **Thể loại:** party game co-op, vật lý hài, 1–8 người
- **Góc nhìn:** 2D nhìn từ trên xuống (top-down), hơi chéo cho có chiều sâu
- **Cảm giác muốn tạo ra:** hỗn loạn, cười nhiều, đổ lỗi cho nhau. Càng đông càng loạn.
- **Một màn chơi:** khoảng 5–10 phút tùy màn
- **Phong cách hình ảnh:** nhân vật tròn trịa, màu tươi, nét vẽ đơn giản, hoạt ảnh lắc lư. Có 8 màu nhân vật dễ phân biệt.

---

## 2. Vòng chơi chính

1. **Vào phòng (lobby):** tạo phòng hoặc vào phòng bằng mã hay link mời; chọn màu và mũ; host chọn màn **phù hợp với số người hiện có**.
2. **Vào nhà:** xem danh sách đồ (đồ **bắt buộc** và đồ **thưởng thêm**), mỗi món ghi rõ **số người cần để khiêng**.
3. **Nhặt, khiêng, ném:** đồ nhỏ một người cầm; đồ to phải gom đủ người nắm cùng lúc.
4. **Đưa ra xe tải:** qua cửa hẹp, hành lang, cầu thang, sân trơn.
5. **Xếp lên xe:** thùng xe có diện tích giới hạn, xếp ẩu thì đồ trượt rơi ra.
6. **Hết giờ:** xe chạy. Tính điểm theo số đồ lên xe, tình trạng hư hỏng và độ hài lòng của chủ nhà.

---

## 3. Cơ chế khiêng nhiều người (trọng tâm của game)

### Quy tắc
- Mỗi món đồ có `requiredGrabbers` (1–8) và **các điểm nắm** (`grabPoints`) phân bố quanh món đồ.
- **Chế độ khiêng (`liftRule`):**
  - `"free"`: một người cũng kéo được, nhiều người thì nhanh hơn.
  - `"drag"`: thiếu người vẫn kéo lê được nhưng rất chậm, cào sàn (chủ nhà chê, đồ mất độ bền).
  - `"strict"`: **thiếu người thì món đồ không nhúc nhích**. Dùng cho đồ khổng lồ, là lý do một màn bắt buộc phải chơi đông người.
- Khi đủ người, món đồ được nhấc lên. Hướng di chuyển là **trung bình hướng của tất cả người đang nắm**: mỗi người kéo một ngả thì món đồ xoay vòng hoặc đứng im.
- Một người buông tay giữa chừng thì món đồ rơi xuống, va chạm và có thể vỡ.
- Hiển thị trên món đồ: `2/6 👐` (số người đang nắm / số người cần); viền đổi màu khi đủ người.

### Đồ cần nhiều người (ví dụ)
| Đồ | Số người | liftRule | Ghi chú |
|---|---|---|---|
| Sofa | 2 | drag | Dễ kẹt cửa, phải xoay góc |
| Tủ lạnh | 2 | drag | Trượt khó dừng |
| Máy chạy bộ | 3 | strict | Bấm nhầm nút là băng chuyền chạy |
| Piano đứng | 4 | strict | Rất nặng |
| Két sắt | 4 | strict | Rơi là lõm sàn |
| Bàn bi-a | 6 | strict | Dài, phải đi theo hàng |
| Giàn tạ | 6 | strict | Rơi tạ lăn khắp nơi |
| Bể cá khổng lồ | 6 | strict | Nghiêng quá là nước tràn |
| Đàn grand piano | 8 | strict | Boss của mọi món đồ |
| Tượng đá bảo tàng | 8 | strict | Cực dễ vỡ, giá trị cực cao |

---

## 4. Đồ đạc và vật lý "ngu"

| Đồ vật | Hành vi đặc biệt |
|---|---|
| 🧊 Tủ lạnh | Ma sát rất thấp, trượt khó dừng; va mạnh thì cửa bật mở, rơi đồ ăn |
| 🪞 Gương | Độ bền 3 nấc, va mạnh là nứt; vỡ thì để lại mảnh kính trên sàn |
| 🐈 Mèo | AI chạy trốn, chui gầm giường, nhảy ra khỏi thùng, cào người bế (rơi khỏi tay) |
| 🛋️ Sofa | Dài, dễ kẹt cửa, phải xoay đúng góc mới qua được |
| 🎹 Piano | Rất nặng, cần 4 người |
| 🪴 Chậu cây | Đổ thì vãi đất, vùng sàn đó bị trơn |
| 📦 Thùng carton | Dễ xếp nhưng có thể bị rách đáy nếu chứa đồ nặng |
| 🐠 Bể cá | Đổ nước làm sàn trơn, cá văng ra phải nhặt lại |
| 🏃 Máy chạy bộ | Va vào nút thì băng chuyền chạy, hất văng người |
| 🎱 Bàn bi-a | Nghiêng thì bi lăn tứ tung |
| 🗿 Tượng đá | Cần 8 người; chỉ cần một người buông là rơi |
| 🧸 Đồ kỷ niệm | Giá trị thấp nhưng chủ nhà cực kỳ quan tâm |

**Nguyên tắc thiết kế:** mỗi món đồ phải có ít nhất một cách hỏng một cách buồn cười.

---

## 5. Màn chơi và yêu cầu số người

### Hệ thống phân cấp
| Cấp | Số người tối thiểu | Ý nghĩa |
|---|---|---|
| 🟢 **Solo** | 1+ | Chơi một mình hay đông đều được |
| 🔵 **Đôi** | 2+ | Có đồ `strict` cần 2–3 người |
| 🟣 **Đội** | 4+ | Có đồ `strict` cần 4 người |
| 🟠 **Đại đội** | 6+ | Có đồ `strict` cần 6 người |
| 🔴 **Full nhà** | 8 | Có đồ `strict` cần đủ 8 người |

- Màn **bị khóa** nếu số người trong phòng < `minPlayers`. Màn chọn màn hiện rõ: "🔒 Cần ít nhất 6 người (hiện có 4)".
- Để mở màn còn cần đủ **số sao** ở các màn trước (`unlockStars`). Hai điều kiện độc lập: đã mở bằng sao nhưng thiếu người thì vẫn chưa chơi được.
- **Co giãn theo số người** (`scaling`): khi số người vượt mức tối thiểu, màn có thêm đồ thưởng và thời gian giảm nhẹ, để luôn đủ thử thách.

### Danh sách màn (16 màn)
| # | Màn | Cấp | Tối thiểu | Đồ "đinh" | Mechanic mới |
|---|---|---|---|---|---|
| 1 | Căn hộ studio | 🟢 | 1 | Thùng carton | Hướng dẫn: nắm, ném, xếp xe |
| 2 | Phòng trọ sinh viên | 🟢 | 1 | Gương | Đồ dễ vỡ |
| 3 | Nhà có mèo | 🟢 | 1 | Mèo | Mèo AI |
| 4 | Nhà phố 1 trệt | 🔵 | 2 | Sofa, tủ lạnh | Hướng dẫn khiêng 2 người, cửa hẹp |
| 5 | Ngày mưa | 🔵 | 2 | Tủ lạnh | Sân trơn |
| 6 | Nhà ống dài | 🔵 | 2 | Máy chạy bộ (3) | Chuyền tay đồ dọc hành lang |
| 7 | Tiệm đồ cổ | 🟣 | 4 | Piano đứng (4) | Nhiều đồ dễ vỡ, giá trị cao |
| 8 | Nhà 6 con mèo | 🟣 | 4 | Két sắt (4) | Mèo mở cửa, chia việc bắt mèo |
| 9 | Nhà trên dốc | 🟣 | 4 | Piano (4) | Xe tải tự lăn nếu quên kéo phanh tay |
| 10 | Chung cư không thang máy | 🟣 | 4 | Két sắt (4) | Cầu thang hẹp, khiêng xoay góc |
| 11 | Phòng gym | 🟠 | 6 | Giàn tạ (6) | Tạ rơi lăn khắp nơi |
| 12 | Quán bi-a | 🟠 | 6 | Bàn bi-a (6) | Đi theo hàng qua cửa |
| 13 | Thủy cung tại gia | 🟠 | 6 | Bể cá khổng lồ (6) | Phải giữ thăng bằng, nghiêng là tràn nước |
| 14 | Căn hộ minimalist | 🟠 | 6 | Bàn bi-a (6) | Chủ nhà đổi ý liên tục |
| 15 | Bảo tàng tư nhân | 🔴 | 8 | Tượng đá (8) | Cả đội phải phối hợp tuyệt đối |
| 16 | Biệt thự người nổi tiếng | 🔴 | 8 | Grand piano (8) | Paparazzi cản đường (boss level) |

> Màn cấp 🟢 vẫn chơi được với 8 người (đồ thưởng được nhân lên theo `scaling`).

---

## 6. Điều khiển

### Chơi chung một bàn phím (tối đa 2 người mỗi bàn phím)
| Hành động | Người 1 | Người 2 |
|---|---|---|
| Di chuyển | W A S D | Phím mũi tên |
| Nắm / thả | Space | Enter / Numpad 0 |
| Ném | E | Shift phải / Numpad 1 |
| Lao / chụp | Q | Ctrl phải / Numpad 2 |
| Ping | F | Numpad 3 |

### Tay cầm (Gamepad API, tối đa 4 người mỗi máy)
- Cần trái: di chuyển · A: nắm/thả · B: ném · X: lao · Y: ping

### Online
- Mỗi người dùng máy riêng với bố cục của Người 1 (hoặc tay cầm).
- **Ping nhanh** thay cho voice chat: "Lại đây khiêng!", "Nâng lên!", "Buông ra!", "Bắt mèo!", "Mở cửa!". Ping hiện thành icon trên bản đồ và trên đầu nhân vật.
- Món đồ đang thiếu người có thể được ping "Cần thêm 3 người!".

---

## 7. Chủ nhà NPC

- **Thanh "Hài lòng"** (0–100), bắt đầu ở 50.
- **Sự kiện kích hoạt câu thoại:** `itemBroken`, `itemDropped`, `wallHit`, `itemLoaded`, `catEscaped`, `timeLow`, `levelStart`, `levelEnd`, `bigLiftStart` (khi đủ người nhấc một món đồ cần nhiều người), `bigLiftFail` (khi buông giữa chừng).
- **Hành vi:** đi lại, thỉnh thoảng đứng chắn đường; đổi yêu cầu giữa chừng; hiếm khi khen một câu.
- **Online:** chủ nhà chạy trên máy host; host gửi **mã câu thoại** (không gửi chữ) tới mọi máy, mỗi máy hiện câu đó bằng ngôn ngữ của mình.
- **Song ngữ:** mỗi câu thoại có bản tiếng Anh và tiếng Việt cùng mã, viết lại cho hài theo từng ngôn ngữ chứ không dịch máy.
- **Chống lặp:** cooldown theo loại sự kiện, ưu tiên câu chưa nói gần đây.
- **Các kiểu chủ nhà:** bà cụ khó tính, anh startup cuồng minimalism, chị chủ 6 con mèo, ông chú nghiện đồ cổ, ngôi sao nổi tiếng.

Ví dụ câu thoại:
| Tiếng Việt | English |
|---|---|
| "Cái sofa đó của bà nội tôi đấy!" | "That sofa belonged to my grandmother!" |
| "Tôi thuê 8 người hay 8 con gấu vậy?" | "Did I hire eight movers or eight bears?" |
| "Tám người mà không nhấc nổi một cái đàn à?" | "Eight of you and you can't lift ONE piano?" |
| "Ờ… giỏi. Giỏi lắm." (khi làm vỡ gương) | "Oh… great. Just great." (mirror broken) |

---

## 8. Tính điểm

```
Điểm = Σ giá trị đồ lên xe
     − Σ tiền đền đồ hỏng
     + thưởng hài lòng (hài lòng × hệ số màn)
     + thưởng đồ "bắt buộc" đủ 100%
```

- **Qua màn:** phải đưa đủ **toàn bộ đồ bắt buộc** lên xe.
- **1/2/3 sao** theo mốc điểm. Mốc điểm co giãn theo số người (`scaling.starsPerExtraPlayer`).
- **Danh hiệu cuối màn** (theo từng người): "Bàn tay vàng làm vỡ", "Người thì thầm với mèo", "Kẻ đứng nhìn", "Vua ném đồ", "Người buông tay đầu tiên", "Cột sống của đội" (khiêng nhiều nhất).
- **Màn kết:** xe tải chạy đi, đồ xếp ẩu rơi lộp độp ra đường.
- **Lưu tiến trình online:** mỗi người tự lưu sao vào `localStorage` của máy mình theo kết quả host gửi về.

---

## 9. Kiến trúc kỹ thuật (web, client-only)

### Công nghệ
| Hạng mục | Lựa chọn | Lý do |
|---|---|---|
| Ngôn ngữ | **TypeScript** | An toàn kiểu cho data JSON và gói tin mạng |
| Build | **Vite** | Nhanh, ra file tĩnh |
| Engine 2D | **Phaser 3** | Ổn định, có sẵn input, scene, audio, tích hợp Matter.js |
| Vật lý | **Matter.js** | Rigid body, constraint cho nhiều người cùng nắm một vật |
| Mạng | **WebRTC DataChannel** qua **Trystero** (dự phòng PeerJS) | P2P, không cần server riêng |
| Mã hóa gói tin | Nhị phân (`ArrayBuffer` / `DataView`) cho snapshot, JSON cho sự kiện | Giảm băng thông |
| Input | Keyboard API + Gamepad API | Chơi chung máy |
| UI | HTML/CSS overlay | Dễ làm menu, lobby |
| Lưu trữ | `localStorage` | Không cần server |
| Hosting | GitHub Pages / Netlify / itch.io | Miễn phí, tĩnh |

### Mô hình mạng: host-authoritative
```
 Client (máy khách)                          Host (máy chủ phòng)
 ┌───────────────┐   input (30 Hz)          ┌─────────────────────────┐
 │ Đọc phím/tay  │ ───────────────────────▶ │ Gộp input mọi người     │
 │ cầm           │                          │ Chạy Matter.js (60 Hz)  │
 │ Nội suy và    │ ◀─────────────────────── │ Logic: điểm, chủ nhà,   │
 │ vẽ hình       │   snapshot (20 Hz)       │ mèo, đồng hồ            │
 │ Hiện câu      │ ◀─────────────────────── │                         │
 │ thoại, hiệu   │   event (khi có)         │                         │
 │ ứng           │                          │                         │
 └───────────────┘                          └─────────────────────────┘
```
- **Host** là trình duyệt của người tạo phòng: chạy vật lý thật, AI mèo, chủ nhà, đồng hồ, tính điểm.
- **Client** chỉ gửi input và vẽ lại trạng thái host gửi về; nội suy với độ trễ khoảng 100 ms cho mượt.
- **Dự đoán phía client** chỉ áp dụng cho chuyển động nhân vật của chính mình (phần còn lại để host quyết định), giúp điều khiển không bị "dính".
- **Topology hình sao:** mọi client nối trực tiếp tới host (tối đa 7 kết nối).
- **Chơi offline / chơi chung máy:** cùng một code; máy đó vừa là host vừa là client (không mở mạng).

### Gói tin
| Loại | Hướng | Tần suất | Nội dung |
|---|---|---|---|
| `hello` / `join` | client → host | 1 lần | tên, màu, số người chơi trên máy đó, phiên bản game |
| `lobbyState` | host → all | khi đổi | danh sách người chơi, màn đã chọn, trạng thái sẵn sàng |
| `input` | client → host | 30 Hz | trục di chuyển (int8 × 2), bitmask nút, số thứ tự |
| `snapshot` | host → all | 20 Hz | vị trí/góc/trạng thái các vật thể **có thay đổi** (delta), đồng hồ, độ hài lòng |
| `event` | host → all | khi có | `itemBroken`, `dialogue`, `ping`, `itemLoaded`, `levelEnd`… |
| `ping`/`pong` | hai chiều | 1 Hz | đo độ trễ, hiện chỉ số mạng |

### Ước tính băng thông
- Snapshot: khoảng 60 vật thể động × 10 byte × 20 Hz ≈ **12 KB/s mỗi client**.
- Host upload cho 7 client ≈ **85 KB/s**: ổn với mạng gia đình thông thường.
- Tối ưu: chỉ gửi vật đang chuyển động, lượng tử hóa vị trí (int16), góc (int8).

### Phòng chơi
- Host bấm "Tạo phòng" thì sinh **mã phòng 6 ký tự** và **link mời** dạng `.../?room=ABC123`.
- Người khác mở link hoặc nhập mã để vào; tối đa 8 người tính cả người chơi chung máy.
- Kiểm tra **phiên bản game** khi vào phòng; khác phiên bản thì từ chối kèm thông báo.
- **Mất kết nối:** client rớt mạng có 30 giây để vào lại đúng chỗ cũ; nhân vật đứng yên trong lúc chờ. **Host thoát thì màn kết thúc** (không chuyển host trong MVP).
- Host có quyền: chọn màn, bắt đầu, kick người chơi.

### Cấu trúc thư mục
```
/
├── index.html
├── public/
│   ├── data/
│   │   ├── items.json
│   │   ├── levels.json
│   │   ├── landlords.json
│   │   ├── lines.en.json
│   │   ├── lines.vi.json
│   │   ├── config.json
│   │   └── i18n/
│   │       ├── en.json   (chữ giao diện tiếng Anh)
│   │       └── vi.json   (chữ giao diện tiếng Việt)
│   └── assets/ (sprites, audio, fonts)
└── src/
    ├── main.ts
    ├── scenes/        (Boot, Menu, Lobby, LevelSelect, Game, Result)
    ├── entities/      (Player, Item, Cat, Landlord, Truck)
    ├── systems/       (Grab, Lift, Damage, Scoring, Dialogue, Timer, Input, Scaling)
    ├── net/           (Transport, Room, HostLoop, ClientLoop, Protocol, Interpolation)
    ├── data/          (types.ts, loader.ts, validate.ts, i18n.ts, settings.ts)
    └── ui/            (HUD, bubble, menus, ping wheel)
```

### Nguyên tắc "data-driven"
- Thêm đồ, màn hay câu thoại mới **chỉ cần sửa JSON**, không đụng code.
- Kiểm tra JSON lúc tải game; báo lỗi rõ ràng nếu thiếu trường hoặc màn không khả thi (vd. `minPlayers` < `requiredGrabbers` lớn nhất của đồ `strict` bắt buộc).
- Online: mọi máy tải cùng file JSON; host gửi **mã hash của data** khi có người vào để chắc chắn mọi người dùng cùng dữ liệu.

---

## 10. Data schema

### `items.json`
```json
[
  {
    "id": "fridge",
    "name": { "en": "Fridge", "vi": "Tủ lạnh" },
    "sprite": "items/fridge.png",
    "size": { "w": 60, "h": 80 },
    "mass": 120,
    "friction": 0.01,
    "requiredGrabbers": 2,
    "liftRule": "drag",
    "grabPoints": [[-30, 0], [30, 0]],
    "value": 300,
    "fragile": false,
    "durability": 5,
    "repairCost": 150,
    "behaviors": ["slippery", "doorPopsOpen"],
    "truckSlots": 4
  },
  {
    "id": "grand_piano",
    "name": { "en": "Grand piano", "vi": "Đàn grand piano" },
    "sprite": "items/grand_piano.png",
    "size": { "w": 160, "h": 110 },
    "mass": 500,
    "friction": 0.4,
    "requiredGrabbers": 8,
    "liftRule": "strict",
    "grabPoints": [[-80,-50],[0,-55],[80,-50],[85,0],[80,50],[0,55],[-80,50],[-85,0]],
    "value": 3000,
    "fragile": true,
    "durability": 4,
    "breakImpulse": 6,
    "repairCost": 2500,
    "behaviors": ["dropOnRelease", "keysSoundOnHit"],
    "truckSlots": 10
  },
  {
    "id": "cat",
    "name": { "en": "Cat", "vi": "Mèo" },
    "sprite": "items/cat.png",
    "mass": 4,
    "requiredGrabbers": 1,
    "liftRule": "free",
    "value": 0,
    "behaviors": ["fleeAI", "scratchDrop", "escapeBox"],
    "ai": { "speed": 3.5, "fleeRadius": 120, "hideSpots": true },
    "truckSlots": 1
  }
]
```

### `levels.json`
```json
[
  {
    "id": "lv15_museum",
    "name": { "en": "Private Museum", "vi": "Bảo tàng tư nhân" },
    "tier": "full",
    "minPlayers": 8,
    "maxPlayers": 8,
    "recommendedPlayers": 8,
    "unlockStars": 30,
    "timeLimitSec": 600,
    "map": "maps/museum.json",
    "landlord": "collector",
    "truck": { "x": 1400, "y": 500, "slots": 40, "hasHandbrake": true },
    "spawns": [
      { "item": "statue", "x": 600, "y": 300, "required": true },
      { "item": "mirror", "x": 320, "y": 90, "required": false }
    ],
    "playerSpawns": [[100,400],[140,400],[180,400],[220,400],[100,440],[140,440],[180,440],[220,440]],
    "modifiers": [],
    "stars": [2000, 3500, 5000],
    "satisfactionMultiplier": 10,
    "scaling": null
  },
  {
    "id": "lv01_studio",
    "name": { "en": "Studio Apartment", "vi": "Căn hộ studio" },
    "tier": "solo",
    "minPlayers": 1,
    "maxPlayers": 8,
    "recommendedPlayers": 2,
    "unlockStars": 0,
    "timeLimitSec": 300,
    "map": "maps/studio.json",
    "landlord": "grandma",
    "truck": { "x": 900, "y": 300, "slots": 20, "hasHandbrake": false },
    "spawns": [
      { "item": "box", "x": 200, "y": 150, "required": true }
    ],
    "playerSpawns": [[100,400],[140,400],[180,400],[220,400],[100,440],[140,440],[180,440],[220,440]],
    "modifiers": [],
    "stars": [500, 900, 1300],
    "satisfactionMultiplier": 5,
    "scaling": {
      "basePlayers": 1,
      "extraSpawnsPerPlayer": [{ "item": "box", "count": 2 }, { "item": "plant", "count": 1 }],
      "timeDeltaPerPlayerSec": -10,
      "starsPerExtraPlayer": [150, 250, 350],
      "truckSlotsPerPlayer": 3
    }
  }
]
```
- `tier`: `"solo" | "duo" | "team" | "squad" | "full"`
- `modifiers`: `"rain"`, `"slope"`, `"stairs"`, `"landlordChangesMind"`, `"paparazzi"`

### `landlords.json`
```json
[
  {
    "id": "grandma",
    "name": { "en": "Grandma Tu", "vi": "Bà Tư" },
    "sprite": "npc/grandma.png",
    "voicePitch": 1.3,
    "startSatisfaction": 50,
    "sensitivity": { "itemBroken": -15, "itemDropped": -5, "wallHit": -3, "itemLoaded": 2, "bigLiftFail": -8 },
    "favoriteItems": ["teddy"],
    "linesKey": "grandma"
  }
]
```

### Đa ngôn ngữ trong data
- **Tên** đồ vật, màn chơi, chủ nhà: ghi thẳng cả hai ngôn ngữ trong cùng file, dạng `{ "en": "…", "vi": "…" }`.
- **Chữ giao diện** (menu, HUD, nút…): `i18n/en.json` và `i18n/vi.json`, khóa phẳng, tham số `{ten}`.
- **Câu thoại** chủ nhà: `lines.en.json` và `lines.vi.json`, **cùng cấu trúc, cùng số câu** ở mỗi sự kiện; câu thứ *i* ở hai file là cùng một câu (online chỉ gửi mã sự kiện + số thứ tự).
- Validate (P05) báo lỗi nếu thiếu bản dịch, lệch số câu, lệch khóa hoặc lệch tham số.

### `lines.vi.json` (`lines.en.json` cùng cấu trúc)
```json
{
  "grandma": {
    "levelStart": ["Nhẹ tay nhé mấy đứa, đồ của bà quý lắm."],
    "itemBroken": ["Trời đất ơi!", "Ờ… giỏi. Giỏi lắm."],
    "wallHit": ["Tường mới sơn đó!"],
    "itemLoaded": ["Ừ, được.", "Cũng tạm."],
    "bigLiftStart": ["Cẩn thận! Cẩn thận!"],
    "bigLiftFail": ["Đông người mà không nhấc nổi à?"],
    "timeLow": ["Nhanh lên, xe sắp chạy rồi!"],
    "levelEnd": ["Thôi được, lần sau bà gọi người khác."]
  }
}
```

### `config.json`
```json
{
  "maxPlayers": 8,
  "maxLocalPlayers": 4,
  "logicHz": 60,
  "runTripChance": 0.03,
  "throwSpeed": 11,
  "grabRange": 40,
  "net": {
    "transport": "trystero",
    "fallbackTransport": "peerjs",
    "appId": "beast-movers-v1",
    "iceServers": [
      { "urls": "stun:stun.l.google.com:19302" }
    ],
    "inputHz": 30,
    "snapshotHz": 20,
    "interpolationDelayMs": 100,
    "reconnectGraceSec": 30
  },
  "dialogue": { "cooldownSec": { "default": 4, "itemBroken": 2 } },
  "debug": false
}
```

### Lưu tiến trình (`localStorage`, key `beast-movers-save-v1`)
```json
{
  "version": 1,
  "profile": { "name": "Hùng", "color": "orange", "hat": "cap" },
  "levels": { "lv01_studio": { "stars": 3, "bestScore": 1420, "bestPlayerCount": 4 } },
  "settings": { "volume": 0.8, "language": "vi", "screenShake": true }
}
```

---

## 11. Giao diện (UI)

### Các màn hình
1. **Màn hình chính:** Chơi chung máy · Tạo phòng online · Vào phòng · Cài đặt · Hướng dẫn
2. **Lobby:**
   - 8 ô người chơi (tên, màu, mũ, biểu tượng bàn phím/tay cầm/online, độ trễ ms)
   - Người chơi chung máy nhấn nút để tham gia
   - Mã phòng và nút **Copy link mời**
   - Nút **Sẵn sàng**; host bấm **Bắt đầu** khi mọi người đã sẵn sàng
3. **Chọn màn:**
   - Lọc theo cấp (🟢🔵🟣🟠🔴)
   - Mỗi màn hiện: `👥 Tối thiểu 6 · Đề xuất 8`, sao đã đạt, trạng thái khóa
   - Màn thiếu người: mờ đi kèm "🔒 Cần thêm 2 người"
   - Màn thiếu sao: "🔒 Cần 30 ⭐"
4. **Trong game (HUD):**
   - Đồng hồ đếm ngược
   - Thanh hài lòng của chủ nhà (kèm biểu cảm khuôn mặt)
   - Danh sách đồ bắt buộc, kèm số người cần (`🎹 8👐`)
   - Chỉ số thùng xe đã đầy bao nhiêu
   - Bong bóng thoại chủ nhà
   - Nhãn tên/màu trên đầu từng người
   - Bộ đếm `3/8 👐` trên món đồ đang được nắm
   - Mũi tên chỉ hướng tới đồng đội / món đồ đang được ping ngoài màn hình
   - Chỉ số mạng (online)
5. **Camera:**
   - Chơi chung máy: camera chung, tự zoom để thấy tất cả người chơi trên máy đó
   - Online: mỗi máy có camera riêng theo người chơi của máy đó (nếu máy đó có nhiều người thì zoom gom lại)
6. **Tạm dừng:**
   - Chơi chung máy thì dừng game thật.
   - Online thì chỉ mở menu, game vẫn chạy; host có thêm nút "Kết thúc màn".
7. **Kết quả:** bảng điểm, số sao, danh hiệu từng người, nút Chơi lại / Màn tiếp (host chọn)

### Yêu cầu giao diện
- Hỗ trợ toàn màn hình, tự co giãn theo cửa sổ; tối thiểu 1280×720; điện thoại không phải mục tiêu chính.
- Font hỗ trợ tiếng Việt đầy đủ dấu.
- **Song ngữ Anh/Việt:** đổi ngôn ngữ ngay trong menu, không cần tải lại trang; bố cục chừa đủ chỗ cho câu dài hơn ở một trong hai ngôn ngữ.
- 8 màu nhân vật **phân biệt được cả với người mù màu** (mỗi màu kèm một ký hiệu hoặc mũ riêng).
- Tùy chọn tắt rung màn hình, chỉnh âm lượng.

---

## 12. Yêu cầu phi chức năng

| Mục | Mục tiêu |
|---|---|
| Hiệu năng (host) | 60 FPS vật lý với 8 người và khoảng 60 vật thể động trên laptop tầm trung |
| Hiệu năng (client) | 60 FPS vẽ hình, nội suy mượt |
| Độ trễ chấp nhận được | Chơi tốt khi ping < 150 ms; cảnh báo khi > 250 ms |
| Băng thông | ≤ 15 KB/s mỗi client, ≤ 100 KB/s upload ở host |
| Thời gian tải | Dưới 5 giây lần đầu (tổng asset < 20 MB) |
| Vào phòng | Dưới 10 giây từ lúc mở link tới khi vào lobby |
| Trình duyệt | 2 phiên bản mới nhất của Chrome, Edge, Firefox, Safari |
| Bảo trì | Thêm nội dung chỉ qua JSON |

---

## 13. Lộ trình phát triển (theo phase nhỏ)

Tổng cộng **41 phase**, mỗi phase khoảng **2–5 ngày**, gom thành **7 mốc (A–G)**. Ước tính khoảng **5–6 tháng** cho 1–2 người.

> **Nguyên tắc:** ngay từ phase đầu, mọi logic game viết theo kiểu "input vào, trạng thái ra" để mốc D (online) chỉ cần cắm lớp mạng vào, không phải viết lại.

### Cách tích tiến độ
1. Làm xong một việc thì đổi `- [ ]` thành `- [x]` ở phần chi tiết của phase đó.
2. Một phase **chỉ được tích xong** khi **mọi việc** đã tích **và** tiêu chí "✅ Xong khi" đã được kiểm tra thật (chạy game, không chỉ code xong).
3. Cập nhật bảng tổng quan: đổi ⬜ thành 🟨 (đang làm) hoặc ✅ (xong), ghi ngày xong.
4. Commit theo dạng `P08: khiêng nhiều người – xong`.
5. Hết mỗi mốc thì chơi thử (playtest) và ghi nhận xét vào mục **Ghi chú playtest** ở cuối mốc.
6. Không bắt đầu mốc mới khi mốc trước còn phase chưa xong (trừ khi ghi rõ lý do bên dưới).

### Bảng tổng quan

Cột **MVP**: ✔ là phase cần cho bản MVP (mục 15).

| Phase | Tên | Mốc | MVP | Ước tính | Trạng thái | Ngày xong |
|---|---|---|---|---|---|---|
| P01 | Khởi tạo dự án | A | ✔ | 1–2 ngày | 🟨 | |
| P02 | Scene và vòng lặp game | A | ✔ | 2 ngày | ✅ | 2026-10-28 |
| P03 | Input chung máy | A | ✔ | 3 ngày | ✅ | 2026-10-28 |
| P04 | Nhân vật | A | ✔ | 3–4 ngày | ✅ | 2026-10-28 |
| P05 | Data loader và validate | B | ✔ | 2–3 ngày | ✅ | 2026-10-28 |
| P06 | Đồ vật dựng từ data | B | ✔ | 2 ngày | ✅ | 2026-10-28 |
| P07 | Nắm, thả, ném (1 người) | B | ✔ | 3 ngày | ✅ | 2026-10-28 |
| P08 | Khiêng nhiều người | B | ✔ | 5 ngày | ✅ | 2026-10-28 |
| P09 | Độ bền và vỡ | B | ✔ | 3 ngày | ✅ | 2026-10-28 |
| P10 | Hành vi đặc biệt của đồ | B | ✔ | 4 ngày | ✅ | 2026-10-28 |
| P11 | Mèo AI | B | ✔ | 3 ngày | ✅ | 2026-10-28 |
| P12 | Bản đồ và level loader | C | ✔ | 4 ngày | ✅ | 2026-10-28 |
| P13 | Xe tải | C | ✔ | 3 ngày | ⬜ | |
| P14 | Đồng hồ và điều kiện qua màn | C | ✔ | 2 ngày | ⬜ | |
| P15 | Chủ nhà NPC | C | ✔ | 4 ngày | ⬜ | |
| P16 | Tính điểm và màn kết quả | C | ✔ | 3 ngày | ⬜ | |
| P17 | HUD trong game | C | ✔ | 3 ngày | ⬜ | |
| P18 | Camera chung máy | C | ✔ | 2 ngày | ⬜ | |
| P19 | Tách simulation host/client | D | ✔ | 4–5 ngày | ⬜ | |
| P20 | Transport và phòng chơi | D | ✔ | 4 ngày | ⬜ | |
| P21 | Lobby online | D | ✔ | 3 ngày | ⬜ | |
| P22 | Gửi input và snapshot | D | ✔ | 4 ngày | ⬜ | |
| P23 | Nội suy và dự đoán | D | ✔ | 4 ngày | ⬜ | |
| P24 | Đồng bộ sự kiện | D | ✔ | 2 ngày | ⬜ | |
| P25 | Rớt mạng, lỗi kết nối, dự phòng | D | ✔ | 4 ngày | ⬜ | |
| P26 | Test 8 người online | D | ✔ | 3 ngày | ⬜ | |
| P27 | Menu chính, cài đặt, hướng dẫn | E | ✔ | 3 ngày | ⬜ | |
| P28 | Màn chọn màn (khóa theo người và sao) | E | ✔ | 3 ngày | ⬜ | |
| P29 | Lưu tiến trình | E | ✔ | 2 ngày | ⬜ | |
| P30 | Ping nhanh và chỉ dẫn | E | ✔ | 3 ngày | ⬜ | |
| P31 | 5 màn MVP (1 màn mỗi cấp) và 3 chủ nhà | F | ✔ | 5 ngày | ⬜ | |
| P32 | Màn Solo và Đôi còn lại | F | | 5 ngày | ⬜ | |
| P33 | Màn Đội còn lại | F | | 5 ngày | ⬜ | |
| P34 | Màn Đại đội và Full nhà còn lại | F | | 5 ngày | ⬜ | |
| P35 | Co giãn theo số người (scaling) | F | | 3 ngày | ⬜ | |
| P36 | Thêm 2 chủ nhà và bộ thoại | F | | 3 ngày | ⬜ | |
| P37 | Âm thanh và hiệu ứng | G | | 4 ngày | ⬜ | |
| P38 | Tối ưu hiệu năng và mạng | G | | 4 ngày | ⬜ | |
| P39 | Cân bằng và playtest theo số người | G | | 5 ngày | ⬜ | |
| P40 | Kiểm thử trình duyệt | G | | 2 ngày | ⬜ | |
| P41 | Phát hành | G | | 2 ngày | ⬜ | |

**Tiến độ:** 11/41 phase · Mốc A 🟨 · B ✅ · C 🟨 · D ⬜ · E ⬜ · F ⬜ · G ⬜

---

### 🅰️ Mốc A — Nền tảng

#### P01 · Khởi tạo dự án
- [x] Tạo dự án Vite + TypeScript + Phaser 3 (bật Matter.js)
- [x] Cài ESLint + Prettier, bật `strict` trong `tsconfig`
- [x] Tạo cấu trúc thư mục như mục 9 (`scenes/`, `entities/`, `systems/`, `net/`, `data/`, `ui/`)
- [ ] Thiết lập deploy tự động lên GitHub Pages khi push nhánh chính
  - [x] Viết workflow `.github/workflows/deploy.yml` (lint → test → build → deploy)
  - [ ] Tạo repo GitHub, push, bật Pages (Source: GitHub Actions)
- [x] README: cách chạy dev, cách build
- **✅ Xong khi:** mở link GitHub Pages thấy canvas Phaser hiển thị chữ "Hello".
- 📝 *Đã kiểm tra bản build chạy local (`vite preview`) hiển thị menu "Xin chào!". Còn chờ repo GitHub để deploy.*

#### P02 · Scene và vòng lặp game
- [x] Tạo các scene `Boot`, `Menu`, `Game`, `Result` (giao diện tạm), chuyển qua lại được
- [x] Vòng lặp logic **cố định 60 Hz** (fixed timestep), tách khỏi tốc độ vẽ hình
- [x] Bật chế độ debug: hiện FPS và khung va chạm (`config.debug`, `?debug=1`, phím F1)
- **✅ Xong khi:** chuyển Menu → Game → Result → Menu không lỗi; logic chạy đúng 60 lần/giây kể cả khi màn hình 144 Hz.
- 📝 *Kiểm tra: Chromium chạy 2 vòng chuyển scene, 0 lỗi console; FPS vẽ 37 mà logic vẫn 61 bước/giây; unit test 30/60/75/120/144/240 Hz đều ra 60 bước/giây.*

#### P03 · Input chung máy
- [x] Định nghĩa `InputFrame` chuẩn: trục X/Y (int8) + bitmask nút (nắm, ném, lao, ping)
- [x] Bố cục bàn phím Người 1 và Người 2
- [x] Hỗ trợ Gamepad API: nhận, ngắt, cắm lại tay cầm
- [x] `InputManager` gán tối đa 4 người chơi trên một máy, mỗi người một nguồn input
- [x] Màn test input hiện trạng thái từng người
- **✅ Xong khi:** 2 người bàn phím + 2 tay cầm điều khiển cùng lúc, logic game chỉ đọc `InputFrame` (không đọc phím trực tiếp).
- 📝 *Kiểm tra: 15 unit test input; Chromium với 2 tay cầm giả lập + 2 bố cục bàn phím, 4 người tham gia và điều khiển độc lập cùng lúc (màn "Thử điều khiển", phím I); rút/cắm lại tay cầm không lỗi. Chưa thử tay cầm thật và hiện tượng bàn phím kẹt phím (ghosting) trên máy thật.*

#### P04 · Nhân vật
- [x] Nhân vật là thân Matter.js hình tròn, đi và chạy
- [x] Chạy có xác suất vấp (`runTripChance`), ngã thì nằm 1 giây
- [x] Lao/chụp có thời gian hồi chiêu (cooldown)
- [x] 8 màu + ký hiệu riêng cho từng người, nhãn tên trên đầu
- [x] Hoạt ảnh tạm: đứng, đi, ngã
- **✅ Xong khi:** 4 người chạy, lao, vấp ngã, va vào nhau có vật lý trên một bản đồ trống.
- 📝 *Kiểm tra: 10 unit test di chuyển (đi, chạy, lao, hồi chiêu, vấp, đứng dậy); Chromium 4 người cùng chạy 4 hướng, P1 lao vào P2 làm P2 ngã, phím T cho cả 4 ngã; logic giữ 60 bước/giây khi FPS vẽ chỉ 25. Thêm: chạy giữ hướng 0,6 giây, nhân vật vào giữa màn được.*

**Ghi chú playtest mốc A:**
- Nhãn tên bị cắt khi nhân vật đứng sát mép trên bản đồ → xử lý ở P18 (camera, giới hạn khung).
- `runTripChance` = 0,03 nghĩa là trung bình chạy liên tục khoảng 33 giây mới vấp một lần; cần chỉnh lại khi playtest thật (P39).
- Còn chờ: playtest với người thật, tay cầm thật.

---

### 🅱️ Mốc B — Vật lý và đồ đạc

#### P05 · Data loader và validate
- [x] Viết `types.ts` cho `items`, `levels`, `landlords`, `lines`, `config`
- [x] Loader đọc toàn bộ JSON trong `public/data/`
- [x] Validate: thiếu trường, sai kiểu, `id` trùng, tham chiếu tới `id` không tồn tại
- [x] Kiểm tra màn khả thi: `minPlayers` ≥ `requiredGrabbers` của mọi đồ `strict` **bắt buộc** trong màn
- [x] Kiểm tra song ngữ: mọi `name` có đủ `en` + `vi`; `lines.en.json` và `lines.vi.json` cùng khóa, cùng số câu
- [x] Tính **hash của data** (dùng ở P20)
- [x] Hiện màn hình lỗi dễ đọc khi data sai
- **✅ Xong khi:** cố ý làm sai một file JSON thì game báo đúng file, đúng trường bị lỗi.
- 📝 *Kiểm tra: 21 unit test (data thật hợp lệ; mỗi loại lỗi báo đúng file + đường dẫn trường, vd. `items.json › [fridge].size.w`; JSON sai cú pháp báo đúng dòng/cột; thiếu file; không báo lỗi dây chuyền). Trình duyệt: sửa data qua mạng thì màn hình lỗi hiện đúng 3 lỗi bằng tiếng Việt, JSON hỏng hiện dòng 5 cột 23 bằng tiếng Anh. Kèm theo: kiểm tra trường gõ sai tên, hash data hiện ở góc menu. Thay đổi nhỏ: `throwForce` → `throwSpeed`; cooldown thoại chuyển sang `config.json` (không phụ thuộc ngôn ngữ).*

#### P06 · Đồ vật dựng từ data
- [x] Sinh đồ vật từ `items.json`: kích thước, khối lượng, ma sát, sprite
- [x] Màn "sandbox" để thả thử từng món đồ
- [x] Nhập đủ 10 món đồ MVP vào JSON (sprite tạm cũng được)
- **✅ Xong khi:** thêm một món đồ mới chỉ bằng cách sửa JSON là nó xuất hiện trong sandbox.
- 📝 *Kiểm tra: Chromium chèn thêm "Đèn cây" vào items.json qua mạng → có trong bảng chọn và thả được; thả cả 23 món cùng lúc; click đặt, chuột phải xóa; đẩy cùng vận tốc thì tủ lạnh (ma sát 0,01) trượt 252px, sofa (0,35) chỉ 50px. Data có 22 món (16 trong plan + đồ ăn, cá, bi, quả tạ, sách, lồng mèo). Hình tạm: khối màu + emoji. Sandbox mở bằng phím S ở menu.*

#### P07 · Nắm, thả, ném (1 người)
- [x] Nắm món đồ gần nhất trong `grabRange`, gắn vào điểm nắm gần nhất
- [x] Thả ra, và ném theo hướng đang đi (`throwSpeed`)
- [x] Mang đồ nặng thì đi chậm lại theo khối lượng
- [x] Viền sáng món đồ có thể nắm
- **✅ Xong khi:** một người nhặt, mang và ném được thùng carton, gương, chậu cây.
- 📝 *Kiểm tra (Chromium): nắm/thả thùng, mang thùng đi cùng tốc độ người; ném thùng bay 302px, bể cá 25kg bay 188px; mang bể cá chậm hơn mang thùng; một người kéo sofa (cần 2) chỉ lê được 11px/1,5s và phát `itemScrape`; viền sáng + chấm ở điểm sẽ nắm. Chỉ nắm được khi điểm nắm còn trống nằm trong tầm với (đồ dài phải đi tới đúng chỗ). Vật bị ném bay ~0,45s gần như không ma sát; người ném xuyên qua vật vừa ném 0,25s. Đồ > 30kg hoặc cần > 1 người thì không ném được. Phần "trừ độ bền" khi kéo lê làm ở P09 (đã có sự kiện `itemScrape`).*

#### P08 · Khiêng nhiều người
- [x] Đọc `grabPoints` từ data; mỗi điểm chỉ một người nắm
- [x] Nối người và đồ bằng constraint mềm (stiffness thấp, giới hạn lực)
- [x] Gộp hướng: hướng di chuyển là trung bình hướng của những người đang nắm
- [x] `liftRule`:
  - [x] `free`: một người cũng kéo được, đông thì nhanh hơn
  - [x] `drag`: thiếu người thì kéo lê chậm, trừ độ bền
  - [x] `strict`: thiếu người thì không nhúc nhích
- [x] Đủ người thì món đồ "nhấc lên" (đổi bóng đổ, đổi viền màu)
- [x] Một người buông khi đang nhấc đồ `strict` thì món đồ rơi xuống, phát sinh va chạm
- [x] Bộ đếm `x/y 👐` trên món đồ
- **✅ Xong khi:** 4 người chung máy khiêng được piano (`strict`, 4 người); 3 người thì piano đứng im; 1 người buông thì piano rơi.
- 📝 *Kiểm tra (Chromium, 2 bàn phím + 2 tay cầm giả lập, chạy 2 lần cùng kết quả): 3 người đẩy 1s → piano đi 0px; người thứ 4 nắm → `lifted`, cùng đẩy phải 1s → đi 91px, không xoay; hai người trên kéo trái, hai người dưới kéo phải → xoay ~50° tại chỗ; kéo co trái/phải → đứng im; P1 buông → `bigLiftFail` + `itemDropped`, piano đóng đinh lại. 10 unit test bộ điều khiển khiêng. Sửa lỗi phát hiện khi test: người đang khiêng vẫn bị tính là chạy nên có thể vấp ngã và tuột tay → giờ đang khiêng thì không chạy/lao/vấp.*

#### P09 · Độ bền và vỡ
- [x] Tính lực va chạm; vượt `breakImpulse` thì trừ `durability`
- [x] Hiển thị nứt theo nấc độ bền
- [x] Vỡ thì để lại mảnh vỡ (vật thể nhỏ hoặc vùng nguy hiểm trên sàn)
- [x] Phát sự kiện `itemBroken`, `itemDropped`, `wallHit` lên event bus
- **✅ Xong khi:** ném gương vào tường 3 lần thì vỡ; event bus ghi log đúng sự kiện.
- 📝 *Kiểm tra (Chromium): ném gương vào tường 3 lần → độ bền 2 → 1 → 0, vỡ; nhật ký debug ghi đúng `itemThrown → wallHit → itemDamaged` ×3 rồi `itemBroken → zoneSpawned glass`. Thêm: ném thùng vào gương → gương mất 1 độ bền (đồ va đồ); kéo lê sofa một mình 6s → mất 2 độ bền; rơi đồ đang khiêng = cú va mạnh theo khối lượng (`4 + kg/100`). Vùng sàn: mảnh kính (đi qua vấp 3/8 lần), nước/đất (trơn: thả phím trượt 22px so với 5px trên sàn khô, đồ vật trượt xa hơn). Người đi bộ va vào đồ không làm vỡ đồ. 6 unit test logic va chạm. Registry hành vi đã có khung + `shatterDebris` (gương, tượng); các hành vi còn lại ở P10.*

#### P10 · Hành vi đặc biệt của đồ
- [x] `slippery` (tủ lạnh trượt)
- [x] `doorPopsOpen` (cửa tủ lạnh bật mở, rơi đồ ăn)
- [x] `spillSoil` / `spillWater`: tạo vùng sàn trơn
- [x] `escapeFish` (cá văng ra khỏi bể)
- [x] `treadmillBelt` (máy chạy bộ hất văng người)
- [x] `ballsRoll` (bàn bi-a nghiêng thì bi lăn ra)
- [x] `dropOnRelease` (đồ 8 người rơi khi có người buông)
- [x] `boxBottomTear` (đáy thùng rách khi chứa đồ nặng)
- [x] Hành vi gắn bằng tên trong JSON (registry), không hard-code theo `id`
- **✅ Xong khi:** mỗi hành vi có một cảnh test trong sandbox và chạy đúng.
- 📝 *Kiểm tra (Chromium): 10 cảnh thử ở sandbox (phím 1–0) đều ra đúng kết quả: tủ lạnh đập tường → văng đồ ăn; chậu cây → vùng đất; bể cá → nước + cá giãy; máy chạy bộ bị va → băng chạy, người sát máy bị hất ngã; bàn bi-a rơi → RẦM + bi lăn; giàn tạ rơi → tạ lăn; thùng ném mạnh → rách đáy, rơi sách; piano rơi → người đứng gần ngã + "♪ Plinggg!"; gương → mảnh kính; bể cá khổng lồ rơi → nước + cá. Đi vào tủ lạnh thì tủ trượt 182px (sofa 81px). Cách làm: 2 hành vi chung có tham số (`spawnOnImpact`, `spillZone`) + các tên trong plan là preset của chúng; data có thể ghi `{ "type": "spawnOnImpact", "item": "…", … }` để tạo hành vi mới không cần code. Ghi chú thiết kế: "đáy thùng rách" kích hoạt khi va mạnh (chưa có đồ chứa đồ); "nghiêng" = món đồ đang khiêng xoay nhanh. Thêm `weightsRoll`, `flop` (cá giãy), `keysSoundOnHit`. Âm thanh thật làm ở P37.*

#### P11 · Mèo AI
- [x] Trạng thái: đi lang thang → chạy trốn khi có người lại gần (`fleeRadius`) → trốn vào chỗ nấp
- [x] Bế mèo có xác suất bị cào (`scratchDrop`)
- [x] Bỏ mèo vào thùng thì mèo có thể nhảy ra (`escapeBox`)
- [x] Phát sự kiện `catEscaped`
- **✅ Xong khi:** 2 người phải phối hợp mới bắt và đưa được mèo vào lồng trong vòng 1 phút.
- 📝 *Kiểm tra (Chromium): người đi tới → mèo chạy/nấp; lao trúng → mèo choáng 1,2s rồi bắt được; bế trung bình ~5s bị cào tuột tay (1s đầu không cào); thả cạnh lồng → mèo vào lồng, 6s sau vẫn trong lồng; thả cạnh thùng carton → mèo nhảy ra sau vài giây. Bot điều khiển bằng phím thật (6 lượt, giới hạn 60s): 2 bot (một con chặn đầu) bắt và đưa vào lồng trong 3,4–4,0s; 1 bot mất 6,4–9,0s. ⚠️ Đạt vế "2 người bắt được trong 1 phút", nhưng 1 người (bot phản xạ hoàn hảo) vẫn bắt được → độ khó "bắt buộc phối hợp" cần playtest người thật và chỉnh ở P39. Thay đổi khi chỉnh: mèo chạy 4,4 (nhanh hơn người chạy 4,2), né cú lao 75% (`ai.dodgeChance`), đang nấp thì bỏ chạy khi người cách 120px; chỗ nấp không đặt ở góc phòng (ngõ cụt). 10 unit test "não" mèo.*

**Ghi chú playtest mốc B:**
- Chưa playtest người thật; mọi kiểm tra là tự động (unit test + Chromium điều khiển bằng phím/tay cầm giả lập + bot).
- Độ khó bắt mèo cho 1 người cần chỉnh khi playtest (xem P11).
- Ném: vật bay ~0,45s gần như không ma sát; bể cá 25kg vẫn ném được (≤ 30kg) — cân nhắc lại khi playtest.
- Sandbox có 10 cảnh thử hành vi (phím 1–0) để chỉnh thông số nhanh.

---

### 🅲 Mốc C — Một màn chơi hoàn chỉnh (chơi chung máy)

#### P12 · Bản đồ và level loader
- [x] Vẽ bản đồ bằng Tiled, xuất JSON; load tường, cửa, sàn, vùng trơn, chỗ nấp
- [x] Đọc `levels.json`: điểm xuất hiện người chơi và đồ vật, chủ nhà, xe tải, `modifiers`
- [x] Cửa có bản lề, mở được khi đẩy
- **✅ Xong khi:** màn `lv01_studio` dựng hoàn toàn từ file data.
- 📝 *Kiểm tra: Chromium dựng `lv01_studio` hoàn toàn từ `levels.json` + `maps/studio.json`: 10 tường, 2 cửa, 13 món đồ (3 bắt buộc), 5 chỗ nấp, người chơi ở đúng điểm xuất hiện. Đi qua cửa chính → cửa xoay 31° rồi tự khép lại. Bản đồ dùng định dạng JSON của Tiled (lớp `floors`, `walls`, `doors`, `markers`, `zones`), mở và sửa được bằng Tiled; bản đầu được sinh bằng `tools/make-studio-map.py` chứ chưa vẽ tay trong Tiled. Validate bản đồ: thiếu file, đường dẫn ngoài `maps/`, vị trí ngoài bản đồ, đối tượng xoay, loại vùng lạ, màu sai (5 unit test). Xe tải, chủ nhà và modifier dựng ở P13/P15. Thêm: HudScene chạy song song để HUD và debug không bị camera zoom.*

#### P13 · Xe tải
- [ ] Vùng thùng xe; đồ đặt vào thì tính là "đã lên xe" (phát sự kiện `itemLoaded`)
- [ ] Giới hạn `slots`; đầy thì không nhận thêm
- [ ] Xếp chồng ẩu thì đồ trượt rơi ra (`itemUnloaded`)
- [ ] Phanh tay (`hasHandbrake`) cho modifier `slope`
- **✅ Xong khi:** chất đầy xe, đồ thừa bị rơi ra; trên dốc quên kéo phanh tay thì xe lăn đi.

#### P14 · Đồng hồ và điều kiện qua màn
- [ ] Đếm ngược theo `timeLimitSec`; còn 60 giây thì phát `timeLow`
- [ ] Theo dõi danh sách đồ bắt buộc
- [ ] Hết giờ thì khóa điều khiển và chuyển sang cảnh kết
- [ ] Qua màn nếu đủ đồ bắt buộc, ngược lại là thua
- **✅ Xong khi:** thắng và thua đều chuyển đúng sang màn kết quả.

#### P15 · Chủ nhà NPC
- [ ] Đi lại theo điểm định sẵn, thỉnh thoảng đứng chắn đường
- [ ] Thanh hài lòng thay đổi theo `sensitivity` khi nhận sự kiện
- [ ] Hệ thống thoại: chọn câu theo sự kiện, cooldown, tránh lặp câu
- [ ] Bong bóng thoại + âm thanh lẩm bẩm theo `voicePitch`
- [ ] Modifier `landlordChangesMind`: đổi danh sách đồ giữa chừng
- **✅ Xong khi:** làm vỡ gương thì chủ nhà nói câu phù hợp, thanh hài lòng tụt; trong 5 phút không nói lặp một câu quá 2 lần.

#### P16 · Tính điểm và màn kết quả
- [ ] Công thức điểm như mục 8
- [ ] Tính sao theo `stars`
- [ ] Thống kê từng người: số đồ khiêng, số đồ làm vỡ, số lần ném, số mèo bắt được
- [ ] Gán danh hiệu dựa trên thống kê
- [ ] Cảnh xe tải chạy đi, đồ rơi ra đường
- **✅ Xong khi:** màn kết quả hiện đúng điểm, sao, danh hiệu sau mỗi lần chơi.

#### P17 · HUD trong game
- [ ] Đồng hồ, thanh hài lòng có mặt biểu cảm, chỉ số thùng xe đã đầy bao nhiêu
- [ ] Danh sách đồ bắt buộc kèm số người cần, tự gạch khi đã lên xe
- [ ] Bong bóng thoại không che nhân vật
- **✅ Xong khi:** người mới nhìn HUD hiểu được cần làm gì mà không cần giải thích.

#### P18 · Camera chung máy
- [ ] Camera chung, tự zoom và di chuyển để thấy tất cả người chơi trên máy
- [ ] Giới hạn zoom; người đi quá xa thì hiện mũi tên ở mép màn hình
- [ ] Rung màn hình khi đồ vỡ (tắt được trong cài đặt)
- **✅ Xong khi:** 4 người tản ra hai đầu bản đồ vẫn thấy được nhau.

**🎯 Mốc C hoàn thành = vertical slice chơi chung máy.** Playtest với 2–4 người thật.

**Ghi chú playtest mốc C:**
_(ghi ở đây: có vui không? chỗ nào bực mình?)_

---

### 🅳 Mốc D — Chơi online P2P

#### P19 · Tách simulation host/client
- [ ] Tách `Simulation` thuần: `step(state, inputs[]) → state`, không đụng tới việc vẽ hình
- [ ] `GameState` có thể chuyển thành dữ liệu để gửi qua mạng (serialize): vật thể, người chơi, đồng hồ, độ hài lòng, điểm
- [ ] `Renderer` chỉ đọc state để vẽ
- [ ] `LoopbackTransport`: giả lập mạng ngay trong một máy (có thể thêm độ trễ và mất gói)
- **✅ Xong khi:** chơi chung máy vẫn chạy y như cũ nhưng đi qua `LoopbackTransport`; bật giả lập 100 ms trễ vẫn chơi được.

#### P20 · Transport và phòng chơi
- [ ] Interface `Transport` chung; bản cài đặt Trystero
- [ ] Tạo phòng: sinh mã 6 ký tự, link `?room=ABC123`
- [ ] Vào phòng bằng mã hoặc link
- [ ] Bắt tay khi vào: kiểm tra phiên bản game + hash data, sai thì từ chối kèm thông báo
- [ ] Giới hạn tổng 8 người (tính cả người chơi chung máy)
- [ ] Đọc `iceServers` (STUN/TURN) từ `config.json`
- **✅ Xong khi:** 2 máy ở 2 mạng khác nhau vào được cùng phòng bằng link.

#### P21 · Lobby online
- [ ] 8 ô người chơi: tên, màu, mũ, biểu tượng nguồn input, độ trễ (ms)
- [ ] Đổi màu không trùng nhau
- [ ] Nút Sẵn sàng; host bấm Bắt đầu khi mọi người đã sẵn sàng
- [ ] Host chọn màn, kick người chơi
- [ ] Nút Copy link mời
- **✅ Xong khi:** 4 máy vào lobby, đổi màu, sẵn sàng, host bắt đầu được màn.

#### P22 · Gửi input và snapshot
- [ ] Client gửi `InputFrame` 30 Hz, có số thứ tự
- [ ] Host gộp input mọi máy và chạy `Simulation`
- [ ] Snapshot nhị phân 20 Hz: chỉ gửi vật thể có thay đổi (delta), lượng tử hóa vị trí (int16) và góc (int8)
- [ ] Gửi snapshot đầy đủ khi có người mới vào và định kỳ mỗi 2 giây
- **✅ Xong khi:** 4 máy chơi trọn một màn online; băng thông mỗi client ≤ 15 KB/s.

#### P23 · Nội suy và dự đoán
- [ ] Đệm snapshot, nội suy với độ trễ `interpolationDelayMs`
- [ ] Dự đoán chuyển động nhân vật của chính mình phía client, kéo về dần khi lệch so với host
- [ ] Món đồ đang nắm hiển thị mượt (không giật theo nhịp snapshot)
- **✅ Xong khi:** với 150 ms trễ, điều khiển nhân vật không có cảm giác "dính", vật thể không giật.

#### P24 · Đồng bộ sự kiện
- [ ] Gửi qua mạng các sự kiện: `dialogue`, `itemBroken`, `itemLoaded`, `ping`, `timeLow`, `levelEnd`
- [ ] Hiệu ứng, âm thanh, câu thoại phát ở client dựa trên sự kiện
- [ ] Kết quả màn do host tính rồi gửi tới mọi máy
- [ ] Câu thoại gửi bằng mã (sự kiện + số thứ tự), mỗi máy hiện theo ngôn ngữ của mình
- **✅ Xong khi:** mọi máy thấy cùng một câu thoại (mỗi máy bằng ngôn ngữ đã chọn) và cùng bảng kết quả.

#### P25 · Rớt mạng, lỗi kết nối, dự phòng
- [ ] Client rớt mạng: nhân vật đứng yên, được vào lại đúng chỗ cũ trong `reconnectGraceSec`
- [ ] Host thoát: kết thúc màn, báo cho mọi người, quay về menu
- [ ] Dự phòng: chuyển sang PeerJS nếu Trystero không kết nối được
- [ ] Màn hình lỗi kết nối kèm hướng dẫn (thử mạng khác, dùng chơi chung máy)
- [ ] Hiện chỉ số mạng; cảnh báo khi ping > 250 ms
- **✅ Xong khi:** tắt Wi-Fi một client 10 giây rồi bật lại thì client vào lại đúng chỗ cũ; tắt host thì mọi client nhận thông báo.

#### P26 · Test 8 người online
- [ ] Test 8 máy thật (hoặc 8 tab trên vài máy)
- [ ] Đo FPS của host, băng thông, độ trễ, ghi vào bảng kết quả
- [ ] Test kết hợp: 2 máy × 2 người chung máy + 4 máy đơn
- [ ] Khiêng đồ `strict` 8 người qua mạng
- **✅ Xong khi:** 8 người khiêng xong grand piano lên xe; host giữ ≥ 55 FPS; không lỗi đồng bộ trong 10 phút.

**Ghi chú playtest mốc D:**
_(ghi ở đây)_

---

### 🅴 Mốc E — Giao diện và tiến trình

#### P27 · Menu chính, cài đặt, hướng dẫn
- [ ] Menu: Chơi chung máy · Tạo phòng · Vào phòng · Cài đặt · Hướng dẫn
- [ ] Cài đặt: âm lượng, rung màn hình, toàn màn hình, đổi phím
- [ ] Trang hướng dẫn điều khiển (bàn phím và tay cầm)
- [ ] Font tiếng Việt đầy đủ dấu
- [x] Chọn ngôn ngữ English / Tiếng Việt, lưu lựa chọn (làm sớm cùng lúc đổi tên game)
- **✅ Xong khi:** đi hết các menu chỉ bằng tay cầm.

#### P28 · Màn chọn màn (khóa theo người và sao)
- [ ] Danh sách màn lọc theo cấp 🟢🔵🟣🟠🔴
- [ ] Mỗi màn hiện: số người tối thiểu, số người đề xuất, sao đã đạt
- [ ] Khóa khi thiếu người: "🔒 Cần thêm N người"
- [ ] Khóa khi thiếu sao: "🔒 Cần X ⭐"
- [ ] Online: sao tính theo máy host
- **✅ Xong khi:** phòng 4 người thấy màn 🟠🔴 bị khóa đúng lý do; đủ 8 người thì mở ra.

#### P29 · Lưu tiến trình
- [ ] Lưu và đọc `localStorage` theo schema `beast-movers-save-v1`
- [ ] Bọc `try/catch`; trình duyệt chặn lưu trữ thì game vẫn chạy
- [ ] Có số phiên bản để nâng cấp dữ liệu lưu cũ (migration)
- [ ] Nút xóa tiến trình trong cài đặt
- **✅ Xong khi:** tải lại trang vẫn giữ sao, cài đặt, tên và màu.

#### P30 · Ping nhanh và chỉ dẫn
- [ ] Vòng ping: "Lại đây khiêng!", "Nâng lên!", "Buông ra!", "Bắt mèo!", "Mở cửa!"
- [ ] Ping lên món đồ: "Cần thêm N người!"
- [ ] Icon ping trên bản đồ, mũi tên chỉ hướng khi ping ở ngoài màn hình
- [ ] Màu + ký hiệu riêng, phân biệt được với người mù màu
- **✅ Xong khi:** nhóm 6 người không nói chuyện vẫn gom đủ người khiêng bàn bi-a chỉ bằng ping.

**Ghi chú playtest mốc E:**
_(ghi ở đây)_

---

### 🅵 Mốc F — Nội dung

#### P31 · 5 màn MVP (1 màn mỗi cấp) và 3 chủ nhà
- [ ] 🟢 Màn 1 – Căn hộ studio (kèm hướng dẫn chơi)
- [ ] 🔵 Màn 4 – Nhà phố 1 trệt
- [ ] 🟣 Màn 7 – Tiệm đồ cổ
- [ ] 🟠 Màn 12 – Quán bi-a
- [ ] 🔴 Màn 16 – Biệt thự người nổi tiếng
- [ ] 3 chủ nhà: bà cụ khó tính, ông chú đồ cổ, ngôi sao nổi tiếng; mỗi người ≥ 5 câu cho mỗi sự kiện, **cả tiếng Anh và tiếng Việt**
- [ ] Đặt mốc sao cho cả 5 màn
- **✅ Xong khi:** đạt toàn bộ checklist mục 15.

**🎯 MỐC MVP: có thể phát hành bản demo tại đây.**

#### P32 · Màn Solo và Đôi còn lại
- [ ] 🟢 Màn 2 – Phòng trọ sinh viên
- [ ] 🟢 Màn 3 – Nhà có mèo
- [ ] 🔵 Màn 5 – Ngày mưa (modifier `rain`)
- [ ] 🔵 Màn 6 – Nhà ống dài
- **✅ Xong khi:** mỗi màn được chơi thử ít nhất 2 lần, đạt 3 sao được nhưng không dễ.

#### P33 · Màn Đội còn lại
- [ ] 🟣 Màn 8 – Nhà 6 con mèo
- [ ] 🟣 Màn 9 – Nhà trên dốc (modifier `slope`)
- [ ] 🟣 Màn 10 – Chung cư không thang máy (modifier `stairs`)
- **✅ Xong khi:** test với đúng 4 người, mỗi màn qua được trong thời gian quy định.

#### P34 · Màn Đại đội và Full nhà còn lại
- [ ] 🟠 Màn 11 – Phòng gym
- [ ] 🟠 Màn 13 – Thủy cung tại gia
- [ ] 🟠 Màn 14 – Căn hộ minimalist (modifier `landlordChangesMind`)
- [ ] 🔴 Màn 15 – Bảo tàng tư nhân
- [ ] Modifier `paparazzi` cho màn 16
- **✅ Xong khi:** test với 6 và 8 người thật.

#### P35 · Co giãn theo số người (scaling)
- [ ] Thêm đồ theo `extraSpawnsPerPlayer`
- [ ] Đổi thời gian theo `timeDeltaPerPlayerSec`
- [ ] Đổi mốc sao theo `starsPerExtraPlayer`
- [ ] Thêm chỗ trong xe theo `truckSlotsPerPlayer`
- **✅ Xong khi:** màn 1 chơi với 1 người và với 8 người đều thấy vừa sức, không quá dễ.

#### P36 · Thêm 2 chủ nhà và bộ thoại
- [ ] Anh startup cuồng minimalism
- [ ] Chị chủ 6 con mèo
- [ ] Rà soát toàn bộ câu thoại cả hai ngôn ngữ (chính tả, độ hài, không lặp)
- **✅ Xong khi:** mỗi màn trong 16 màn có chủ nhà phù hợp.

**Ghi chú playtest mốc F:**
_(ghi ở đây)_

---

### 🅶 Mốc G — Hoàn thiện và phát hành

#### P37 · Âm thanh và hiệu ứng
- [ ] Hiệu ứng âm thanh: va chạm, vỡ kính, mèo kêu, xe tải, tiếng phím đàn khi va vào piano
- [ ] Nhạc nền menu và trong màn; nhạc dồn dập khi còn 60 giây
- [ ] Hiệu ứng hạt: bụi, mảnh vỡ, nước, đất
- [ ] Sprite và hoạt ảnh chính thức thay sprite tạm
- **✅ Xong khi:** tắt hình chỉ nghe tiếng vẫn đoán được chuyện gì đang xảy ra.

#### P38 · Tối ưu hiệu năng và mạng
- [ ] Cho vật đứng yên "ngủ" (sleeping), đơn giản hóa hình va chạm
- [ ] Gộp sprite (atlas), nén asset, lazy-load từng màn
- [ ] Giảm kích thước snapshot; đo lại băng thông
- **✅ Xong khi:** đạt toàn bộ mục tiêu ở mục 12 (FPS, băng thông, thời gian tải < 5 giây).

#### P39 · Cân bằng và playtest theo số người
- [ ] Playtest các nhóm 1, 2, 4, 6, 8 người, mỗi nhóm ít nhất 2 buổi
- [ ] Chỉnh `mass`, `friction`, `breakImpulse`, thời gian, mốc sao
- [ ] Ghi lại các điểm gây bực mình và sửa
- **✅ Xong khi:** mọi nhóm playtest đều muốn "chơi thêm một màn nữa".

#### P40 · Kiểm thử trình duyệt
- [ ] Chrome, Edge, Firefox, Safari (2 phiên bản mới nhất)
- [ ] Tay cầm Xbox, PlayStation, tay cầm thường
- [ ] Màn hình 1280×720, 1920×1080, 2560×1440
- [ ] Online giữa các trình duyệt khác nhau (vd. Safari ↔ Chrome)
- **✅ Xong khi:** không còn lỗi chặn chơi trên bất kỳ trình duyệt nào trong danh sách.

#### P41 · Phát hành
- [ ] Build production, deploy GitHub Pages và itch.io
- [ ] Trang giới thiệu: ảnh, GIF, hướng dẫn chơi, link mời bạn bè
- [ ] Changelog phiên bản 1.0
- **✅ Xong khi:** người lạ mở link, rủ bạn vào phòng và chơi được mà không cần hỏi gì.

**🏁 Hoàn thành dự án.**

**Ghi chú playtest mốc G:**
_(ghi ở đây)_

---

## 14. Rủi ro

| Rủi ro | Cách xử lý |
|---|---|
| Không kết nối P2P được (NAT, firewall) | Cấu hình TURN miễn phí; màn hình báo lỗi rõ ràng kèm hướng dẫn; luôn còn chế độ chơi chung máy |
| Dịch vụ signaling công cộng chập chờn | Trystero hỗ trợ nhiều kênh signaling (Nostr/torrent/MQTT); có PeerJS dự phòng; tên dịch vụ đặt trong `config.json` để đổi không cần sửa code |
| Máy host yếu, vật lý 8 người bị chậm | Giới hạn vật thể động, cho vật đứng yên "ngủ", hình va chạm đơn giản; lobby gợi ý máy mạnh nhất làm host |
| Lag làm khiêng đồ khó chịu | Dự đoán chuyển động nhân vật phía client; constraint mềm khi nắm đồ; nội suy |
| Host thoát giữa chừng | MVP: kết thúc màn và báo cho mọi người. Sau MVP: cân nhắc chuyển host |
| Màn 6–8 người khó tìm đủ người | Màn cấp 🟢🔵🟣 luôn đủ để chơi trọn; màn 🟠🔴 là nội dung "thưởng" cho nhóm đông; link mời dễ chia sẻ |
| Bàn phím không nhận nhiều phím cùng lúc (ghosting) | Bố cục phím hợp lý, khuyến khích tay cầm |
| Hỗn loạn quá với 8 người, không biết ai làm gì | Ping nhanh, bộ đếm `x/y 👐`, mũi tên chỉ hướng, màu và ký hiệu riêng |
| Phạm vi phình to | Khóa MVP như mục 15 trước khi làm thêm |

---

## 15. Định nghĩa hoàn thành MVP

- [ ] Mở link là chơi được ngay, không cần cài đặt
- [ ] Chơi chung máy 1–4 người (bàn phím + tay cầm)
- [ ] Chơi online tới **8 người** bằng mã phòng hoặc link mời, P2P qua WebRTC
- [ ] Cơ chế khiêng nhiều người: `requiredGrabbers` 1–8, `liftRule` `free`/`drag`/`strict`
- [ ] Màn bị khóa khi không đủ `minPlayers`, hiển thị rõ cần thêm bao nhiêu người
- [ ] Ít nhất 1 màn mỗi cấp (🟢🔵🟣🟠🔴), tức tối thiểu 5 màn; 10 loại đồ; 3 chủ nhà, toàn bộ lấy từ JSON
- [ ] Tủ lạnh trượt, gương vỡ, mèo chạy trốn, đồ 8 người hoạt động đúng cả khi chơi chung máy lẫn online
- [ ] Chủ nhà phản ứng bằng thoại theo sự kiện, mọi máy thấy cùng một câu
- [ ] Toàn bộ giao diện có tiếng Anh và tiếng Việt, đổi được trong menu (hệ thống i18n đã có; mọi màn hình mới phải dùng)
- [ ] Tính điểm, sao và lưu tiến trình bằng `localStorage`
- [ ] Không tự vận hành bất kỳ server nào; ngoài file tĩnh chỉ dùng signaling/STUN/TURN công cộng
