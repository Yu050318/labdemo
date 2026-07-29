# LabFlow P0 / G3 Sites M0 工程验收报告

- 状态：开发部工程验证通过，等待测试部独立验收
- 被测提交：`b0e4464790e00b7a8edc2286c127993337dc8bb6`
- Sites 项目：`appgprj_6a698f9dcc308191a04908ac9f5dc9b0`
- Sites 版本：2（`appgprj_6a698f9dcc308191a04908ac9f5dc9b0~appgver_b6082d39102c8191833148ddbe861f8e`）
- Sites 部署：`appgdep_6a699271df448191977aed29b11b109c`
- 生产入口：<https://labflow-m0.t77hk9x5tj.chatgpt.site>
- 访问边界：Sites `custom`，仅当前项目所有者可访问；未公开真实用户数据
- 验证日期：2026-07-29（Asia/Shanghai）

## 1. 被测版本、产物、命令与环境变量

最终 OpenNext 产物：

`D:\学习\labdemo\artifacts\labflow-sites-m0-opennext-b0e4464.tar.gz`

归档大小为 3,959,928 字节，包含 `.open-next/worker.js`、`.openai/hosting.json` 与 `wrangler.jsonc`；归档来源与被测提交一致。

复测命令：

```powershell
npm ci
npm test
npm run typecheck
npm run lint
npm run build
npm run build:opennext
npm run preview:opennext -- --port 4311
```

仅允许配置以下非敏感客户端变量名：

- `NEXT_PUBLIC_APP_ORIGIN`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_VAPID_PUBLIC_KEY`

服务端泄漏探针变量名为 `LABFLOW_M0_SERVER_ONLY_PROBE`。它只用于构建期负向扫描，未配置到 Sites，且报告不记录探针值。当前 Sites 生产环境变量修订号为 0，没有配置运行时环境变量或 secret。

## 2. Next.js / OpenNext 构建结果

工程采用 Next.js 16.2.12、React 19.2.8、TypeScript 6.0.3、OpenNext Cloudflare 1.20.2 和 Wrangler 4.115.0。

- `next build` 成功生成 SSR 首页、4 个 M0 Route Handler、Auth callback 占位与离线页。
- `opennextjs-cloudflare build` 成功生成 `.open-next/worker.js`。
- Wrangler 本地运行时成功启动并完成 HTTP/浏览器探针。
- 同一提交已推送到 Sites 隔离源码仓库，保存版本 2 并完成生产部署。

OpenNext 在 Windows 上仍输出“建议使用 WSL”的平台提示；本轮 Windows 本地运行时和 Sites 生产构建均成功，因此该提示记录为剩余风险，不单独触发 Vercel 回退。

## 3. SSR 与 Route Handler 探针

Next 本地生产运行时和 OpenNext/Wrangler 运行时均验证：

- SSR `/`：HTTP 200，服务端生成时间存在。
- GET `/api/m0/health`：HTTP 200，只返回布尔能力状态，不返回环境变量值。
- POST `/api/m0/echo`：HTTP 200；仅接受 1～64 字符字符串，边界输入安全收窄。
- GET `/api/m0/cookie`：设置 `Secure`、`HttpOnly`、`SameSite=Lax`、5 分钟有效期 Cookie。
- GET `/api/m0/stream`：流式返回两个分段。
- `/manifest.webmanifest` 与 `/sw.js`：HTTP 200。

## 4. public / secret 分离

- 浏览器可见配置仅使用 `NEXT_PUBLIC_*` 名称。
- 服务端能力探针不会回显配置值，也不输出日志。
- 使用非敏感服务端哨兵构建后扫描 `.open-next/assets`，客户端资产命中数为 0。
- Sites 未配置任何运行时 secret；浏览器不持有 `service_role`、VAPID 私钥或密码。
- `npm audit --omit=dev` 为 0 个生产依赖漏洞。

完整依赖树仍有 13 个 high 级开发/构建工具链告警，来自 ESLint 间接依赖及 OpenNext AWS 内部构建依赖。它们不进入客户端运行时，但需随上游版本持续复核；不得通过强制升级破坏当前锁定构建。

## 5. Supabase Auth callback 占位

`/auth/callback` 当前仅为 M0 安全占位，不交换真实 Supabase 授权码：

- 相对 `next=/today` 保留为 `/today`。
- 绝对 URL、协议相对 URL和畸形输入统一降级为 `/`，避免开放重定向。
- 返回 HTTP 501，明确表示真实 Auth 集成尚未进入 G3。

## 6. PWA 与 Service Worker

- Manifest 使用 `standalone`，声明 192×192 与 512×512 图标。
- 浏览器验证 Service Worker 已注册且取得页面控制权。
- 安装阶段执行 `skipWaiting`；激活阶段删除旧的 `labflow-*` 缓存并执行 `clients.claim`。
- 导航采用 network-first，并以 `/offline` 为离线降级。
- `/api/*` 与 `/auth/callback` 明确不进入缓存。
- 320×800 浏览器验证无横向溢出，截图位于：
  `D:\学习\labdemo\output\playwright\labflow-m0-mobile-320.png`

本轮验证 manifest、Service Worker 注册和运行边界；不同操作系统/浏览器是否展示安装提示仍由测试部在目标矩阵独立验证。

## 7. Web Push 与站内降级

客户端能力检测区分：

- 可用：安全上下文、Service Worker、Push API、Notification API 均存在。
- 不支持：浏览器缺少必要 API。
- 被拒绝：通知权限为 `denied`。
- 失败：注册或运行异常。

任何不支持、拒绝或失败状态都不会视为任务失败，必须保留站内提醒降级。M0 只验证能力检测与 Service Worker `push` 事件展示通知；不申请真实订阅、不发送真实 Push、不写入数据库。

## 8. HTTPS、域名与安全边界

- Sites 默认生产域名使用 HTTPS。
- 未认证访问生产入口返回 HTTP 401 和 `Cache-Control: no-store`，符合当前 owner-only 验收边界。
- 当前未绑定自定义域名；自定义域名的 DNS、证书续期和回调 URL 仍属于部署阶段验收项。
- 生产页面不含真实用户或实验数据，未接入 Supabase 业务数据。

## 9. Sites 兼容性与 Vercel 回退

本轮验证结果未发现必须回退的不兼容项，Vercel 回退暂不触发。出现以下任一情况且无法在最高优先级修复时，转入 Vercel：

1. Sites/OpenNext 无法对锁定提交稳定构建、保存版本或部署。
2. SSR、Route Handler、Cookie 或流式响应与 Next.js 契约产生不可接受差异。
3. 无法保证 public/secret 隔离，或客户端资产、日志泄漏服务端配置。
4. HTTPS、自定义域名、Auth callback、Service Worker 或 Web Push 的平台边界阻断 P0 验收。
5. Sites 运行时出现无法解决的安全、性能、稳定性或可观测性门禁失败。

当前结论：Sites M0 工程兼容性通过，等待测试部基于该提交、版本与产物进行独立验收。此结论不代表产品 UI、视觉、WCAG 全量、真实 Auth、Supabase 数据、业务功能或 G3 整体通过。

## 10. 工程范围与设计依赖

已建立严格 TypeScript、测试、lint、Next/OpenNext 构建、PWA、Route Handler、安全 callback 占位和 23 个冻结路由/非理想状态的固定数据 harness。

当前技术页仅用于 M0 诊断。设计部已锁定“实验记录台 / Field Ledger”方向，但仍在完成 23 个视图与浏览器 QA；在设计部正式交付唯一视觉事实来源前，不把设计原型并入 Next.js 应用，不接入真实数据。
