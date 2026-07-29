# LabFlow P0 数据模型、迁移与权限规格

> 版本：G2-Review-3.1  
> 日期：2026-07-29  
> 状态：G2-QA-01～04 已修订，待测试部差异复核  
> 数据库：Supabase PostgreSQL

## 1. 建模原则

- PostgreSQL 是业务唯一事实来源。
- 所有业务根实体使用 UUID、`space_id`、数据库时间和 revision。
- P0 只开放个人空间，但表结构使用空间归属。
- 历史执行通过不可变版本和执行快照保护。
- 普通删除为软删除；保留期到期后由内部作业清理。
- 复杂状态变化通过 RPC 事务完成。
- 状态字段使用 `text + check constraint`，避免 PostgreSQL enum 难演进。
- 内容字段优先规范化；只对历史快照、每日摘要使用 JSONB。

## 2. Schema 边界

### 2.1 `public`

仅放需要客户端 Data API 读取或经 RPC 操作的业务数据。全部启用 RLS。

### 2.2 `private`

不暴露给 Data API：

- 内部提醒作业。
- Push subscription。
- 幂等 mutation 回执。
- Cron 运行记录。
- 内部审计。
- 账户永久删除执行状态。
- 特权 helper/function。

### 2.3 `auth`

由 Supabase 管理；应用只通过外键引用 `auth.users.id`，不修改 Auth 内部表结构。

## 3. 表清单

### 3.1 身份、空间与偏好

#### `public.user_profiles`

| 字段 | 类型 | 规则 |
|---|---|---|
| `user_id` | uuid PK | FK `auth.users`, cascade only during account purge |
| `display_name` | text null | 不用于授权 |
| `account_status` | text | `active | pending_deletion | purging` |
| `created_at` | timestamptz | DB default |
| `updated_at` | timestamptz | DB trigger |

#### `public.spaces`

| 字段 | 类型 | 规则 |
|---|---|---|
| `id` | uuid PK | |
| `kind` | text | P0 check `personal` |
| `name` | text | |
| `owner_user_id` | uuid | FK auth user |
| `created_at` | timestamptz | |
| `deleted_at` | timestamptz null | 账户删除流程使用 |

唯一：P0 对 `owner_user_id where kind = 'personal' and deleted_at is null` 建部分唯一索引。

#### `public.space_memberships`

| 字段 | 类型 | 规则 |
|---|---|---|
| `space_id` | uuid | FK spaces |
| `user_id` | uuid | FK auth users |
| `role` | text | P0 仅 `owner` |
| `status` | text | `active | removed` |
| `created_at` | timestamptz | |

PK：`(space_id, user_id)`。

#### `public.user_preferences`

| 字段 | 类型 | 规则 |
|---|---|---|
| `id` | uuid PK | |
| `user_id` | uuid unique | |
| `space_id` | uuid unique | |
| `timezone` | text | IANA 时区 |
| `summary_enabled` | boolean | default true |
| `summary_local_time` | time | default `21:00` |
| `protocol_display_preference` | text | P0 固定 `standard_full` |
| `next_summary_at` | timestamptz null | 服务端计算 |
| `revision` | bigint | default 1 |
| `created_at/updated_at` | timestamptz | DB |

浏览器通知权限不作为跨设备事实保存为“已授权”；只保存用户提醒偏好。实际权限由每台设备查询。

### 3.2 方案与版本

#### `public.protocols`

逻辑方案身份。

| 字段 | 类型 | 规则 |
|---|---|---|
| `id` | uuid PK | |
| `space_id` | uuid | |
| `title` | text | |
| `lifecycle_status` | text | `active | deactivated` |
| `current_version_id` | uuid null | 延迟 FK |
| `search_text` | text | RPC 维护 |
| `revision` | bigint | |
| `created_by` | uuid | |
| `created_at/updated_at` | timestamptz | |
| `deleted_at/purge_after` | timestamptz null | |

索引：

- `(space_id, lifecycle_status, updated_at desc)`
- `gin(search_text gin_trgm_ops)`
- `gin(tags)` 若 tags 保存在逻辑方案；本规格将 tags 放版本表。

#### `public.protocol_versions`

| 字段 | 类型 | 规则 |
|---|---|---|
| `id` | uuid PK | |
| `protocol_id` | uuid | |
| `space_id` | uuid | 冗余用于 RLS/索引，触发器校验父归属 |
| `version_number` | integer | > 0 |
| `status` | text | `draft | review_pending | confirmed` |
| `origin` | text | `manual | execution_archive` |
| `source_completion_id` | uuid null | 归档版本回指一次不可变完成，逻辑唯一 |
| `title` | text | |
| `objective` | text null | |
| `applicability` | text null | |
| `key_parameters` | text null | |
| `cautions` | text null | |
| `source_text` | text null | P0 用户手工来源 |
| `version_note` | text null | |
| `tags` | text[] | default `{}` |
| `revision` | bigint | 草稿阶段可变 |
| `confirmed_at` | timestamptz null | |
| `created_by/created_at/updated_at` | uuid/timestamptz | |

