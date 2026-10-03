import { randomInt } from '@jieqi/shared';
import type { TimeOpts } from '@jieqi/shared';
import { Room } from './room';

const rooms = new Map<string, Room>();

export function createRoom(opts: TimeOpts): Room {
  for (;;) {
    let code = '';
    for (let i = 0; i < 6; i++) code += String(randomInt(10)); // 6 位数字房号
    if (!rooms.has(code)) {
      const r = new Room(code, opts);
      rooms.set(code, r);
      return r;
    }
  }
}

export const getRoom = (code: string) => rooms.get(code);
export const allRooms = (): Room[] => [...rooms.values()];
export const removeRoom = (code: string) => rooms.delete(code);

/** 房间生命周期清扫:到期的广播解散并删除;对局中僵死兜底 */
export function sweepExpired(now: number) {
  for (const [code, r] of rooms) {
    if (r.expired(now) || r.stale(now)) {
      r.closeNow();
      rooms.delete(code);
    }
  }
}
