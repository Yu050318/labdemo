# LabFlow P0 / G3 Next.js 静态页面候选报告

- 候选提交：`4dbfae6b59c940a5567be5ffa33d425a57ca803e`
- 唯一视觉事实来源：G3-Visual-1 / Field Ledger
- Sites 项目：`appgprj_6a698f9dcc308191a04908ac9f5dc9b0`
- Sites 版本：3（`appgprj_6a698f9dcc308191a04908ac9f5dc9b0~appgver_aa9bb83961c881919efc38108e5ab81f`）
- Sites 部署：`appgdep_6a69a10f41fc819195b0d3e98f8e9fa3`
- Owner-only 生产入口：<https://labflow-m0.t77hk9x5tj.chatgpt.site>
- OpenNext 归档：`D:\学习\labdemo\artifacts\labflow-g3-static-opennext-4dbfae6.tar.gz`
- 状态：测试部通过（固定数据静态页面范围），0 产品缺陷

## 完成内容

- 将设计部 G3-Visual-1 的 Field Ledger 可编辑 React/CSS 原型迁入 Next.js 应用。
- 保留 23 个页面/视图、10 类固定状态和 `page/state/qa` 可复现入口。
- 根页面由 Next.js Server Page 读取并白名单归一化查询参数，首屏 HTML 与水合状态一致。
- 保留 M0 SSR、Route Handler、Cookie、流式响应、Auth callback、PWA 和 Service Worker 工程能力。
- 保留 G2 第 10 节用户可见增量：
  - 完成—撤销—再次完成的不可变快照；
  - 当前设备 outbox 未清空时阻断完成；
  - 其他离线设备尚未上报的提示；
  - `PARENT_COMPLETED` 冲突反馈；
  - 知识库最新生效归档。
- 未修改 `D:\学习\labdemo\design\labflow-g3` 设计源文件。

## 范围边界

- 仅使用设计部固定代表性数据。
- 未接入 Supabase 真实数据、migration、真实 Auth、真实 Push 或 G4 业务逻辑。
- 页面按钮仅执行设计原型中的本地展示状态，不进行业务持久化。
- Sites 环境变量修订为 0，无运行时环境变量或 secret。
- Sites 访问仍为 owner-only，无群组访问。

## 自动化验证

- Vitest：8 个测试文件、27 个测试通过。
- TypeScript：`tsc --noEmit` 通过。
- ESLint：0 错误、0 警告。
- Next.js 16.2.12：生产构建通过。
- OpenNext Cloudflare 1.20.2：构建通过并生成 `.open-next/worker.js`。
- 生产依赖审计：`npm audit --omit=dev` 为 0 漏洞。
- 23 页面 × 1440/320：46/46 路由通过，0 横向溢出、每页 1 个 `h1`、QA 检查器按参数隐藏、生产控制台 0 错误。
- 10/10 固定状态检查通过。
- 5/5 G2 用户可见增量检查通过。
- 代表性 D01/W03/C01：无未命名按钮、无小于 44×44 的可见操作目标、键盘焦点环至少 3px。

## 截图证据

- 桌面 D01：`D:\学习\labdemo\output\playwright\g3-next-final-desktop-1440x900.png`
- 移动 W03：`D:\学习\labdemo\output\playwright\g3-next-final-mobile-390x844.png`
- 320px D01：`D:\学习\labdemo\output\playwright\g3-next-final-mobile-320x844.png`
- W04 离线 outbox：`D:\学习\labdemo\output\playwright\g3-next-final-w04-offline-outbox.png`
- W04 `PARENT_COMPLETED`：`D:\学习\labdemo\output\playwright\g3-next-final-w04-parent-completed.png`
- H02 完成—撤销—再次完成：`D:\学习\labdemo\output\playwright\g3-next-final-h02-complete-undo-complete.png`

## 原生浏览器 200% 门禁

`QA-G3-GAP-01` 已由测试部使用真实 Chrome 200% 关闭。

开发部已分别尝试：

1. Playwright 固定 viewport 下的网页按键；
2. 有界面 Chrome 与系统级 SendKeys；
3. 无 viewport 模拟的持久 Chrome 与 Windows 原生键盘事件。

自动化 Chrome 未产生可观测的浏览器缩放变化，`innerWidth` 与 `devicePixelRatio` 保持不变。因此没有把 720×450 等效视口、CSS zoom 或无变化截图冒充原生 200% 证据。

独立证据：

- `innerWidth`：1036 → 518；
- `devicePixelRatio`：1.25 → 2.5；
- Chrome 站点 `zoom_level=3.8017840169239308`，对应浏览器原生 200%；
- D01、W03、W04、C01 的主要操作可达；
- 固定条无永久遮挡。

测试部正式报告：

`D:\学习\labdemo\docs\qa\LABFLOW_P0_G3_STATIC_PAGE_ACCEPTANCE_REPORT.md`

## 剩余风险

- OpenNext 仍提示 Windows 并非推荐构建环境；Sites 版本 3 已成功部署。
- 完整依赖树仍有开发/构建工具链的上游安全告警；生产依赖审计为 0。
- 真实 Auth/数据/Push、自定义域名、公开入口+登录/RLS 均不属于本候选通过范围。
- 本报告仅确认固定数据静态页面范围通过；后续阶段是否启动仍由产品部决定。