唯一：`(protocol_id, version_number)`。
归档来源唯一：`(source_completion_id) where source_completion_id is not null`。同一 run 撤销后再次完成可产生新的归档版本。
`source_completion_id` 的 FK 在 migration 004 创建 `run_completions` 后延迟补充，避免 migration 003/004 循环依赖。

不可变触发器：

- 旧状态为 `confirmed` 或 `origin = execution_archive` 时拒绝内容 UPDATE。
- 被 `experiment_runs.protocol_version_id` 引用时拒绝 DELETE。

#### `public.protocol_checklist_templates`

| 字段 | 类型 |
|---|---|
| `id` | uuid PK |
| `protocol_version_id` | uuid |
| `space_id` | uuid |
| `category` | text |
| `name` | text |
| `quantity_or_spec` | text null |
| `notes` | text null |
| `position` | integer |

唯一：`(protocol_version_id, position)`。

#### `public.protocol_steps`

| 字段 | 类型 |
|---|---|
| `id` | uuid PK |
| `protocol_version_id` | uuid |
| `space_id` | uuid |
| `instruction` | text |
| `key_parameters` | text null |
| `estimated_duration_minutes` | integer null |
| `cautions` | text null |
| `timer_suggested_minutes` | integer null |
| `required` | boolean default true |
| `position` | integer |

唯一：`(protocol_version_id, position)`。

父版本确认后，模板和步骤同样不可变。
确认 RPC 只强制方案名称、至少一个步骤、每步非空可执行说明；其余方案内容允许为空。

任务备注、方案简介/来源、步骤说明、跳过原因及一般文本字段均为纯文本并保留换行；数据库不保存 Markdown/HTML 格式开关，应用输出到 HTML 时必须转义。

### 3.3 日程与执行

#### `public.experiment_tasks`

| 字段 | 类型 | 规则 |
|---|---|---|
| `id` | uuid PK | |
| `space_id` | uuid | |
| `title` | text | |
| `execution_state` | text | `not_started | active | paused | completed | cancelled` |
| `planned_local_date` | date | |
| `day_part` | text | `morning | afternoon | evening` |
| `planned_local_time` | time null | |
| `planned_local_end_time` | time null | |
| `planned_timezone` | text | IANA |
| `planned_start_at` | timestamptz null | DB 派生 |
| `planned_end_at` | timestamptz null | DB 派生 |
| `notes` | text null | |
| `protocol_version_id` | uuid null | 开始后不可改 |
| `actual_started_at` | timestamptz null | |
| `actual_completed_at` | timestamptz null | |
| `revision` | bigint | |
| `created_by` | uuid | |
| `created_at/updated_at` | timestamptz | |
| `deleted_at/purge_after` | timestamptz null | |

索引：

- `(space_id, planned_local_date, day_part)`
- `(space_id, execution_state, planned_start_at)`
- `(protocol_version_id)`

展示状态由只读 view/RPC 派生，不允许客户端写入，优先级固定为：已完成/已取消 > 已逾期 > 等待中 > 进行中 > 待执行 > 待准备 > 待规划。逾期优先使用 `planned_end_at`；未填写时按任务所属日期和 `planned_timezone` 计算：早 12:00、中 18:00、晚次日 00:00。

#### `public.experiment_runs`

| 字段 | 类型 | 规则 |
|---|---|---|
| `id` | uuid PK | |
| `space_id` | uuid | |
| `task_id` | uuid unique | P0 一任务一执行 |
| `protocol_version_id` | uuid | 不可变版本 |
| `protocol_snapshot` | jsonb | 开始时快照，schema version |
| `status` | text | `active | paused | completed` |
| `started_at/paused_at/completed_at` | timestamptz | DB |
| `incomplete_preparation_snapshot` | jsonb | 开始时未完成项 |
| `revision` | bigint | |
| `created_at/updated_at` | timestamptz | |

`completed_at` 只表示当前有效完成时间；撤销时置空。它不是历史事实来源，历史完成时间由 `run_completions` 保留。

#### `public.run_completions`

每次确认完成生成一行，之后禁止 UPDATE/DELETE：

