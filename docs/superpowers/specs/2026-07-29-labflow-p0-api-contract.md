# LabFlow P0 API Contract

> Contract：`labflow.p0.api.v1`  
> 版本：G2-Review-3.1  
> 日期：2026-07-29  
> 状态：G2-QA-01～04 已修订，待测试部差异复核  
> 适用范围：Next.js/React PWA + Supabase PostgreSQL/Auth/RLS/Cron

## 1. Contract 原则

1. PostgreSQL schema、RPC 入参与返回值、Route Handler 路径共同构成接口事实来源。
2. 生成的 Supabase TypeScript 类型是数据库形状事实来源；业务 DTO 需显式定义，禁止 `any`。
3. 外部输入在边界验证；数据库约束是最终防线。
4. 所有可重试写入携带 `mutationId` 或 `idempotencyKey`。
5. 创建命令不携带 `expectedRevision`；更新单聚合携带该聚合的 `expectedRevision`；跨任务/run 命令分别携带两者 revision。
6. 时间使用 ISO 8601 UTC；业务日期另传 `YYYY-MM-DD` 和 IANA 时区。
7. API 不返回实验正文到日志或错误详情。

## 2. 通用类型

```ts
type UUID = string;
type ISODate = `${number}-${number}-${number}`;
type ISOInstant = string;
type IanaTimeZone = string;

interface CommandMeta {
  mutationId: UUID;
  clientOccurredAt: ISOInstant;
}

interface MutationMeta extends CommandMeta {
  expectedRevision: number;
}

interface TaskRunMutationMeta extends CommandMeta {
  expectedTaskRevision: number;
  expectedRunRevision: number;
}

type ApiSuccess<T> = {
  ok: true;
  data: T;
  requestId: UUID;
};

type ApiFailure = {
  ok: false;
  error: {
    code: ErrorCode;
    message: string;
    fieldErrors?: Record<string, string>;
    currentRevision?: number;
    currentRevisions?: {
      task?: number;
      run?: number;
      protocol?: number;
      protocolVersion?: number;
    };
    conflictId?: UUID;
  };
  requestId: UUID;
};

type ApiResult<T> = ApiSuccess<T> | ApiFailure;

type ErrorCode =
  | "AUTH_REQUIRED"
  | "EMAIL_NOT_VERIFIED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VALIDATION_FAILED"
  | "CONFLICT"
  | "DUPLICATE"
  | "IDEMPOTENCY_KEY_REUSED"
  | "IMMUTABLE_VERSION"
  | "PENDING_OFFLINE_MUTATIONS"
  | "OPEN_SYNC_CONFLICTS"
  | "TIME_OVERLAP_CONFIRMATION_REQUIRED"
  | "INCOMPLETE_PREPARATION_CONFIRMATION_REQUIRED"
  | "ACTIVE_TIMER_BLOCKS_COMPLETION"
  | "REQUIRED_STEP_BLOCKS_COMPLETION"
  | "UNDO_WINDOW_EXPIRED"
  | "INVALID_STATE_TRANSITION"
  | "RATE_LIMITED"
  | "TEMPORARY_UNAVAILABLE"
  | "INTERNAL_ERROR";
```

返回给用户的 `message` 为可展示的概述，不包含 SQL、token、内部路径或实验正文。

幂等与回执规则：

- `mutationId` 标识一次逻辑命令。服务端计算 `requestHash = hash(rpcName + auth.uid() + canonicalPayload)`。
- 只有事务已提交，或旧 revision 已作为 `sync_conflicts` 冲突事实登记成功时，才写入 `private.mutation_receipts`。纯校验失败、二次确认 challenge、认证失败和临时错误不写回执。
- 相同用户、相同 `mutationId`、相同 `requestHash` 重试时返回首次持久化结果，不重复产生副作用；同一 `mutationId` 但 hash 不同返回 `IDEMPOTENCY_KEY_REUSED`。
- 因确认 challenge 尚未写入回执，客户端可用原 `mutationId` 补充确认字段后再次提交；首次持久化结果产生后不得再改变该 mutation 的 payload。
- 创建型命令不传 `expectedRevision`，成功创建的根聚合从 `revision = 1` 开始。单聚合更新只比较该聚合 revision；任务/run 双聚合命令按任务后 run 的固定顺序加锁并同时比较两个 revision，任一不匹配则整体不写入。

