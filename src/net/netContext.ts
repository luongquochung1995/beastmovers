import type { Lobby, LobbyState } from './lobby';
import type { RoomSession } from './session';
import type { TransportKind } from './openTransport';

/** Phiên online đang chạy, chuyển từ lobby sang màn chơi qua `registry`. */
export interface NetContext {
  session: RoomSession;
  lobby: Lobby;
  kind: TransportKind;
  code: string;
  /** Trạng thái lobby lúc host bấm Bắt đầu: thứ tự ô = số thứ tự người chơi. */
  roster: LobbyState;
}