| 字段 | 类型 | 规则 |
|---|---|---|
| `id` | uuid PK | completion ID |
| `space_id/task_id/run_id` | uuid | 归属同一聚合 |
| `sequence` | integer | 同 run 从 1 递增 |
| `mutation_id` | uuid | 本次完成命令 |
| `completed_at` | timestamptz | 数据库时间 |
| `pre_task_state/pre_run_state` | text | 撤销时恢复 |
| `snapshot_schema_version` | text | |
| `completion_snapshot` | jsonb | 最终清单、步骤、计时、计划/实际时间和备注 |
| `completion_notes` | text null | 纯文本 |
| `created_by/created_at` | uuid/timestamptz | |

唯一：`(run_id, sequence)`、`(run_id, mutation_id)`。同一完成 mutation 重试指向同一行；再次完成必须产生新 mutation 和新 sequence。

#### `public.completion_archives`

| 字段 | 类型 | 规则 |
|---|---|---|
| `completion_id` | uuid PK | 一次完成一个投影 |
| `space_id/run_id` | uuid | |
| `status` | text | `pending | complete | failed` |
| `archived_protocol_version_id` | uuid null | FK protocol_versions |
| `attempt_count` | integer | |
| `last_error_code` | text null | 不含正文 |
| `revision` | bigint | |
| `created_at/updated_at` | timestamptz | |

归档重试只更新此投影状态，不更新完成快照。知识库“当前执行归档”默认选择 run 最新、尚未被后续 `completion_undone` 事件撤销的 completion；历史查询返回全部 completion 和归档版本。

#### `public.run_events`

Append-only execution history: `started | paused | resumed | completed | completion_undone | archive_retried`，记录 `run_id`、可空 `completion_id`、`mutation_id`、数据库时间、actor 和白名单 metadata。撤销只追加引用原 completion 的 `completion_undone` 事件，不修改原完成快照或归档；不允许客户端更新/删除。

#### `public.task_checklist_items`

| 字段 | 类型 |
|---|---|
| `id` | uuid PK |
| `space_id` | uuid |
| `task_id` | uuid |
| `run_id` | uuid null，开始时绑定并冻结 |
| `source_template_id` | uuid null |
| `category` | text |
| `name` | text |
| `quantity_or_spec` | text null |
| `checked` | boolean |
| `checked_at` | timestamptz null |
| `notes` | text null |
| `position` | integer |
| `revision` | bigint |
| `updated_at` | timestamptz |

任务关联方案后即可生成和修改准备项；开始实验时保存未完成项快照并绑定到 run。它不是 run 创建后才存在的对象。

#### `public.run_steps`

| 字段 | 类型 |
|---|---|
| `id` | uuid PK |
| `space_id` | uuid |
| `run_id` | uuid |
| `source_protocol_step_id` | uuid null |
| `instruction_snapshot` | text |
| `key_parameters_snapshot` | text null |
| `cautions_snapshot` | text null |
| `required` | boolean |
| `position` | integer |
| `state` | text (`pending | completed | skipped`) |
| `completed_at` | timestamptz null |
| `skipped_at` | timestamptz null |
| `skipped_reason` | text null |
| `notes` | text null |
| `revision` | bigint |
| `updated_at` | timestamptz |

约束：

- `state = skipped` 时 `skipped_reason` 非空。
- `state = completed` 时 `completed_at` 非空。
- run 当前状态为 `completed` 时禁止修改；撤销完成恢复 run 后可继续修改，但旧完成快照始终不可变。

### 3.4 计时器

#### `public.timers`

| 字段 | 类型 |
|---|---|
| `id` | uuid PK |
| `space_id` | uuid |
| `task_id` | uuid |
| `run_step_id` | uuid null |
| `label` | text |
| `status` | text (`running | paused | ended`) |
| `started_at` | timestamptz |
| `target_end_at` | timestamptz null |
| `paused_at` | timestamptz null |
| `remaining_ms` | bigint null |
| `ended_at` | timestamptz null |
| `generation` | integer |
| `revision` | bigint |
| `created_at/updated_at` | timestamptz |

索引：

- `(space_id, status)`
- `(status, target_end_at) where status = 'running'`
- `(task_id)`, `(run_step_id)`

#### `public.timer_events`

追加写事件历史。

| 字段 | 类型 |
|---|---|
| `id` | uuid PK |
| `space_id` | uuid |
| `timer_id` | uuid |
| `event_type` | text |
| `occurred_at` | timestamptz |
| `previous_status/new_status` | text null |
| `previous_target_end_at/new_target_end_at` | timestamptz null |
| `delta_ms` | bigint null |
| `idempotency_key` | uuid |
| `actor_user_id` | uuid |

唯一：`(timer_id, idempotency_key)`。

### 3.5 通知与汇总

#### `public.in_app_notifications`

