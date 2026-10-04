export const PORT = Number(process.env.PORT || 3190);
/** 对局进行中的无活动兜底(不限时房挂机),静默回收 */
export const STALE_MS = 2 * 60 * 60 * 1000;
/** 掉线宽限:超过即按超时判负 */
export const ABANDON_MS = 60_000;
/** 计时看门狗周期 */
export const CLOCK_TICK_MS = 500;
/** 服务端 ws 心跳周期 */
export const HB_INTERVAL_MS = 15_000;
