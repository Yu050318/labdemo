# LabFlow P0 / G2 测试部正式一致性评审

> 评审日期：2026-07-29  
> 首次评审对象：Tech Spec、API Contract、Data Model（均为 G2-Review-2）  
> 最终差异复核对象：Tech Spec、API Contract、Data Model（均为 G2-Review-3.1）  
> 上位基线：`LABFLOW_P0_FROZEN_BASELINE.md` 第 1～10 节  
> 关联设计：G1-Countersign-5（产品部已批准）  
> 评审性质：规格一致性与可测试性评审；未执行产品、UI、视觉、WCAG 运行时或部署测试  
> 评审结论：**通过**

## 1. 结论摘要

三份开发规格已完整承接 P0 范围、AC-P0-01～12、PD-QA-01～09、PD-01～12 和 DEV-PD-01～06。RLS、时间/时区、多计时器、离线、导出、删除、保留、备份恢复、生产认证及 Sites M0/Vercel 回退均已形成可测试边界，未发现 P1/P2 范围越权。

首次正式评审发现 4 项实现前规格阻断。产品部已在冻结基线第 10 节明确 G2-QA-01、02，开发部随后以 G2-Review-3/3.1 统一修订三份规格。测试部差异复核确认 G2-QA-01～04 全部关闭，当前不存在剩余 G2 规格阻断。

## 2. 首次评审最小阻断项

### G2-QA-01：撤销完成与归档不可变/唯一规则冲突

- 严重程度：G2 阻断 / S1 风险。
- 影响：PD-08 允许完成后 30 天内恢复到完成前状态；如果首次完成已成功生成归档版本，当前数据模型同时把归档 run 及步骤设为只读，并以 `source_run_id` 保证归档版本唯一。规格未定义撤销后继续执行、再次完成时旧归档、完成快照、`archive_status` 和唯一归档版本的关系，可能导致无法撤销、无法继续执行、再次完成覆盖历史或无法重新归档。
- 证据：
  - API Contract §5.16～5.18：完成后生成不可变快照和归档投影，30 天内可 `undo_complete_experiment`。
  - Data Model 第 146 行：归档版本以 `source_run_id` 唯一。
  - Data Model 第 240 行：`archive_status` 仅有 `not_started | pending | complete | failed`。
  - Data Model 第 296、550 行：run 归档后只读，`prevent_archived_run_mutation` 阻止修改。
- 关闭标准：三份规格必须对“归档成功后撤销完成 → 继续执行 → 再次完成”的状态转换、不可变历史保留、当前归档指向及幂等唯一键给出同一且可测试的语义。

### G2-QA-02：完成阻断缺少可判定的服务端待同步/冲突事实

- 严重程度：G2 阻断 / S1 风险。
- 影响：Tech Spec 和 API Contract 声明完成事务拒绝待同步或未解决冲突，Data Model 也要求数据库触发器验证；但 outbox 和冲突详情保存在设备 IndexedDB，数据模型没有服务端 pending/conflict 实体。设备 B 在线完成时，服务端无法知道设备 A 尚未上报的离线事件，导致不同实现对 PD-04/AC-P0-08 得出不同结果。
- 证据：
  - Tech Spec §11.1～11.5：outbox 位于 IndexedDB，存在待同步/冲突时禁止完成。
  - API Contract 第 393 行：完成 RPC 拒绝待同步或未解决 revision 冲突。
  - Data Model 第 553 行：`validate_completion_blockers` 负责拒绝待同步与冲突。
  - Data Model 当前只有成功/重复 mutation 回执，没有可表示设备未上报 outbox 或未解决冲突的服务端事实。
- 关闭标准：明确完成阻断的设备范围、服务端可观察事实和跨设备行为；API、数据表/约束及 QA 预期必须能对同一场景作出唯一判定。

### G2-QA-03：mutation、创建 revision 与多聚合 revision 语义未统一

- 严重程度：G2 阻断 / S1 风险。
- 影响：
  1. 创建任务发生时间冲突后要求使用“相同 mutation”携带确认再次提交，但规格同时规定重复 mutation 返回第一次保存结果，未说明校验失败是否写 mutation receipt、同 ID 不同 payload 如何处理。
  2. `save_protocol_draft` 同时承担创建与更新、`apply_timer_action` 同时承担新建与更新，却统一继承必填 `expectedRevision`；新对象不存在 revision，契约未定义取值。
  3. 完成/撤销同时修改 task 与 run，却只有一个 `expectedRevision`，未定义它校验哪个聚合以及另一聚合如何防并发覆盖。
- 证据：
  - Tech Spec 第 360～361 行：保存 `(user_id, mutation_id)` 回执，重复请求返回已保存结果。
  - API Contract 第 177 行：时间冲突后二次确认使用相同 mutation。
  - API Contract §5.7、§5.15：创建/更新共用接口且继承单一 `expectedRevision`。
  - API Contract §5.16、§5.18：task/run 跨聚合事务只携带一个 `expectedRevision`。
- 关闭标准：统一成功/失败回执保存规则、payload 漂移处理、创建时 revision 表达，以及跨聚合写入需要校验的 revision；所有调用方和数据约束必须一致。

### G2-QA-04：Push subscription 的 private schema 写入授权路径未闭合

