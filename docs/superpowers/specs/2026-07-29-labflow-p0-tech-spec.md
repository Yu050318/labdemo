# LabFlow P0 Tech Spec

> 版本：G2-Review-3.1  
> 日期：2026-07-29  
> 状态：G2-QA-01～04 已修订，待测试部差异复核  
> 上位事实来源：`LABFLOW_PRD_AND_TECH_STACK.md` V1.2、`LABFLOW_P0_FROZEN_BASELINE.md` P0-Freeze-1  
> 接口事实来源：`2026-07-29-labflow-p0-api-contract.md`  
> 数据事实来源：`2026-07-29-labflow-p0-data-model.md`

## 1. 目标与完成定义

本规格把已冻结的 P0 需求转换为可实现、可测试的技术边界。本轮只交付规格，不创建应用、不执行迁移、不接入真实 UI 数据、不部署环境。

G2 技术规格完成需满足：

1. P0 模块、数据流和服务边界明确。
2. API、数据库、Auth、RLS、服务端特权写入边界明确。
3. 时间、时区、多计时器、提醒、晚间汇总均有幂等与并发规则。
4. 短时离线 outbox、冲突、恢复与 UI 所需状态明确。
5. JSON/CSV 导出、日志、监控、备份和恢复要求明确。
6. Sites 兼容性有可执行验证清单，Vercel 回退条件可判定。
7. 不引入 P0 冻结范围外技术。

## 2. 范围约束

### 2.1 P0 允许

- Next.js App Router、React、严格 TypeScript。
- 响应式 PWA、Service Worker、IndexedDB。
- Sites 优先，Vercel 备用。
- Supabase PostgreSQL、Auth、RLS、Cron。
- PostgreSQL `pg_cron`、`pg_net`、`pg_trgm` 扩展。
- 标准 Web Push、站内通知。
- Next.js Route Handler 作为轻量服务端边界。

### 2.2 P0 禁止

- 文件上传、PDF/OCR、AI、联网检索、RAG。
- Supabase Queue、pgvector、Python Worker。
- Docker、Redis、独立消息系统、微服务。
- 材料库存、场地/仪器预约、Zotero、团队协作。
- 危险实验的闹钟级实时承诺。

## 3. 方案比较与架构决策

### 3.1 备选方案

| 方案 | 描述 | 优点 | 缺点 | 结论 |
|---|---|---|---|---|
| A. 全部直连 Data API | 浏览器直接对表 CRUD | 代码最少 | 复杂事务、版本冻结、计时和幂等容易分散到前端 | 不采用 |
| B. 全部通过 Next.js BFF | 所有读写都经过 Route Handler | 入口统一 | 重复 Supabase 能力，部署平台耦合和服务端代码增加 | 不采用 |
| C. RLS 直读 + RPC 原子写入 + 轻量 Route Handler | 普通查询走 Data API；跨表事务走 RPC；Push/导出/回调走 Route Handler | 安全边界清晰，跨平台，组件最少 | 需要严格维护 RPC Contract 和 RLS 测试 | **采用** |

### 3.2 首选架构

```text
浏览器 / PWA
├─ Next.js 页面与静态资源
├─ Supabase Auth SSR 会话
├─ RLS 保护的 Data API 查询
├─ PostgreSQL RPC 原子业务写入
└─ IndexedDB 缓存与离线 outbox

Next.js Route Handler
├─ Auth callback / session refresh
├─ Push subscription 注册与注销
├─ Web Push 分发
└─ JSON / CSV 流式导出

Supabase
├─ PostgreSQL：唯一业务事实来源
├─ Auth：邮箱密码、验证、找回
├─ RLS：个人空间隔离
├─ Cron：提醒、晚间汇总、过期清理
└─ pg_net：调用受保护的 Push 分发入口
```

核心原则：

- 数据库时间、版本号和唯一约束决定事实，不信任设备时间。
- 浏览器不持有 `service_role`、VAPID 私钥或内部 Cron 密钥。
- 复杂业务写入由事务型 RPC 完成，避免部分成功。
- 所有业务根实体带 `space_id`，P0 只创建个人空间。
- 部署层不可成为业务数据事实来源。

## 4. 模块边界

| 模块 | 职责 | 主要依赖 | 不负责 |
|---|---|---|---|
| Identity | 注册、登录、验证、找回、会话 | Supabase Auth | 业务授权 |
| Space & Preferences | 个人空间、偏好、时区、汇总设置 | PostgreSQL、RLS | 团队管理 UI |
| Schedule | 日/周任务、早中晚、改期、取消 | Tasks RPC | 自动顺延 |
| Protocols | 手工方案、版本、搜索、停用 | PostgreSQL、`pg_trgm` | 文档解析、AI |
| Execution | 准备清单、步骤、跳过、进度、归档 | Protocol snapshot、RPC | 自动完成实验 |
| Timers | 多计时器、目标时间、事件历史 | 数据库时钟、RPC | 秒级硬实时 |
| Notifications | 到期任务、站内消息、Push | Cron、pg_net、Route Handler | 保证 Push 必达 |
| Daily Summary | 当日/次日快照、未完成待处理 | Cron、IANA 时区 | 自动修改任务 |
| Offline Sync | 缓存、outbox、幂等重放、冲突 | IndexedDB、RPC | 离线结构编辑 |
| Export | JSON、三类 CSV、导出审计 | Route Handler、RLS | P1 文件导出 |
| Operations | 结构化日志、作业运行记录、恢复 | 平台日志、Postgres | 第三方可观测平台 |