| 字段 | 类型 |
|---|---|
| `id` | uuid PK |
| `space_id` | uuid |
| `user_id` | uuid |
| `type` | text (`timer_due | daily_summary | system`) |
| `title` | text |
| `body` | text |
| `entity_type/entity_id` | text/uuid null |
| `logical_key` | text |
| `created_at` | timestamptz |
| `read_at` | timestamptz null |
| `handled_at` | timestamptz null |
| `revision` | bigint |

唯一：`(user_id, logical_key)`。

#### `private.notification_jobs`

| 字段 | 类型 |
|---|---|
| `id` | uuid PK |
| `space_id/user_id` | uuid |
| `job_type` | text |
| `logical_key` | text unique |
| `due_at` | timestamptz |
| `status` | text (`pending | claimed | sent | push_failed | superseded`) |
| `attempt_count` | integer |
| `next_attempt_at` | timestamptz |
| `claimed_at/claim_token` | timestamptz/uuid null |
| `last_error_code` | text null |
| `created_at/updated_at` | timestamptz |

#### `private.push_subscriptions`

| 字段 | 类型 |
|---|---|
| `id` | uuid PK |
| `user_id` | uuid |
| `endpoint` | text |
| `endpoint_hash` | text |
| `p256dh/auth_key` | text |
| `device_label` | text null |
| `status` | text (`active | invalid | revoked`) |
| `last_success_at/last_failure_at` | timestamptz null |
| `created_at/updated_at` | timestamptz |

唯一：`(user_id, endpoint_hash)`。日志不得输出这些字段。

`anon`/`authenticated` 对该表无直接权限。Route Handler 使用当前用户 JWT 调用 `public.register_my_push_subscription` 或 `public.revoke_my_push_subscription`（`SECURITY INVOKER` wrapper）；wrapper 只转调 `private` schema 内最小权限 `SECURITY DEFINER` helper。helper 固定 `search_path`、不接受 `user_id`、从 `auth.uid()` 派生所有者并验证 active account。浏览器和订阅 Route Handler 均不使用 `service_role`/等价高权限。

#### `public.daily_summaries`

| 字段 | 类型 |
|---|---|
| `id` | uuid PK |
| `space_id/user_id` | uuid |
| `local_date` | date |
| `timezone` | text |
| `summary_type` | text (`daily`) |
| `snapshot` | jsonb |
| `generated_at` | timestamptz |
| `notification_id` | uuid null |
| `schema_version` | text |

唯一：`(user_id, local_date, summary_type)`。

不存在的 DST 当地汇总时间顺延到跳变后的第一个有效当地时间；重复当地时间仍依靠 `(user_id, local_date, summary_type)` 只生成一次，不以 UTC offset 去重。汇总开启时每日均生成：当日和次日都为空时正文固定为“今日暂无任务记录，明日暂无安排”且不创建 Push 作业；任一日期有任务时按偏好创建 Push 作业。快照只包含任务 id、标题、计划时间和生成时状态，不包含不必要的方案正文。

### 3.6 幂等、审计、导出和删除

#### `private.mutation_receipts`

| 字段 | 类型 |
|---|---|
| `user_id` | uuid |
| `mutation_id` | uuid |
| `rpc_name` | text |
| `request_hash` | text |
| `entity_type/entity_id` | text/uuid |
| `result_code` | text (`committed | conflict_registered`) |
| `result_revision` | bigint null |
| `result_payload` | jsonb |
| `committed_at` | timestamptz |

PK：`(user_id, mutation_id)`。`request_hash = hash(rpc_name + auth.uid() + canonical_payload)`。只为已提交事务或已成功登记的 revision 冲突写入；challenge/纯校验失败、认证失败和临时错误不写。相同 key/hash 返回原 `result_payload`，相同 key 不同 hash 返回 `IDEMPOTENCY_KEY_REUSED`。按账户保留至少 30 天，覆盖“待同步事件至少保留 24 小时”的离线重放窗口。

#### `public.sync_conflicts`

| 字段 | 类型 | 规则 |
|---|---|---|
| `id` | uuid PK | |
| `space_id/user_id` | uuid | |
| `task_id/run_id` | uuid null | 完成阻断归属 |
| `entity_type/entity_id` | text/uuid | 白名单实体 |
| `mutation_id` | uuid | 原离线 mutation |
| `base_revision/current_revision` | bigint | |
| `pending_intent/current_state` | jsonb | 白名单字段；不接受表名/SQL |
| `reason` | text | `STALE_ENTITY_REVISION | PARENT_COMPLETED` |
| `status` | text | `open | resolved_keep_server | resolved_reapplied` |
| `resolved_at` | timestamptz null | |
| `revision` | bigint | |
| `created_at/updated_at` | timestamptz | |

