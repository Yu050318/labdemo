# LabFlow P0 / G4-I1 数据库基线开发报告

> 版本：G4-I1-A-1
> 日期：2026-07-29
> 范围：数据库基线 A；不包含真实 Auth/UI、合成账号或后续业务表
> 目标项目：`LabFlow` / `ogvqegmgcuwlynczasop`
> 环境用途：G4 开发与独立验收，非 G5 生产公开环境

## 1. 完成内容

- 使用 Supabase CLI 2.110.0 初始化本地非敏感工程配置并生成版本化 migration。
- 创建 `public.user_profiles`、`public.spaces`、`public.space_memberships`、`public.user_preferences`。
- 创建主键、外键、唯一约束、状态 check、必要索引、`updated_at` 与 preference `revision` 触发器。
- 创建 `private.is_active_account`、`private.is_active_space_member` 与私有 bootstrap helper。
- 创建 `public.bootstrap_personal_space(timezone)` SECURITY INVOKER RPC；私有写 helper 使用当前 JWT 的 `auth.uid()`，不接受调用方 user id。
- 通过 advisory transaction lock、部分唯一索引与单事务 helper 定义 personal space 幂等/并发边界。
- 为四张 public 表启用 RLS；`anon` 无表权限，`authenticated` 只有 SELECT，所有写入只能经冻结 RPC/内部边界。
- 增补数据库级 IANA 时区触发器，覆盖所有 `user_preferences` INSERT/UPDATE 路径。
- 已将两条 migration 原子应用到目标项目；没有修改 Auth 配置、Storage、Cron 或 Supabase 系统 schema。

## 2. Migration、顺序与校验值

按以下顺序应用，不允许交换：

1. `supabase/migrations/20260729080019_g4_i1_identity_spaces_rls.sql`
   - SHA-256：`D5BE466353854551CE51B8ECC698153BA737C46AFBE12023BC8D352092FB6D1A`
   - 建立 private 边界、四张表、约束/索引、触发器、helper/RPC、ACL 与 RLS。
2. `supabase/migrations/20260729080358_g4_i1_enforce_iana_timezone.sql`
   - SHA-256：`5AFD34A0BCD2278C889F6E982D370B9D16FB5786A0135862BF182A32E131FBE5`
   - 依赖第 1 条中的 `private` schema 与 `public.user_preferences`。

远端 `supabase_migrations.schema_migrations` 已只读确认同名、同序版本：

- `20260729080019 / g4_i1_identity_spaces_rls`
- `20260729080358 / g4_i1_enforce_iana_timezone`

## 3. 实际结构与权限边界

### 3.1 表

- `user_profiles`：Auth user PK/FK，`active | pending_deletion | purging`，数据库维护时间戳。
- `spaces`：P0 仅 `personal`；同 owner 仅一个未删除 personal space。
- `space_memberships`：`(space_id, user_id)` 复合 PK；P0 仅 owner；`active | removed`。
- `user_preferences`：user/space 各自唯一，IANA timezone，21:00 默认汇总时间，`standard_full`，revision 从 1 开始。

四张表当前行数均为 0；本轮未创建真实或合成用户。

### 3.2 RLS、ACL 与函数

- 四张表 `relrowsecurity=true`。
- `anon`：无 SELECT/INSERT/UPDATE/DELETE。
- `authenticated`：仅 SELECT；无直接 INSERT/UPDATE/DELETE。
- 四条 SELECT policy 均为 `TO authenticated`，并组合 active account、当前 user 与 active membership。
- `pending_deletion/purging` 由 `private.is_active_account` 在数据库实时判定，旧 JWT 不能依赖 metadata 绕过。
- 三个 SECURITY DEFINER（两个授权 helper、一个私有 bootstrap helper）均为 `search_path=''`、owner=`postgres`、PUBLIC/anon EXECUTE=false。
- public bootstrap wrapper 为 SECURITY INVOKER；PUBLIC/anon EXECUTE=false，authenticated=true。
- `private` schema 未加入 Data API exposed schemas；anon 无 USAGE，authenticated 仅有调用冻结 helper 所需的 USAGE/精确 EXECUTE，无 CREATE 或表权限。

## 4. 开发验证

### 4.1 TDD

- 初始空 migration：数据库契约测试 4/4 失败。
- 完成首 migration：4/4 通过。
- 发现表级 IANA 约束缺口后新增失败测试：1 失败、4 通过。
- 增补第二 migration 后：5/5 通过。

