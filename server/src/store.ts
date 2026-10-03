import fs from 'node:fs/promises';
import path from 'node:path';
import { here } from './env';

const dir = path.resolve(here, '../../records');

/** 对局结束后追加一条 JSON 记录(只含公开信息:动作+揭示,不含初始暗子布局) */
export async function appendRecord(rec: unknown): Promise<void> {
  try {
    await fs.mkdir(dir, { recursive: true });
    const file = path.join(dir, `${new Date().toISOString().slice(0, 10)}.ndjson`);
    await fs.appendFile(file, JSON.stringify(rec) + '\n', 'utf8');
  } catch (e) {
    console.error('[jieqi] 对局记录写入失败', e);
  }
}
