import type { Item } from '../entities/Item';
import type { World } from '../sim/World';

/**
 * Cảnh thử hành vi trong sandbox (phím 1–0). Mỗi cảnh xóa đồ cũ, đặt đồ mới
 * và tự kích hoạt hành vi (ném vào tường, cho rơi…) để xem ngay không cần điều khiển.
 * Tọa độ tính cho phòng sandbox: tường trái ở x ≈ 300, tường ngăn ở x ≈ 890.
 */
export interface Scenario {
  /** Tên phím Phaser (ONE, TWO…). */
  key: string;
  setup(world: World): void;
}

/** Ném món đồ như người chơi ném: có thời gian bay gần như không ma sát. */
const fling = (world: World, item: Item, vx: number, vy = 0) => {
  world.scene.matter.body.setVelocity(item.body, { x: vx, y: vy });
  item.setAirborne(800);
};

const near = (world: World, x: number, y: number) => {
  const p = world.players[0];
  if (p) world.scene.matter.body.setPosition(p.body, { x, y }, false);
};

export const SCENARIOS: Scenario[] = [
  {
    key: 'ONE', // Tủ lạnh: lao vào tường → cửa bật mở, rơi đồ ăn
    setup: (w) => fling(w, w.spawnItem('fridge', 520, 200), -10),
  },
  {
    key: 'TWO', // Chậu cây: đập tường → đổ đất (sàn trơn)
    setup: (w) => fling(w, w.spawnItem('plant', 520, 300), -10),
  },
  {
    key: 'THREE', // Bể cá: đập tường → tràn nước, cá nhảy ra giãy
    setup: (w) => fling(w, w.spawnItem('fish_tank', 520, 420), -11),
  },
  {
    key: 'FOUR', // Máy chạy bộ: bị va → băng chuyền chạy, người đứng trên bị hất
    setup: (w) => {
      const tm = w.spawnItem('treadmill', 600, 450);
      near(w, 600, 418); // sát cạnh trên của máy
      w.later(() => w.impact(tm, 5));
    },
  },
  {
    key: 'FIVE', // Bàn bi-a: đang khiêng thì rơi → RẦM, bi lăn tứ tung
    setup: (w) => {
      const t = w.spawnItem('pool_table', 600, 300);
      near(w, 600, 420);
      w.later(() => w.onItemDropped(t));
    },
  },
  {
    key: 'SIX', // Giàn tạ: rơi → tạ lăn
    setup: (w) => {
      const r = w.spawnItem('weight_rack', 600, 300);
      w.later(() => w.onItemDropped(r));
    },
  },
  {
    key: 'SEVEN', // Thùng: ném mạnh vào tường → có thể rách đáy, rơi sách
    setup: (w) => fling(w, w.spawnItem('box', 520, 200), -13),
  },
  {
    key: 'EIGHT', // Piano: rơi → RẦM + plinggg, người đứng gần ngã
    setup: (w) => {
      const p = w.spawnItem('upright_piano', 600, 300);
      near(w, 600, 380);
      w.later(() => w.onItemDropped(p));
    },
  },
  {
    key: 'NINE', // Gương sắp vỡ: đập tường → vỡ, mảnh kính trên sàn
    setup: (w) => {
      const m = w.spawnItem('mirror', 520, 200);
      w.damage(m, 2);
      fling(w, m, -12);
    },
  },
  {
    key: 'ZERO', // Bể cá khổng lồ: rơi → tràn nước, cá nhảy ra
    setup: (w) => {
      const a = w.spawnItem('giant_aquarium', 600, 300);
      w.later(() => w.onItemDropped(a));
    },
  },
];