## 5. 读写边界

### 5.1 浏览器可直读

登录用户可使用 Supabase publishable key 读取其空间内的：

- 用户偏好、任务、方案及版本。
- 准备项、执行步骤、计时器。
- 站内通知、每日汇总、历史归档。

所有 `public` 表必须启用 RLS，并显式授予最小 SQL 权限。`anon` 对业务表无权限。

### 5.2 必须通过 RPC 的写入

以下操作需要事务、版本校验或审计，禁止多次独立表写入：

- 初始化个人空间。
- 创建/更新/改期/取消/恢复任务。
- 确认或停用方案版本。
- 开始实验并冻结执行版本。
- 更新准备项和步骤状态。
- 启动、暂停、继续、调整、结束计时器。
- 完成实验、保存不可变快照，并创建/重试归档投影。
- 离线 outbox 幂等重放。

### 5.3 必须通过服务端 Route Handler

- Push subscription 的保存、撤销和失效清理；Route Handler 必须使用当前用户 JWT 调用受限 RPC。
- Web Push 发送。
- JSON/CSV 导出。
- 账户删除申请与撤销（需要重新验证会话时）。
- Supabase Auth callback。

### 5.4 内部特权

`service_role` 仅存在于 Sites/Vercel 服务端环境变量。它只能用于：

- Cron 触发的 Push 分发。
- 账户永久删除。

导出使用当前用户 JWT 访问 RLS 数据，不以 `service_role` 绕过用户隔离。

Push subscription 保存/撤销同样不使用 `service_role`：Route Handler 先用 SSR 会话验证用户，再以该用户 JWT 调用 `public.register_my_push_subscription` / `public.revoke_my_push_subscription`。公开 wrapper 为 `SECURITY INVOKER`，只调用不暴露 schema 中的私有 `SECURITY DEFINER` helper；helper 不接受 `user_id`，只从 `auth.uid()` 绑定当前账户。private 表不给 `anon/authenticated` 直接表权限。

内部函数和表放在不暴露的 `private` schema。确需 `SECURITY DEFINER` 时：

- 固定 `search_path`。
- 函数内部验证调用者或内部密钥上下文。
- 撤销 `PUBLIC EXECUTE`。
- 只向明确角色授予执行权。

### 5.5 Command、幂等与 revision 统一规则

- `mutation_id` 标识一次逻辑命令；服务端计算 `request_hash = hash(rpc_name + auth.uid + canonical_payload)`。
- 只有产生持久副作用的结果才写 mutation receipt：事务提交成功，或离线 stale revision 已登记为服务端冲突。纯校验/二次确认挑战、鉴权失败和临时错误不写 receipt。
- receipt 已存在且 hash 相同：返回首次持久结果；hash 不同：返回 `IDEMPOTENCY_KEY_REUSED`，不得执行。
- 二次确认挑战未写 receipt，因此可沿用原 `mutation_id` 携带确认字段重试；一旦写入 receipt，payload 不可漂移。
- 创建命令不携带 `expected_revision`，成功后新实体 revision 为 1。
- 单实体更新携带该实体 `expected_revision`。
- 同时修改 task/run 的完成与撤销命令分别携带 `expected_task_revision` 和 `expected_run_revision`；两者在同一事务内锁定和校验，任一不匹配则全部不写。

## 6. Auth 与 RLS

### 6.1 Auth

- P0 仅邮箱和密码。
- 注册必须验证邮箱。
- 找回密码使用 Supabase Auth 邮件流程。
- 开发/测试可使用平台测试邮件能力；正式发布必须配置受控的生产 SMTP，用于邮箱验证和密码找回，凭据只存服务端环境配置。
- 不启用匿名登录、社交登录、MFA、SSO。
- SSR 使用 Supabase 官方 Cookie 客户端模式；服务端鉴权以验证过的用户身份为准，不把未验证的客户端 session 当授权事实。

### 6.2 空间模型

- 每个用户首次完成验证后创建一个 `kind = personal` 的空间。
- `space_memberships` P0 仅允许一名 `owner`。
- 所有业务根实体必须引用 `space_id`。
- P2 可增加团队空间与角色，不需要迁移 P0 业务表归属。

### 6.3 RLS 正向规则

- 用户只可访问存在有效 membership 的空间数据。
- 用户账户必须为 `active`；处于 `pending_deletion/purging` 时，旧 token 也不能读取普通业务数据。
- 新建行的 `space_id` 必须属于当前用户。
- 更新同时使用 `USING` 与 `WITH CHECK`，禁止改变到无权空间。
- 子表通过父实体空间归属校验。
- 软删除行默认不出现在普通列表；恢复入口显式查询保留期内数据。

