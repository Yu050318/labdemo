# LabFlow P0 / Sites M0 测试报告

> 状态：测试部独立验收通过（仅限 M0 工程兼容性）  
> 被测提交：`b0e4464790e00b7a8edc2286c127993337dc8bb6`  
> Sites 版本：version 2 / `appgprj_6a698f9dcc308191a04908ac9f5dc9b0~appgver_b6082d39102c8191833148ddbe861f8e`  
> Sites 部署：`appgdep_6a699271df448191977aed29b11b109c`  
> 测试日期：2026-07-29（Asia/Shanghai）  
> 测试范围：构建、SSR、Route Handler、环境变量、Auth 回调占位、PWA、Service Worker、Web Push、HTTPS、Sites/Vercel 边界

## 1. 测试结果

- 结论：**通过（M0 工程兼容性范围）**。
- M0 检查：12 项通过，0 项失败。
- 自动化测试：7 个文件、23 个用例通过。
- 质量检查：TypeScript、ESLint、Next.js build、OpenNext build 通过。
- 缺陷：0。
- 发布边界：本结论不代表产品 UI、真实 Auth、Supabase 数据、真实 Push、自定义域名、完整 WCAG 或 G3 整体通过。

## 2. 独立验证记录

| ID | 验证项 | 结果 | 独立证据 |
|---|---|---|---|
| M0-01 | 版本来源 | 通过 | 工作区 HEAD 与交付 commit 一致；本地归档大小 3,959,928 bytes，SHA-256 `DA672F355503485F28B83D5AE5D13ABDB171F076FDDFAF723EA025DAEA2B7258`；归档含 worker、hosting 配置和 Wrangler 配置 |
| M0-02 | Next/OpenNext 构建 | 通过 | `next build` 退出码 0；OpenNext 生成 `.open-next/worker.js`，退出码 0；Windows/WSL 提示保留为平台风险 |
| M0-03 | SSR | 通过 | `/` 返回 200、服务端时间戳存在、HTML 9157 bytes；浏览器标题和单一 `h1` 正常 |
| M0-04 | Route Handler | 通过 | health 200；合法 echo 200，空 payload 400；Cookie 含 Secure/HttpOnly/SameSite=lax；stream 返回两段文本；manifest、SW 200 |
| M0-05 | public/secret 隔离 | 通过 | `.open-next/assets` 对服务端探针名和常见服务端 secret 名扫描均为 0；Sites 运行时环境变量列表为空 |
| M0-06 | Auth callback 占位 | 通过 | 相对 `/today` 保留；绝对、协议相对、畸形输入均降级 `/`；统一 501、`no-store`、`exchangePerformed=false` |
| M0-07 | PWA | 通过 | manifest 200、standalone、start/scope `/`、192/512 图标声明 |
| M0-08 | Service Worker | 通过 | 独立浏览器确认 registered、controlled、scope 正确；缓存 `labflow-m0-v1`；离线导航进入 `/offline`；API/Auth 明确不缓存 |
| M0-09 | Web Push 降级 | 通过 | 当前安全上下文能力为 available；单元测试覆盖 unsupported/denied/error；页面持续显示站内通知降级，不创建真实订阅 |
| M0-10 | HTTPS | 通过 | Sites 默认域名 TLS 可达；未认证响应 401、`Cache-Control: no-store`；当前 owner-only |
| M0-11 | Sites 适配 | 通过 | Sites 查询确认项目 active、version 2、部署 succeeded、live URL 与回传一致 |
| M0-12 | Vercel 回退 | 通过 | 当前未触发回退；回退条件覆盖构建、SSR/Route、隔离、HTTPS/Auth/SW/Push、安全与稳定性，且不改变业务契约 |

## 3. 浏览器证据

- 320×800：无页面级横向溢出，Service Worker 已控制页面。
- 离线导航：显示 “Offline”，说明 live probes 需要网络且不会丢弃排队动作。
- 控制台：在线 M0 页面 0 error / 0 warning；离线切换时仅出现预期的网络失败日志。
- 截图：`D:\学习\labdemo\output\playwright\qa-sites-m0-mobile-320.png`。

## 4. 未覆盖与剩余风险

- `npm audit --omit=dev` 独立复跑因当前测试沙箱无法访问 npm audit endpoint 而失败；不沿用开发部“0 漏洞”为独立结论。23 个测试、构建、静态扫描均通过，但依赖漏洞仍须由可联网 CI 留档复核。
- 完整依赖树的 13 个 high 告警属于开发/构建工具链，未发现进入客户端运行时；仍须持续跟踪上游修复。
- 当前无 Sites runtime env/secret、无真实 Supabase code exchange、无真实 Push 订阅/投递/数据库写入。
- 当前未绑定自定义域名；DNS、证书续期、正式 Auth callback URL 必须在部署阶段重新验收。
- Sites 当前为 owner-only。公开入口和个人数据登录/RLS 必须在最终生产候选上重新验收。

## 5. Bug 列表

无。

## 6. 门禁结论

Sites M0 工程兼容性门禁通过，不触发 Vercel 回退。上述剩余项不得被解释为生产发布已通过；真实 Auth/数据/Push、自定义域名和公开访问边界仍是后续发布门禁。
