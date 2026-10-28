# -*- coding: utf-8 -*-
"""Thêm/cập nhật các màn MVP trong levels.json (P31) và kiểm tra nhanh vị trí đồ vật.

- Mốc sao tính từ giá trị đồ: 1★ ≈ đủ đồ bắt buộc + chủ nhà hài lòng vừa phải,
  3★ ≈ đồ bắt buộc + 60% đồ thêm + chủ nhà khá hài lòng. Chỉnh lại khi playtest (P39).
- Thùng xe 260×220: chỉ chứa được MỘT món cần 6–8 người (người khiêng phải vào được thùng),
  nên mỗi màn chỉ đặt một món khổng lồ.
- Báo lỗi nếu đồ vật / điểm xuất hiện đè lên tường hoặc nằm ngoài sàn.
Chạy: python tools/make-levels.py
"""
import json
import pathlib
import sys

DATA = pathlib.Path(__file__).resolve().parent.parent / "public/data"
ITEMS = {i["id"]: i for i in json.loads((DATA / "items.json").read_text(encoding="utf-8"))}


def spawns(required, optional):
    out = [{"item": i, "x": x, "y": y, "required": True} for i, x, y in required]
    out += [{"item": i, "x": x, "y": y, "required": False} for i, x, y in optional]
    return out


def yard(x0, y0, y1):
    """8 điểm xuất hiện ở sân: 2 cột × 2 hàng trên + 2 hàng dưới."""
    return [[x0, y0], [x0 + 50, y0], [x0, y0 + 50], [x0 + 50, y0 + 50],
            [x0, y1], [x0 + 50, y1], [x0, y1 + 50], [x0 + 50, y1 + 50]]


def round50(v):
    return int(round(v / 50.0) * 50)


def stars(level):
    req = sum(ITEMS[s["item"]]["value"] for s in level["spawns"] if s["required"])
    extra = sum(ITEMS[s["item"]]["value"] for s in level["spawns"] if not s["required"])
    mult = level["satisfactionMultiplier"]
    s1 = req + 200 + 40 * mult
    s3 = req + 0.6 * extra + 200 + 65 * mult
    s3 = max(s3, s1 + 400)
    return [round50(s1), round50((s1 + s3) / 2), round50(s3)]


LEVELS = [
    {
        "id": "lv04_townhouse",
        "name": {"en": "Ground-Floor Townhouse", "vi": "Nhà phố 1 trệt"},
        "tier": "duo", "minPlayers": 2, "maxPlayers": 8, "recommendedPlayers": 2,
        "unlockStars": 1, "timeLimitSec": 300, "map": "maps/townhouse.json",
        "landlord": "grandma",
        "truck": {"x": 1330, "y": 460, "slots": 24, "hasHandbrake": False, "facing": "left"},
        "spawns": spawns(
            [("sofa", 240, 760), ("fridge", 850, 700), ("box", 150, 120), ("box", 210, 120)],
            [("box", 150, 180), ("box", 210, 180), ("box", 400, 610), ("box", 600, 880),
             ("mirror", 500, 50), ("plant", 940, 80), ("plant", 60, 880), ("plant", 960, 890),
             ("teddy", 120, 470), ("fish_tank", 700, 300)],
        ),
        "playerSpawns": yard(1090, 250, 620),
        "modifiers": [], "satisfactionMultiplier": 6, "scaling": None,
    },
    {
        "id": "lv07_antique_shop",
        "name": {"en": "Antique Shop", "vi": "Tiệm đồ cổ"},
        "tier": "team", "minPlayers": 4, "maxPlayers": 8, "recommendedPlayers": 4,
        "unlockStars": 3, "timeLimitSec": 360, "map": "maps/antique_shop.json",
        "landlord": "collector",
        "truck": {"x": 1330, "y": 370, "slots": 28, "hasHandbrake": False, "facing": "left"},
        "spawns": spawns(
            [("upright_piano", 300, 760), ("mirror", 500, 50), ("teddy", 900, 500)],
            [("mirror", 280, 170), ("mirror", 720, 170), ("fish_tank", 500, 300),
             ("plant", 60, 520), ("plant", 950, 60), ("safe", 800, 820),
             ("box", 100, 640), ("box", 160, 640), ("box", 100, 700)],
        ),
        "playerSpawns": yard(1090, 180, 560),
        "modifiers": [], "satisfactionMultiplier": 8, "scaling": None,
    },
    {
        "id": "lv12_billiard_hall",
        "name": {"en": "Billiard Hall", "vi": "Quán bi-a"},
        "tier": "squad", "minPlayers": 6, "maxPlayers": 8, "recommendedPlayers": 6,
        "unlockStars": 5, "timeLimitSec": 420, "map": "maps/billiard_hall.json",
        "landlord": "collector",
        "truck": {"x": 1500, "y": 470, "slots": 36, "hasHandbrake": False, "facing": "left"},
        "spawns": spawns(
            [("pool_table", 500, 360), ("box", 100, 800), ("box", 160, 800)],
            [("box", 300, 800), ("box", 100, 860), ("fridge", 1100, 800), ("mirror", 800, 1040),
             ("plant", 60, 60), ("plant", 1140, 60), ("teddy", 1140, 650),
             ("fish_tank", 1000, 1000)],
        ),
        "playerSpawns": yard(1260, 250, 640),
        "modifiers": [], "satisfactionMultiplier": 10, "scaling": None,
    },
    {
        "id": "lv16_celebrity_villa",
        "name": {"en": "Celebrity Villa", "vi": "Biệt thự người nổi tiếng"},
        "tier": "full", "minPlayers": 8, "maxPlayers": 8, "recommendedPlayers": 8,
        "unlockStars": 7, "timeLimitSec": 480, "map": "maps/villa.json",
        "landlord": "celebrity",
        "truck": {"x": 1650, "y": 430, "slots": 40, "hasHandbrake": False, "facing": "left"},
        "spawns": spawns(
            [("grand_piano", 500, 380), ("mirror", 1000, 50), ("teddy", 1150, 1000)],
            [("fish_tank", 200, 100), ("fish_tank", 450, 980), ("mirror", 600, 1140),
             ("plant", 60, 720), ("plant", 1240, 720), ("sofa", 850, 660),
             ("mirror", 200, 1140), ("box", 1000, 900), ("box", 1060, 900)],
        ),
        "playerSpawns": yard(1400, 200, 620),
        "modifiers": [], "satisfactionMultiplier": 12, "scaling": None,
    },
]