### 6.4 RLS 负向规则

必须证明：

- A 不能通过猜测 UUID 读取、更新、删除 B 的任何记录。
- `anon` 不能访问业务表或 RPC。
- 用户不能把行的 `space_id` 或 `created_by` 改成他人值。
- 用户不能直接写不可变方案版本、审计、提醒作业或幂等回执。
- 已确认方案版本、执行快照和归档制品不能被直接更新或删除。
- 客户端不能调用内部 Cron、Push 或永久删除函数。

### 6.5 Supabase 安全约束

- 不使用 `user_metadata` 作授权判断。
- 不把 `service_role`、secret key、VAPID 私钥放入 `NEXT_PUBLIC_*`。
- 暴露 schema 的所有表启用 RLS。
- View 若暴露给客户端必须使用 `security_invoker = true`。
- RLS 谓词涉及的 `space_id`、`user_id`、父外键必须建索引。

### 6.6 删除边界

- “最近删除”只包含未完成任务和未被历史锁定的逻辑方案，保留 30 天。
- 已完成 run 永不软删除；被执行引用的方案版本永不删除，逻辑方案只能停用。
- 准备项、步骤、计时器随未完成任务恢复，不提供独立恢复入口；通知和摘要不进入最近删除。
- 发起账户删除后退出普通 UI；7 天内重新登录只进入待删除页，可二次确认撤销。
- 7 天后开始 purge，最迟 30 天内完成。`account_status` 同时参与 RLS，避免未过期 access token 绕过待删除封锁。

## 7. 时间、时区与任务日期

### 7.1 存储规则

- 所有实际发生时间、服务端时间和到期时间使用 `timestamptz`，按 UTC 传输。
- 用户偏好保存 IANA 时区，例如 `Asia/Shanghai`。
- 任务同时保存：
  - `planned_local_date`：用户计划看到的日期。
  - `day_part`：`morning | afternoon | evening`。
  - `planned_local_time`：可空，表示具体本地时间。
  - `planned_local_end_time`：可空，表示具体本地结束时间。
  - `planned_timezone`：创建或改期时使用的 IANA 时区。
  - `planned_start_at/planned_end_at`：有具体时间时由服务端换算出的 UTC。
- 设备提交的 `client_occurred_at` 只用于诊断和展示，不决定数据库先后顺序。
- `created_at`、`updated_at`、实际开始/完成时间均由数据库生成。

### 7.2 旅行与修改时区

- 已计划任务不因用户修改偏好时区而改变绝对时间或计划日期。
- 新任务和未来汇总使用修改后的时区。
- 已生成的当地日期汇总不重新生成。
- 持久化只记录 `not_started | active | paused | completed | cancelled` 等显式动作事实；显示状态按“已完成/已取消 > 已逾期 > 等待中 > 进行中 > 待执行 > 待准备 > 待规划”派生。
- 已填写精确结束时间时，以任务所属日期和 `planned_timezone` 换算的精确结束时间为逾期边界。
- 未填写精确结束时间时：早在当地 12:00 起逾期；中在当地 18:00 起逾期；晚在次日当地 00:00 起逾期。
- 逾期只改变派生显示状态，不自动取消、完成或改期。

### 7.3 DST

- 不存在的本地汇总时间顺延到该日第一个有效时刻。
- 重复出现的本地时间不依赖 UTC offset 区分；`user + local_date + summary_type` 唯一约束保证只生成一次。
- 测试必须覆盖 DST 跳时、重复时段和跨午夜。

## 8. 多计时器规则

### 8.1 事实模型

每个计时器独立关联任务，可选关联执行步骤。持久状态只使用：

- `running`
- `paused`
- `ended`

“已到点”由 `running && target_end_at <= database_now()` 派生，不自动改变步骤或实验。

### 8.2 操作语义

| 操作 | 服务端效果 |
|---|---|
| start | `target_end_at = database_now() + duration`，状态 `running` |
| pause | 计算 `remaining_ms = max(0, target_end_at - database_now())`，状态 `paused` |
| resume | `target_end_at = database_now() + remaining_ms`，状态 `running` |
| extend/shorten | 运行中调整目标时间；暂停中调整剩余毫秒；不得小于 0 |
| end | 记录 `ended_at`，状态 `ended` |

每次操作：

- `start` 是创建命令，不携带 `expected_revision`，新计时器 revision 为 1；其余操作要求当前计时器 `expected_revision`。
- 在同一事务中更新计时器、追加 `timer_events`、更新提醒 generation。
- 记录 `idempotency_key`；重复请求返回第一次结果。
- 目标时间发生变化时使旧提醒作业 `superseded`，生成新的唯一提醒作业。

### 8.3 客户端显示

- 剩余时间由 `target_end_at - estimated_server_now` 推算。
- 登录或页面恢复时校准服务端时钟偏差。
- 页面倒计时只是显示，不是事实来源。
- 离线时仅继续显示已启动计时器，禁止改变计时状态。

## 9. 提醒与幂等

### 9.1 流程

