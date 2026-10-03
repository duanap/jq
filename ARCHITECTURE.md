# 揭棋联机网页版 — 技术架构设计 (MVP)

> 决策前提:游客昵称、房间链接制、无匹配/账号/观战/AI;主流规则(暗子按位置走、明士象自由、困毙判负、不支持悔棋);移动端 H5 优先;服务器权威。

## 1. 总体拓扑

```
浏览器 (H5, 移动端优先)
   │  HTTPS(静态页面) + WSS(对局)
Nginx (宝塔) :443  ← TLS 终结
   ├── /            → web/dist 静态资源
   └── /ws          → 反代 → Node.js 游戏服务 127.0.0.1:3190 (PM2 守护)
Node 服务
   ├── RoomManager   房间表(内存)
   ├── Game          对局状态机 + 计时 + 视角生成
   ├── 规则引擎       引用 shared/(纯函数,前后端同一份)
   └── 对局记录       每局结束追加写 JSONL(回放用)
```

MVP 单进程即可(几十个房间无压力);若日后多进程扩展,需把房间表挪到 Redis,现在不做。

## 2. 技术选型

| 层 | 选型 | 理由 |
|---|---|---|
| 前端 | Vue 3 + Vite + TypeScript | 熟悉的生态;棋盘用 DOM/SVG 渲染(无需 Canvas) |
| 通信 | `ws` 库 + JSON 协议(自研心跳/重连) | 回合制不需要 socket.io 的重量;协议完全可控 |
| 服务端 | Node.js 20 + TS,PM2 单进程 | 部署到现有宝塔服务器 |
| 共享代码 | pnpm workspace,`shared` 包 | 规则引擎与协议类型前后端共用同一份 TS |
| 存储 | 内存房间 + JSONL 对局记录 | MVP 够用;以后要战绩/账号再上 better-sqlite3 |

## 3. Monorepo 目录结构

```
jieqi/
├─ shared/                # 前后端共用,零依赖纯 TS
│  ├─ src/rules/
│  │  ├─ board.ts         # 棋盘表示、初始布局、posType 位置表
│  │  ├─ shuffle.ts       # crypto 随机洗子(帅固定,15 子洗 15 位)
│  │  ├─ moves.ts         # 走法生成(effectiveType 分派)
│  │  ├─ check.ts         # 将军/白脸将/困毙判定
│  │  └─ game.ts          # 应用走子、揭示、终局、重复局面检测
│  ├─ src/protocol.ts     # C2S / S2C 消息类型定义
│  └─ src/types.ts        # Side / PieceType / Cell / BoardView ...
├─ server/
│  ├─ src/index.ts        # ws 入口、心跳、路由分发
│  ├─ src/rooms.ts        # RoomManager:建房/加入/TTL 清理
│  ├─ src/game.ts         # 对局状态机、计时、视角生成、事件广播
│  └─ src/store.ts        # 对局记录 JSONL 落盘
└─ web/
   ├─ src/views/Home.vue  # 昵称 + 建房/加入
   ├─ src/views/Room.vue  # 棋盘 + 计时 + 状态栏
   └─ src/components/Board.vue
```

## 4. 核心数据模型与防作弊(视角生成)

### 4.1 数据模型

```ts
type Side = 'red' | 'black';
type PieceType = 'K' | 'A' | 'B' | 'N' | 'R' | 'C' | 'P'; // 帅士象马车炮兵

// 服务端完整棋盘(绝不出服务端)
type Cell = { side: Side; trueType: PieceType; revealed: boolean } | null;

// 客户端视角 —— 协议红线:暗子只允许 side + dark 标记,绝不带 trueType
type PublicCell =
  | { side: Side; revealed: true;  type: PieceType }
  | { side: Side; revealed: false }
  | null;
```

### 4.2 视角生成规则(整局的保密核心)

1. 服务端持有完整棋盘;**任何消息、任何客户端(含将来的观战/回放流)都不会收到未揭示暗子的身份**。
2. 初始与每次走子后,按连接者身份生成 `BoardView` 下发全量视图(90 格,体积小,不做增量,实现简单且天然幂等)。
3. 揭示以 `reveal {pos, type}` 事件广播,客户端把该格本地升级为明子。
4. 回放记录只存"动作 + 揭示结果"序列,天然不含暗子明文;服务端日志同样脱敏。

### 4.3 走子流程

```
C→S move {from,to}
  → 校验:轮到该方 / 格子归属 / 规则合法(含走后不被将、白脸将)
  → 应用走子;若源格是暗子 → 生成 reveal 事件
  → 计算对方是否被将、是否困毙/将死、和棋条件
  → S→C update {seq, move, reveal?, check?, clocks} 给双方
```