唯一：`(user_id, mutation_id)`。`apply_offline_mutation` 在锁定白名单子实体后先读取并锁定所属 task/run：若父聚合已完成，不比较为可写，也不因子实体 revision 仍匹配而放行，而是在“`PARENT_COMPLETED` 冲突行 + conflict receipt”同一事务中登记；父聚合未完成但 revision 过期时以 `STALE_ENTITY_REVISION` 同样登记。只有 `status='open'` 是完成的服务端冲突阻断事实。尚在其他设备 outbox、从未到达服务器的操作不在此表，服务器不作预测。

#### `private.audit_events`

| 字段 | 类型 |
|---|---|
| `id` | uuid PK |
| `space_id/actor_user_id` | uuid |
| `action` | text |
| `entity_type/entity_id` | text/uuid |
| `request_id` | uuid null |
| `metadata` | jsonb |
| `created_at` | timestamptz |

该表只记录安全与重要业务审计，保留 2 年。metadata 只允许状态、revision、错误码等白名单字段，不保存实验正文。

#### `private.export_audit_records`

| 字段 | 类型 |
|---|---|
| `id` | uuid PK |
| `user_id/space_id` | uuid |
| `format` | text |
| `dataset` | text null |
| `includes_recoverable_deleted` | boolean | JSON 固定 true；CSV 固定 false |
| `row_count` | integer |
| `generated_at` | timestamptz |
| `request_id` | uuid |

#### `public.account_deletion_requests`

| 字段 | 类型 |
|---|---|
| `user_id` | uuid PK |
| `requested_at` | timestamptz |
| `scheduled_for` | timestamptz |
| `cancelled_at` | timestamptz null |
| `purge_started_at/completed_at` | timestamptz null |
| `status` | text |

用户只能读取自己的请求；创建/撤销通过服务端边界。

#### `private.account_deletion_receipts`

永久删除完成后仅保留最小合规回执：`subject_hash`、申请/撤销/开始/完成时间、结果码、追踪 ID 和 `retain_until`。不保留邮箱、业务正文或可恢复业务外键；保留 2 年。

#### `private.ops_job_runs`

| 字段 | 类型 |
|---|---|
| `id` | uuid PK |
| `job_name` | text |
| `started_at/finished_at` | timestamptz |
| `status` | text |
| `claimed_count/success_count/failure_count` | integer |
| `error_codes` | text[] |

## 4. 外键与删除规则

- 所有父子业务数据默认 `ON DELETE RESTRICT`。
- 账户永久删除只能由受保护的 purge 流程按明确顺序执行。
- 只有未完成任务和未被历史锁定的逻辑方案可软删除并在 30 天内恢复；软删除不触发数据库 cascade。
- `protocol_versions` 被 task/run 引用时不可物理删除。
- 已完成 run 永不进入最近删除。准备项、步骤和计时历史不提供独立删除/恢复；未完成任务恢复时整体恢复其子记录。
- 通知可按保留政策清理，但不能改变任务/步骤事实。

## 5. Revision 与 updated_at

- 所有可变实体初始 `revision = 1`。
- 创建命令不携带 expected revision，插入根聚合 `revision = 1`；单聚合更新使用 `WHERE id = ... AND revision = expected_revision`。
- 同时改变 task/run 的完成与撤销命令固定先锁 task、后锁 run，并分别比较 `expected_task_revision`、`expected_run_revision`；任一不匹配则整体回滚。
- 成功时 `revision = revision + 1`，`updated_at = database_now()`。
- 影响 0 行时再次检查可见性：
  - 不可见：`NOT_FOUND/FORBIDDEN`。
  - 可见但 revision 不同：`CONFLICT`。
- 客户端不能直接写 `revision`、`created_at`、`updated_at`。

## 6. RLS 策略矩阵

| 表组 | SELECT | INSERT/UPDATE | DELETE |
|---|---|---|---|
| profiles/preferences | 当前 user | 当前 user，经 RPC/受限 policy | 禁止物理删除 |
| spaces/memberships | 当前 membership | bootstrap/internal | internal |
| tasks/protocol roots | 当前 space member | RPC + space check | 仅软删除 RPC |
| protocol versions/templates/steps | 当前 space member | 草稿 RPC | 禁止客户端 |
| run/checklist/steps/timers | 当前 space member | RPC | 禁止客户端 |
| run completions/events/archives | 当前 space member | completion/archive RPC；完成快照和事件 append-only | 禁止客户端 |
| sync conflicts | 当前 user/space member | 冲突登记/解决 RPC | 禁止客户端 |
| timer events | 当前 space member | RPC append only | 禁止 |
| in-app notifications | 当前 user | internal | 禁止客户端物理删除 |
| daily summaries | 当前 user | internal | 禁止 |
| account deletion request | 当前 user | Route Handler | Route Handler |
| private.* | 无 Data API | internal 或显式最小权限 helper | internal |