客户端消费契约须支持 WCAG 2.2 AA：`fieldErrors` 以稳定字段名关联表单控件，状态和错误不得只依赖颜色；异步状态变化提供可控的语义宣告，但计时器不每秒触发读屏播报。

所有任务备注、方案简介/来源、步骤说明、跳过原因和一般文本输入按纯文本处理并保留换行。服务端不接受“内容格式”开关，不执行 Markdown/HTML 渲染；输出到 HTML 时按文本转义，结构化内容使用显式数组和字段。

## 3. Auth Contract

Auth 使用 Supabase 官方接口，不重复包装用户名密码 API。

| 能力 | 接口 |
|---|---|
| 注册 | `supabase.auth.signUp({ email, password })` |
| 登录 | `supabase.auth.signInWithPassword(...)` |
| 找回密码 | `supabase.auth.resetPasswordForEmail(...)` |
| 更新密码 | `supabase.auth.updateUser(...)` |
| 退出 | `supabase.auth.signOut()` |
| SSR callback | `GET /api/auth/callback` |

规则：

- 未验证邮箱不能 bootstrap 业务空间。
- callback 的 `next` 只能是站内相对路径，防止开放重定向。
- Route Handler 使用 HTTP-only Cookie 完成 SSR 会话。
- 业务授权从数据库 membership 判断，不从 `user_metadata` 判断。

## 4. 查询 Contract

普通查询通过 Supabase Data API，由 RLS 限制空间。

| Query Key | 来源 | 主要参数 | 结果 |
|---|---|---|---|
| `preferences.current` | `user_preferences` | 无 | 当前用户偏好 |
| `schedule.range` | `experiment_tasks` | `fromDate`, `toDate` | 日期范围任务 |
| `protocols.search` | `search_protocols` RPC | `query`, `status`, `limit`, `cursor` | 方案摘要 |
| `protocol.detail` | protocols + versions + children | `protocolId`, `versionId?` | 方案版本 |
| `execution.detail` | task/run/task checklist/steps/timers | `taskId` | 执行聚合 |
| `timers.active` | `timers` | 无 | 当前空间运行/暂停计时器 |
| `notifications.list` | `in_app_notifications` | `unreadOnly`, cursor | 站内通知；前台可见时最多每 60 秒轮询 |
| `summaries.list` | `daily_summaries` | date range | 每日摘要 |
| `history.list` | tasks + runs + run_completions + completion_archives | cursor | 全部完成、撤销和再次完成历史；默认知识库关联最新有效完成 |
| `trash.list` | soft-deleted roots | entity type | 30 天内可恢复记录 |

列表统一：

- 按稳定排序字段和 UUID 游标分页，不使用深 offset。
- 默认排除 `deleted_at is not null`。
- 最大 `limit = 100`。
- 搜索输入最大 200 字符。

## 5. RPC Contract

### 5.1 `bootstrap_personal_space`

输入：

```ts
interface BootstrapPersonalSpaceInput {
  timezone: IanaTimeZone;
}
```

输出：

```ts
interface BootstrapPersonalSpaceResult {
  spaceId: UUID;
  preferencesId: UUID;
  alreadyExisted: boolean;
}
```

幂等键为当前 auth user；一个用户最多一个 P0 personal space。

### 5.2 `save_user_preferences`

```ts
interface SavePreferencesInput extends MutationMeta {
  timezone: IanaTimeZone;
  summaryEnabled: boolean;
  summaryLocalTime: string;
  protocolDisplayPreference: "standard_full";
}
```

服务端校验 IANA 时区并重算未来 `next_summary_at`，不重新生成已存在摘要。`protocolDisplayPreference` 只控制 P0 标准完整结构的展示偏好；全部正文仍固定为纯文本。

### 5.3 `create_experiment_task`

```ts
interface CreateTaskInput extends CommandMeta {
  title: string;
  plannedLocalDate: ISODate;
  dayPart: "morning" | "afternoon" | "evening";
  plannedLocalTime?: string;
  plannedLocalEndTime?: string;
  plannedTimezone: IanaTimeZone;
  notes?: string;
  protocolVersionId?: UUID;
  confirmTimeOverlap?: boolean;
}
```

仅名称、日期和时段必填。输出任务初始 `revision = 1`。有具体时间时由数据库生成 `planned_start_at/planned_end_at`。若与同日任务时间重叠，先返回 `TIME_OVERLAP_CONFIRMATION_REQUIRED` 和冲突任务摘要；客户端以相同 mutation 加 `confirmTimeOverlap=true` 才能保存。

