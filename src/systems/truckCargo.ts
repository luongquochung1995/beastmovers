/**
 * Sổ hàng trên xe tải (thuần, không phụ thuộc Phaser).
 * - Món đồ nằm trọn trong thùng và đã yên vị (không ai cầm, không đang bay) → lên xe.
 * - Xe không đủ chỗ (`slots`) → từ chối, món đồ bị đẩy ra (chỉ báo một lần cho đến khi nó ra khỏi thùng).
 * - Món đã lên xe mà ra khỏi thùng → xuống xe.
 */
export interface CargoCandidate {
  uid: number;
  slots: number;
  /** Nằm trọn trong thùng xe. */
  inside: boolean;
  /** Không ai cầm, không đang bay, gần như đứng yên. */
  settled: boolean;
}

export interface CargoState {
  /** Món đã lên xe → số chỗ nó chiếm. */
  loaded: ReadonlyMap<number, number>;
  /** Món đã bị từ chối vì xe đầy (chờ nó ra khỏi thùng mới xét lại). */
  rejected: ReadonlySet<number>;
  used: number;
}

export interface CargoUpdate {
  state: CargoState;
  loaded: number[];
  unloaded: number[];
  rejected: number[];
}

export function emptyCargo(): CargoState {
  return { loaded: new Map(), rejected: new Set(), used: 0 };
}

export function updateCargo(
  state: CargoState,
  candidates: readonly CargoCandidate[],
  capacity: number,
): CargoUpdate {
  const loaded = new Map(state.loaded);
  const rejected = new Set(state.rejected);
  let used = state.used;
  const out: CargoUpdate = { state, loaded: [], unloaded: [], rejected: [] };
  const byUid = new Map(candidates.map((c) => [c.uid, c]));

  // Món đã lên xe mà không còn trong thùng (hoặc đã biến mất) → xuống xe.
  for (const [uid, slots] of state.loaded) {
    const c = byUid.get(uid);
    if (!c || !c.inside) {
      loaded.delete(uid);
      used -= slots;
      out.unloaded.push(uid);
    }
  }
  for (const uid of state.rejected) {
    if (!byUid.get(uid)?.inside) rejected.delete(uid);
  }
  for (const c of candidates) {
    if (!c.inside || !c.settled || loaded.has(c.uid) || rejected.has(c.uid)) continue;
    if (used + c.slots <= capacity) {
      loaded.set(c.uid, c.slots);
      used += c.slots;
      out.loaded.push(c.uid);
    } else {
      rejected.add(c.uid);
      out.rejected.push(c.uid);
    }
  }
  out.state = { loaded, rejected, used: Math.max(0, used) };
  return out;
}

/** Món nằm sát cửa thùng (trong `margin` px) dễ rơi ra khi xe chạy (xếp ẩu). */
export function nearOpening(distanceToOpening: number, margin = 30): boolean {
  return distanceToOpening < margin;
}