Policy 统一使用 `TO authenticated`、`private.is_active_account(auth.uid())` 和空间/用户谓词；仅有 `TO authenticated` 不构成授权。账户处于 `pending_deletion/purging` 时，所有普通业务 SELECT/写入均拒绝，即使旧 access token 尚未过期；只允许读取和撤销本人删除请求。

## 7. Helper 与函数安全

允许的 helper：

- `private.is_active_space_member(space_id uuid, user_id uuid)`
- `private.is_active_account(user_id uuid)`
- `private.database_now()`
- `private.next_local_occurrence(local_time, timezone, after_at)`
- `private.register_my_push_subscription(...)`
- `private.revoke_my_push_subscription(...)`

安全要求：

- helper 固定 `search_path`。
- 不接受动态 SQL 表名。
- `SECURITY DEFINER` 只在避免 membership RLS 递归或写入 private subscription 时使用；订阅 helper 不接受调用方传入的 user id。
- 撤销 `PUBLIC` 执行权，再按需授权 `authenticated` 或 `service_role`。
- 业务 RPC 首行验证 `auth.uid() is not null`。
- `public.register_my_push_subscription`、`public.revoke_my_push_subscription` 使用 `SECURITY INVOKER` 并只允许 `authenticated` 执行；`authenticated` 仅获得调用这两个 private helper 所必需的 schema usage 与精确函数 execute，不获得其他 private 函数或表权限。private schema 不加入 Data API exposed schemas，private table 对 `anon`/`authenticated` 全部 revoke。调用链始终保留用户 JWT，不向浏览器暴露高权限 key。

## 8. 约束与触发器

必须具备：

1. `set_updated_at`：数据库维护更新时间。
2. `bump_revision`：仅 RPC 或受限 trigger 触发。
3. `prevent_frozen_protocol_mutation`：保护确认后版本及其子行。
4. `validate_child_space`：子表 `space_id` 与父表一致。
5. `validate_task_time`：具体时间字段组合一致。
6. `validate_step_state`：跳过原因/完成时间一致。
7. `validate_timer_state`：running/paused/ended 字段组合一致。
8. `prevent_completed_run_mutation`：run 当前完成时执行行只读；`apply_offline_mutation` 必须在触发该防线前把后到白名单操作原子登记为 `PARENT_COMPLETED` open conflict，其他写路径只拒绝；撤销恢复后重新允许写入。
9. `set_soft_delete_purge_after`：允许进入最近删除的记录删除后 30 天。
10. `prevent_completed_run_delete`：完成执行仅归档查看。
11. `prevent_completion_mutation`：`run_completions` 禁止 UPDATE/DELETE，completion archive 只能改投影状态。
12. `validate_completion_blockers`：只以已登记 `sync_conflicts.status='open'`、未结束计时器和未处理必要步骤作为服务端硬阻断；当前设备未发送 outbox 由客户端阻断，不构造服务端记录。

## 9. 搜索

P0 方案搜索覆盖标题、标签、目标、适用条件、来源和步骤文本。

采用：

- `pg_trgm` 的 trigram 相似/子串搜索，兼顾中文和模糊匹配。
- 前缀过滤 space/status。
- `search_text` 仅在草稿保存或新版本确认时由 RPC 重建。

不采用：

- pgvector。
- 独立搜索服务。
- 自动语义扩展。

以中文、英文、数字参数和特殊符号代表语料建立相关性基线；若中文 trigram 质量不足，提交 P1 搜索升级评审，不在 P0 引入 RAG。

### 9.1 容量与查询预算

模型和索引须在 1,000 个账户、100 个并发活跃用户下支撑每账户 5,000 个任务、500 个方案、20,000 条步骤或准备项、10,000 条计时和提醒记录。普通登录页面查询与核心写操作在代表性数据、正常网络下 P95 不超过 1 秒。列表统一使用带归属前缀的复合索引和游标分页；禁止无界读取子记录，导出单独走流式读取。提醒/汇总/清理按有界批次领取，不与交互请求争用长事务。

## 10. 迁移顺序

实际实施时用 Supabase CLI `supabase migration new` 创建迁移文件，不手工猜测时间戳文件名。扩展不显式 pin 版本。