## 5. 规则引擎要点(shared/,纯函数,单测重点)

- **effectiveType(pos)**: `revealed ? trueType : posType(pos)`。posType 按"初始布局位置"查表(红/黑各 16 位)。一切走法、将军判定都用 effectiveType —— **这是全引擎最易错点**。
- 走法分派:车马炮兵按常规;**明士全盘斜走一格(不限九宫)、明象走田可过河(塞眼照算);暗士暗象仍受九宫/河界限制**。马蹩腿、象塞眼按 effectiveType 判。
- `legalMoves(board, side)`:伪合法走法 → 过滤"走后被将军"与"帅将照面"。
- 终局:
  - 将死:被将且 legalMoves 为空 → 负;
  - 困毙:未被将但 legalMoves 为空 → 负;
  - 和棋:连续 60 回合无吃子;全盘局面(含暗子明置状态哈希)重复 3 次。
  - 长将:MVP 简化 —— 重复检测命中且重复窗口内每一步均为将军着法 → 判长将方负;长捉后置。
- 洗子:`crypto` 熵源 Fisher–Yates,帅固定原位,15 暗子随机洗入其余 15 位;红黑各自独立洗。

## 6. 通信协议(节选)

```
C→S  {t:'create', nick, opts?}          # opts: 时制 5+3 / 10+3 / 15+5 / 无限
     {t:'join', room, nick}
     {t:'move', from, to}               # from/to 为 0..89 格索引
     {t:'resign'} {t:'draw_offer'|'draw_accept'|'draw_decline'}
     {t:'rematch'} {t:'ping'}
S→C  {t:'joined', room, you: Side, view, clocks}
     {t:'start', view, clocks}
     {t:'update', seq, move, reveal?, check?, clocks}
     {t:'over', reason, winner?}        # mate|stalemate|timeout|resign|draw|repetition|perpetual
     {t:'peer', online} {t:'error', code}
```

- `seq` 单调递增,断线重连后客户端可对账,服务端以最新全量视图兜底。
- 颜色随机分配;房间号 6 位随机码,进房链接 `https://域名/?r=xxxxxx`。

## 7. 计时与断线

- 计时:服务端权威。每方 `base + increment`,在每个影响时钟的操作时惰性结算,另设 1s watchdog 扫描活跃房间,超时判负。客户端只做展示,不参与判定。
- 心跳:客户端 15s 一 ping,服务端 30s 无心跳视为掉线;掉线宽限 60s(对手端显示提示),到期按超时判负;宽限期内重连立即恢复。
- 重连:`sessionToken` 存 localStorage,join 时携带,服务端据此恢复座位并下发全量视图 + 时钟快照。

## 8. 部署(宝塔 + PM2)

1. `web` 构建产物 `dist/` 交由 Nginx 静态托管(或宝塔静态站点)。
2. `server` 用 PM2 守护,监听 `127.0.0.1:3190`。
3. Nginx 站点:
   ```nginx
   location /ws {
     proxy_pass http://127.0.0.1:3190;
     proxy_http_version 1.1;
     proxy_set_header Upgrade $http_upgrade;
     proxy_set_header Connection "upgrade";
     proxy_read_timeout 300s;
   }
   ```
4. TLS 用宝塔证书;对局记录目录挂持久化路径并纳入备份。

## 9. 里程碑

| 阶段 | 内容 | 验收 |
|---|---|---|
| M1 | shared 规则引擎 + vitest 单测 | 走法/将军(按位置身份)/明士象自由/困毙/洗子分布 全覆盖 |
| M2 | server 房间+对局+协议 | 两个脚本 ws 客户端打完一整局(含揭示、将死、超时) |
| M3 | web 棋盘 UI + 联机 | 手机浏览器双机对局流畅,翻子动画 |
| M4 | 计时/断线重连/和棋判定/记录落盘 | 掉线 60s 重连恢复;超时判负 |
| M5 | 部署上线 | 域名 + TLS + PM2,外网双人联机 |

## 10. 已识别的风险/坑

1. **将军判定按 effectiveType** —— 最易写错,单测必须覆盖"暗车照将""明象过河将军"等用例。
2. **暗子保密是协议红线** —— review 时专查每条 S2C 消息与日志;写一条 eslint 自定义规则或类型约束兜底(PublicCell 类型即护栏)。
3. 移动端触摸:棋盘区域禁止页面滚动/双击缩放(touch-action)。
4. 重连幂等依赖 seq + token,M2 就要把协议定死,避免返工。
5. 房间 TTL:无对局动作 2 小时自动销毁,防内存泄漏。
6. 时间以服务端为准;客户端时钟仅供显示。