### 5.4 `update_experiment_task`

```ts
interface UpdateTaskInput extends MutationMeta {
  taskId: UUID;
  patch: {
    title?: string;
    plannedLocalDate?: ISODate;
    dayPart?: "morning" | "afternoon" | "evening";
    plannedLocalTime?: string | null;
    plannedLocalEndTime?: string | null;
    plannedTimezone?: IanaTimeZone;
    notes?: string | null;
    protocolVersionId?: UUID | null;
    confirmTimeOverlap?: boolean;
  };
}
```

已开始或已完成任务不得换关联执行版本。

### 5.5 `cancel_experiment_task`

```ts
interface CancelTaskInput extends MutationMeta {
  taskId: UUID;
  reason: string;
}
```

取消原因必填。取消不物理删除任务。

### 5.6 `soft_delete_entity` / `restore_entity`

```ts
interface SoftDeleteInput extends MutationMeta {
  entityType: "task" | "protocol";
  entityId: UUID;
  confirmation: true;
}
```

仅未完成任务和未被历史锁定的逻辑方案根实体进入“最近删除”，保留 30 天。完成执行只能归档查看；被任务/执行历史引用的方案版本禁止删除，逻辑方案只能停用。清单、步骤、计时器随未完成任务整体恢复，不提供独立删除/恢复；通知与摘要不进入最近删除。

### 5.7 `save_protocol_draft`

```ts
interface ProtocolDraftPayload {
  title: string;
  objective?: string;
  applicability?: string;
  keyParameters?: string;
  cautions?: string;
  sourceText?: string;
  versionNote?: string;
  tags?: string[];
  checklistTemplates?: Array<{
    id?: UUID;
    category: "equipment" | "reagent" | "material" | "preparation";
    name: string;
    quantityOrSpec?: string;
    notes?: string;
    position: number;
  }>;
  steps: Array<{
    id?: UUID;
    instruction: string;
    keyParameters?: string;
    estimatedDurationMinutes?: number;
    cautions?: string;
    timerSuggestedMinutes?: number;
    required?: boolean;
    position: number;
  }>;
}

type SaveProtocolDraftInput =
  | (CommandMeta &
      ProtocolDraftPayload & {
        mode: "create";
      })
  | (CommandMeta &
      ProtocolDraftPayload & {
        mode: "update";
        protocolId: UUID;
        versionId: UUID;
        expectedProtocolRevision: number;
        expectedVersionRevision: number;
      });
```

仅 `draft` 或 `review_pending` 版本可编辑。确认后的修改必须创建新版本。

### 5.8 `confirm_protocol_version`

```ts
interface ConfirmProtocolVersionInput extends CommandMeta {
  protocolId: UUID;
  versionId: UUID;
  expectedProtocolRevision: number;
  expectedVersionRevision: number;
}
```

事务内只把“方案名称、至少一个步骤、每步可执行指令”作为确认必填；`required` 缺省为 `true`。验证步骤顺序后状态变为 `confirmed`，此后不可变。草稿可直接确认或先进入 `review_pending`。

### 5.9 `deactivate_protocol`

```ts
interface DeactivateProtocolInput extends MutationMeta {
  protocolId: UUID;
  reason?: string;
}
```

停用不改变任何历史版本。

### 5.10 `initialize_task_preparation`

任务关联方案版本后，以模板幂等生成任务级准备清单；用户可在开始前增删改和勾选。更换尚未开始任务的方案版本时，必须以 revision 契约显式重建，禁止静默覆盖用户修改。

```ts
interface InitializeTaskPreparationInput extends MutationMeta {
  taskId: UUID;
  protocolVersionId: UUID;
  replaceExisting: boolean;
}
```

已有用户修改时 `replaceExisting=false` 返回冲突摘要；显式确认后才能重建。

### 5.11 `start_experiment`

```ts
interface StartExperimentInput extends CommandMeta {
  taskId: UUID;
  expectedTaskRevision: number;
  confirmIncompletePreparation: boolean;
}
```

事务效果：

1. 校验任务和已确认方案版本。
2. 创建 `experiment_run`。
3. 复制不可变方案快照。
4. 冻结任务级准备清单并绑定到执行，复制步骤为执行行。
5. 记录实际开始时间。
6. 将执行状态更新为 `active`。
7. 若准备未完成，保存未完成项快照。

