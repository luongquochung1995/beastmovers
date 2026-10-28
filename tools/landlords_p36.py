# -*- coding: utf-8 -*-
"""P36: chủ nhà "anh startup cuồng minimalism" và "chị chủ 6 con mèo" (dùng trong new-landlords.py).

Câu thứ i của tiếng Anh và tiếng Việt là cùng một câu, mỗi bên viết lại cho hài theo
ngôn ngữ của mình.
"""

LANDLORDS = [
    {
        "id": "startup",
        "name": {"en": "Kevin the Founder", "vi": "Anh Khoa Startup"},
        "icon": "🧘",
        "color": "#80cbc4",
        "voicePitch": 1.1,
        "startSatisfaction": 50,
        "sensitivity": {
            "itemBroken": -10, "itemDropped": -4, "wallHit": -6, "itemLoaded": 3,
            "bigLiftFail": -8, "catEscaped": -2, "bigLiftStart": 2, "timeLow": -3,
        },
        "favoriteItems": ["plant"],
        "linesKey": "startup",
    },
    {
        "id": "catlady",
        "name": {"en": "Auntie Whiskers", "vi": "Chị Hạnh Mèo"},
        "icon": "🐱",
        "color": "#ffcc80",
        "voicePitch": 1.4,
        "startSatisfaction": 50,
        "sensitivity": {
            "itemBroken": -8, "itemDropped": -4, "wallHit": -2, "itemLoaded": 2,
            "bigLiftFail": -6, "catEscaped": -10, "bigLiftStart": 1,
        },
        "favoriteItems": ["cat", "cat_carrier", "teddy"],
        "linesKey": "catlady",
    },
]

