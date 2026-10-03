/** 安全随机整数 [0, n):浏览器 / Node 通用(WebCrypto) */
export function randomInt(n: number): number {
  const g = (globalThis as { crypto?: Crypto }).crypto;
  if (!g?.getRandomValues) throw new Error('环境缺少 crypto.getRandomValues');
  const limit = Math.floor(0x100000000 / n) * n; // 拒绝采样,避免取模偏差
  const buf = new Uint32Array(1);
  for (;;) {
    g.getRandomValues(buf);
    if (buf[0]! < limit) return buf[0]! % n;
  }
}

export function shuffleInPlace<T>(arr: T[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
}