准备未完成且 `confirmIncompletePreparation = false` 时返回 `INCOMPLETE_PREPARATION_CONFIRMATION_REQUIRED`；二次确认后允许开始，不要求填写原因。任务可以临时关联草稿/待复核版本，但开始实验必须关联 `confirmed` 版本。

### 5.12 `set_checklist_item_state`

```ts
interface SetChecklistStateInput extends MutationMeta {
  checklistItemId: UUID;
  checked: boolean;
  notes?: string | null;
}
```

支持在线与 outbox 重放。重复 `mutationId` 返回第一次结果。

### 5.13 `set_run_step_state`

```ts
interface SetRunStepInput extends MutationMeta {
  runStepId: UUID;
  state: "pending" | "completed" | "skipped";
  skippedReason?: string | null;
  notes?: string | null;
}
```

`skipped` 必须有非空原因；`completed` 的实际时间由数据库生成。步骤变化不自动完成实验。

### 5.14 `set_experiment_execution_state`

```ts
interface SetExecutionStateInput extends MutationMeta {
  runId: UUID;
  action: "pause" | "resume";
}
```

暂停/继续的是当前实验执行，不改变任何计时器状态；计时器需分别暂停或继续。

### 5.15 `apply_timer_action`

```ts
type TimerAction =
  | { type: "pause" }
  | { type: "resume" }
  | { type: "adjust"; deltaMs: number }
  | { type: "end" };

interface StartTimerInput extends CommandMeta {
  taskId: UUID;
  runStepId?: UUID;
  label: string;
  durationMs: number;
}

interface ApplyTimerActionInput extends MutationMeta {
  timerId: UUID;
  taskId: UUID;
  runStepId?: UUID;
  label: string;
  action: TimerAction;
}
```

创建计时器调用 `start_timer(StartTimerInput)`，不传 `expectedRevision`，成功后计时器 `revision = 1`；暂停、继续、调整和结束调用 `apply_timer_action(ApplyTimerActionInput)` 并比较计时器 revision。

限制：

- `durationMs` 为正数且不超过产品安全上限。
- 调整后剩余时间不得小于 0。
- `ended` 不能恢复，需新建计时器。
- 离线时不得调用。

### 5.16 `complete_experiment`

```ts
interface CompleteExperimentInput extends TaskRunMutationMeta {
  taskId: UUID;
  runId: UUID;
  completionNotes?: string;
  confirmOptionalSteps: boolean;
  confirmIncompletePreparation: boolean;
}
```

事务效果：

1. 客户端在当前设备 outbox 尚有未发送操作时不得发起完成，并提示“其他离线设备的未上报操作无法提前检测”；服务端只拒绝该 task/run 已登记且 `status='open'` 的 `sync_conflicts`。
2. 拒绝任何 `running` 或 `paused` 且未结束的关联计时器。
3. 拒绝未完成且未按要求填写跳过原因的必做步骤。
4. 可选步骤未处理只警告并要求 `confirmOptionalSteps=true`；准备未完成只警告并要求 `confirmIncompletePreparation=true`。
5. 按任务后 run 的顺序加锁并核对两个 expected revision。
6. 创建新的不可变 `run_completions` 记录，记录本次 `completionId`、顺序号、实际完成时间、完成前状态和最终执行快照。
7. 更新任务/run 当前状态为 `completed`，创建该 `completionId` 独立的 `completion_archives(status='pending')`，并追加完成事件。

输出至少包含 `{ completionId, taskRevision, runRevision, archiveStatus }`。同一完成 `mutationId` 重试返回同一 `completionId`；撤销后再次完成必须使用新 mutation，并生成新 `completionId`。核心完成事实、最终快照和归档意图在同一事务写入；任何核心写入失败则整体回滚。随后从该完成快照幂等生成知识库归档版本：成功置 `complete`，失败置 `failed`。归档投影或通知失败不得回滚已完成任务，也不得丢失快照。

### 5.17 `retry_experiment_archive`

```ts
interface RetryExperimentArchiveInput extends MutationMeta {
  completionId: UUID;
}
```

