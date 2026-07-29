# LabFlow G4-I2 Schedule Database Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 数据库优先交付日程、任务与早/中/晚安排，不提前实现 G4-I3 Protocols。

**Architecture:** 先追加 task schema，再追加 task 所需 mutation receipt/audit 和事务 RPC/RLS；I2 首候选不接真实 UI。所有远端写入必须晚于本地红绿测试与测试部数据库准入。

**Tech Stack:** Supabase PostgreSQL、RLS、PL/pgSQL、严格 TypeScript、Vitest、SQL contract tests。

> 状态：产品部已冻结 Schedule-only 范围和精确时间规则，并于 2026-07-29 正式放行数据库优先实现。

## 1. 唯一编号与范围

事实来源：`docs/superpowers/plans/2026-07-29-labflow-cross-department-execution.md` §P0-4。

- 第 208 行：开发部按依赖顺序交付。
- 第 211 行：第 2 项为“日程与早/中/晚安排”。
- 第 212 行：第 3 项为“手工实验方案库、版本与方案关联”。
- 第 221 行：逐项称为“功能增量”。

因此：

- `G4-I2 = Schedule`：日程、任务、早/中/晚安排。
- `G4-I3 = Protocols`：手工方案库、版本、搜索与方案关联。
- Tech Spec 的 `M2 Schedule & Protocols` 是更粗粒度工程里程碑，不等于 G4-I2。

## 2. I2 对应事实

### 2.1 产品与验收

- 核心：`AC-P0-02`。
- 跨切回归：`AC-P0-01` 的任务隔离。
- `PD-01`：时间重叠只警告；相同 mutation 明确确认后保存。
- `PD-06`：任务显式状态与派生状态优先级。
- `PD-10`：名称、日期、早/中/晚必填；精确起止、方案、备注选填。
- `DEV-PD-01`：早 12:00、中 18:00、晚次日 00:00 逾期；精确结束优先；逾期不自动改任务。

### 2.2 API Contract

- Query：§4 `schedule.range`。
- RPC：§5.3 `create_experiment_task`。
- RPC：§5.4 `update_experiment_task`，包含改期。
- RPC：§5.5 `cancel_experiment_task`。
- RPC：§5.6 仅 `entityType="task"` 的软删除/恢复。
- 通用：§2 mutation receipt、创建 revision=1、单聚合 expected revision、重复 mutation 与 `IDEMPOTENCY_KEY_REUSED`。

### 2.3 Data Model

- §3.3 `public.experiment_tasks`。
- §5 revision/updated_at。
- §6 tasks RLS。
- §8 `validate_task_time`、`set_soft_delete_purge_after`。
- 为 task RPC 提供最小必要的 `private.mutation_receipts` 与 task audit 记录。

### 2.4 产品冻结增量：取消原因

- `public.experiment_tasks.cancellation_reason` 为 nullable 纯文本业务正文，不复用 `notes`。
- `cancel_experiment_task` 对 reason 执行 trim 后要求 1–500 字符；I2 明确定义 ASCII space/tab/CR/LF/form-feed 为边界空白，空白或超长返回 `VALIDATION_FAILED`，事务零副作用。其他 Unicode 空白不自动裁剪；前端必须镜像同一字符集合。
- `execution_state='cancelled'` 时原因必须非空；其他状态原因必须为 `null`。
- 取消事务原子更新状态、原因和 revision，写 mutation receipt，并只向 audit metadata 写状态/revision，不写取消正文。
- 不增加 `cancelled_at`；取消事件时间以不可变 audit event `created_at` 为事实。
- JSON 导出后续包含该任务字段；CSV 口径留到 I6。

## 3. I2 明确排除

- Protocols 表、方案搜索、方案草稿/待复核/确认/停用、不可变版本和方案关联业务；这些全部属于 G4-I3。
- 准备清单、run、步骤、计时器、提醒、Push、完成/撤销/归档、汇总、离线/outbox/冲突、导出、运维。
- 全部 P1/P2。
- 真实 UI 数据接线；第一候选按数据库优先交付。
- 当前共享工作区未提交的 `.mts`、`tsx` 和 package lock 差异。
- `expiredSession`；它作为独立并行发布门禁保留。

## 4. Protocol 兼容边界

- `experiment_tasks.protocol_version_id` 在 I2 保留为 nullable UUID 形状，默认 `null`。
- I2 不创建 Protocols 表，不提前实现方案 FK 或方案读取。
- I2 RPC 不接受非空 `protocolVersionId` 作为已实现能力；G4-I3 创建 Protocols 表后，以追加 migration 增加 FK、归属校验与关联写入。
- I2 的可验收派生状态仅覆盖取消、逾期和未关联方案时的“待规划”；待准备/待执行由后续 Protocols/Execution 增量补齐。

