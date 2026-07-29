# LabFlow P0 / G3 Next.js 静态页面验收报告

> 状态：测试部最终验收通过  
> 报告版本：QA-P0-G3-3  
> 被测提交：`4dbfae6b59c940a5567be5ffa33d425a57ca803e`  
> Sites 版本：version 3 / `appgprj_6a698f9dcc308191a04908ac9f5dc9b0~appgver_aa9bb83961c881919efc38108e5ab81f`  
> Sites 部署：`appgdep_6a69a10f41fc819195b0d3e98f8e9fa3`  
> 测试日期：2026-07-29（Asia/Shanghai）  
> 测试范围：23 页面、10 固定状态、5 项 G2 用户可见增量、1440×900、390×844、320×844、原生浏览器 200%、键盘、焦点、语义和代表性可访问性

## 1. 测试结果

- 结论：**通过（G3 Next.js 固定数据静态页面范围）**。
- 页面路由：23 页面 × 1440/320，共 46/46 通过。
- 固定状态：10/10 通过。
- G2 用户可见增量：5/5 通过。
- 原生浏览器 200%：通过，`QA-G3-GAP-01` 已关闭。
- 自动化测试：8 个文件、27 个用例通过。
- TypeScript、ESLint、Next.js build、OpenNext build：通过。
- 浏览器控制台：0 error。
- 产品缺陷：0。

本结论只覆盖固定数据静态页面，不代表真实 Auth、Supabase 数据、真实 Push、业务持久化、自定义域名、公开入口+登录/RLS、完整 WCAG 2.2 AA 或生产发布整体通过。

## 2. 版本与产物追踪

- 工作区 `HEAD` 精确为被测提交。
- OpenNext 本地归档：
  `D:\学习\labdemo\artifacts\labflow-g3-static-opennext-4dbfae6.tar.gz`
- 归档大小：4,055,724 bytes。
- 归档 SHA-256：
  `7FF3A21BA4FA523449CF7823E05C10A40D53FEB7430ED2A7854AB28101BCB91F`
- Sites 查询确认：
  - version number：3；
  - source commit 与被测提交一致；
  - deployment status：`succeeded`；
  - runtime env revision：0，环境变量列表为空；
  - custom domains：0。

## 3. 页面、状态与 G2 增量

### 3.1 23 页面与响应式

- 1440×900 和 320×844：46 个入口全部保持单一 `h1`、正确页面标题、无页面级横向溢出、`qa=1` 不显示设计检查器。
- 390×844：W03 离线状态正确首屏渲染，离线提示、重试、当前步骤和固定计时条层级清楚。
- 320×844：D01 主要信息和固定底部区域无横向溢出，主要内容可滚动到达。
- 视觉抽查未发现文字裁切、卡片重叠、主要操作丢失或桌面/移动错误布局。

### 3.2 10 个固定状态

以下固定入口均成功渲染、单一 `h1`、无横向溢出且有有效内容：

1. normal；
2. loading；
3. empty；
4. error；
5. disabled；
6. offline；
7. conflict；
8. notification-unavailable；
9. account-pending-deletion；
10. dense。

### 3.3 5 项 G2 用户可见增量

- H02：`CMP-0728-02`、撤销完成、首次完成均存在。
- W04 offline：显示 `2 条 outbox 未发送` 和“完成已阻止”。
- W04 normal：显示无法提前发现其他离线设备尚未上报操作的提示。
- W04 conflict：显示 `PARENT_COMPLETED`、“采用最新状态”和“重新应用我的动作”。
- K02：显示“最新生效归档”和“最新生效完成归档”。

## 4. QA-G3-GAP-01 原生 200% 关闭证据

### 4.1 环境与缩放真实性

- 浏览器：普通有界面 Google Chrome，独立临时空白配置。
- 系统显示缩放：125%。
- 浏览器缩放前：
  - `innerWidth=1036`；
  - `devicePixelRatio=1.25`。
- 浏览器通过顶层快捷键设置 200% 后：
  - `innerWidth=518`；
  - `devicePixelRatio=2.5`；
  - Chrome 临时配置中的站点 `zoom_level=3.8017840169239308`，对应 200%。

`innerWidth` 减半、DPR 加倍且浏览器持久站点缩放配置存在，证明本轮使用真实浏览器 200%，不是 720×450 viewport、CSS zoom 或截图等效模拟。

### 4.2 200% 运行结果

在有效 CSS 视口约 518×323（宽度条件严于 720px 等效检查）下复核：

| 页面/状态 | 横向溢出 | 主要操作 | 固定条与遮挡 | 焦点 |
|---|---:|---|---|---|
| D01 normal | 0 | 开始计时、查看步骤详情均可达 | 可继续滚动到固定计时条上方 | 可见实线 |
| W03 offline | 0 | 重试、完成步骤、跳过均可达 | 可继续滚动到固定条上方 | 可见实线 |
| W04 conflict | 0 | 两个冲突解决操作均可达 | 无不可恢复遮挡 | 可见实线 |
| C01 pending deletion | 0 | 撤销账户删除、退出均可达 | 无普通导航和固定条干扰 | 可见实线 |

四个页面均保持单一 `h1`，移动计时条和移动导航没有造成双向滚动陷阱。初次自动滚动可能把相邻操作置于固定条下方，但用户继续单向滚动即可完整露出并聚焦，不构成不可达或永久遮挡。

独立截图：
`D:\学习\labdemo\output\playwright\qa-g3-native-200-edge.png`

结论：`QA-G3-GAP-01` **关闭**。

## 5. 键盘、焦点、语义与触控目标

- D01、W03、C01 均存在单一 `main` 和单一 `h1`。
- 可见按钮无缺失可访问名称。
- 代表性可见操作目标均不小于 44×44 CSS px。
- 正常视口前 10 个 Tab 停靠点使用 3px solid 焦点轮廓。
- 原生 200% 下关键操作仍有可见实线焦点，并可通过单向滚动到达。
- C01 不显示普通业务导航，只保留撤销账户删除和退出。

以上为代表性语义和键盘检查，不等同于真实屏幕阅读器全量认证。

## 6. 构建与运行验证

- Vitest：8/8 文件、27/27 用例通过。
- `tsc --noEmit`：通过。
- ESLint：0 错误。
- Next.js 16.2.12 build：通过。
- OpenNext Cloudflare 1.20.2 build：通过并生成 `.open-next/worker.js`。
- Windows/WSL 提示继续记录为 OpenNext 平台风险；Sites version 3 已成功部署。

## 7. Bug 列表

无。

## 8. 剩余边界与发布门禁

- 未接入真实 Supabase、migration、Auth code exchange、真实 Push 或业务持久化。
- Sites 仍为 owner-only，未绑定自定义域名。
- 公开入口、登录、RLS、真实数据、Push 投递、自定义域名和生产恢复能力仍须后续阶段独立验收。
- 本轮没有执行完整屏幕阅读器、浏览器/操作系统全矩阵或全部组件逐像素对比度扫描。

## 9. 最终门禁结论

commit `4dbfae6b59c940a5567be5ffa33d425a57ca803e` / Sites version 3 的 G3 固定数据静态页面验收通过。`QA-G3-GAP-01` 已以真实浏览器 200% 证据关闭，当前版本具备提交产品部进行 G3 最终门禁确认的条件。