`expectedRevision` 指该 completion archive 投影 revision。仅允许对本人的 `pending/failed` 完成归档调用；以 `completionId` 为唯一键从对应不可变快照生成一次知识库版本。重复成功请求返回现有 `archivedProtocolVersionId`。同一 run 的不同 completion 可各自产生归档版本；知识库默认展示最新仍生效的 completion 归档，历史视图展示全部版本。

### 5.18 `undo_complete_experiment`

```ts
interface UndoCompleteInput extends TaskRunMutationMeta {
  taskId: UUID;
  runId: UUID;
  completionId: UUID;
  confirmation: true;
}
```

仅允许撤销当前最新且仍生效的 completion，并限该次完成后 30 天内。事务按任务后 run 的顺序加锁并比较两个 revision，恢复该 completion 记录的完成前任务/run 状态，清空“当前有效完成时间”，追加引用 `completionId` 的 `completion_undone` 事件；超过窗口返回 `UNDO_WINDOW_EXPIRED`。不得更新或删除原 `run_completions` 快照及其归档版本。再次完成生成新的快照；历史按 completion 顺序完整保留。

### 5.19 `apply_offline_mutation`

```ts
interface OfflineMutationInput {
  mutationId: UUID;
  entityType: "task_checklist_item" | "run_step";
  entityId: UUID;
  operation:
    | "set_checked"
    | "set_step_pending"
    | "set_step_completed"
    | "set_step_skipped"
    | "set_step_notes";
  baseRevision: number;
  payload: Record<string, boolean | string | null>;
  clientOccurredAt: ISOInstant;
}

type OfflineMutationResult =
  | { status: "APPLIED"; entityId: UUID; revision: number }
  | { status: "DUPLICATE"; entityId: UUID; revision: number }
  | {
      status: "CONFLICT";
      conflictId: UUID;
      reason: "STALE_ENTITY_REVISION" | "PARENT_COMPLETED";
      entityId: UUID;
      currentRevision: number;
      currentState: Record<string, unknown>;
      pendingMutation: OfflineMutationInput;
    };
```

不接受任意表名、字段名或 SQL 片段。

服务端按“鉴权与归属 → 所属 task/run 当前状态 → 子实体 revision → 应用”的顺序处理。旧 revision 一律拒绝且不覆盖；所属 task/run 已完成时，即使 `baseRevision === currentRevision` 也一律拒绝且不覆盖。两种情况都在同一事务登记 `sync_conflicts(status='open')` 与 mutation 回执，冲突原因分别为 `STALE_ENTITY_REVISION`、`PARENT_COMPLETED`。冲突响应必须同时返回 `conflictId`、reason、服务器当前值/revision 和本地待提交意图；用户只能选择保留服务器值，或在 run 经撤销恢复且实体最新 revision 仍满足时重新应用本地意图。只有所属 task/run 未完成且 revision 匹配时，清单和步骤勾选才按唯一 `mutationId` 幂等应用。

```ts
type ResolveSyncConflictInput =
  | (CommandMeta & {
      conflictId: UUID;
      action: "keep_server";
      expectedConflictRevision: number;
    })
  | (CommandMeta & {
      conflictId: UUID;
      action: "reapply";
      expectedConflictRevision: number;
      expectedEntityRevision: number;
    });
```

`keep_server` 只把冲突标记为 `resolved_keep_server`；`reapply` 必须同时比较冲突和当前实体 revision，先成功应用原白名单意图，再在同一事务标记为 `resolved_reapplied`。仍为 `open` 的冲突是完成服务端阻断事实；仅存在于尚未发送设备 outbox 的操作不是服务端事实。

客户端离线契约：缓存当天和次日的任务、关联方案、准备、步骤与已启动计时器事实，连续离线验收目标不超过 8 小时；outbox 操作至少保留 24 小时，超期继续保留并提示联网，不得静默丢弃。

### 5.20 `mark_notification_read`

```ts
interface MarkNotificationReadInput extends MutationMeta {
  notificationId: UUID;
}
```

只修改读取时间，不修改关联步骤、计时器或任务状态。

## 6. Next.js Route Handler Contract

### 6.1 Push subscriptions

`POST /api/push/subscriptions`

```ts
interface SavePushSubscriptionRequest {
  endpoint: string;
  expirationTime?: number | null;
  keys: {
    p256dh: string;
    auth: string;
  };
  deviceLabel?: string;
}
```