1. 计时器生成 `notification_jobs`，唯一键为 `timer:{timer_id}:generation:{n}:due`。
2. Supabase Cron 每分钟执行数据库函数。
3. 函数为到期作业写入一条站内通知，依赖唯一键避免重复。
4. 函数通过 `pg_net` 调用受保护的 Next.js Push 分发入口。
5. 分发入口领取待发送作业并向当前有效订阅发送 Web Push。
6. 失效订阅被停用；Push 失败不删除站内通知。
7. 前台页面可见时每 60 秒内轮询未读站内提醒；刷新后立即查询。

### 9.2 投递语义

- 数据库作业和站内通知保证“至少一次处理、逻辑唯一”。
- Web Push 可能延迟、失败或重复；Service Worker 使用 notification id/tag 折叠重复。
- Push 成功不代表用户已看到；读取和处理状态分开记录。
- 到点、点击、延长或关闭提醒均不自动完成步骤。
- staging 正常网络下，到期作业须在目标时间后 2 分钟内被领取并形成站内提醒；前台在提醒形成后 60 秒内显示，或刷新后立即显示。
- Push 终端到达时间不作硬承诺；发布验证发送尝试、失败记录、重试和站内补显链路。

### 9.3 重试

- 临时失败按 1、5、15 分钟退避，最多 3 次。
- 永久订阅错误立即停用该订阅。
- 达到重试上限后记录 `push_failed`，站内通知仍为有效未读状态。
- 每次 Cron 执行写入 `ops_job_runs`，含开始、结束、处理数量和脱敏错误码。

### 9.4 浏览器关闭后的可靠性边界

计时和提醒事实均在数据库，关闭页面不会停止服务端领取；重新打开或换设备时按目标时间恢复。浏览器关闭后只有已获授权且平台仍允许后台投递的 Web Push 可以主动触达，操作系统省电、iOS 主屏幕安装条件、网络与浏览器策略均可能延迟或拦截，因此不承诺终端必达。站内提醒先落库，用户下次打开后立即补显；产品持续声明不替代专用报警设备、机构安全制度或人工值守。

## 10. 晚间汇总

- 用户偏好维护 `summary_enabled`、`summary_local_time`、`timezone` 和 `next_summary_at`。
- Cron 每分钟领取 `next_summary_at <= database_now()` 的用户。
- 生成过程使用数据库事务读取任务快照。
- 唯一键：`user_id + local_date + summary_type`。
- 摘要保存生成时的任务状态快照，不因后续任务修改而重写。
- 摘要只展示，不执行顺延、改期、关闭或完成。
- 生成完成后计算下一次有效本地时间。
- 修改时区或汇总时间只重算未来的 `next_summary_at`。
- 汇总启用时每天生成站内摘要。当日与次日均无任务时正文固定为“今日暂无任务记录，明日暂无安排”且不发 Push；任一日期有任务时按通知偏好尝试 Push。

## 11. 短时离线、outbox 与冲突

### 11.1 离线缓存范围

IndexedDB 缓存：

- 当天和次日日程。
- 关联方案只读快照。
- 准备清单。
- 执行步骤。
- 已启动计时器只读状态。

P0 连续离线验收目标不超过 8 小时。缓存至少覆盖该窗口；不承诺永久离线或完整离线编辑。

不得缓存认证凭据、`service_role`、VAPID 私钥或完整敏感日志。

### 11.2 允许进入 outbox 的操作

- 准备项勾选/取消勾选。
- 步骤完成/取消完成。
- 步骤跳过及原因。
- 步骤备注修改。

其他冻结基线中禁止的离线操作必须在 UI 禁用并解释原因。

### 11.3 Outbox envelope

```json
{
  "mutationId": "uuid-v4",
  "entityType": "checklist_item",
  "entityId": "uuid",
  "operation": "set_checked",
  "baseRevision": 4,
  "payload": { "checked": true },
  "clientOccurredAt": "2026-07-29T10:00:00.000Z"
}
```

规则：

- `mutationId` 使用浏览器原生 `crypto.randomUUID()`。
- 同一实体 FIFO；不同实体可并行但限制并发。
- 服务端按 `(user_id, mutation_id)` 唯一保存持久结果及 `request_hash`；重复命令按 §5.5 处理。
- 成功后才能从 outbox 删除。
- 临时错误保留并退避；鉴权失败暂停全部重放并要求登录。
- 待同步事件至少保留 24 小时；超过 24 小时仍继续保留并显著提示用户联网处理，绝不静默清除。

### 11.4 冲突

