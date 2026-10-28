# -*- coding: utf-8 -*-
"""Thêm chủ nhà vào landlords.json + lines.*.json: "ông chú đồ cổ", "ngôi sao" (P31),
"anh startup", "chị chủ 6 con mèo" (P36, trong landlords_p36.py). Chạy lại nhiều lần được.

Câu thứ i của tiếng Anh và tiếng Việt là cùng một câu (online chỉ gửi số thứ tự), nhưng
mỗi bên viết lại cho hài theo ngôn ngữ của mình chứ không dịch từng chữ.
"""
import json
import pathlib

import landlords_p36 as p36

DATA = pathlib.Path(__file__).resolve().parent.parent / "public/data"

LANDLORDS = [
    {
        "id": "collector",
        "name": {"en": "Uncle Bay", "vi": "Chú Bảy"},
        "icon": "🧐",
        "color": "#a1887f",
        "voicePitch": 0.85,
        "startSatisfaction": 45,
        "sensitivity": {
            "itemBroken": -20, "itemDropped": -6, "wallHit": -4, "itemLoaded": 3,
            "bigLiftFail": -10, "catEscaped": -1, "bigLiftStart": 2,
        },
        "favoriteItems": ["mirror", "upright_piano", "safe"],
        "linesKey": "collector",
    },
    {
        "id": "celebrity",
        "name": {"en": "Diva Lana", "vi": "Diva Lan Na"},
        "icon": "🕶️",
        "color": "#f48fb1",
        "voicePitch": 1.6,
        "startSatisfaction": 55,
        "sensitivity": {
            "itemBroken": -18, "itemDropped": -5, "wallHit": -5, "itemLoaded": 2,
            "bigLiftFail": -12, "catEscaped": -3, "bigLiftStart": 3, "timeLow": -2,
        },
        "favoriteItems": ["grand_piano", "statue", "teddy"],
        "linesKey": "celebrity",
    },
]