### 4.2 最新完整验证

- `npm.cmd test`：9 个文件、32 个测试全部通过。
- `npm.cmd run typecheck`：通过。
- `npm.cmd run lint`：通过。
- `npm.cmd run build`：Next.js 生产构建通过，既有 SSR/Route/静态入口保持。
- `supabase/tests/g4_i1_database_contract.sql`：远端只读执行通过；同时返回两条预期 migration history。
- 无 `auth.uid()` 的 authenticated 会话：四张表读取为空，bootstrap 被拒绝。
- Supabase security advisor：0 条。
- Supabase performance advisor：1 条 INFO，提示新建的 `space_memberships_user_id_idx` 尚未使用。该索引服务 FK/RLS membership 查询路径，新空库阶段保留。参考：[Supabase unused index lint](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index)。
- `npm.cmd audit --omit=dev --audit-level=high`：生产依赖 0 漏洞。
- 完整开发依赖 audit：13 个 high，来自现有 ESLint/OpenNext 工具链的 `brace-expansion/minimatch` 依赖链；官方建议的自动修复会强制升级 ESLint 主版本，本增量未进行破坏性升级。

本机 Docker daemon 未运行，因此 `supabase db lint --local` 无法连接本地 Postgres。已使用 migration 源契约测试、远端原子应用、只读 catalog/ACL/RLS SQL 和 Supabase advisor 作为替代验证；该限制不伪装为本地数据库测试已通过。

## 5. 测试部复验

无需 secret 的仓库内入口：

- 静态 migration 契约：`npm.cmd test -- tests/database/g4-i1-migration-contract.test.ts`
- 全量回归：`npm.cmd test`
- 数据库只读契约：在精确项目 `ogvqegmgcuwlynczasop` 的受控管理测试连接执行 `supabase/tests/g4_i1_database_contract.sql`
- migration 校验值：PowerShell 执行 `Get-FileHash supabase/migrations/*.sql -Algorithm SHA256`

当前可独立复验：migration/history、结构、约束、索引、RLS、ACL、函数属性、无会话负向、advisor 与 G3 工程回归。

当前不可复验且不应误判通过：

- 合成 A/B active 用户；
- pending_deletion、旧 token、无 membership 边界；
- bootstrap 顺序重复、同用户并发与跨用户隔离。

这些账号与运行态证据属于产品规定的 B/Auth 接入阶段。本轮为遵守“A 自检和测试部结构/RLS 评审前不进入后续阶段”，没有提前创建 Auth 用户。测试部可先给出 A 范围结论；完整 G4-I1 仍保持待测。

## 6. 回退说明

本轮未执行回退。回退属于破坏性操作，必须由产品部明确批准，并只允许在确认四张表仍为零业务数据的 G4 测试环境执行。

批准后按逆序处理：

1. 删除 `user_preferences_validate_timezone` trigger，再删除 `private.validate_preferences_timezone()`。
2. 删除四条 RLS policy 和 public/private bootstrap/helper。
3. 删除相关 trigger/function。
4. 按 `user_preferences` → `space_memberships` → `spaces` → `user_profiles` 删除表。
5. 仅当 private schema 中无其他对象时删除该 schema。

一旦 B 阶段产生用户数据，不允许使用上述 drop 回退；必须采用 expand → migrate → contract 的前向修复 migration。

## 7. 修改文件

- `package.json`
- `package-lock.json`
- `supabase/.gitignore`
- `supabase/config.toml`
- `supabase/migrations/20260729080019_g4_i1_identity_spaces_rls.sql`
- `supabase/migrations/20260729080358_g4_i1_enforce_iana_timezone.sql`
- `supabase/tests/g4_i1_database_contract.sql`
- `tests/database/g4-i1-migration-contract.test.ts`
- `docs/engineering/LABFLOW_P0_G4_I1_DATABASE_BASELINE_REPORT.md`

未修改 `design/labflow-g3`，未接入真实业务数据，未写入或提交 key、token、密码、连接串或 `.env`。

## 8. 部署状态与门禁

- Supabase G4 测试项目：两条 migration 已应用。
- Sites/Web：未重新部署；G3 固定数据 harness 保持。
- G4-I1/A：具备结构/RLS 差异评审条件。
- G4-I1/B 与后续业务表：尚未开始，等待测试部 A 范围结论及产品部后续门禁。