- 严重程度：G2 阻断 / S1 安全风险。
- 影响：订阅保存/撤销必须由 Route Handler 完成，目标表位于 `private` schema 且只允许 internal/service；但 Tech Spec 把 `service_role` 使用范围限制为 Cron Push 分发和账户永久删除，API Contract 也没有定义受用户身份约束的数据库 RPC。实现可能因此无法写入订阅，或为求可用而扩大 service role 权限并引入跨用户修改风险。
- 证据：
  - Tech Spec 第 129 行：Push subscription 保存、撤销必须经 Route Handler。
  - Tech Spec 第 137～140 行：`service_role` 只能用于 Cron Push 分发和账户永久删除。
  - Data Model §3.5：订阅表位于 `private.push_subscriptions`。
  - Data Model §6：`private.*` 仅 internal/service 可写。
  - API Contract §6.1：只描述 HTTP 鉴权和 endpoint hash，没有定义符合上述限制的数据库写入边界。
- 关闭标准：三份规格必须明确 Route Handler 到 private 表的最小权限写入路径、当前用户绑定、跨用户拒绝和撤销规则，且不得把 service role 暴露给浏览器或放宽为无用户约束的写入。

## 3. G2-Review-3.1 差异复核关闭记录

| ID | 最终规格证据 | 复核结论 |
|---|---|---|
| G2-QA-01 | 每次完成创建不可变 `run_completions`；撤销仅追加事件；再次完成创建新 completion；归档按 `completion_id` 唯一，知识库默认最新有效完成 | 已关闭 |
| G2-QA-02 | 当前设备未发送 outbox 由客户端阻断；服务端仅检查已登记 open conflict；父 task/run 已完成时，即使子 revision 匹配也以 `PARENT_COMPLETED` 原子登记 open conflict；重复 mutation 返回同一 conflict | 已关闭 |
| G2-QA-03 | 回执绑定 RPC/用户/规范 payload hash；challenge 不落回执；创建、单聚合、task/run 双聚合 revision 分治 | 已关闭 |
| G2-QA-04 | 当前用户 JWT → public `SECURITY INVOKER` wrapper → private 最小权限 `SECURITY DEFINER` helper；从 `auth.uid()` 派生用户，浏览器无 service role/private 表权限 | 已关闭 |

差异复核未发现第 10 节以外的需求扩展。G2-Review-3.1 仍只定义规格，不代表任何产品功能、UI、WCAG、性能、部署或恢复演练已经通过。

## 4. 覆盖核对

| 范围 | 结论 | 主要证据 |
|---|---|---|
| AC-P0-01～12 | 12/12 已映射 | Tech Spec §4、§6～18；API §3～9；Data Model §3～15 |
| PD-QA-01～09 | 9/9 已落地 | 提醒窗口、DST、8h/24h、revision、WCAG、删除、容量、空摘要、软删除规则均明确 |
| PD-01～12 | 12/12 已落地 | 冲突确认、准备快照、离线跳过、完成阻断、状态、误完成、必填、删除入口均有契约 |
| DEV-PD-01～06 | 6/6 已落地 | 三份规格均含关闭记录；时间、备份、导出、纯文本、保留、认证/部署规则一致 |
| P0 范围边界 | 无越权 | 未引入文档处理、AI、联网检索、库存、预约、Worker、Docker 或团队功能 |
| Sites M0 / Vercel | 验收矩阵完整 | 构建、SSR、Route Handler、环境变量、Auth、PWA、SW、Push、域名/HTTPS及同矩阵回退已覆盖 |

## 5. 第 9 节专项结论

- DEV-PD-01：早 12:00、中 18:00、晚次日 00:00 及精确结束时间优先已一致落地；逾期仅为派生显示状态。
- DEV-PD-02：生产 RPO ≤ 24 小时、RTO ≤ 4 小时、非免费层承诺、必要独立备份及发布前恢复演练已一致落地。
- DEV-PD-03：JSON 固定包含 30 天内软删除对象及恢复字段；CSV 排除；永久删除均排除。
- DEV-PD-04：一般正文固定纯文本、保留换行，不解析 Markdown/HTML，无格式开关。
- DEV-PD-05：90 天/365 天/2 年/1 年/2 年保留期明确，清理不得破坏实验事实。
- DEV-PD-06：生产受控邮件、公开入口与登录数据边界、开发部主责 M0、Vercel 回退不改 API/数据/业务规则均明确。

## 6. 发布阻断延续

G2 规格通过后，以下仍是后续发布阻断，不因本次会签自动通过：

- Sites M0 与 Vercel 回退预案未实际验证。
- 正式生产邮件未配置或邮箱验证/找回未通过。
- 未完成数据库恢复演练，或实际结果不能证明 RPO ≤ 24 小时、RTO ≤ 4 小时。
- RLS 双用户负向、导出隔离、保留清理、离线/冲突、多计时器、完成/撤销/归档、WCAG 2.2 AA 或容量性能未通过。

## 7. 最终会签意见

**通过。**

冻结业务规则覆盖完整，G1 已正式通过，G2-QA-01～04 已全部关闭，Tech Spec、API Contract、Data Model 与测试口径在本轮差异范围内一致。测试部同意 G2 规格门禁通过并提交产品部作最终阶段状态确认。

本结论只代表规格一致性和可测试性通过；本轮未执行产品、UI、视觉、WCAG 运行时、性能、数据库、Sites M0、Vercel 回退、备份恢复或部署测试。
