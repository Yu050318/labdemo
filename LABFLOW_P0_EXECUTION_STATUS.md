# LabFlow P0 执行状态

> 更新日期：2026-07-29  
> 产品基线：`LABFLOW_P0_FROZEN_BASELINE.md`  
> 跨部门计划：`docs/superpowers/plans/2026-07-29-labflow-cross-department-execution.md`

## 当前结论

| 阶段门槛 | 状态 | 结论 |
|---|---|---|
| G0 需求冻结 | 已通过 | P0 范围、业务规则和 AC-P0-01～12 已冻结 |
| G1 产品流程与设计规格 | 已通过 | `G1-Countersign-5` 已获开发部、测试部会签及产品部批准 |
| G2 技术规格与测试设计 | 已通过 | `G2-Review-3.1` 已关闭 G2-QA-01～04，并获测试部一致性评审通过及产品部批准 |
| G3 静态页面与视觉验收 | 已通过 | commit `4dbfae6` / Sites version 3 经测试部最终验收通过，产品缺陷 0 |
| G4 功能实现与集成验证 | 进行中 | 开始 Supabase、认证、RLS 与 P0 业务闭环实现及增量测试 |
| G5 发布候选与试点 | 未开始 | 依赖功能、测试、Sites M0 与恢复演练 |
| G6 正式发布 | 未开始 | 依赖 G5 发布评审 |

## G1 正式批准记录

- 设计规格：`docs/superpowers/specs/2026-07-29-labflow-p0-g1-design-spec.md`
- 批准版本：`G1-Countersign-5`
- 开发部结论：同意会签，无 G1 实现阻断。
- 测试部结论：同意会签；G1-QA-01～03 已关闭，v5 增量复核 11/11 通过。
- 产品部结论：批准 G1。
- 放行边界：允许将该规格作为后续视觉事实来源的业务与体验依据；只有 G2 同时通过后，设计部才正式进入网页 UI 视觉设计，开发部才进入固定数据静态页面阶段。

## 当前进行中的工作

1. 开发部实现 Supabase 数据模型、Auth、RLS、P0 API/RPC 和真实业务闭环。
2. 测试部按增量执行功能、权限、时间、离线和回归测试。
3. 设计部验证真实数据与错误状态接入后没有破坏 `G3-Visual-1`。

## G2 正式批准记录

- 技术规格：
  - `docs/superpowers/specs/2026-07-29-labflow-p0-tech-spec.md`
  - `docs/superpowers/specs/2026-07-29-labflow-p0-api-contract.md`
  - `docs/superpowers/specs/2026-07-29-labflow-p0-data-model.md`
- 批准版本：`G2-Review-3.1`
- 测试设计：`docs/qa/LABFLOW_P0_G2_TEST_DESIGN.md`（`QA-P0-G2-4`）
- 测试部结论：G2-QA-01～04 全部关闭，规格一致性与可测试性通过。
- 产品部结论：批准 G2，允许进入 G3。
- 放行边界：
  - 设计部可以制作网页 UI 与视觉事实来源。
  - 开发部可以执行项目基线、Sites M0 和基于固定数据的静态页面工作。
  - G3 视觉验收通过前，不得接入 Supabase 真实数据或实现 G4 业务闭环。

## G3 设计部交付记录

- 视觉方向：方向 1「实验记录台 / Field Ledger」。
- 可编辑静态原型：`design/labflow-g3/`。
- 视觉规格：`docs/superpowers/specs/2026-07-29-labflow-p0-g3-visual-spec.md`。
- 页面与状态矩阵：`design/labflow-g3/PAGE_STATE_MATRIX.md`。
- 设计 QA：`design/labflow-g3/design-qa.md`，内部结论 `passed`。
- 设计部验证：23/23 页面、10/10 全局状态、46/46 桌面/320 路由检查、4/4 核心交互、Sites 打包测试 4/4。
- 测试部最终复验：`docs/qa/LABFLOW_P0_G3_STATIC_PAGE_ACCEPTANCE_REPORT.md`（`QA-P0-G3-3`），结论为“通过（G3 Next.js 固定数据静态页面范围）”；23/23 页面、10/10 状态、5/5 G2 用户可见增量、46/46 路由检查及代表性视觉、键盘、语义和可访问性检查通过，产品缺陷为 0。
- 原生浏览器 200%：`QA-G3-GAP-01` 已使用普通有界面 Chrome 的真实 200% 缩放证据关闭。
- 当前边界：产品部已正式批准 G3；`G3-Visual-1` 冻结为 G4 唯一视觉事实来源。实现侧不得反向修改或污染 `design/labflow-g3`。

## G3 Next.js 集成候选记录

- 候选提交：`4dbfae6b59c940a5567be5ffa33d425a57ca803e`。
- 开发报告：`docs/engineering/LABFLOW_P0_G3_STATIC_CANDIDATE_REPORT.md`。
- Sites 版本：3（owner-only），入口：<https://labflow-m0.t77hk9x5tj.chatgpt.site>。
- 视觉一致性边界：开发部直接复用 `G3-Visual-1` 的固定数据、Design Tokens 与 CSS，未修改 `design/labflow-g3`，未自行重设计。
- 集成验证：23 页面、10 状态、G2 用户可见增量、46/46 生产路由、1440/390/320 响应式及代表性可访问性检查通过。
- 已修复集成问题：Next.js Server Page 现对白名单 `page/state/qa` 参数进行首屏解析，首屏 HTML 与水合状态一致，不再固定显示 D01。
- 测试部最终结论：commit `4dbfae6b59c940a5567be5ffa33d425a57ca803e` / Sites version 3 的 G3 固定数据静态页面验收通过，产品缺陷为 0。
- 原生 200% 证据：`QA-G3-GAP-01` 已关闭；D01、W03、W04、C01 在真实浏览器 200% 下无横向溢出，主要操作可达且焦点可见。
- 产品部最终结论：批准 G3，正式放行 G4 真实数据与业务功能实现。

## G4 设计一致性跟踪

- 状态：等待开发部第一批真实数据增量候选。
- 设计部复核范围：页面、状态、响应式、可访问性及与 `G3-Visual-1` 的视觉和交互差异。
- 重点数据与状态：真实长文本、空数据、加载、错误、离线、冲突、完成—撤销—再次完成和提醒降级。
- 职责边界：设计部不重新定义业务规则，不扩展 P1/P2，不接入真实数据，不编写业务代码。
- 决策升级：若实现暴露现有规格无法覆盖的用户可见问题，设计部记录影响并回传产品部决定，不自行扩展范围。
- 事实来源保护：`design/labflow-g3` 保持冻结；实现侧不得将集成代码或实现差异反向写入设计源文件。