| 顺序 | Migration 主题 | 内容 | 回退原则 |
|---:|---|---|---|
| 001 | schemas_extensions | `private` schema、pg_cron/pg_net/pg_trgm | 禁用依赖后再移除 |
| 002 | identity_spaces | profiles、spaces、memberships、preferences | 无业务数据时可回退 |
| 003 | protocols | protocol roots、versions、templates、steps、搜索索引 | 保留不可变版本 |
| 004 | schedule_execution | tasks、runs、run completions、completion archives、run events、task checklist、run steps | 禁止丢历史 |
| 005 | timers | timers、timer_events、约束和索引 | 先停止 Cron |
| 006 | notifications_summaries | notifications、jobs、subscriptions、summaries | 先禁用外发 |
| 007 | idempotency_conflicts_audit_deletion | mutation receipts、sync conflicts、audit、export audit、deletion requests/receipts、ops runs | 保留审计与未解冲突 |
| 008 | functions_triggers | RPC、helper、状态/不可变触发器 | 版本化替换函数 |
| 009 | rls_grants | 全表 RLS、policies、显式 grants/revokes | 不得临时关闭 RLS |
| 010 | cron_jobs | reminder、summary、soft/account purge、固定保留期清理 | 默认 staging 外发关闭 |
| 011 | verification | pgTAP/SQL fixtures 或等价验证 | 不写生产业务 seed |

生产 migration：

1. 先备份。
2. 在 staging 完整应用。
3. 运行数据库、RLS 和恢复检查。
4. 记录 migration list。
5. 生产只执行已验证文件。
6. 破坏性变更采用 expand → migrate → contract，不在同一版本直接删列。

## 11. Cron 定义

| Job | 频率 | 作用 |
|---|---|---|
| `process_due_notifications` | 每分钟 | 创建站内通知并请求 Push 分发 |
| `generate_due_daily_summaries` | 每分钟 | 按 `next_summary_at` 生成摘要 |
| `retry_push_notifications` | 每分钟 | 领取达到 next attempt 的作业 |
| `purge_soft_deleted_records` | 每日 | 清理超过 30 天且无历史保护的数据 |
| `process_account_deletions` | 每日 | 处理超过 7 天撤销期的账户 |
| `retry_failed_archives` | 每分钟 | 从不可变完成快照重试知识库归档投影 |
| `cleanup_mutation_receipts` | 每日 | 清理超过保留期的幂等回执 |
| `purge_expired_notifications` | 每日 | 清理生成超过 90 天的站内提醒 |
| `purge_expired_summaries` | 每日 | 清理生成超过 365 天的晚间汇总 |
| `purge_expired_audit_records` | 每日 | 按 2 年/1 年期限清理审计与导出审计 |
| `purge_expired_deletion_receipts` | 每日 | 清理超过 2 年的最小删除回执 |

每个 Job：

- 获取 advisory lock，防止同 job 重叠。
- 单批有数量上限，避免长事务。
- 写 `ops_job_runs`。
- 单行失败不泄露正文。
- 可安全重复执行。

提醒领取使用 `FOR UPDATE SKIP LOCKED`、有期限 claim token 和唯一 `logical_key`。staging 正常网络下，到期作业须在目标时间后 2 分钟内被领取并形成站内提醒；前台可见页面每 60 秒内轮询未读提醒，或刷新后立即显示。Push 仅验发送尝试、失败记录、退避重试和站内补显，不承诺终端必达。

## 12. 数据保留

| 数据 | 保留 |
|---|---|
| 正常账户业务数据 | 用户主动删除前 |
| 允许进入最近删除的数据 | 30 天 |
| 历史执行引用的方案版本 | 随历史保留，不因方案停用删除 |
| mutation receipts | 至少 30 天 |
| 实验执行历史、方案版本、timer events | 随账户正常保留，直到账户删除 |
| in-app notifications | 生成后 90 天 |
| daily summaries | 生成后 365 天 |
| ops job runs | 30 天 |
| 安全与重要业务 audit events | 2 年 |
| export audit | 1 年 |
| 账户删除请求 | 7 天可撤销；随后进入 purge，最迟 30 天完成 |
| 永久删除最小脱敏回执 | 2 年 |

通知和汇总到期清理不得级联删除任务、执行、方案版本或计时事实。

## 13. 数据导出映射

### JSON `labflow.p0.v1`

```text
metadata
profile
preferences
spaces
tasks
protocols
protocolVersions
protocolChecklistTemplates
protocolSteps
experimentRuns
runCompletions
completionArchives
runEvents
taskChecklistItems
runSteps
timers
timerEvents
notifications
dailySummaries
syncConflicts
recoverableDeletedObjects
```

`recoverableDeletedObjects` 固定包含 30 天恢复期内的任务/逻辑方案，并输出 `deleted_at`、`purge_after` 和对象状态；永久删除对象永不导出。

### CSV

