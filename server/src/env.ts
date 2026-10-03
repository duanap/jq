import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * 当前文件所在目录(tsx/ESM 与 esbuild/CJS 双兼容):
 * CJS 产物里 import.meta 不可用,回退 __dirname(即 server/dist)。
 */
export const here: string = (() => {
  try {
    return path.dirname(fileURLToPath(import.meta.url));
  } catch {
    return __dirname;
  }
})();