# Mỗi sự kiện: 5 cặp (en, vi). `changeMind` có tham số {item}.
LINES = {
    "collector": {
        "levelStart": [
            ("Every piece here is older than your grandparents. Act accordingly.", "Món nào ở đây cũng già hơn ông bà mấy cậu. Liệu mà cư xử."),
            ("Touch with your eyes first. Then, reluctantly, with your hands.", "Nhìn bằng mắt trước. Rồi miễn cưỡng lắm mới được dùng tay."),
            ("That mirror survived two wars. Let's see if it survives you.", "Cái gương đó sống sót qua hai cuộc chiến. Để xem có sống nổi qua mấy cậu không."),
            ("I've catalogued everything. I WILL notice.", "Tôi ghi sổ hết rồi đấy. Mất cái gì là tôi biết."),
            ("Slowly. Antiques can smell fear.", "Từ từ thôi. Đồ cổ nó ngửi thấy sự sợ hãi đấy."),
        ],
        "itemBroken": [
            ("That was eighteenth century!", "Đồ thế kỷ mười tám đấy!"),
            ("Priceless. It WAS priceless.", "Vô giá. Đã từng vô giá."),
            ("I need to sit down.", "Cho tôi ngồi xuống cái đã."),
            ("You've just made history. In the bad way.", "Mấy cậu vừa làm nên lịch sử. Theo nghĩa xấu."),
            ("I'm adding that to the invoice. In bold.", "Cái đó tôi ghi vào hóa đơn. In đậm."),
        ],
        "itemDropped": [
            ("Gravity is not your colleague!", "Trọng lực không phải đồng nghiệp của cậu đâu!"),
            ("Did it bounce? Tell me it didn't bounce.", "Nó có nảy không? Nói là không nảy đi."),
            ("Two hands. Two! You have them!", "Hai tay. HAI tay! Cậu có mà!"),
            ("My heart just did the same thing.", "Tim tôi cũng vừa rơi y như thế."),
            ("Careful, that's patina, not dirt!", "Cẩn thận, đó là lớp men thời gian chứ không phải bụi!"),
        ],
        "wallHit": [
            ("That wall is listed heritage!", "Bức tường đó là di sản đấy!"),
            ("Mind the plaster, it's original.", "Coi chừng lớp vữa, vữa nguyên bản đó."),
            ("Are you steering or bowling?", "Cậu đang khiêng đồ hay đang chơi bowling?"),
            ("Another dent. Wonderful. Very authentic.", "Thêm một vết lõm. Tuyệt. Rất cổ kính."),
            ("Corners, gentlemen. They have corners.", "Góc nhà, các cậu ơi. Nhà có góc đấy."),
        ],
        "itemLoaded": [
            ("Mm. Acceptable.", "Ừm. Tạm được."),
            ("Strap it. Then strap it again.", "Chằng lại. Rồi chằng thêm lần nữa."),
            ("Gently into the truck. Like tucking in a baby.", "Đặt vào xe nhẹ thôi. Như đắp chăn cho em bé."),
            ("One more relic saved.", "Thêm một cổ vật được cứu."),
            ("Fine. Don't let it look out the window.", "Được. Đừng để nó nhìn ra cửa sổ."),
        ],
        "catEscaped": [
            ("Who let a cat into an antique shop?!", "Ai cho mèo vào tiệm đồ cổ vậy?!"),
            ("Not near the porcelain! NOT near the porcelain!", "Đừng lại gần đồ sứ! ĐỪNG lại gần đồ sứ!"),
            ("That cat is younger than everything here and twice as fragile.", "Con mèo đó trẻ hơn mọi thứ ở đây và còn dễ vỡ gấp đôi."),
            ("Catch it before it appraises something.", "Bắt nó lại trước khi nó 'thẩm định' món gì đó."),
            ("Shoo! Shoo, you furry vandal!", "Xùy! Xùy, cái đồ phá hoại có lông!"),
        ],
        "timeLow": [
            ("The truck won't wait. Neither will my lawyer.", "Xe không đợi đâu. Luật sư của tôi cũng vậy."),
            ("Faster — but not THAT fast!", "Nhanh lên — mà đừng nhanh QUÁ!"),
            ("One minute. Prioritise the old stuff. All of it is old stuff.", "Còn một phút. Ưu tiên đồ cổ. Mà đồ nào cũng cổ."),
            ("Tick tock, like my grandfather clock. Which you'd better not break.", "Tích tắc, như cái đồng hồ quả lắc của tôi. Đừng có làm vỡ nó."),
            ("Hurry, gently. Gently, hurry!", "Nhanh mà nhẹ. Nhẹ mà nhanh!"),
        ],
        "levelEnd": [
            ("I'll be checking every item with a magnifying glass.", "Tôi sẽ soi từng món bằng kính lúp."),
            ("Adequate. I've seen worse. Once. In 1974.", "Tạm chấp nhận. Tôi từng thấy tệ hơn. Một lần. Năm 1974."),
            ("Leave your names. For the insurance company.", "Để lại tên đi. Cho công ty bảo hiểm."),
            ("Well. The shop is empty, at least.", "Thôi. Ít ra tiệm cũng trống rồi."),
            ("Next time I'm hiring museum staff.", "Lần sau tôi thuê nhân viên bảo tàng."),
        ],
        "bigLiftStart": [
            ("All together now — like a string quartet!", "Cùng nhấc nào — đều như dàn tứ tấu!"),
            ("That piano has seen better days. Don't make it see worse.", "Cây đàn đó từng có thời huy hoàng. Đừng cho nó thấy thời tàn."),
            ("Lift with your legs, not with my money.", "Nhấc bằng chân, đừng nhấc bằng tiền của tôi."),
            ("Steady... steady... I'm not breathing until it's down.", "Vững... vững... Tôi nín thở tới khi nó nằm yên."),
            ("Four hands, one rhythm!", "Bốn đôi tay, một nhịp!"),
        ],
        "bigLiftFail": [
            ("Who let go?! I demand a name!", "Ai buông tay?! Tôi đòi biết tên!"),
            ("That was a chord I never want to hear again.", "Hợp âm đó tôi không bao giờ muốn nghe lại."),
            ("Teamwork! Look it up!", "Làm việc nhóm! Tra từ điển đi!"),
            ("You dropped a century on my floor.", "Mấy cậu vừa đánh rơi một thế kỷ xuống sàn nhà tôi."),
            ("Again. And this time, all of you.", "Lại lần nữa. Lần này đủ mặt mọi người."),
        ],
        "changeMind": [
            ("Actually, the {item} comes too. It's... sentimental.", "À mà mang cả {item} nữa. Nó... có giá trị tình cảm."),
            ("On reflection, I can't live without the {item}.", "Nghĩ lại thì tôi không sống thiếu {item} được."),
            ("Add the {item} to the list. Don't ask why.", "Thêm {item} vào danh sách. Đừng hỏi tại sao."),
            ("The {item}! How could I forget the {item}!", "Cái {item}! Sao tôi lại quên cái {item} được!"),
            ("I just remembered the {item} is worth a fortune.", "Tôi vừa nhớ ra {item} đáng giá cả gia tài."),
        ],
    },
    "celebrity": {
        "levelStart": [
            ("Darlings! Make it quick, I have a photoshoot.", "Các cưng! Làm nhanh nhé, chị có buổi chụp hình."),
            ("Please don't touch anything that's been on magazine covers.", "Đừng đụng vào món nào từng lên bìa tạp chí nha."),
            ("Every item here has its own fan club.", "Món nào ở đây cũng có fan club riêng đó."),
            ("The piano is insured for more than all of you combined.", "Cây đàn được bảo hiểm cao hơn cả đám cưng cộng lại."),
            ("Smile! You never know who's filming.", "Cười lên! Biết đâu có người đang quay."),
        ],
        "itemBroken": [
            ("That was a GIFT from a FAN!", "Quà của FAN tặng đó!"),
            ("Somebody call my publicist.", "Ai gọi quản lý giùm chị."),
            ("I can't look. Tell me when it's over.", "Chị không dám nhìn. Xong rồi thì báo chị."),
            ("This is going straight to my podcast.", "Chuyện này chị sẽ kể lên podcast."),
            ("Oh no, oh no, oh NO, darling!", "Thôi xong, thôi xong, thôi XONG rồi cưng ơi!"),
        ],
        "itemDropped": [
            ("Butterfingers is not a good look!", "Tay lóng ngóng không hợp hình ảnh đâu nha!"),
            ("Pick it up like the cameras are rolling!", "Nhặt lên như thể máy quay đang chạy đi!"),
            ("Ew. Floor.", "Ơ. Rơi xuống sàn."),
            ("That's not how we do things in this house.", "Nhà này không làm việc kiểu đó đâu cưng."),
            ("Drama is MY job, not yours.", "Drama là việc của chị, không phải của cưng."),
        ],
        "wallHit": [
            ("That wall is in my music video!", "Bức tường đó có trong MV của chị đó!"),
            ("Mind the gold leaf, sweetie!", "Coi chừng lớp mạ vàng nha cưng!"),
            ("Bump the wall one more time and it's a lawsuit.", "Đụng tường thêm cái nữa là ra tòa đó."),
            ("Gentle! The house has feelings too.", "Nhẹ thôi! Căn nhà cũng có cảm xúc mà."),
            ("Ouch. I felt that in my soul.", "Ui da. Chị đau tận tâm can."),
        ],
        "itemLoaded": [
            ("Fabulous. Next!", "Tuyệt vời. Món tiếp theo!"),
            ("That's going to look gorgeous in the new place.", "Món đó đặt ở nhà mới chắc đẹp xỉu."),
            ("Good job, babe. Not great. Good.", "Làm tốt lắm cưng. Chưa xuất sắc. Tốt."),
            ("Put the logo facing out, please.", "Quay logo ra ngoài giùm chị nha."),
            ("Mwah! Love that for us.", "Chụt! Chị mê luôn."),
        ],
        "catEscaped": [
            ("Princess! Mommy's little princess, come back!", "Công chúa! Công chúa nhỏ của mẹ, về đây!"),
            ("That cat has more followers than you!", "Con mèo đó nhiều người theo dõi hơn cưng đó!"),
            ("Catch her! But don't mess up her fur!", "Bắt lại! Mà đừng làm rối lông bé nha!"),
            ("If she gets out, the paparazzi will get her!", "Bé mà chạy ra ngoài là bị paparazzi chụp đó!"),
            ("Someone bring the diamond cat carrier!", "Ai mang cái lồng mèo đính kim cương ra đây!"),
        ],
        "timeLow": [
            ("One minute! My car is already here!", "Còn một phút! Xe chị tới rồi!"),
            ("Faster, darlings, faster! Like a remix!", "Nhanh lên các cưng! Nhanh như bản remix!"),
            ("I'm going to be late and it'll be YOUR fault.", "Chị mà trễ hẹn là tại các cưng đó."),
            ("The paparazzi are waiting outside! Hurry!", "Paparazzi đứng chờ ngoài cổng rồi! Lẹ lên!"),
            ("Tick-tock, superstars!", "Tích tắc, các siêu sao ơi!"),
        ],
        "levelEnd": [
            ("Thank you, thank you, no autographs!", "Cảm ơn, cảm ơn, không ký tặng đâu nha!"),
            ("I'll rate you on my socials. Maybe.", "Chị sẽ chấm điểm trên mạng xã hội. Có thể."),
            ("Well, that was a show.", "Chà, đúng là một màn trình diễn."),
            ("Air kisses! Don't call me, I'll call you.", "Hôn gió nè! Đừng gọi chị, chị sẽ gọi."),
            ("That's a wrap, darlings!", "Đóng máy rồi các cưng ơi!"),
        ],
        "bigLiftStart": [
            ("All eight of you! Like a boy band!", "Đủ tám người! Như một nhóm nhạc nam!"),
            ("Lift on three. One, two, FABULOUS!", "Đếm tới ba rồi nhấc. Một, hai, TUYỆT VỜI!"),
            ("My Grammy piano is in your hands. Literally.", "Cây đàn đoạt giải của chị nằm trong tay các cưng. Theo nghĩa đen."),
            ("Choreography, people! In sync!", "Vũ đạo nào mọi người! Đều nhịp!"),
            ("Careful, that's going on tour!", "Cẩn thận, món đó còn đi tour đó!"),
        ],
        "bigLiftFail": [
            ("Who dropped my piano?! Who?!", "Ai làm rơi đàn của chị?! AI?!"),
            ("Eight people and not one brain?", "Tám người mà không có nổi một bộ óc?"),
            ("That note was flat. The piano too, now.", "Nốt đó phô rồi. Giờ cây đàn cũng méo luôn."),
            ("I'm going to cry and it'll ruin my makeup.", "Chị sắp khóc và lớp trang điểm sẽ trôi hết."),
            ("Again! From the top! With feeling!", "Làm lại! Từ đầu! Có cảm xúc vào!"),
        ],
        "changeMind": [
            ("Oh! The {item} is coming too. It matches my aura.", "À! Mang cả {item} nữa. Nó hợp năng lượng của chị."),
            ("My stylist says the {item} stays with me.", "Stylist của chị nói {item} phải theo chị."),
            ("Can't leave the {item}, it was in my last music video!", "Không bỏ {item} được, nó có trong MV mới nhất!"),
            ("Add the {item}, darling. Don't argue with a star.", "Thêm {item} đi cưng. Đừng cãi ngôi sao."),
            ("Wait wait wait — the {item}! I need the {item}!", "Khoan khoan khoan — cái {item}! Chị cần cái {item}!"),
        ],
    },
}


def main():
    LANDLORDS.extend(p36.LANDLORDS)
    LINES.update(p36.LINES)
    lp = DATA / "landlords.json"
    landlords = json.loads(lp.read_text(encoding="utf-8"))
    ids = {l["id"] for l in landlords}
    landlords += [l for l in LANDLORDS if l["id"] not in ids]
    lp.write_text(json.dumps(landlords, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    for i, loc in enumerate(["en", "vi"]):
        p = DATA / f"lines.{loc}.json"
        lines = json.loads(p.read_text(encoding="utf-8"))
        for key, events in LINES.items():
            lines[key] = {ev: [pair[i] for pair in pairs] for ev, pairs in events.items()}
        p.write_text(json.dumps(lines, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print("ok", [l["id"] for l in landlords])


if __name__ == "__main__":
    main()