- 每个可变实体有单调递增 `revision`。
- `baseRevision != currentRevision` 时返回 `CONFLICT`，不应用操作。
- P0 不做静默最后写入胜出。
- 白名单 offline mutation 到达服务端时，先检查所属 task/run 当前状态，再比较子实体 revision。子实体 revision 过期，或所属 task/run 已完成（即使子实体 revision 仍相同），均不得应用，并在同一事务登记一条可展示/可解决的 `sync_conflicts(status='open')`；只有 `open` 的已登记冲突是服务端完成阻断事实。
- 客户端展示服务器当前值/revision、本设备待同步值和发生时间；用户选择保留服务器状态或以最新 revision 重新提交本地意图。
- 勾选类事件在没有 revision 冲突时按唯一 mutation/event id 幂等重放。
- 不同实体的操作互不冲突；同一实体连续 outbox 操作在前一个成功后更新后续 `baseRevision`。
- 另一台离线设备尚未上报的 outbox 对服务端不可见，P0 不承诺跨设备预判；任务完成后，该设备再上传的操作无论子实体 revision 是否仍匹配，都必须以 `PARENT_COMPLETED` 冲突原因拒绝并登记 open conflict，绝不覆盖完成事实。

### 11.5 归档前检查

- 当前设备有未发送 outbox 时由客户端阻止发出完成命令，并提示“其他离线设备稍后同步时可能产生冲突”；服务端不声称知道未上报 outbox。
- 服务端只根据已持久化事实阻断：当前 run 的 `open sync_conflicts`、`running/paused` 且未结束计时器，或未完成且未按规则跳过的必要步骤。可选步骤和准备不完整只警告并二次确认。
- 每次成功完成创建新的不可变 `run_completions` 快照；同一完成 `mutation_id` 只能创建一条，同一 run 可因撤销后再次完成而拥有多条。
- 撤销完成只追加引用该 completion 的 `completion_undone` 事件，并把 task/run 恢复到快照保存的完成前状态；不更新或删除旧快照/旧归档版本。
- 再次完成生成新 completion 和独立归档投影；知识库默认指向最新未被撤销的 completion，历史保留完整完成—撤销—再完成时间线。
- 归档幂等唯一键为 `completion_id`，不是 `run_id`。每个 completion 的投影失败可独立重试，任务和完成快照不得丢失。

## 12. JSON/CSV 导出

### 12.1 生成方式

- P0 不引入文件流水线或对象存储。
- Next.js Route Handler 按请求流式生成并直接下载。
- 服务端根据当前会话和空间重新校验权限。
- 每次导出写入脱敏 `export_audit_records`；不保存导出正文。

### 12.2 JSON

- MIME：`application/json; charset=utf-8`。
- 顶层版本：`labflow.p0.v1`。
- 包含任务、方案及版本、清单、步骤执行、计时及事件、站内提醒、晚间汇总和归档记录。
- 必须包含仍在 30 天恢复期内的软删除对象，并输出 `deleted_at`、`purge_after` 和对象状态。
- 每个 UTC 时间使用 ISO 8601，同时保留相关 IANA 时区和本地计划日期字段。
- 保留稳定 UUID 和引用关系，支持未来迁移。

### 12.3 CSV

分别提供：

1. `tasks.csv`
2. `protocols.csv`
3. `experiment_runs.csv`

格式要求：

- UTF-8 with BOM，兼容常见中文表格软件。
- RFC 4180 引号和换行转义。
- 第一行为稳定英文列名。
- 多值字段使用 JSON 字符串，不用不明确的逗号拼接。
- 以数据库一致性快照生成。
- 文件名包含 UTC 生成时间和 schema version。
- 只导出当前有效任务、方案和执行记录，不包含软删除对象。

### 12.4 安全

- 导出响应使用 `Cache-Control: private, no-store`。
- 不写入 CDN 缓存。
- 不包含平台日志、密钥、永久删除数据或 P1 文件。
- 公式注入风险字段以安全方式转义，防止 CSV 单元格以 `= + - @` 执行。

### 12.5 纯文本格式

- P0 的任务备注、方案简介、步骤说明、跳过原因和一般文本字段统一存储为纯文本。
- 保留换行；不解析 Markdown、HTML、富文本、嵌入脚本或自定义样式。
- 器材、材料、步骤和计时使用独立结构化字段/列表，不依赖正文标记语法。

### 12.6 来源追溯与私密资料边界

- 每个方案版本保留逻辑方案 id、版本号、状态、来源说明、创建人/时间和版本备注；执行 run 引用不可变版本并保存 schema-versioned 快照，执行归档版本回指不可变 `completion_id`，并可由它追溯 run。
- 后续编辑只能创建新版本，不覆盖已执行版本；相似方案不自动合并。
- P0 不上传或存储论文/教科书文件，因此没有“私密论文 Storage”实现。P1 若获批准须另行设计私有 bucket、对象级授权、短期签名 URL、病毒/类型校验和删除恢复，不得把 P0 数据公开或跨用户复用。

## 13. 监控与日志

P0 不新增第三方监控服务，使用部署平台日志和 Supabase 能力。

### 13.1 结构化日志

记录：

- `request_id`、`user_id_hash`、`space_id_hash`。
- route/RPC 名称、结果码、耗时、revision 冲突。
- Cron job run id、领取数、成功数、失败数。
- Push 结果类别，不记录 endpoint、密钥或正文。
- 导出类型、行数、耗时，不记录导出内容。

禁止记录：

- 密码、JWT、Cookie、secret、VAPID 私钥。
- 实验方案正文、步骤正文、备注正文。
- Push endpoint 和订阅密钥。

