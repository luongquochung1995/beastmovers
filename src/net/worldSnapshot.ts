import type { LevelRuntime } from '../sim/LevelRuntime';
import type { World } from '../sim/World';
import { captureSnapshot, type Snapshot } from './snapshot';

/** Chụp trạng thái thế giới (và màn chơi nếu có) để gửi cho máy khách. */
export function snapshotWorld(
  world: World,
  runtime: LevelRuntime | null,
  ackOf: (slot: number) => number = () => 0,
): Snapshot {
  return captureSnapshot({
    tick: world.bus.tick,
    players: world.players,
    holding: (slot) => {
      const p = world.players.find((pl) => pl.slotIndex === slot);
      return (p && world.grab.holding(p)?.uid) ?? -1;
    },
    ackOf,
    items: world.items,
    containerOf: (uid) => {
      for (const [cat, box] of world.containedIn) if (cat.uid === uid) return box.uid;
      return -1;
    },
    doorAngles: world.doors.map((d) => d.angle),
    truck: world.truck && {
      offset: world.truck.offsetPos,
      used: world.truck.used,
      handbrakeOn: world.truck.handbrakeOn,
    },
    landlord: runtime?.landlord ?? null,
    clock: runtime?.clock ?? null,
    required: runtime ? [...runtime.built.required] : [],
  });
}
