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
        self.layers = {k: [] for k in ("floors", "walls", "doors", "markers", "zones")}
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

    def floor(self, name, x, y, w, h, color):
        self.obj("floors", "floor", x, y, w, h, name=name, props=[("color", "string", color)])

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

    def door(self, name, x, y, w, h, hinge="start"):
        self.obj("doors", "door", x, y, w, h, name=name, props=[("hinge", "string", hinge)])

    def hide(self, x, y):
        self.obj("markers", "hideSpot", x, y, point=True)

    def path(self, *pts):
        for i, (x, y) in enumerate(pts, 1):
            self.obj("markers", "landlordPath", x, y, point=True, props=[("order", "int", i)])

    def save(self, file):
        names = ["floors", "walls", "doors", "markers", "zones"]
        m = {
            "type": "map", "version": "1.10", "tiledversion": "1.10.2",
            "orientation": "orthogonal", "renderorder": "right-down", "infinite": False,
            "compressionlevel": -1, "width": self.w // TILE, "height": self.h // TILE,
            "tilewidth": TILE, "tileheight": TILE, "nextlayerid": 6,
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
    m.floor("Sân", 1024, 24, 552, 912, YARD)
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
    m.floor("Sân", 1024, 24, 552, 912, YARD)
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
    m.floor("Sân", 1204, 24, 572, 1052, YARD)
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
    m.floor("Sân", 1324, 24, 652, 1152, YARD)
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


if __name__ == "__main__":
    townhouse()
    antique_shop()
    billiard_hall()
    villa()