def check(level):
    """Đồ vật không đè tường và nằm trên sàn."""
    m = json.loads((DATA / level["map"]).read_text(encoding="utf-8"))
    layers = {l["name"]: l["objects"] for l in m["layers"]}
    walls = layers["walls"]
    floors = layers["floors"]
    errors = []

    def overlaps(x, y, w, h, r):
        return x - w / 2 < r["x"] + r["width"] and x + w / 2 > r["x"] and \
            y - h / 2 < r["y"] + r["height"] and y + h / 2 > r["y"]

    def on_floor(x, y):
        return any(f["x"] <= x <= f["x"] + f["width"] and f["y"] <= y <= f["y"] + f["height"]
                   for f in floors)

    things = [(s["item"], s["x"], s["y"], ITEMS[s["item"]]["size"]) for s in level["spawns"]]
    things += [("player", x, y, {"w": 40, "h": 40}) for x, y in level["playerSpawns"]]
    for name, x, y, size in things:
        if any(overlaps(x, y, size["w"] + 4, size["h"] + 4, w) for w in walls):
            errors.append(f"{level['id']}: {name} ({x},{y}) đè tường")
        if not on_floor(x, y):
            errors.append(f"{level['id']}: {name} ({x},{y}) ngoài sàn")
    return errors


def main():
    path = DATA / "levels.json"
    levels = json.loads(path.read_text(encoding="utf-8"))
    by_id = {l["id"]: i for i, l in enumerate(levels)}
    errors = []
    for lv in LEVELS:
        lv = dict(lv)
        lv["stars"] = stars(lv)
        # Giữ đúng thứ tự trường như các màn có sẵn.
        order = ["id", "name", "tier", "minPlayers", "maxPlayers", "recommendedPlayers",
                 "unlockStars", "timeLimitSec", "map", "landlord", "truck", "spawns",
                 "playerSpawns", "modifiers", "stars", "satisfactionMultiplier", "scaling"]
        lv = {k: lv[k] for k in order}
        errors += check(lv)
        if lv["id"] in by_id:
            levels[by_id[lv["id"]]] = lv
        else:
            levels.append(lv)
        print(lv["id"], "stars", lv["stars"])
    errors += check(levels[0])
    path.write_text(json.dumps(levels, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    if errors:
        print("\n".join(errors))
        sys.exit(1)


if __name__ == "__main__":
    main()