## 5. 建议候选拆分

### I2-A：数据库结构与只读查询

- `public.experiment_tasks` 字段、check、index、软删除字段。
- `schedule.range` 的 RLS 查询形状。
- active account + active membership。
- 早/中/晚与精确时间的 UTC 派生。

### I2-B：任务事务 RPC

- create/update/reschedule/cancel。
- task soft-delete/restore。
- overlap challenge。
- mutation receipt、revision、幂等、task audit。

### I2-C：应用数据接线

- S01 日/周日程。
- S02 任务创建/编辑。
- D01/W01 的任务摘要。
- 保留 G3 固定数据 harness。

I2-C 的前置依赖是已评审的 SSR Auth/session 应用适配器。当前 `src/app/auth/callback/route.ts` 仍是 M0 `501` placeholder，因此 I2-A/B 可以先行，I2-C 不得假定真实应用会话已经交付。

## 6. Migration 草案顺序

实施时必须用 `npx supabase migration new <name>` 生成真实文件名，不手工猜测时间戳。

1. `g4_i2_schedule_schema`
   - `experiment_tasks`
   - FK 到 `spaces/auth.users`
   - check/index/soft-delete字段
   - 不创建 Protocols 表或 protocol FK
2. `g4_i2_task_command_foundation`
   - task 所需 mutation receipts
   - 仅状态/revision/error code 的 audit 记录
3. `g4_i2_schedule_rpcs_rls`
   - create/update/cancel/task delete/restore
   - overlap、time、revision、updated_at、purge_after
   - RLS、grants/revokes
4. `g4_i2_schedule_verification`
   - 可移除的测试 helper；不写生产业务 seed

回退原则：

- 远端无任务时可按逆序回退。
- 一旦产生任务或 receipt/audit，只允许前向修复，不 drop 历史。
- RLS 不得为回退临时关闭。

## 7. TDD 与测试计划

### 7.1 静态/本地

- migration contract：字段、check、FK、index、RLS、ACL、search_path、PUBLIC EXECUTE。
- RPC contract：创建无 expected revision，更新携带一个 expected revision。
- time contract：早/中/晚、精确起止、IANA timezone、逾期不改执行事实。
- mutation contract：同 mutation/同 payload 返回原结果；同 mutation/不同 payload 拒绝。
- cancel contract：reason trim 后 1–500 字符；空白/超长零副作用；正文只落任务字段，不进入 audit metadata。

### 7.2 远端结构与 RLS

- A/B 双向 schedule SELECT 为 0。
- A/B 双向 create/update/cancel/delete/restore 拒绝。
- inactive account、无 membership、anon 拒绝。
- 篡改 `space_id/created_by/revision/updated_at` 拒绝。
- stale revision 不得静默成功。
- overlap challenge 不写 task、receipt 或 audit；确认重试只写一次。

### 7.3 时间边界

- 11:59/12:00。
- 17:59/18:00。
- 23:59/次日 00:00。
- 精确结束时间前后。
- 修改用户偏好时区不重写已计划任务。
- `plannedLocalTime` 与 `plannedLocalEndTime` 同时存在时，按同一 `plannedLocalDate + plannedTimezone` 当地日期解释，必须严格 `start < end`。
- `end <= start` 返回 `VALIDATION_FAILED`，不得产生 task、receipt、audit 或 revision 副作用。
- P0 不隐式跨日，不增加 end date/next-day 字段；跨日计划拆成两个任务。
- 只填写单一精确时间仍允许；未填精确结束时间的晚时段仍从次日当地 00:00 起逾期。

### 7.4 固定回归

- I1 RLS/账户状态回归。
- D01、S01、S02、W01 固定数据入口无回归。
- TypeScript、lint、Next build、数据库专项、diff check、audit。
- 390×844、320×844 与键盘焦点在 I2-C 执行。

## 8. 首候选交付门禁

- 产品部批准本 Schedule-only 范围。
- 测试部补齐并批准 G4-I2 Schedule 清单。
- 精确 commit、migration 名称/hash/history、回退说明。
- 项目 ref 固定 `ogvqegmgcuwlynczasop`。
- Security Advisor 0 个新增安全问题。
- 不包含任何 Protocols 实现、secret、真实用户数据或共享 `.mts/package` 差异。