### 13.2 健康指标

- Auth callback 成功率。
- API/RPC 错误率与 P95 耗时。
- RLS 拒绝异常峰值。
- 提醒作业延迟、失败和积压。
- 晚间汇总漏生成/重复冲突。
- outbox 冲突率和最长待同步时长。
- 归档失败率。
- 导出失败率。
- 数据库容量、连接数和慢查询。

### 13.3 容量与性能基线

- 最多 1,000 个注册账户、100 个并发活跃用户。
- 每账户代表性容量：5,000 个任务、500 个方案、20,000 条步骤或准备项、10,000 条计时和提醒记录。
- 代表性数据与正常网络下，普通已登录页面数据响应和核心写操作 P95 均不超过 1 秒。
- 列表采用复合索引和游标分页；Cron 有界批量领取；导出走独立流式响应。不得因平台成本自行降低冻结目标。

### 13.4 告警门槛

试点阶段至少对以下情况人工或平台告警：

- 连续 2 次 Cron 失败。
- 最旧到期提醒滞后超过 5 分钟。
- 当地日期汇总在计划时间后 15 分钟仍未生成。
- 归档事务失败或数据库容量超过 70%。
- 认证、导出或内部 Push 路由出现持续 5xx。

### 13.5 正式保留期限

| 数据 | 保留期 |
|---|---:|
| 站内提醒 | 生成后 90 天 |
| 晚间汇总 | 生成后 365 天 |
| 安全与重要业务审计 | 2 年 |
| 数据导出审计 | 1 年 |
| 账户删除与脱敏处理最小回执 | 2 年 |

实验执行历史、方案版本和计时事实随账户正常保留直到账户删除；通知/汇总到期清理不得级联删除实验事实。导出审计只记录用户、时间、类型、结果和追踪 ID，不记录正文。

## 14. 备份与恢复

### 14.1 目标

- 正式生产最低业务目标为 RPO ≤ 24 小时、RTO ≤ 4 小时。
- 每次生产迁移前必须有可恢复备份。
- 正式发布前必须完成一次数据库备份恢复演练并记录实际 RPO、RTO、数据缺口和问题；此后每季度至少一次，重大迁移前额外演练。

### 14.2 方案

- 本地开发和临时测试可使用满足功能验证的低成本环境。
- 正式生产必须选择能够满足备份、恢复和稳定性目标的 Supabase 方案，不以免费层作为生产承诺。
- 若所选方案自身不能满足 RPO/RTO，必须增加至少每日一次的独立逻辑备份，并保存到经批准的异地加密位置；验证前阻断发布。
- 备份必须覆盖 schema、业务数据、RLS、函数、触发器和 Cron 定义。
- Auth 配置、站点环境变量名称、回调 URL 和 VAPID 公钥另存配置清单；secret 值不进入仓库。
- P0 没有业务文件对象，因此无需 Storage 对象恢复。

### 14.3 恢复演练

1. 在隔离项目恢复备份。
2. 执行迁移一致性检查。
3. 验证两个测试用户的 RLS 隔离。
4. 验证任务、不可变方案、执行、计时和摘要数量。
5. 验证 Cron 定义但保持外部 Push 禁用。
6. 记录恢复时长、数据缺口和问题。

P0 不包含用户论文文件，因此本阶段不涉及 Storage 对象备份。

## 15. Sites 兼容性验证计划

当前仓库没有 `.openai/hosting.json`，Sites 项目尚未创建，因此本轮不声明兼容通过。

Sites 访问模式为公开网站入口；未登录用户只能访问公开入口与认证页面，全部个人业务数据必须登录后访问并由 RLS 隔离。M0 由开发部主责，测试部提供验收清单，产品部确认业务能力是否满足。

### 15.1 验证时点

- G2 通过后建立最小兼容性 harness。
- G1 通过前只使用固定页面/最小路由，不接入真实 UI 数据。
- 真实 Sites 验证使用受限测试用户和非生产 Supabase 项目。

### 15.2 验证矩阵

| 能力 | 验证方法 | 通过条件 |
|---|---|---|
| Next.js 构建 | OpenNext/vinext 构建 | 构建无不支持 API |
| SSR | 服务端读取非敏感环境标志 | 首屏 SSR 正常 |
| Route Handler | GET/POST、Cookie、流式响应 | 状态码、头和 body 正确 |
| 环境变量 | public/secret 分离 | secret 不进入客户端 bundle/log |
| Supabase Auth | 注册、验证、登录、刷新、找回、退出 | Cookie 和回调稳定 |
| RLS/Data API | 两用户负向请求 | 无跨用户数据 |
| PWA | manifest、安装、离线 shell | 支持浏览器可安装 |
| Service Worker | 注册、更新、版本替换 | 无旧缓存长期污染 |
| Web Push | 桌面、Android、iOS 主屏幕 | 可订阅；失败有站内降级 |
| Cron 到 Route Handler | pg_net + 内部鉴权 | 可调用且拒绝伪造请求 |
| 导出 | JSON 和三类 CSV 流式下载 | 内容正确且不被缓存 |
| 版本与回滚 | 保存版本、部署、回退 | 源码 commit 与版本可追溯 |
| 访问控制 | 试点访问范围 | 仅指定用户可试点 |
| 公开入口 | 未登录访问入口、登录后数据路由 | 未登录不加载个人数据；登录后受 RLS 隔离 |
| 自定义域名/HTTPS | 域名绑定、证书、重定向和安全头 | HTTPS 有效且无混合内容 |
| 可访问性 | 键盘、焦点、语义、错误、对比、读屏、320px/200% | 核心流程达到 WCAG 2.2 AA，无阻断性缺陷 |