- 需要登录。
- 校验 HTTPS endpoint、字段大小和 origin 允许规则。
- 以 endpoint hash 幂等 upsert。
- 响应 `201` 新建、`200` 已存在。
- Route Handler 先用 HTTP-only Cookie 验证 SSR 会话，再以该用户 JWT 调用 `public.register_my_push_subscription`。该 public 函数为 `SECURITY INVOKER`，只转调 unexposed private schema 内固定 `search_path` 的最小权限 helper；helper 不接受 `userId`，只从 `auth.uid()` 绑定所有者。

`DELETE /api/push/subscriptions`

- 需要登录。
- 按 endpoint hash 停用当前用户订阅。
- 不允许删除他人订阅。
- 删除同样以用户 JWT 调用 `public.revoke_my_push_subscription`。浏览器和 Route Handler 均不得持有或使用 `service_role`/等价高权限；`private.push_subscriptions` 不向 `anon`/`authenticated` 授予直接表权限。

### 6.2 Internal Push dispatch

`POST /api/internal/notifications/dispatch`

- 仅允许 Supabase Cron/pg_net。
- 使用独立 bearer secret、请求时间戳和请求 id；拒绝重放窗口外请求。
- 不接受用户指定的任意 notification id 列表。
- 服务端从 `private.notification_jobs` 领取到期作业。
- 返回处理计数，不返回 endpoint 或通知正文。

```ts
interface DispatchResult {
  claimed: number;
  sent: number;
  failedTemporary: number;
  failedPermanent: number;
}
```

### 6.3 Export

`GET /api/exports/json`

响应：

- `200 application/json`
- `Content-Disposition: attachment`
- `Cache-Control: private, no-store`
- 固定包含 30 天恢复期内的软删除对象及 `deleted_at`、`purgeAfter`、对象状态；调用方不能关闭。

`GET /api/exports/csv?dataset=tasks|protocols|experiment_runs`

响应：

- `200 text/csv; charset=utf-8`
- UTF-8 BOM。
- 非法 dataset 返回 `400`。
- 固定排除软删除对象和永久删除对象。

服务端必须使用当前用户身份限定空间；不能接受任意 `userId` 或 `spaceId`。

### 6.4 Account deletion

`GET /api/account-deletion`

- 返回当前用户删除状态和 `scheduledFor`；这是待删除账户登录后唯一可读的账户接口。

`POST /api/account-deletion`

```ts
interface RequestAccountDeletion {
  confirmation: "DELETE";
}
```

- 需要近期会话或重新登录。
- 创建 7 天撤销期请求并退出普通业务 UI。
- 返回 `scheduledFor`。

`DELETE /api/account-deletion`

- 7 天内重新登录只进入“账户待删除”页；该页可二次确认撤销，撤销后恢复正常业务访问。

7 天后受保护 purge 流程开始，最迟在 30 天内完成永久删除。待删除期间所有业务 RLS/RPC 均拒绝，只有读取/撤销本人删除请求可用。

## 7. HTTP 状态映射

| 状态 | 场景 |
|---|---|
| 200 | 查询、幂等重复或更新成功 |
| 201 | 资源创建 |
| 204 | 删除订阅等无正文成功 |
| 400 | 输入格式错误 |
| 401 | 未登录/会话失效 |
| 403 | 已登录但无权限 |
| 404 | 不存在或因隔离不可见 |
| 409 | revision 冲突、重复业务事实 |
| 422 | 状态转换或业务校验失败 |
| 429 | 速率限制 |
| 503 | 临时平台/数据库不可用 |

为避免泄露资源是否属于他人，越权读取可统一返回 `404`。

## 8. 状态转换

### 8.1 Task

```text
not_started → active ↔ paused → completed
      └──────────────→ cancelled
```

- 持久化只保存用户动作事实；显示状态按以下优先级派生：已完成/已取消 > 已逾期 > 等待中 > 进行中 > 待执行 > 待准备 > 待规划。
- `等待中` 表示已开始且至少一个关联计时器为 `running` 或 `paused`；`进行中` 表示已开始但没有此类计时器。
- `待规划` 表示无已确认方案；`待准备` 表示已关联确认方案但准备未完成；`待执行` 表示已准备且未开始。
- `已逾期` 表示精确结束时间已过；未填写时，早/中/晚分别从任务所属 IANA 当地时间 12:00、18:00、次日 00:00 起算，且任务未完成/未取消。
- 已完成只能通过 30 天内的受审计撤销恢复。
- 改期不创建完成事实。

### 8.2 Protocol version

