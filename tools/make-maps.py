"""Sinh bản đồ (định dạng Tiled) cho các màn MVP: nhà phố, tiệm đồ cổ, quán bi-a, biệt thự.

Mở được bằng Tiled để chỉnh tiếp; script này chỉ dùng để tạo bản đầu tiên.
Chạy: python tools/make-maps.py
Quy ước: nhà nằm bên trái, sân + xe tải bên phải; người chơi xuất hiện ở sân.
Lối đi cho đồ cần nhiều người khiêng phải rộng hơn (món đồ + 2 người ≈ +90 px) và không có cửa.
"""
import json
import pathlib

TILE = 32
BORDER = 24
WALL = 16
OUT = pathlib.Path(__file__).resolve().parent.parent / "public/data/maps"


class Map:
    def __init__(self, w, h):
        self.w, self.h = w, h
        self.next_id = 1
        self.layers = {k: [] for k in ("floors", "walls", "doors", "markers", "zones", "stairs")}
        # Tường bao bản đồ
        self.wall(0, 0, w, BORDER)
        self.wall(0, h - BORDER, w, BORDER)
        self.wall(0, BORDER, BORDER, h - 2 * BORDER)
        self.wall(w - BORDER, BORDER, BORDER, h - 2 * BORDER)

    def obj(self, layer, kind, x, y, w=0, h=0, point=False, props=None, name=""):
        o = {"id": self.next_id, "name": name, "type": kind, "x": x, "y": y, "width": w,
             "height": h, "rotation": 0, "visible": True}
        if point:
            o["point"] = True
        if props:
            o["properties"] = [{"name": k, "type": t, "value": v} for k, t, v in props]
        self.next_id += 1
        self.layers[layer].append(o)
        return o

    def floor(self, name, x, y, w, h, color, outdoor=False):
        props = [("color", "string", color)]
        if outdoor:
            props.append(("outdoor", "bool", True))
        self.obj("floors", "floor", x, y, w, h, name=name, props=props)

    def yard(self, x, y, w, h):
        """Sân ngoài trời (modifier `rain` rải vũng nước ở đây)."""
        self.floor("Sân", x, y, w, h, YARD, outdoor=True)

    def wall(self, x, y, w, h):
        self.obj("walls", "wall", x, y, w, h)

    def hwall(self, y, x0, x1, gaps=()):
        """Tường ngang từ x0 tới x1, chừa các khoảng (a, b)."""
        x = x0
        for a, b in sorted(gaps):
            if a > x:
                self.wall(x, y, a - x, WALL)
            x = b
        if x1 > x:
            self.wall(x, y, x1 - x, WALL)

    def vwall(self, x, y0, y1, gaps=(), t=WALL):
        y = y0
        for a, b in sorted(gaps):
            if a > y:
                self.wall(x, y, t, a - y)
            y = b
        if y1 > y:
            self.wall(x, y, t, y1 - y)

    def stairs(self, x, y, w, h):
        self.obj("stairs", "stairs", x, y, w, h)

    def door(self, name, x, y, w, h, hinge="start"):
        self.obj("doors", "door", x, y, w, h, name=name, props=[("hinge", "string", hinge)])

    def hide(self, x, y):
        self.obj("markers", "hideSpot", x, y, point=True)

    def path(self, *pts):
        for i, (x, y) in enumerate(pts, 1):
            self.obj("markers", "landlordPath", x, y, point=True, props=[("order", "int", i)])

    def save(self, file):
        names = ["floors", "walls", "doors", "markers", "zones", "stairs"]
        m = {
            "type": "map", "version": "1.10", "tiledversion": "1.10.2",
            "orientation": "orthogonal", "renderorder": "right-down", "infinite": False,
            "compressionlevel": -1, "width": self.w // TILE, "height": self.h // TILE,
            "tilewidth": TILE, "tileheight": TILE, "nextlayerid": len(names) + 1,
            "nextobjectid": self.next_id, "tilesets": [],
            "layers": [{"id": i + 1, "name": n, "type": "objectgroup", "draworder": "topdown",
                        "opacity": 1, "visible": True, "x": 0, "y": 0,
                        "objects": self.layers[n]} for i, n in enumerate(names)],
        }
        out = OUT / file
        out.write_text(json.dumps(m, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print("wrote", out)


YARD = "#2c3330"


def townhouse():
    """Màn 4 – Nhà phố 1 trệt: cửa phòng ngủ 100 px, sofa dài 130 px phải xoay mới qua.

    Cửa bếp 150 px, cửa chính 160 px: tủ lạnh + 2 người khiêng hai bên (~136 px) đi thẳng qua được.
    """
    m = Map(1600, 960)
    m.floor("Phòng khách", 24, 24, 976, 496, "#3b3346")
    m.floor("Phòng ngủ", 24, 536, 456, 400, "#33384a")
    m.floor("Bếp", 496, 536, 504, 400, "#463f2e")
    m.yard(1024, 24, 552, 912)
    m.floor("Ngưỡng cửa", 1000, 380, 24, 160, "#3b3346")
    m.floor("Lối phòng ngủ", 200, 520, 100, 16, "#3b3346")
    m.floor("Lối bếp", 680, 520, 150, 16, "#3b3346")
    m.vwall(1000, 24, 936, gaps=[(380, 540)], t=24)
    m.hwall(520, 24, 1000, gaps=[(200, 300), (680, 830)])
    m.vwall(480, 536, 936)
    m.door("Cửa chính", 1004, 382, 16, 156)
    m.door("Cửa phòng ngủ", 202, 522, 96, 12)
    m.door("Cửa bếp", 682, 522, 146, 12, hinge="end")
    for p in [(60, 60), (940, 60), (60, 900), (900, 900), (440, 300)]:
        m.hide(*p)
    m.path((500, 280), (860, 160), (940, 460), (750, 420), (300, 420), (160, 200))
    m.save("townhouse.json")


def antique_shop():
    """Màn 7 – Tiệm đồ cổ: phòng trưng bày đầy đồ dễ vỡ, piano ở kho phía sau."""
    m = Map(1600, 960)
    m.floor("Phòng trưng bày", 24, 24, 976, 536, "#4a3a32")
    m.floor("Kho", 24, 576, 976, 360, "#3a3530")
    m.yard(1024, 24, 552, 912)
    m.floor("Cửa tiệm", 1000, 260, 24, 220, "#4a3a32")
    m.floor("Vòm kho", 400, 560, 220, 16, "#4a3a32")
    m.vwall(1000, 24, 936, gaps=[(260, 480)], t=24)
    m.hwall(560, 24, 1000, gaps=[(400, 620)])
    # Kệ trưng bày giữa phòng (tường thấp) chia lối đi.
    m.wall(200, 200, 160, 24)
    m.wall(640, 200, 160, 24)
    for p in [(60, 60), (940, 80), (60, 900), (940, 900)]:
        m.hide(*p)
    m.path((500, 120), (880, 140), (900, 400), (500, 420), (150, 420), (150, 120))
    m.save("antique_shop.json")


def billiard_hall():
    """Màn 12 – Quán bi-a: bàn bi-a 6 người, lối ra rộng 340 px, quầy bar và kho."""
    m = Map(1800, 1100)
    m.floor("Sảnh bi-a", 24, 24, 1156, 676, "#2f4436")
    m.floor("Kho", 24, 716, 560, 360, "#3a3530")
    m.floor("Quầy bar", 600, 716, 580, 360, "#463a2e")
    m.yard(1204, 24, 572, 1052)
    m.floor("Cửa quán", 1180, 300, 24, 340, "#2f4436")
    m.floor("Lối kho", 200, 700, 240, 16, "#2f4436")
    m.floor("Lối bar", 760, 700, 200, 16, "#2f4436")
    m.vwall(1180, 24, 1076, gaps=[(300, 640)], t=24)
    m.hwall(700, 24, 1180, gaps=[(200, 440), (760, 960)])
    m.vwall(584, 716, 1076)
    # Quầy bar
    m.wall(640, 900, 380, 24)
    for p in [(60, 60), (1120, 60), (60, 1040), (1120, 1040), (560, 60)]:
        m.hide(*p)
    m.path((300, 140), (900, 140), (1100, 470), (900, 620), (300, 620), (120, 380))
    m.save("billiard_hall.json")


def villa():
    """Màn 16 – Biệt thự: đại sảnh có grand piano (8 người), phòng tranh có tượng."""
    m = Map(2000, 1200)
    m.floor("Đại sảnh", 24, 24, 1276, 736, "#4a4258")
    m.floor("Phòng tranh", 24, 776, 900, 400, "#3d4052")
    m.floor("Phòng ngủ", 940, 776, 360, 400, "#4b3846")
    m.yard(1324, 24, 652, 1152)
    m.floor("Cửa lớn", 1300, 250, 24, 360, "#4a4258")
    m.floor("Lối phòng tranh", 300, 760, 340, 16, "#4a4258")
    m.floor("Lối phòng ngủ", 1060, 760, 120, 16, "#4a4258")
    m.vwall(1300, 24, 1176, gaps=[(250, 610)], t=24)
    m.hwall(760, 24, 1300, gaps=[(300, 640), (1060, 1180)])
    m.vwall(924, 776, 1176)
    m.door("Cửa phòng ngủ", 1062, 762, 116, 12)
    for p in [(60, 60), (1240, 60), (60, 1140), (880, 1140), (1260, 1140)]:
        m.hide(*p)
    m.path((300, 160), (1100, 160), (1200, 430), (900, 680), (400, 680), (120, 420))
    m.save("villa.json")


def student_room():
    """Màn 2 – Phòng trọ sinh viên: hành lang dài, 3 phòng nhỏ cửa 90 px, gương dễ vỡ."""
    m = Map(1600, 960)
    m.floor("Hành lang", 24, 24, 976, 176, "#3d3a48")
    m.floor("Phòng A", 24, 216, 306, 720, "#3a3346")
    m.floor("Phòng B", 346, 216, 314, 720, "#33384a")
    m.floor("Phòng C", 676, 216, 324, 720, "#3b3a33")
    m.yard(1024, 24, 552, 912)
    m.floor("Cổng", 1000, 60, 24, 130, "#3d3a48")
    for a, b in [(130, 220), (450, 540), (790, 880)]:
        m.floor("Cửa phòng", a, 200, b - a, 16, "#3d3a48")
    m.vwall(1000, 24, 936, gaps=[(60, 190)], t=24)
    m.hwall(200, 24, 1000, gaps=[(130, 220), (450, 540), (790, 880)])
    m.vwall(330, 216, 936)
    m.vwall(660, 216, 936)
    m.door("Cổng", 1004, 62, 16, 126)
    m.door("Cửa phòng A", 132, 202, 86, 12)
    m.door("Cửa phòng B", 452, 202, 86, 12, hinge="end")
    m.door("Cửa phòng C", 792, 202, 86, 12)
    for p in [(60, 400), (300, 900), (380, 400), (630, 900), (720, 400), (960, 900)]:
        m.hide(*p)
    m.path((200, 110), (600, 110), (940, 110), (600, 140), (180, 400))
    m.save("student_room.json")


def cat_house():
    """Màn 3 – Nhà có mèo: nhiều phòng, nhiều chỗ nấp cho mèo."""
    m = Map(1600, 960)
    m.floor("Phòng khách", 24, 24, 676, 496, "#3b3346")
    m.floor("Phòng ngủ", 716, 24, 284, 496, "#33384a")
    m.floor("Phòng làm việc", 24, 536, 476, 400, "#3a3a46")
    m.floor("Bếp", 516, 536, 484, 400, "#463f2e")
    m.yard(1024, 24, 552, 912)
    m.floor("Ngưỡng cửa", 1000, 380, 24, 120, "#3b3346")
    m.floor("Lối phòng ngủ", 700, 200, 16, 100, "#3b3346")
    m.floor("Lối phòng làm việc", 150, 520, 100, 16, "#3b3346")
    m.floor("Lối bếp", 700, 520, 100, 16, "#3b3346")
    m.vwall(1000, 24, 936, gaps=[(380, 500)], t=24)
    m.vwall(700, 24, 520, gaps=[(200, 300)])
    m.hwall(520, 24, 1000, gaps=[(150, 250), (700, 800)])
    m.vwall(500, 536, 936)
    m.door("Cửa chính", 1004, 382, 16, 116)
    # Chỗ nấp: gầm giường, sau sofa, dưới bàn… (không đặt ở góc phòng — ngõ cụt).
    for p in [(350, 120), (150, 300), (600, 420), (860, 120), (860, 440), (300, 700),
              (120, 860), (650, 640), (900, 860)]:
        m.hide(*p)
    m.path((350, 260), (600, 120), (850, 300), (940, 440), (750, 700), (300, 760), (300, 420))
    m.save("cat_house.json")


def rainy_house():
    """Màn 5 – Ngày mưa: nhà nhỏ, sân rộng và trơn, xe tải ở góc xa."""
    m = Map(1600, 960)
    m.floor("Phòng khách", 24, 24, 676, 576, "#3b3346")
    m.floor("Bếp", 24, 616, 676, 320, "#463f2e")
    m.yard(724, 24, 852, 912)
    m.floor("Ngưỡng cửa", 700, 400, 24, 160, "#3b3346")
    m.floor("Lối bếp", 300, 600, 150, 16, "#3b3346")
    m.vwall(700, 24, 936, gaps=[(400, 560)], t=24)
    m.hwall(600, 24, 700, gaps=[(300, 450)])
    m.door("Cửa chính", 704, 402, 16, 156)
    # Mái hiên che mưa trước cửa (tường thấp) để có chỗ khô.
    m.wall(760, 330, 120, 16)
    m.wall(760, 614, 120, 16)
    for p in [(60, 300), (640, 60), (400, 880), (120, 880)]:
        m.hide(*p)
    m.path((200, 150), (600, 150), (620, 480), (350, 480), (350, 780), (150, 780))
    m.save("rainy_house.json")


def tube_house():
    """Màn 6 – Nhà ống dài: 4 gian nối nhau, cửa giữa các gian 150 px; chuyền tay đồ ra trước."""
    m = Map(2560, 704)
    rooms = [("Bếp", 24, 476, "#463f2e"), ("Phòng ngủ", 516, 484, "#33384a"),
             ("Phòng khách", 1016, 484, "#3b3346"), ("Gian trước", 1516, 484, "#3d3a48")]
    for name, x, w, color in rooms:
        m.floor(name, x, 24, w, 656, color)
    m.yard(2024, 24, 512, 656)
    for x in (500, 1000, 1500):
        m.floor("Lối", x, 260, 16, 150, "#3d3a48")
        m.vwall(x, 24, 680, gaps=[(260, 410)])
    m.floor("Cửa trước", 2000, 250, 24, 180, "#3d3a48")
    m.vwall(2000, 24, 680, gaps=[(250, 430)], t=24)
    for p in [(250, 600), (760, 80), (1250, 600), (1760, 80)]:
        m.hide(*p)
    m.path((250, 340), (760, 340), (1260, 340), (1760, 340), (1260, 200), (760, 500))
    m.save("tube_house.json")


def six_cats():
    """Màn 8 – Nhà 6 con mèo: 6 phòng có cửa (mèo đẩy cửa chạy qua), két sắt 4 người."""
    m = Map(1800, 1100)
    names = [("Phòng khách", "#3b3346"), ("Phòng mèo", "#4a3a46"), ("Phòng ngủ", "#33384a"),
             ("Phòng đọc", "#3a3a46"), ("Bếp", "#463f2e"), ("Kho", "#3a3530")]
    for i, (name, color) in enumerate(names):
        x = 24 + (i % 3) * 400
        y = 24 if i < 3 else 556
        m.floor(name, x, y, 376 if i % 3 < 2 else 376, 516 if i < 3 else 520, color)
    m.yard(1224, 24, 552, 1052)
    # Tường dọc giữa các phòng: cửa có cánh 110 px; lối giữa phòng khách và phòng mèo rộng 170
    # (đường khiêng két sắt), lối phòng mèo → phòng ngủ cũng 170.
    m.vwall(400, 24, 1076, gaps=[(200, 370), (760, 870)])
    m.vwall(800, 24, 1076, gaps=[(200, 370), (760, 870)])
    m.hwall(540, 24, 1200, gaps=[(150, 260), (550, 660), (950, 1060)])
    m.vwall(1200, 24, 1076, gaps=[(250, 430), (760, 870)], t=24)
    for a, b in [(150, 260), (550, 660), (950, 1060)]:
        m.floor("Lối", a, 540, b - a, 16, "#3b3346")
    for x in (400, 800):
        m.floor("Lối", x, 200, 16, 170, "#3b3346")
        m.floor("Lối", x, 760, 16, 110, "#3b3346")
    m.floor("Cửa chính", 1200, 250, 24, 180, "#3b3346")
    m.floor("Cửa sau", 1200, 760, 24, 110, "#3b3346")
    m.door("Cửa P1–P4", 152, 542, 106, 12)
    m.door("Cửa P2–P5", 552, 542, 106, 12, hinge="end")
    m.door("Cửa P3–P6", 952, 542, 106, 12)
    m.door("Cửa P4–P5", 402, 762, 12, 106)
    m.door("Cửa P5–P6", 802, 762, 12, 106, hinge="end")
    m.door("Cửa sau", 1204, 762, 16, 106)
    for p in [(200, 120), (330, 450), (600, 100), (520, 440), (1000, 120), (1120, 460),
              (120, 700), (300, 1000), (620, 650), (700, 1000), (1000, 700), (1120, 1000)]:
        m.hide(*p)
    m.path((200, 300), (600, 300), (1000, 300), (1000, 820), (600, 820), (200, 820))
    m.save("six_cats.json")


def slope_house():
    """Màn 9 – Nhà trên dốc: lối ra rộng 240 px xuống sân dốc; xe tải có phanh tay."""
    m = Map(1800, 1100)
    m.floor("Phòng khách", 24, 24, 700, 576, "#3b3346")
    m.floor("Phòng ngủ", 740, 24, 360, 576, "#33384a")
    m.floor("Hiên", 400, 600, 240, 16, "#3b3346")
    m.floor("Lối", 724, 120, 16, 240, "#3b3346")
    m.yard(24, 616, 1752, 460)
    m.floor("Sân bên", 1116, 24, 660, 592, YARD, outdoor=True)
    m.hwall(600, 24, 1100, gaps=[(400, 640)])
    m.vwall(724, 24, 600, gaps=[(120, 360)])
    m.vwall(1100, 24, 616)
    for p in [(60, 300), (680, 60), (1060, 560), (900, 300)]:
        m.hide(*p)
    m.path((200, 150), (600, 150), (900, 200), (900, 500), (500, 500), (200, 450))
    m.save("slope_house.json")


def walkup():
    """Màn 10 – Chung cư không thang máy: căn hộ trên lầu, 2 đoạn cầu thang hẹp có góc rẽ."""
    m = Map(1856, 1100)
    m.floor("Căn hộ", 24, 24, 976, 496, "#3b3346")
    m.floor("Chiếu nghỉ", 500, 860, 170, 216, "#4a4458")
    m.floor("Sảnh", 1200, 500, 200, 576, "#3d3a48")
    m.yard(1424, 24, 408, 1052)
    m.floor("Cửa căn hộ", 500, 520, 170, 16, "#3b3346")
    m.floor("Cổng", 1400, 760, 24, 200, "#3d3a48")
    m.stairs(500, 536, 170, 324)   # đoạn 1: đi xuống
    m.stairs(670, 876, 530, 200)   # đoạn 2: rẽ phải ra sảnh
    m.hwall(520, 24, 1016, gaps=[(500, 670)])
    m.vwall(1000, 24, 520)
    m.vwall(484, 536, 1076)
    m.vwall(670, 536, 860)
    m.hwall(860, 686, 1200)
    m.wall(24, 536, 460, 540)       # khối nhà bên dưới (không vào được)
    m.wall(1016, 24, 384, 460)
    m.wall(1016, 484, 184, 376)
    m.wall(686, 536, 330, 324)     # giữa hai đoạn cầu thang
    m.hwall(484, 1200, 1400)
    m.vwall(1400, 24, 1076, gaps=[(760, 960)], t=24)
    m.door("Cửa căn hộ", 502, 522, 166, 12)
    for p in [(60, 300), (940, 60), (900, 460)]:
        m.hide(*p)
    m.path((200, 150), (800, 150), (900, 450), (580, 450), (200, 400))
    m.save("walkup.json")


if __name__ == "__main__":
    townhouse()
    antique_shop()
    billiard_hall()
    villa()
    student_room()
    cat_house()
    rainy_house()
    tube_house()
    six_cats()
    slope_house()
    walkup()