- `tasks.csv`：任务规划、状态、方案版本引用、实际时间。
- `protocols.csv`：每个方案版本一行；步骤和清单为 JSON 字符串列。
- `experiment_runs.csv`：每次执行一行；全部完成/撤销序列、步骤/清单/计时摘要为 JSON 字符串列。

三类 CSV 查询均固定 `deleted_at is null`，不接受包含软删除数据的参数。

## 14. 生产备份与恢复

- 正式生产使用能够达到 RPO ≤24 小时、RTO ≤4 小时的 Supabase 方案，不以免费层作生产承诺。
- 若平台备份不足，增加至少每日一次的加密异地逻辑备份，覆盖 schema、数据、RLS、函数、触发器和 Cron 定义。
- 每次生产迁移前创建可恢复备份；正式发布前在隔离项目完成一次恢复演练，记录实际 RPO/RTO、数据缺口和问题。
- 恢复后验证双用户 RLS 隔离、任务/方案/run/计时/摘要数量和 migration 一致性；外部 Push 保持关闭。
- P0 无论文文件，不涉及 Storage 对象恢复。

## 15. 数据库验证清单

### 15.1 结构

- 所有 public 业务表启用 RLS。
- 所有 RLS 外键有索引。
- private schema 未暴露。
- 所有函数的 owner、search_path、execute grants 符合预期。
- 扩展未 pin 具体版本。

### 15.2 权限

- A/B 两用户逐表 SELECT/INSERT/UPDATE/DELETE 负向测试。
- 直接 RPC 猜测他人 UUID 测试。
- `anon` 和过期会话测试。
- 改写 `space_id`、`created_by`、revision 测试。
- 客户端调用 private function 测试。

### 15.3 一致性

- 确认方案后内容不可修改。
- 每次完成事务必须保存任务、run、新的不可变 `run_completions` 和独立 `completion_archives`；同 mutation 重试返回同 completion，撤销后再次完成生成新 completion。
- 撤销完成只追加引用原 completion 的事件并恢复当前任务/run；不得修改旧快照或旧归档。知识库投影失败只把对应 completion archive 置 `failed`，可从原快照幂等重试。
- timer action 重复 idempotency key 只产生一条事件。
- daily summary 同当地日期只一条。
- offline mutation 重复只应用一次。
- 创建不接收 expected revision；单聚合 mutation 比较一个 revision；完成/撤销同时比较 task/run revision。
- 相同 mutation/hash 返回原结果，相同 mutation/不同 hash 返回 `IDEMPOTENCY_KEY_REUSED`；纯确认 challenge 不写 receipt。
- revision 不匹配不覆盖业务实体，并原子登记 `sync_conflicts`；解决前保持 open。
- 所属 task/run 已完成时，使用仍匹配的子实体 revision 重放白名单离线 mutation 也不得写入，且原子登记 `reason='PARENT_COMPLETED'` 的 open conflict；重复 mutation 返回同一 conflict。
- 当前设备未发送 outbox 由客户端阻断完成；服务端只覆盖已登记 open conflict、running/paused 未结束计时器和未处理必要步骤；可选步骤与准备不完整只要求确认。
- 完成后 30 天内撤销恢复 pre-completion state，并保留完成/撤销事件。

### 15.4 时间

- UTC、本地日期、IANA 时区转换。
- DST 不存在时间顺延到首个有效当地时间；重复时间按用户/当地日期/摘要类型唯一。
- 跨午夜和修改时区。
- 设备时间错误不改变数据库事实。

## 16. 产品决策关闭记录

- DEV-PD-01：逾期边界已写入任务派生状态。
- DEV-PD-02：生产 RPO/RTO、独立备份条件与发布前恢复演练已冻结。
- DEV-PD-03：JSON 固定包含可恢复软删除对象，CSV 固定排除。
- DEV-PD-04：正文固定纯文本，不保存 Markdown/HTML 格式。
- DEV-PD-05：提醒、汇总、审计、导出审计和删除回执保留期已固定。
- DEV-PD-06：生产 SMTP、Sites M0 和 Vercel 回退属于部署/认证配置，不改变本数据模型。

## 17. G2 条件项关闭记录

- G2-QA-01：新增逐次不可变 `run_completions` 与按 completion 唯一的 `completion_archives`；撤销仅追加事件。
- G2-QA-02：新增持久化 `sync_conflicts` 作为服务器可判定事实；未发送 outbox 留在当前客户端边界；父 task/run 已完成时，子 revision 匹配的后到操作也登记 `PARENT_COMPLETED` open conflict。
- G2-QA-03：`mutation_receipts` 增加 RPC/hash/结果语义，revision 分为创建、单聚合和 task/run 双聚合。
- G2-QA-04：Push 订阅固定为用户 JWT → public invoker wrapper → unexposed private definer helper，且 private 表无客户端权限。
