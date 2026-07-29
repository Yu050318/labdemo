# LabFlow P0 / G4-I2-A Schedule Schema 远端应用报告

> 状态：已应用，待测试部独立远端验收  
> 日期：2026-07-29  
> 目标：LabFlow / `ogvqegmgcuwlynczasop`  
> 分支：`codex/g4-i2-schedule`  
> 授权源 commit：`b68a02567c07cf221d725def16720d3a58b6b21b`

## 1. 授权对象与应用结果

- 本地 migration：`supabase/migrations/20260729141437_g4_i2_schedule_schema.sql`
- 本地 SHA-256：`F45E2445F68CF7CFF6BA6C21D7006286B58318F5DC37C2DD0FF4688516273301`
- 应用工具：project-scoped Supabase MCP `apply_migration`
- 远端实际 migration name：`g4_i2_schedule_schema`
- 远端实际 migration version：`20260729150030`
- 平台版本对应时间：`2026-07-29 15:00:30 UTC`（版本字段编码；`schema_migrations` 无独立 `created_at` 列）
- 首次应用结果：成功
- 应用次数：1

Supabase MCP 为本次调用生成了远端 version，因此远端实际 version 与本地文件名前缀 `20260729141437` 不同。本地授权文件、内容和 SHA-256 未改变；没有改写 migration history，也没有为版本差异追加修补 migration。

应用前已再次确认：

- HEAD 与 upstream 均为授权 commit；
- worktree clean；
- 本地 migration SHA-256 与授权值一致；
- 远端 history 尚无 `g4_i2_schedule_schema`；
- `public.experiment_tasks` 尚不存在；
- I1 四业务表均为 0 行；
- Security Advisor 0，Performance Advisor 0。

## 2. 远端 history 与范围

应用后去敏 migration history 依次为：

1. `20260729080019 / g4_i1_identity_spaces_rls`
2. `20260729080358 / g4_i1_enforce_iana_timezone`
3. `20260729104223 / g4_i1_auth_fixture_support`
4. `20260729113507 / g4_i1_tighten_fixture_acl_and_membership`
5. `20260729150030 / g4_i2_schedule_schema`

`public` 当前只有：

- `user_profiles`
- `spaces`
- `space_memberships`
- `user_preferences`
- `experiment_tasks`

本轮没有创建 I2-B 的 create/update/cancel/soft-delete RPC，相关 public RPC 数量为 0；没有创建 Protocols、清单、步骤、计时、通知、归档、汇总、离线、导出或 P1/P2 对象。

## 3. Catalog 自检

`public.experiment_tasks`：

- 22 个字段，字段类型、nullability 和默认值与授权 migration 一致；
- 主键：`id`；
- 外键：
  - `space_id -> public.spaces(id) ON DELETE RESTRICT`
  - `created_by -> auth.users(id) ON DELETE RESTRICT`
- 约束覆盖：
  - title、notes、execution state、day part；
  - 双精确时间严格 `start < end`；
  - `protocol_version_id IS NULL`；
  - cancellation reason 规范化、长度与 cancelled 状态一致性；
  - revision `>= 1`；
  - soft-delete 的 `deleted_at` / `purge_after` 窗口；
  - 精确开始时间与早/中/晚时段匹配。
- 索引：
  - 主键索引；
  - `space_id`、`created_by` 外键索引；
  - 日程范围、执行状态、可空 protocol version 索引。
- trigger：
  - `experiment_tasks_set_planned_instants`
  - `experiment_tasks_bump_revision`
- private trigger helper：
  - 均为 `SECURITY INVOKER`；
  - 均固定 `search_path=''`；
  - owner 为 `postgres`；
  - anon、authenticated、service_role 均无直接 EXECUTE。

`set_experiment_task_planned_instants` 从当地日期、当地时间和 IANA timezone 派生 UTC，并拒绝 DST 不存在的当地时间。`bump_experiment_task_revision` 在更新时令 `revision = old.revision + 1` 并刷新 `updated_at`。

## 4. RLS 与 ACL

