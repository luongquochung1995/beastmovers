import type { CarryState } from '../systems/carry';
import type { LevelPhase } from '../systems/levelClock';
import type { MotorMode } from '../systems/PlayerMotor';

/**
 * Ảnh chụp trạng thái màn chơi mà host gửi cho máy khách (đủ để vẽ lại, không có vật lý).
 * Gửi qua mạng bằng `snapshotCodec` (nhị phân, chỉ gửi phần thay đổi).
 */
export interface PlayerSnap {
  /** Ô toàn cục. */
  s: number;
  x: number;
  y: number;
  /** Hướng nhìn. */
  fx: number;
  fy: number;
  mode: MotorMode;
  run: boolean;
  /** uid món đang nắm, -1 nếu không. */
  hold: number;
  /** Vận tốc (px/bước logic), để máy khách dự đoán nhân vật của mình. */
  vx: number;
  vy: number;
  /** Số thứ tự gói input cuối cùng host đã dùng cho người này (máy khách dự đoán phần sau đó). */
  ack: number;
}

export interface ItemSnap {
  u: number;
  /** id trong items.json (máy khách tạo món đồ khi gặp lần đầu). */
  d: string;
  x: number;
  y: number;
  a: number;
  cs: CarryState;
  carriers: number;
  dur: number;
  broken: boolean;
  hidden: boolean;
  loaded: boolean;
  icon: string | null;
  /** uid đồ chứa đang nhốt món này (mèo trong lồng), -1 nếu không. */
  box: number;
}

export interface Snapshot {
  tick: number;
  players: PlayerSnap[];
  items: ItemSnap[];
  doors: number[];
  truck: { ox: number; oy: number; used: number; handbrake: boolean } | null;
  landlord: { x: number; y: number; sat: number } | null;
  clock: { left: number; phase: LevelPhase } | null;
  required: number[];
}

/** Những gì cần để chụp (World + LevelRuntime nếu đang trong màn chơi). */
export interface SnapshotSource {
  tick: number;
  players: readonly {
    slotIndex: number;
    position: { x: number; y: number };
    motor: { mode: MotorMode; running: boolean; facing: { x: number; y: number } };
    body: { velocity: { x: number; y: number } };
  }[];
  holding(slotIndex: number): number;
  /** Gói input cuối cùng đã dùng cho ô `slotIndex` (0 nếu là người trên máy host). */
  ackOf(slotIndex: number): number;
  items: readonly {
    uid: number;
    id: string;
    position: { x: number; y: number };
    angle: number;
    carryState: CarryState;
    carriers: { size: number };
    durability: number;
    broken: boolean;
    hidden: boolean;
    loaded: boolean;
    iconOverride: string | null;
  }[];
  /** uid đồ chứa đang nhốt món `uid`, -1 nếu không. */
  containerOf(uid: number): number;
  doorAngles: readonly number[];
  truck: { offset: { x: number; y: number }; used: number; handbrakeOn: boolean } | null;
  landlord: { position: { x: number; y: number }; satisfaction: number } | null;
  clock: { timeLeftMs: number; phase: LevelPhase } | null;
  required: readonly number[];
}

/** Làm tròn để gói nhỏ và ổn định (vị trí 0,1 px, góc 0,001 rad). */
const r1 = (v: number) => Math.round(v * 10) / 10;
const r3 = (v: number) => Math.round(v * 1000) / 1000;

export function captureSnapshot(src: SnapshotSource): Snapshot {
  return {
    tick: src.tick,
    players: src.players.map((p) => ({
      s: p.slotIndex,
      x: r1(p.position.x),
      y: r1(p.position.y),
      fx: r3(p.motor.facing.x),
      fy: r3(p.motor.facing.y),
      mode: p.motor.mode,
      run: p.motor.running,
      hold: src.holding(p.slotIndex),
      vx: r3(p.body.velocity.x),
      vy: r3(p.body.velocity.y),
      ack: src.ackOf(p.slotIndex),
    })),
    items: src.items.map((i) => ({
      u: i.uid,
      d: i.id,
      x: r1(i.position.x),
      y: r1(i.position.y),
      a: r3(i.angle),
      cs: i.carryState,
      carriers: i.carriers.size,
      dur: i.durability,
      broken: i.broken,
      hidden: i.hidden,
      loaded: i.loaded,
      icon: i.iconOverride,
      box: src.containerOf(i.uid),
    })),
    doors: src.doorAngles.map(r3),
    truck: src.truck && {
      ox: r1(src.truck.offset.x),
      oy: r1(src.truck.offset.y),
      used: src.truck.used,
      handbrake: src.truck.handbrakeOn,
    },
    landlord: src.landlord && {
      x: r1(src.landlord.position.x),
      y: r1(src.landlord.position.y),
      sat: r1(src.landlord.satisfaction),
    },
    clock: src.clock && { left: Math.round(src.clock.timeLeftMs), phase: src.clock.phase },
    required: [...src.required],
  };
}
