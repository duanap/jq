# 揭棋 · 联机网页版

中国象棋变体「揭棋」的双人对弈网站:帅/将明置,其余 30 子随机暗置,动子即揭,明士出宫、明象过河。游客昵称 + 房间链接制,移动端 H5 优先。

架构设计与规则细节见 [ARCHITECTURE.md](./ARCHITECTURE.md)。

## 本地开发

```bash
npm install          # 根目录一次装齐三个包
npm run dev:server   # 游戏服务 :3190
npm run dev:web      # 前端开发服务 :5173(已代理 /ws)
```

浏览器开 http://localhost:5173 ,创建房间后用另一个窗口(或手机)带房码加入。

## 测试与联调

```bash
npm test             # shared 规则引擎单测(vitest)
npm run typecheck    # shared + server TS 检查
npm run e2e          # 自动拉起服务器,双客户端打完整流程
```

e2e 覆盖:建房/加入/开局、**暗子保密红线**(每条下发给客户端的消息都校验暗子不带身份)、随机整局每步揭示一致性、非法步拒绝、超时判负、断线重连、再来一局换先。

单人调试 UI 时可让机器人陪练(执黑,随机合法着法):

```bash
npx tsx server/scripts/sparring.ts <房码> [昵称]
```

## 生产构建与部署

```bash
npm run build        # 产物:server/dist/server.cjs(单文件)+ web/dist/
npm start            # 本机验证:node server/dist/server.cjs,自带静态托管
```

服务器(宝塔)部署:

1. 上传整个项目目录(或只传 `server/dist`、`web/dist`)到如 `/www/wwwroot/jieqi`;
2. PM2 启动:`pm2 start deploy/ecosystem.config.cjs`(改好 cwd),监听 `127.0.0.1:3190`;
3. Nginx 站点按 `deploy/nginx.jieqi.conf.example` 配:静态指 `web/dist`,`/ws` 反代 3190,证书走宝塔;
4. 健康检查 `https://域名/healthz`。

> Node 也可直接静态托管(`server` 内置了 `web/dist` 服务与 SPA 回退),Nginx 只做 TLS + 反代也行。

## 目录结构

```
jieqi/
├─ shared/   规则引擎 + 协议(前后端同一份 TS,vitest 覆盖)
├─ server/   ws 服务:房间/对局/计时/重连/对局记录(records/*.ndjson)
├─ web/      Vue3 + Vite:棋盘、房间 UI、自动重连
└─ deploy/   PM2 + Nginx 配置样例
```

## 规则实现口径

- 暗子按**位置身份**走子/吃子/照将;马蹩腿、象塞眼、炮隔子照算;
- 动暗子即揭示(走或吃都揭),之后按真实身份走;
- **明士出九宫、明象可过河**(塞眼照算),暗士暗象仍受限;
- 困毙判负;长将判负(三次重复窗口内一方每步都在将军);长捉暂按和棋处理;
- 60 回合(120 半步)无吃子判和;三次重复局面判和;
- 不支持悔棋(揭示信息不可回退);重开自动换先并重新洗子;
- 计时服务端权威,默认 10+3,建房可传 {baseMin, incSec},baseMin≤0 为不限时。

## 安全设计(揭棋特有)

- 洗子只发生在服务端(`crypto` 熵源 Fisher–Yates);
- 类型层面保证暗子身份不出服务端:`PublicCell` 的暗子分支**没有 type 字段**,回放记录也只存“动作+揭示结果”;
- 走法判定、将军、终局全部在服务端;客户端只用同一份引擎做走法提示;
- 断线重连按 `sessionToken` 恢复,任何客户端都拿不到未揭示的暗子信息。
