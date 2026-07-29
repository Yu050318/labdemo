# LabFlow P0 / G4-I2-A Schedule Schema 候选报告

> 版本：G4-I2-A-Local-1
>
> 日期：2026-07-29
>
> 分支：`codex/g4-i2-schedule`
>
> 目标项目：`LabFlow` / `ogvqegmgcuwlynczasop`
>
> 状态：仅本地候选，尚未应用远端 migration

## 1. 精确范围

本候选只交付冻结执行计划中的 G4-I2 Schedule 数据库根结构：

- `public.experiment_tasks`。
- 日/周范围查询所需索引。
- active account + active membership 的只读 RLS 边界。
- 数据库派生 `planned_start_at` / `planned_end_at`。
- 数据库维护 `revision` / `updated_at`。
- 软删除时间字段。
- 取消原因纯文本字段及状态一致性约束。
- `protocol_version_id` 仅保留 nullable UUID 兼容形状，并强制为 `null`。

本候选不包含 RPC、mutation receipt、audit、远端测试夹具、UI 接线或真实业务数据。Protocols 及其 FK/关联属于 G4-I3；准备、执行、计时、提醒、完成归档、汇总、离线冲突、导出、P1/P2 均未引入。

## 2. 冻结时间规则

- `planned_local_time` 与 `planned_local_end_time` 同时存在时必须严格 `start < end`。
- 只填写其中一项合法。
- 两个时间均按同一 `planned_local_date + planned_timezone` 派生 UTC。
- 不存在的当地时间由数据库拒绝，不信任客户端提交的 UTC 派生值。
- P0 不增加 end date 或 next-day 语义；跨日计划拆成两个任务。
- 早/中/晚精确开始时间分别限定在 00:00–11:59、12:00–17:59、18:00–23:59。

`end <= start` 在本层由 check constraint 拒绝。I2-B RPC 仍须将该数据库失败稳定映射为 `VALIDATION_FAILED`，并验证 task/receipt/audit/revision 零副作用。

## 3. Migration

依赖顺序：

1. 已通过的 G4-I1 migrations。
2. `supabase/migrations/20260729141437_g4_i2_schedule_schema.sql`

SHA-256：

`E3EE425923DBF1BA539EEC79C9392C861694D67B95D34CE30CD33F8AA4798C69`

远端 history：无变化。当前未连接或写入 Supabase 项目，未运行 Auth 管理操作，未创建测试用户或业务行。

## 4. 结构与安全边界

- 主键：`id`。
- 外键：`space_id -> public.spaces(id)`、`created_by -> auth.users(id)`，均为 `ON DELETE RESTRICT`。
- 外键列有全量索引；日程与执行状态查询使用过滤软删除行的组合索引。
- 标题最大 200 字符，备注最大 10,000 字符。
- `cancellation_reason` 为 trim 后 1–500 字符的纯文本；边界集合固定为 ASCII space/tab/CR/LF/form-feed，其他 Unicode 空白按正文保留；仅 cancelled 状态可非空，且 cancelled 状态必须非空。
- execution state 与 day part 使用冻结枚举 check。
- `protocol_version_id` 没有 FK，非空值被 check 拒绝。
- RLS 默认拒绝；`anon` 无表权限；`authenticated` 仅获得 SELECT。
- SELECT policy 只允许 active account + active membership，并排除软删除任务。
- private trigger functions 固定 `search_path=''`，PUBLIC/anon/authenticated 无直接 EXECUTE。
- 无浏览器端 service role 或管理员写路径。

## 5. TDD 与验证

- 首次测试：6/6 因 migration 尚不存在而失败。
- 完成 schema 后：发现 2 个只与 SQL 换行有关的脆弱断言，改为忽略空白的语义正则。
- 最佳实践复核新增外键索引测试：1 项预期失败；补齐 `space_id`、`created_by` 全量索引后通过。
- 产品冻结取消原因口径后，先新增字段、长度、trim、状态一致性和 audit 排除断言并观察预期失败；实现后通过。
- 测试部静态复核发现 PostgreSQL `btrim(text)` 默认不裁剪制表符/换行；新增真实 PostgreSQL 语义回归后改用显式 ASCII 边界字符集的 `regexp_replace`。
- 目标项目只读 PostgreSQL 语义复现：旧 `btrim(E'\t\n')` 长度为 2；新表达式对 space/tab/CR/LF/混合全空白归一为长度 0，内部换行保持，1/500 接受、501 拒绝。测试不含 DDL/DML，未修改远端。
- 定向契约测试：8/8 通过。
- 全量测试：11 个文件、64/64 通过。
- TypeScript：通过。
- ESLint：通过。
- Next.js production build：通过；仅出现隔离 worktree 双 lockfile 的根目录提示。
- `npm audit --omit=dev --audit-level=high`：0 vulnerabilities。
- `git diff --check`：通过。

本机没有独立 `psql` 运行时；本轮也不启动 Docker。因此尚未声称 migration 已在空库重放、远端 catalog/RLS 已验证或 Supabase Advisor 已通过。这些属于远端应用门禁后的验证。

## 6. 回退说明

远端尚未应用，无需数据库回退。

若经测试部静态复核和产品部门禁后应用到仍无 I2 业务数据的开发验收项目，任何 drop 回退都属于破坏性操作，必须再次获批并确认表为空。产生任务后只允许追加前向修复 migration，不删除任务历史。

## 7. I2-B 已冻结衔接规则

产品部已冻结取消原因数据口径，详细差异见 `docs/superpowers/specs/2026-07-29-labflow-p0-g4-i2-data-model-delta.md`。I2-B 必须 trim 后验证 1–500 字符、原子更新状态/原因/revision/receipt，并保持 audit metadata 不含正文；本 A 候选尚未实现这些 RPC 行为。

## 8. 修改文件

- `supabase/migrations/20260729141437_g4_i2_schedule_schema.sql`
- `supabase/tests/g4_i2_schedule_cancellation_reason_semantics.sql`
- `tests/database/g4-i2-schedule-migration-contract.test.ts`
- `docs/superpowers/plans/2026-07-29-labflow-g4-i2-schedule.md`
- `docs/superpowers/specs/2026-07-29-labflow-p0-g4-i2-data-model-delta.md`
- `docs/engineering/LABFLOW_P0_G4_I2_A_SCHEDULE_SCHEMA_CANDIDATE.md`

未修改 G3 设计源、UI、真实 Auth 接入、Supabase 远端配置或任何 secret。共享主工作区的 `.mts` / `package.json` / lockfile 并行差异未进入本分支。