### 15.3 Sites 操作约束

- 发现 `.openai/hosting.json` 后必须复用真实 `project_id`。
- 同一本地站点只创建一次 Sites 项目。
- 源码先推送，`commit_sha` 必须对应被部署的准确状态。
- 只部署已保存版本；每个部署 URL 视为生产 URL。
- secret 只进入 Sites 运行环境，不写仓库或日志。

## 16. Vercel 回退条件

任一核心能力无法通过，且当前阶段没有低风险修复方案时即触发已批准的 Vercel 部署层回退：

1. Sites 无法稳定构建项目所需的 Next.js/OpenNext 产物。
2. SSR、Route Handler、Cookie 或 Auth callback 不兼容。
3. 无法安全注入服务端 secret，或 secret 进入客户端产物。
4. Service Worker scope/update 或 PWA 安装在支持浏览器上不可用。
5. Web Push 必要 API 或 VAPID 服务端发送不可用。
6. Supabase Cron 无法安全调用内部 Push Route Handler。
7. JSON/CSV 流式导出受时长、响应体或缓存规则阻断。
8. 不能实现源码 commit、保存版本、部署版本和回滚的可追溯性。
9. 无法满足试点访问范围或生产公开访问要求。

回退只迁移 Next.js 部署层。Supabase schema、Auth、RLS、Cron、域模型和接口契约保持不变。回退后必须更新 Supabase Site URL、redirect allow list、CORS/安全头、Push scope 和监控地址。

## 17. 环境隔离

至少建立：

- Local：本地开发，Supabase 本地或独立开发项目。
- Staging：测试账号、测试 Cron、测试 VAPID。
- Production：正式用户与正式密钥。

禁止：

- staging 读取 production 数据。
- 共用 VAPID 私钥、内部 Cron secret 或 service key。
- 用生产账号跑自动化破坏性测试。

迁移顺序固定为 Local → Staging → Production，生产只执行已在 staging 验证的 migration。

## 18. 测试策略

- 单元：时间换算、状态机、CSV 转义、outbox 排序。
- 组件：离线、冲突、通知不可用和待同步状态。
- 数据库：约束、事务、幂等、RLS 正向/负向、不可变版本。
- 集成：Auth SSR、Cron → Push Route、导出。
- E2E：AC-P0-01 至 AC-P0-12。
- 专项：DST、跨午夜、设备时钟错误、多计时器、多设备 revision 冲突。
- 可访问性：WCAG 2.2 AA；键盘、可见焦点、语义标签、字段错误关联、非颜色单一表达、文字对比和基本读屏语义。
- 性能：按冻结账户/并发/单账户数据规模验证页面与核心写 P95。
- 恢复：备份恢复后核心数据和 RLS 验证。
- 部署：Sites 矩阵；触发条件成立时执行 Vercel 同矩阵。

## 19. 模块与里程碑

| 里程碑 | 内容 | 前置门槛 | 完成证据 |
|---|---|---|---|
| M0 平台兼容性（最高发布准备级） | Next/Sites/Supabase/Auth/PWA/Push/域名 HTTPS 最小 harness；开发部主责 | G2 评审 | Sites 矩阵与 Vercel 回退预案结论 |
| M1 Identity & RLS | Auth、空间、偏好、RLS | M0 | 双用户负向测试 |
| M2 Schedule & Protocols | 日程、方案、版本、搜索 | M1；G1 状态字段会签 | 事务与版本测试 |
| M3 Execution & Timers | 清单、步骤、计时、归档 | M2；G3 后接真实 UI | 多计时器/归档测试 |
| M4 Notifications & Summary | Push、站内提醒、晚间汇总 | M3 | 幂等、降级、时区测试 |
| M5 Offline & Export | IndexedDB outbox、冲突、JSON/CSV | M2-M4 | 离线重放/导出测试 |
| M6 Hardening & RC | 日志、备份恢复、部署回退、全量 E2E | M1-M5 | G4/G5 证据 |

设计事实来源 G1 通过前，不开始真实 UI 数据集成；G3 静态视觉验收前，不进行组件化重构和真实数据接线。

## 20. 主要技术风险