```text
draft ↔ review_pending → confirmed
逻辑方案：active → deactivated
```

`confirmed` 之后内容不可写。

### 8.3 Run step

```text
pending ↔ completed
pending ↔ skipped
completed/skipped → pending（当前 run 未处于 completed 时）
```

完成时执行行只读；撤销完成恢复 run 后可继续执行，但旧 completion 快照和旧归档始终只读。

### 8.4 Timer

```text
new → running ↔ paused → ended
       └──────────────→ ended
```

到期不是终态。

## 9. 数据限制与容量基线

P0 验收数据规模：1,000 个账户、100 并发用户；每账户至少支持 5,000 个任务、500 个方案、20,000 条步骤或准备项、10,000 条计时器及提醒记录。正常分页读取和普通写入在该规模下 P95 不超过 1 秒。

| 字段/对象 | 建议上限 |
|---|---:|
| 任务标题 | 200 字符 |
| 备注/跳过原因 | 10,000 字符 |
| 方案标题 | 200 字符 |
| 单步骤正文 | 20,000 字符 |
| 单方案步骤 | 500 |
| 单任务准备项 | 1,000 |
| 单用户同时未结束计时器 | 100 |
| 计时器最大时长 | 30 天 |
| 日期范围查询 | 366 天 |
| 分页大小 | 100 |

这些单对象限制是防滥用边界，不得低于上述账户容量事实；列表必须游标分页，导出使用流式响应。

## 10. Contract 变更规则

- P0 内允许新增可选字段，不允许静默改变现有字段语义。
- 删除/重命名字段需新 Contract 版本。
- 数据库 migration、生成类型和 API Contract 必须同一提交评审。
- RPC 改动需同时更新权限测试、幂等测试和调用方类型。
- Contract 不包含任何 P1/P2 预留 endpoint；未来按新版本增加。

## 11. 生产认证与部署边界

- Sites 提供公开网站入口和认证页面；所有业务 Query、RPC、导出和账户接口必须登录，并继续由 RLS/当前用户身份隔离。
- 开发/测试可使用平台测试邮件；正式生产必须配置受控 SMTP，验证邮箱与密码找回路径均需通过。
- Sites M0 由开发部主责验证 Next.js build、SSR、Route Handler、环境变量、Auth callback、PWA、Service Worker、Web Push、自定义域名和 HTTPS。
- 核心能力无法通过且无低风险修复时回退 Vercel；回退仅改变部署层，不改变本 API 路径、DTO、Supabase schema、RLS 或业务语义。

## 12. 产品决策关闭记录

| 决策 | Contract 落点 |
|---|---|
| DEV-PD-01 | §8.1 固定逾期时间边界 |
| DEV-PD-02 | 不改变接口；生产备份/恢复由 Tech Spec 与 Data Model 约束 |
| DEV-PD-03 | §6.3 JSON 固定包含可恢复软删除对象，CSV 固定排除 |
| DEV-PD-04 | §2 固定纯文本边界，无格式开关 |
| DEV-PD-05 | 列表只返回保留期内数据；清理期限由 Data Model 固定 |
| DEV-PD-06 | §11 固定生产 SMTP、公开入口登录边界及部署层回退不改 Contract |

## 13. G2 条件项关闭与设计影响

| 项目 | Contract 闭环 |
|---|---|
| G2-QA-01 | §5.16～5.18 以 `completionId` 区分逐次完成；撤销只追加事件；归档按 completion 唯一 |
| G2-QA-02 | §5.16、§5.19 区分当前设备 outbox 客户端阻断与服务端 open conflict；父 task/run 已完成即使子 revision 匹配也登记冲突 |
| G2-QA-03 | §2 区分创建、单聚合、task/run 双聚合 revision；固定回执写入与重复 mutation 语义 |
| G2-QA-04 | §6.1 固定用户 JWT → public invoker wrapper → private definer helper 路径，禁止浏览器高权限 |

对设计部的用户可见差异：完成前在本机 outbox 未清空时禁用完成并持续提示；完成确认处提示无法提前发现其他离线设备；服务器登记旧 revision 后展示可解决的冲突；历史中可看到“完成—撤销—再次完成”的多份快照，知识库默认指向最新仍生效的完成。Push 保存授权路径无用户可见变化；`IDEMPOTENCY_KEY_REUSED` 作为异常反馈呈现，不新增产品流程。
