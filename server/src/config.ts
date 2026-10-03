export const PORT = Number(process.env.PORT || 3190);
/** 房间生命周期:等待对手加入的时限 */
export const WAITING_TTL_MS = 15 * 60 * 1000;
/** 房间生命周期:对局结束后保留(供复盘/再来一局)的时限 */
export const OVER_TTL_MS = 10 * 60 * 1000;
/** 对局进行中的无活动兜底(不限时房挂机) */
export const STALE_MS = 2 * 60 * 60 * 1000;
/** 掉线宽限:超过即按超时判负 */
export const ABANDON_MS = 60_000;
/** 计时看门狗周期 */
export const CLOCK_TICK_MS = 500;
/** 服务端 ws 心跳周期 */
export const HB_INTERVAL_MS = 15_000;