| 风险 | 影响 | 控制 |
|---|---|---|
| RLS 配置错误 | 跨用户泄露 | 默认拒绝、双用户负向测试、显式 grant |
| Push 延迟/失败 | 错过提醒 | 站内通知先落库、补显、能力边界提示 |
| Cron 重复/漏跑 | 重复或缺失提醒/摘要 | 唯一键、作业运行记录、延迟监控 |
| 时区/DST | 汇总重复或错日 | IANA 时区、本地日期唯一键、专项测试 |
| 多设备覆盖 | 执行记录错误 | revision、expected revision、冲突 UI |
| 离线重复重放 | 重复状态变更 | mutation UUID 和服务端回执 |
| 方案历史被改写 | 归档不可追溯 | 确认后不可变、数据库触发器 |
| Sites 未验证 | 发布阻塞 | M0 harness、明确 Vercel 回退 |
| 生产备份方案未达到 RPO/RTO | 数据不可恢复或停机过长 | 合格 Supabase 方案 + 必要时独立备份 + 发布前恢复演练 |
| 中文搜索质量 | 方案难检索 | `pg_trgm` 子串/相似搜索；代表语料基线 |

## 21. 产品决策关闭记录

冻结基线第 9 节已关闭全部 G2 产品问题：

| 决策 | 已落实 |
|---|---|
| DEV-PD-01 | 早 12:00、中 18:00、晚次日 00:00；精确结束时间优先 |
| DEV-PD-02 | 生产 RPO ≤24h、RTO ≤4h，发布前恢复演练，不以免费层作生产承诺 |
| DEV-PD-03 | JSON 包含 30 天内软删除对象及恢复字段；CSV 排除 |
| DEV-PD-04 | P0 全部一般正文为纯文本，保留换行，不支持 Markdown/HTML |
| DEV-PD-05 | 提醒 90 天、汇总 365 天、重要审计/删除回执 2 年、导出审计 1 年 |
| DEV-PD-06 | 生产 SMTP；Sites 公开入口+登录数据；开发部主责 M0；Vercel 回退为最高级发布准备 |

## 22. G2 差异复核条件

测试部首次正式一致性评审结论为“有条件通过”。G2-Review-3 已按冻结基线第 10 节统一修订 Tech Spec、API Contract 与 Data Model，现仅请求测试部差异复核 G2-QA-01～04 及机械一致性。

当前结论是“待测试部差异复核”，不代表 G2 已通过；本轮不实施、不部署。Sites M0 及 Vercel 回退预案在 G2 后执行，但均为 P0 最高优先级发布阻断项。

## 23. 当前官方约束参考

- Supabase RLS：<https://supabase.com/docs/guides/database/postgres/row-level-security>
- Supabase Database Functions：<https://supabase.com/docs/guides/database/functions>
- Supabase Data API 安全：<https://supabase.com/docs/guides/api/securing-your-api>
- Supabase Cron：<https://supabase.com/docs/guides/cron>
- Supabase Next.js SSR Auth：<https://supabase.com/docs/guides/auth/server-side/creating-a-client?queryGroups=framework&framework=nextjs>
- Supabase Backups：<https://supabase.com/docs/guides/platform/backups>
- Supabase Custom SMTP：<https://supabase.com/docs/guides/auth/auth-smtp>
- Supabase Production Checklist：<https://supabase.com/docs/guides/deployment/going-into-prod>
- Supabase Extensions：<https://supabase.com/docs/guides/database/extensions>
- Supabase Breaking Changes：<https://supabase.com/changelog?types=breaking-change>

截至 2026-07-29 的相关核对结论：

- 暴露 schema 中的表必须启用 RLS。
- 新表不保证自动暴露给 Data API，migration 必须显式最小 `GRANT`，并与 RLS 同时验证。
- 2026-08-05 起扩展版本显式 pin 被弃用，migration 不写具体扩展版本。
- Supabase 默认 SMTP 仅适合测试且无生产 SLA；正式发布配置自有 SMTP。
- Pro/Team/Enterprise 提供每日平台备份；Free 仅适合开发/测试并自行逻辑导出，不能承担本项目生产恢复承诺。

## 24. G2 条件项关闭与设计影响

| 项目 | 技术闭环 |
|---|---|
| G2-QA-01 | 每次完成创建不可变 `run_completions`；撤销追加事件；再次完成创建新快照；归档以 `completion_id` 唯一 |
| G2-QA-02 | 当前设备未发送 outbox 仅由客户端阻断；服务器只检查已登记 open conflict；后到操作因子 revision 过期或父 task/run 已完成均拒绝并登记冲突 |
| G2-QA-03 | mutation 回执绑定 RPC/用户/规范 payload hash；challenge 不落回执；创建、单聚合和 task/run 双聚合 revision 分治 |
| G2-QA-04 | Push 订阅由用户 JWT 调 public invoker wrapper，再进入 unexposed private definer helper；浏览器无 `service_role` 或 private 表权限 |

设计部需知的用户可见差异仅有四项：本机 outbox 未清空时完成按钮受阻并持续提示；完成确认提示无法预知其他离线设备；旧 revision 到达服务器并登记后出现“保留服务器值/重新应用”的冲突反馈；完成历史可展示完成—撤销—再次完成多份快照，而知识库默认展示最新有效完成。Push 权限实现无 UI 变化；幂等 key payload 漂移显示一般冲突错误，不新增流程。
