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
        "id": "lv11_gym",
        "name": {"en": "The Gym", "vi": "Phòng gym"},
        "tier": "squad", "minPlayers": 6, "maxPlayers": 8, "recommendedPlayers": 6,
        "unlockStars": 11, "timeLimitSec": 420, "map": "maps/gym.json",
        "landlord": "collector",
        "truck": {"x": 1500, "y": 390, "slots": 32, "hasHandbrake": False, "facing": "left"},
        "spawns": spawns(
            [("weight_rack", 500, 400), ("mirror", 600, 50), ("box", 100, 800), ("box", 160, 800)],
            [("treadmill", 300, 150), ("treadmill", 800, 150), ("dumbbell", 900, 500),
             ("dumbbell", 940, 500), ("dumbbell", 980, 500), ("dumbbell", 1020, 500),
             ("box", 220, 800), ("plant", 1120, 650), ("plant", 60, 650)],
        ),
        "playerSpawns": yard(1290, 600, 880),
        "modifiers": [], "satisfactionMultiplier": 10, "scaling": None,
    },
    {
        "id": "lv13_home_aquarium",
        "name": {"en": "Home Aquarium", "vi": "Thủy cung tại gia"},
        "tier": "squad", "minPlayers": 6, "maxPlayers": 8, "recommendedPlayers": 6,
        "unlockStars": 13, "timeLimitSec": 420, "map": "maps/home_aquarium.json",
        "landlord": "celebrity",
        "truck": {"x": 1500, "y": 380, "slots": 32, "hasHandbrake": False, "facing": "left"},
        "spawns": spawns(
            [("giant_aquarium", 500, 380), ("fish_tank", 200, 150), ("teddy", 900, 950)],
            [("fish_tank", 800, 150), ("fish_tank", 1000, 600), ("plant", 60, 650),
             ("plant", 1120, 650), ("mirror", 1000, 1040), ("box", 100, 800), ("box", 160, 800),
             ("sofa", 700, 950)],
        ),
        "playerSpawns": yard(1290, 600, 880),
        "modifiers": [], "satisfactionMultiplier": 10, "scaling": None,
    },
    {
        "id": "lv14_minimalist",
        "name": {"en": "Minimalist Apartment", "vi": "Căn hộ minimalist"},
        "tier": "squad", "minPlayers": 6, "maxPlayers": 8, "recommendedPlayers": 6,
        "unlockStars": 15, "timeLimitSec": 420, "map": "maps/minimalist.json",
        "landlord": "celebrity",
        "truck": {"x": 1500, "y": 470, "slots": 32, "hasHandbrake": False, "facing": "left"},
        "spawns": spawns(
            [("pool_table", 400, 400), ("plant", 100, 100), ("mirror", 800, 50)],
            [("box", 900, 900), ("box", 960, 900), ("box", 1020, 900), ("teddy", 300, 1000),
             ("plant", 1100, 100), ("sofa", 850, 600), ("fish_tank", 200, 900)],
        ),
        "playerSpawns": yard(1290, 700, 920),
        "modifiers": ["landlordChangesMind"], "satisfactionMultiplier": 10, "scaling": None,
    },
    {
        "id": "lv15_museum",
        "name": {"en": "Private Museum", "vi": "Bảo tàng tư nhân"},
        "tier": "full", "minPlayers": 8, "maxPlayers": 8, "recommendedPlayers": 8,
        "unlockStars": 18, "timeLimitSec": 480, "map": "maps/museum.json",
        "landlord": "collector",
        "truck": {"x": 1500, "y": 320, "slots": 36, "hasHandbrake": False, "facing": "left"},
        "spawns": spawns(
            [("statue", 500, 900), ("mirror", 280, 120), ("mirror", 880, 120)],
            [("mirror", 600, 600), ("mirror", 1000, 1040), ("plant", 60, 650),
             ("plant", 1120, 650), ("teddy", 1100, 900), ("fish_tank", 200, 900),
             ("box", 600, 400), ("box", 660, 400)],
        ),
        "playerSpawns": yard(1290, 560, 880),
        "modifiers": [], "satisfactionMultiplier": 12, "scaling": None,
    },
    {
        "id": "lv08_six_cats",
        "name": {"en": "House of Six Cats", "vi": "Nhà 6 con mèo"},
        "tier": "team", "minPlayers": 4, "maxPlayers": 8, "recommendedPlayers": 4,
        "unlockStars": 7, "timeLimitSec": 420, "map": "maps/six_cats.json",
        "landlord": "grandma",
        "truck": {"x": 1500, "y": 340, "slots": 30, "hasHandbrake": False, "facing": "left"},
        "spawns": spawns(
            [("safe", 600, 300), ("cat", 200, 700), ("cat", 600, 820), ("cat", 1000, 300)],
            [("cat", 200, 250), ("cat", 1000, 820), ("cat", 620, 1000),
             ("cat_carrier", 1300, 700), ("cat_carrier", 1360, 700),
             ("cat_carrier", 1300, 760), ("cat_carrier", 1360, 760),
             ("box", 100, 950), ("box", 160, 950), ("box", 700, 620), ("teddy", 1100, 1000),
             ("plant", 60, 60), ("mirror", 950, 50)],
        ),
        "playerSpawns": yard(1290, 520, 880),
        "modifiers": [], "satisfactionMultiplier": 8, "scaling": None,
    },
    {
        "id": "lv09_slope_house",
        "name": {"en": "House on a Hill", "vi": "Nhà trên dốc"},
        "tier": "team", "minPlayers": 4, "maxPlayers": 8, "recommendedPlayers": 4,
        "unlockStars": 8, "timeLimitSec": 360, "map": "maps/slope_house.json",
        "landlord": "collector",
        "truck": {"x": 1300, "y": 850, "slots": 28, "hasHandbrake": True, "facing": "left"},
        "spawns": spawns(
            [("upright_piano", 400, 300), ("box", 100, 100), ("box", 160, 100), ("teddy", 900, 500)],
            [("mirror", 300, 50), ("plant", 680, 560), ("fish_tank", 900, 200), ("box", 1000, 100),
             ("box", 100, 160), ("plant", 60, 560)],
        ),
        "playerSpawns": yard(1600, 680, 900),
        "modifiers": ["slope"], "satisfactionMultiplier": 8, "scaling": None,
    },
    {
        "id": "lv10_walkup",
        "name": {"en": "Walk-up Apartment", "vi": "Chung cư không thang máy"},
        "tier": "team", "minPlayers": 4, "maxPlayers": 8, "recommendedPlayers": 4,
        "unlockStars": 9, "timeLimitSec": 420, "map": "maps/walkup.json",
        "landlord": "grandma",
        "truck": {"x": 1600, "y": 860, "slots": 28, "hasHandbrake": False, "facing": "left"},
        "spawns": spawns(
            [("safe", 200, 300), ("box", 100, 100), ("box", 160, 100), ("mirror", 900, 60)],
            [("teddy", 950, 450), ("plant", 60, 480), ("fish_tank", 600, 300), ("box", 700, 100),
             ("box", 760, 100), ("mirror", 400, 50)],
        ),
        "playerSpawns": yard(1480, 120, 450),
        "modifiers": ["stairs"], "satisfactionMultiplier": 8, "scaling": None,
    },
    {
        "id": "lv02_student_room",
        "name": {"en": "Student Boarding House", "vi": "Phòng trọ sinh viên"},
        "tier": "solo", "minPlayers": 1, "maxPlayers": 8, "recommendedPlayers": 2,
        "unlockStars": 1, "timeLimitSec": 240, "map": "maps/student_room.json",
        "landlord": "grandma",
        "truck": {"x": 1330, "y": 300, "slots": 20, "hasHandbrake": False, "facing": "left"},
        "spawns": spawns(
            [("mirror", 180, 480), ("box", 100, 800), ("box", 500, 700), ("teddy", 600, 880)],
            [("mirror", 840, 600), ("box", 160, 800), ("box", 750, 800), ("box", 560, 700),
             ("plant", 280, 260), ("plant", 950, 300), ("fish_tank", 420, 400),
             ("book", 400, 880), ("book", 900, 880)],
        ),
        "playerSpawns": yard(1090, 520, 760),
        "modifiers": [], "satisfactionMultiplier": 5, "scaling": None,
    },
    {
        "id": "lv03_cat_house",
        "name": {"en": "House with a Cat", "vi": "Nhà có mèo"},
        "tier": "solo", "minPlayers": 1, "maxPlayers": 8, "recommendedPlayers": 2,
        "unlockStars": 2, "timeLimitSec": 300, "map": "maps/cat_house.json",
        "landlord": "grandma",
        "truck": {"x": 1330, "y": 640, "slots": 20, "hasHandbrake": False, "facing": "left"},
        "spawns": spawns(
            [("cat", 300, 300), ("teddy", 120, 880), ("box", 850, 100), ("box", 900, 100)],
            [("cat", 850, 700), ("cat_carrier", 1150, 380), ("cat_carrier", 1210, 380),
             ("box", 850, 160), ("plant", 640, 60), ("plant", 60, 600), ("mirror", 300, 50),
             ("fish_tank", 750, 880)],
        ),
        "playerSpawns": yard(1090, 120, 860),
        "modifiers": [], "satisfactionMultiplier": 5, "scaling": None,
    },
    {
        "id": "lv05_rainy_day",
        "name": {"en": "Rainy Day", "vi": "Ngày mưa"},
        "tier": "duo", "minPlayers": 2, "maxPlayers": 8, "recommendedPlayers": 2,
        "unlockStars": 4, "timeLimitSec": 300, "map": "maps/rainy_house.json",
        "landlord": "grandma",
        "truck": {"x": 1340, "y": 760, "slots": 24, "hasHandbrake": False, "facing": "left"},
        "spawns": spawns(
            [("fridge", 400, 300), ("sofa", 200, 480), ("box", 100, 700), ("box", 160, 700)],
            [("box", 100, 760), ("box", 160, 760), ("plant", 640, 560), ("plant", 60, 60),
             ("mirror", 350, 50), ("teddy", 600, 880), ("fish_tank", 500, 700)],
        ),
        "playerSpawns": yard(800, 120, 700),
        "modifiers": ["rain"], "satisfactionMultiplier": 6, "scaling": None,
    },
    {
        "id": "lv06_tube_house",
        "name": {"en": "Long Tube House", "vi": "Nhà ống dài"},
        "tier": "duo", "minPlayers": 2, "maxPlayers": 8, "recommendedPlayers": 3,
        "unlockStars": 5, "timeLimitSec": 360, "map": "maps/tube_house.json",
        "landlord": "collector",
        "truck": {"x": 2300, "y": 340, "slots": 28, "hasHandbrake": False, "facing": "left"},
        "spawns": spawns(
            [("fridge", 250, 340), ("sofa", 750, 120), ("box", 100, 560), ("box", 160, 560),
             ("box", 100, 620), ("mirror", 1250, 60)],
            [("treadmill", 1250, 560), ("box", 160, 620), ("plant", 60, 60), ("plant", 1960, 60),
             ("teddy", 760, 620), ("fish_tank", 1760, 600), ("book", 1300, 340),
             ("mirror", 1760, 60)],
        ),
        "playerSpawns": yard(2100, 80, 560),
        "modifiers": [], "satisfactionMultiplier": 6, "scaling": None,
    },
    {
        "id": "lv04_townhouse",
        "name": {"en": "Ground-Floor Townhouse", "vi": "Nhà phố 1 trệt"},
        "tier": "duo", "minPlayers": 2, "maxPlayers": 8, "recommendedPlayers": 2,
        "unlockStars": 3, "timeLimitSec": 300, "map": "maps/townhouse.json",
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
        "unlockStars": 6, "timeLimitSec": 360, "map": "maps/antique_shop.json",
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
        "unlockStars": 12, "timeLimitSec": 420, "map": "maps/billiard_hall.json",
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
        "unlockStars": 20, "timeLimitSec": 480, "map": "maps/villa.json",
        "landlord": "celebrity",
        "truck": {"x": 1650, "y": 430, "slots": 40, "hasHandbrake": False, "facing": "left"},
        "spawns": spawns(
            [("grand_piano", 500, 380), ("mirror", 1000, 50), ("teddy", 1150, 1000)],
            [("fish_tank", 200, 100), ("fish_tank", 450, 980), ("mirror", 600, 1140),
             ("plant", 60, 720), ("plant", 1240, 720), ("sofa", 850, 660),
             ("mirror", 200, 1140), ("box", 1000, 900), ("box", 1060, 900)],
        ),
        "playerSpawns": yard(1400, 200, 620),
        "modifiers": ["paparazzi"], "satisfactionMultiplier": 12, "scaling": None,
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
    # Thứ tự trong file = số thứ tự màn (lv01, lv02, …).
    levels.sort(key=lambda l: l["id"])
    path.write_text(json.dumps(levels, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    if errors:
        print("\n".join(errors))
        sys.exit(1)


if __name__ == "__main__":
    main()
