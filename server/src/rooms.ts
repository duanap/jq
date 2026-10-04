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

/** 僵死房间清扫(不限时房挂机过久),静默回收 */
export function sweepStale(now: number) {
  for (const [code, r] of rooms) {
    if (r.stale(now)) {
      r.closeNow('stale');
      rooms.delete(code);
    }
  }
}
