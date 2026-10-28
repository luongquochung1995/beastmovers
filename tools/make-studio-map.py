"""Sinh public/data/maps/studio.json (định dạng Tiled) cho màn "Căn hộ studio".

Mở được bằng Tiled để chỉnh tiếp; script này chỉ dùng để tạo bản đầu tiên.
"""
import json
import pathlib

TILE = 32
W, H = 50, 30  # 1600 × 960 px
next_id = 1


def obj(kind, x, y, w=0, h=0, point=False, ellipse=False, props=None, name=""):
    global next_id
    o = {"id": next_id, "name": name, "type": kind, "x": x, "y": y, "width": w, "height": h,
         "rotation": 0, "visible": True}
    if point:
        o["point"] = True
    if ellipse:
        o["ellipse"] = True
    if props:
        o["properties"] = [{"name": k, "type": t, "value": v} for k, t, v in props]
    next_id += 1
    return o


def layer(lid, name, objects):
    return {"id": lid, "name": name, "type": "objectgroup", "draworder": "topdown",
            "opacity": 1, "visible": True, "x": 0, "y": 0, "objects": objects}


floors = [
    obj("floor", 24, 24, 976, 576, name="Phòng khách", props=[("color", "string", "#3b3346")]),
    obj("floor", 24, 616, 416, 320, name="Phòng tắm", props=[("color", "string", "#2e4250")]),
    obj("floor", 456, 616, 544, 320, name="Bếp", props=[("color", "string", "#463f2e")]),
    obj("floor", 1024, 24, 552, 912, name="Sân",
        props=[("color", "string", "#2c3330"), ("outdoor", "bool", True)]),
    obj("floor", 1000, 380, 24, 100, name="Ngưỡng cửa", props=[("color", "string", "#3b3346")]),
    obj("floor", 280, 600, 100, 16, name="Lối phòng tắm", props=[("color", "string", "#3b3346")]),
    obj("floor", 600, 600, 140, 16, name="Lối vào bếp", props=[("color", "string", "#3b3346")]),
]
walls = [
    # Tường bao bản đồ
    obj("wall", 0, 0, 1600, 24), obj("wall", 0, 936, 1600, 24),
    obj("wall", 0, 24, 24, 912), obj("wall", 1576, 24, 24, 912),
    # Tường phải của nhà, chừa cửa chính y 380–480
    obj("wall", 1000, 24, 24, 356), obj("wall", 1000, 480, 24, 456),
    # Tường ngang giữa phòng khách và phòng tắm/bếp, chừa cửa tắm (280–380) và lối bếp (600–740)
    obj("wall", 24, 600, 256, 16), obj("wall", 380, 600, 220, 16), obj("wall", 740, 600, 260, 16),
    # Tường giữa phòng tắm và bếp
    obj("wall", 440, 616, 16, 320),
]
doors = [
    obj("door", 1004, 382, 16, 96, name="Cửa chính", props=[("hinge", "string", "start")]),
    obj("door", 282, 602, 96, 12, name="Cửa phòng tắm", props=[("hinge", "string", "start")]),
]
markers = [
    obj("hideSpot", 60, 320, point=True), obj("hideSpot", 520, 60, point=True),
    obj("hideSpot", 960, 240, point=True), obj("hideSpot", 240, 900, point=True),
    obj("hideSpot", 760, 900, point=True),
    obj("landlordPath", 500, 300, point=True, props=[("order", "int", 1)]),
    obj("landlordPath", 800, 180, point=True, props=[("order", "int", 2)]),
    obj("landlordPath", 940, 430, point=True, props=[("order", "int", 3)]),
    obj("landlordPath", 820, 520, point=True, props=[("order", "int", 4)]),
    obj("landlordPath", 670, 760, point=True, props=[("order", "int", 5)]),
    obj("landlordPath", 300, 450, point=True, props=[("order", "int", 6)]),
]
zones = []

m = {
    "type": "map", "version": "1.10", "tiledversion": "1.10.2", "orientation": "orthogonal",
    "renderorder": "right-down", "infinite": False, "compressionlevel": -1,
    "width": W, "height": H, "tilewidth": TILE, "tileheight": TILE,
    "nextlayerid": 6, "nextobjectid": next_id, "tilesets": [],
    "layers": [layer(1, "floors", floors), layer(2, "walls", walls), layer(3, "doors", doors),
               layer(4, "markers", markers), layer(5, "zones", zones)],
}
out = pathlib.Path(__file__).resolve().parent.parent / "public/data/maps/studio.json"
out.write_text(json.dumps(m, ensure_ascii=False, indent=2) + "\n")
print("wrote", out)