LINES = {
    "startup": {
        "levelStart": [
            ("Guys, this is a zero-clutter move. Ship it lean.", "Anh em, đây là đợt chuyển nhà không rác. Ship gọn nhẹ nhé."),
            ("Think of each item as a feature. Most of them we'll deprecate.", "Coi mỗi món đồ như một tính năng. Phần lớn sẽ bị khai tử."),
            ("I own exactly one of everything. Please don't make it zero.", "Anh có đúng một cái của mỗi thứ. Đừng biến nó thành không cái."),
            ("Let's move fast and NOT break things.", "Làm nhanh nhưng KHÔNG làm vỡ gì nhé."),
            ("Quick stand-up: lift, carry, load. Questions? No? Great.", "Họp nhanh: nhấc, khiêng, chất lên xe. Có câu hỏi không? Không? Tốt."),
        ],
        "itemBroken": [
            ("That's... a hard pivot.", "Cái đó… pivot hơi gắt rồi đấy."),
            ("Okay, we're officially pre-revenue now.", "Ok, giờ mình chính thức chưa có doanh thu."),
            ("Breathe. Breathe. It was just matter.", "Hít thở. Hít thở. Nó chỉ là vật chất thôi mà."),
            ("Let's call that a learning.", "Coi như đó là một bài học kinh nghiệm."),
            ("Fewer things. I guess that's on brand.", "Ít đồ đi. Chắc cũng đúng chất thương hiệu."),
        ],
        "itemDropped": [
            ("Gravity is not a growth strategy!", "Trọng lực không phải chiến lược tăng trưởng!"),
            ("That drop was not in the roadmap.", "Cú rơi đó không có trong lộ trình."),
            ("Pick it up. Iterate.", "Nhặt lên. Làm lại vòng mới."),
            ("Bug report: item fell. Severity: me, crying.", "Báo lỗi: đồ rơi. Mức độ: anh đang khóc."),
            ("Hands are an API. Use them properly.", "Tay là API. Gọi cho đúng cách đi."),
        ],
        "wallHit": [
            ("Those walls are matte white. MATTE. WHITE.", "Tường đó sơn trắng mờ đấy. TRẮNG. MỜ."),
            ("Every scuff is visible in a minimalist home!", "Nhà tối giản thì vết trầy nào cũng lộ hết!"),
            ("Negative space, people. Respect it.", "Khoảng trống là nghệ thuật. Tôn trọng nó đi."),
            ("I paid a consultant to choose that wall.", "Anh thuê cả chuyên gia tư vấn để chọn bức tường đó."),
            ("Bump the wall again and I'm writing a postmortem.", "Đụng tường lần nữa là anh viết báo cáo sự cố đấy."),
        ],
        "itemLoaded": [
            ("Shipped.", "Đã ship."),
            ("Clean. Efficient. I love it.", "Gọn. Hiệu quả. Anh thích."),
            ("That's one less thing. Literally.", "Bớt được một thứ. Theo nghĩa đen."),
            ("Great execution, team.", "Thực thi tốt lắm, team."),
            ("Mark it done on the board!", "Kéo thẻ đó sang cột Xong!"),
        ],
        "catEscaped": [
            ("Whose cat is that? I don't own a cat. Do I own a cat?", "Mèo của ai vậy? Anh đâu có nuôi mèo. Hay là có?"),
            ("The cat is not part of the MVP!", "Con mèo không nằm trong bản MVP!"),
            ("Contain the cat. It's a scope creep with whiskers.", "Nhốt con mèo lại. Nó là phát sinh ngoài phạm vi có râu."),
            ("It's adding chaos. We said no chaos.", "Nó đang thêm hỗn loạn. Mình đã nói không hỗn loạn."),
            ("Catch it before it disrupts the industry.", "Bắt nó trước khi nó phá vỡ cả thị trường."),
        ],
        "timeLow": [
            ("Sixty seconds to launch!", "Còn sáu mươi giây là launch!"),
            ("We're shipping in a minute, ready or not.", "Một phút nữa là ship, xong hay chưa cũng ship."),
            ("Crunch time! But, like, mindful crunch.", "Nước rút rồi! Nhưng là nước rút có chánh niệm."),
            ("Final sprint, everybody!", "Sprint cuối cùng, mọi người ơi!"),
            ("The deadline is not a suggestion.", "Hạn chót không phải là lời gợi ý."),
        ],
        "levelEnd": [
            ("Let's do a quick retro. Actually, let's not.", "Mình họp rút kinh nghiệm nhanh nhé. À thôi, khỏi."),
            ("Five stars. Maybe four. I'll send a survey.", "Năm sao. Hoặc bốn. Anh sẽ gửi khảo sát."),
            ("My new place has even less stuff. Thanks to you.", "Nhà mới của anh còn ít đồ hơn nữa. Nhờ mấy em đấy."),
            ("Good sprint. See you next quarter.", "Sprint tốt. Hẹn gặp quý sau."),
            ("I feel lighter already. Spiritually and financially.", "Anh thấy nhẹ người rồi. Cả tâm hồn lẫn ví tiền."),
        ],
        "bigLiftStart": [
            ("Six people, one table. That's real synergy.", "Sáu người, một cái bàn. Đó mới là cộng hưởng."),
            ("Align on the vision. Then lift.", "Thống nhất tầm nhìn đã. Rồi nhấc."),
            ("Cross-functional lifting! I love it.", "Khiêng đồ liên phòng ban! Anh mê."),
            ("This is the only big thing I own. Please.", "Đây là món to duy nhất anh có. Làm ơn."),
            ("Steady hands, steady growth.", "Tay vững thì tăng trưởng vững."),
        ],
        "bigLiftFail": [
            ("Who dropped the ball? And the table?", "Ai làm hỏng việc? Và làm rơi cả cái bàn?"),
            ("That's a blocker. A big, heavy blocker.", "Đó là một vấn đề chặn. Một vấn đề to và nặng."),
            ("Communication, team! Use the pings!", "Giao tiếp đi team! Dùng ping đi!"),
            ("We need better alignment. Physically.", "Mình cần đồng bộ tốt hơn. Về mặt thể chất."),
            ("Rollback! Rollback!", "Quay lại bản cũ! Quay lại!"),
        ],
        "changeMind": [
            ("Wait, the {item} sparks joy. It comes with us.", "Khoan, cái {item} làm anh hạnh phúc. Mang theo."),
            ("New requirement: the {item} is in scope now.", "Yêu cầu mới: {item} giờ nằm trong phạm vi."),
            ("I pivoted. The {item} stays with me.", "Anh pivot rồi. {item} đi theo anh."),
            ("On second thought, the {item} is core to my identity.", "Nghĩ lại thì {item} là cốt lõi con người anh."),
            ("Quick change of plan: add the {item}. Sorry. Not sorry.", "Đổi kế hoạch chút: thêm {item}. Xin lỗi. Mà cũng không xin lỗi."),
        ],
    },
    "catlady": {
        "levelStart": [
            ("Mind the babies! All six of them!", "Coi chừng mấy bé nha! Cả sáu đứa đó!"),
            ("Please don't step on anyone's tail.", "Làm ơn đừng giẫm lên đuôi đứa nào."),
            ("The cats come first. Then the furniture. Then you.", "Mèo trước. Rồi tới đồ. Rồi mới tới mấy em."),
            ("If you hear hissing, that's normal. If you hear crying, that's me.", "Nghe tiếng khè là bình thường. Nghe tiếng khóc là chị đó."),
            ("Every cat goes in a carrier. No exceptions. Good luck.", "Bé nào cũng phải vào lồng. Không ngoại lệ. Chúc may mắn."),
        ],
        "itemBroken": [
            ("Oh no! Did it hit a kitty?!", "Trời ơi! Có trúng bé nào không?!"),
            ("Broken? Fine. As long as the cats are okay.", "Vỡ hả? Thôi được. Miễn mấy bé không sao."),
            ("Mochi will never forgive you.", "Bé Mochi sẽ không bao giờ tha thứ cho em."),
            ("That was their favourite scratching mirror!", "Đó là cái gương tụi nhỏ thích cào nhất!"),
            ("Glass on the floor! Everybody freeze, paws up!", "Mảnh kính đầy sàn! Đứng im hết, giơ chân lên!"),
        ],
        "itemDropped": [
            ("Loud noises scare the babies!", "Tiếng động mạnh làm mấy bé sợ đó!"),
            ("Shh! Gently! Cat ears are very sensitive!", "Suỵt! Nhẹ thôi! Tai mèo thính lắm!"),
            ("Now they're all under the bed. Thanks.", "Giờ tụi nó chui hết xuống gầm giường rồi. Cảm ơn nha."),
            ("You startled Bánh Bao.", "Em làm bé Bánh Bao giật mình rồi."),
            ("Pick it up quietly. Like a cat would.", "Nhặt lên nhẹ nhàng. Như mèo vậy."),
        ],
        "wallHit": [
            ("Careful, that wall has their climbing shelves!", "Cẩn thận, tường đó có kệ leo của tụi nhỏ!"),
            ("Bonk. Like Sushi when she misjudges a jump.", "Cốp. Y như bé Sushi nhảy hụt."),
            ("Gentle with the walls, they're scratch-proof, not you-proof.", "Nhẹ với tường thôi, tường chống mèo cào chứ không chống mấy em."),
            ("Every bump wakes somebody up.", "Mỗi cú va là có một bé thức giấc."),
            ("Watch the corners, there might be a tail there!", "Coi chừng góc tường, có khi có cái đuôi ở đó!"),
        ],
        "itemLoaded": [
            ("Good! Purr-fect!", "Tốt! Hoàn hảo meo!"),
            ("Put the soft things near the carriers, please.", "Để đồ mềm gần mấy cái lồng giùm chị nha."),
            ("Nice. The cats approve. I can tell.", "Được. Tụi mèo duyệt rồi. Chị biết mà."),
            ("One step closer to our new home!", "Thêm một bước tới nhà mới rồi!"),
            ("Thank you, sweetie.", "Cảm ơn em nha."),
        ],
        "catEscaped": [
            ("MOCHI! Come back to mommy!", "MOCHI! Về với mẹ nè!"),
            ("Not again! Who opened the door?!", "Lại nữa! Ai mở cửa vậy?!"),
            ("Shake the treat bag! Shake it!", "Lắc túi bánh thưởng đi! Lắc lên!"),
            ("She's fast but she always goes under the bed.", "Bé chạy nhanh lắm nhưng lúc nào cũng chui gầm giường."),
            ("Don't chase her! Make her think it's her idea!", "Đừng đuổi! Làm sao cho bé tưởng là bé tự muốn vào!"),
        ],
        "timeLow": [
            ("One minute! Are all the babies in?!", "Còn một phút! Mấy bé vào lồng hết chưa?!"),
            ("Count the cats! Count them again!", "Đếm mèo đi! Đếm lại lần nữa!"),
            ("The truck won't leave without my kids!", "Xe không được chạy khi chưa có con chị!"),
            ("Hurry, but don't scare them!", "Nhanh lên, mà đừng làm tụi nó sợ!"),
            ("Quick, quick! Mochi's still out there!", "Nhanh nhanh! Mochi còn ở ngoài kia!"),
        ],
        "levelEnd": [
            ("Everyone say bye to the old house!", "Cả nhà chào tạm biệt nhà cũ nào!"),
            ("Thank you! The cats will tolerate you forever.", "Cảm ơn nha! Tụi mèo sẽ chịu đựng mấy em mãi mãi."),
            ("I'm counting them one more time. Just in case.", "Chị đếm lại lần nữa. Cho chắc."),
            ("You smell like cat now. Welcome to the family.", "Giờ mấy em có mùi mèo rồi. Chào mừng vào gia đình."),
            ("Next time bring treats.", "Lần sau nhớ mang bánh thưởng nha."),
        ],
        "bigLiftStart": [
            ("Careful, Sushi likes to sleep on top of that!", "Cẩn thận, bé Sushi hay ngủ trên đó!"),
            ("Check for cats underneath first!", "Kiểm tra có mèo nằm bên dưới không đã!"),
            ("Slowly, slowly, nobody's tail under there?", "Từ từ, từ từ, không có cái đuôi nào bên dưới chứ?"),
            ("All together, gently, like carrying a sleeping kitten.", "Cùng nhấc, nhẹ thôi, như bế một bé mèo đang ngủ."),
            ("Heave! Softly!", "Nhấc nào! Nhẹ nhàng!"),
        ],
        "bigLiftFail": [
            ("That thud just sent three cats up the curtains.", "Cú rầm đó làm ba bé leo tót lên rèm rồi."),
            ("Who let go?! The babies are traumatised!", "Ai buông tay?! Mấy bé hoảng hết rồi!"),
            ("Even the cats work better as a team.", "Đến mèo còn phối hợp giỏi hơn."),
            ("Try again, and this time, say 'one, two, meow'.", "Làm lại đi, lần này đếm 'một, hai, meo'."),
            ("I felt that in my whiskers.", "Chị nghe rung tới tận râu."),
        ],
        "changeMind": [
            ("Oh, the {item}! The kids love sleeping on the {item}!", "À, cái {item}! Tụi nhỏ thích ngủ trên {item} lắm!"),
            ("Bring the {item} too, it smells like home to them.", "Mang cả {item} nữa, nó có mùi nhà với tụi nhỏ."),
            ("Mochi just sat on the {item}. That means it's coming.", "Mochi vừa ngồi lên {item}. Vậy là phải mang theo."),
            ("I can't leave the {item}, the cats would riot.", "Không bỏ {item} được, tụi mèo sẽ nổi loạn."),
            ("Add the {item}, please. Cat's orders.", "Thêm {item} giùm chị. Lệnh của mèo."),
        ],
    },
}