- `public.experiment_tasks` 已启用 RLS；
- 唯一策略为 `experiment_tasks_select_own_active`；
- 策略仅授予 authenticated 用户读取未软删除且属于 active membership 的任务；
- anon 对表无 SELECT/INSERT/UPDATE/DELETE；
- authenticated 仅有 SELECT，无 INSERT/UPDATE/DELETE；
- service_role 保留平台高权限角色既有表权限，但浏览器没有该凭据或路径；
- 两个 private trigger helper 未向 anon、authenticated 或 service_role 开放直接 EXECUTE。

本轮没有浏览器写路径；I2-B 后续 mutation 必须通过冻结 API/RPC 契约单独实现和验收。

## 5. 数据与语义核验

应用前及应用后/清理后行数均为：

| 表 | 行数 |
| --- | ---: |
| `user_profiles` | 0 |
| `spaces` | 0 |
| `space_memberships` | 0 |
| `user_preferences` | 0 |
| `experiment_tasks` | 0 |

本轮未创建真实或合成 Auth 用户，未写入业务行，因此无需数据清理。

取消原因只读 PostgreSQL 语义矩阵：

- 冻结 Unicode trim 集合：26/26 逐码点通过；
- 全集合组合：裁为空；
- U+200B：保留；
- 仅裁首尾，正文内部换行：保留；
- 裁后长度 1：有效；
- 裁后长度 500：有效；
- 裁后长度 501：无效；
- failed code points：无。

远端 CHECK 定义同时确认：

- 全空白或未规范化首尾空白不能保存；
- cancelled 必须有 cancellation reason；
- 非 cancelled 的 cancellation reason 必须为 null；
- 双精确时间 `end <= start` 被拒绝；
- 单填任一精确时间合法；
- P0 不引入跨日结束语义；
- `protocol_version_id` 非 null 被拒绝；
- soft-delete window、revision 和 updated_at 维护规则存在。

## 6. Advisor

- Security Advisor：0 项。
- Performance Advisor：5 项 INFO，均为新建且 0 行的 `experiment_tasks` 索引尚未使用：
  - `experiment_tasks_space_id_idx`
  - `experiment_tasks_created_by_idx`
  - `experiment_tasks_schedule_range_idx`
  - `experiment_tasks_execution_state_idx`
  - `experiment_tasks_protocol_version_id_idx`

这些索引均由已冻结查询、外键或后续 nullable protocol 兼容边界直接需要。空表尚无查询统计属于预期，不删除索引，不视为发布阻断。

## 7. 回归验证

- 全量 Vitest：11 files / 64 tests passed；
- I1 数据库与 Auth harness 静态回归：2 files / 29 tests passed；
- G3 固定数据 harness/query 回归：2 files / 5 tests passed；
- TypeScript `tsc --noEmit`：通过；
- ESLint：通过；
- Next.js production build：通过；
- `git diff --check`：通过；
- I2-A commit 相对父提交未修改 `src`、`public`、`design`：通过；
- worktree 在远端应用后仍无应用代码或 UI 自动变更。

构建仅出现共享仓库/隔离 worktree 双 lockfile 的既有 Next.js workspace-root 提示，不影响构建结果。`npm audit --omit=dev` 本轮因 npm registry audit endpoint/受限网络不可用未形成新结果；此前静态候选验收的生产依赖 audit 为 0 vulnerabilities。本项与 Supabase Advisor 结果分开记录。

## 8. 部署状态与门禁

- 数据库部署：G4-I2-A 授权 schema 已应用到目标开发验收项目。
- 网站部署：本轮未部署或公开网站。
- Auth/fixture：本轮未运行。
- I2-B：未开始。
- 回退：未执行。当前表为 0 行；任何 drop/回退均属破坏性操作，必须重新取得产品部明确授权。
- 下一步：仅请求测试部对远端 history、catalog、CHECK、RLS/ACL、functions、Advisor、I1/G3 回归和 0 行状态做独立验收。测试部通过前不得进入 I2-B。

