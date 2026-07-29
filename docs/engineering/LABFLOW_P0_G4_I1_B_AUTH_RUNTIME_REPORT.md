# LabFlow P0 / G4-I1/B Auth 运行态与隔离报告

> 版本：G4-I1-B-Run-1
> 日期：2026-07-29
> 目标项目：`LabFlow` / `ogvqegmgcuwlynczasop`
> 当前结论：用户受控真实 Auth 运行除自然过期 token 外均已通过，清理结果已由 project-scoped OAuth/MCP 只读复核；RUN-01 可申请关闭，PRE-02 仅剩 `expiredSession`，完整 B 尚未通过。

## 1. 本轮整改

- 追加 migration `20260729113507_g4_i1_tighten_fixture_acl_and_membership.sql`，未改写任何已应用 migration。
- 撤销 `authenticated` 对 `private.is_g4_i1_fixture_user(uuid)` 的直接 `EXECUTE`。
- 新增仅限 `service_role` 的 membership 物理删除/恢复 fixture RPC；private helper 为固定 `search_path=''` 的 `SECURITY DEFINER`，public wrapper 为 `SECURITY INVOKER`。
- 所有 fixture 写操作先验证 `auth.users.raw_app_meta_data.labflow_fixture = g4_i1_b`；未标记 UUID 被拒绝。
- harness 新增：
  - membership 行物理不存在及恢复；
  - 四张表 A→B、B→A 共 8 个 SELECT；
  - 四张表 A→B、B→A 的 INSERT/UPDATE/DELETE 共 24 个拒绝断言；
  - 同一 A/B 去敏 ID 对齐的清理前、后四表计数；
  - 真实过期 JWT 的本地 `exp` 校验与 Supabase Auth 服务端拒绝校验。
- 固定伪 token 只标记为 `invalidSession`，不再作为“过期 token”证据。
- 修正 PRE-03 测试口径：active 用户 membership 为 removed 或物理不存在时，本人 profile 仍为 1；spaces、space_memberships、user_preferences 为 0；bootstrap 必须拒绝。pending_deletion/purging 时四表仍全部为 0。

未创建合成用户，未运行真实 Auth harness，未读取或输出任何 key、密码、邮箱、JWT、refresh token、连接串或 `.env`。

PRE-03 不涉及数据库缺陷，本轮没有新增或应用 migration，也没有修改已应用 migration。

## 2. Migration 与远端状态

- migration：`20260729113507_g4_i1_tighten_fixture_acl_and_membership`
- SHA-256：`656C071016562B317D5FE3697291C7D25BB186C21DB29050090BC778256F825D`
- 依赖顺序：
  1. `20260729080019_g4_i1_identity_spaces_rls`
  2. `20260729080358_g4_i1_enforce_iana_timezone`
  3. `20260729104223_g4_i1_auth_fixture_support`
  4. `20260729113507_g4_i1_tighten_fixture_acl_and_membership`
- 已应用到唯一目标项目 `ogvqegmgcuwlynczasop`。
- 四张 public 业务表仍均为 0 行，RLS 状态未改变。
- 回退边界：这些 fixture helper 必须在 G5 前通过新的追加 migration 删除；不得改写或倒改本 migration。

## 3. ACL 与实现边界

远端核验结果：

- `private.is_g4_i1_fixture_user(uuid)`：`authenticated=false`、`service_role=true`。
- remove/restore private helper：`SECURITY DEFINER`、固定空 `search_path`，仅 `service_role` 可执行。
- remove/restore public wrapper：`SECURITY INVOKER`、固定空 `search_path`，仅 `service_role` 可执行。
- `PUBLIC`、`anon`、`authenticated` 均不能执行新增 remove/restore 函数。
- 未标记 UUID 的 remove/restore 调用均被 fixture guard 拒绝。
- Security Advisor：0。
- Performance Advisor：仅既有空库 `space_memberships_user_id_idx` 未使用 INFO；当前不删除该规格索引。

Supabase 平台的 `service_role` 客观上具备四张表的高权限写能力。因此“harness 不直接写业务表”不是 ACL 强制属性，而由以下边界保证：

1. service-role secret 仅存在于受控服务端进程；
2. harness 源码不使用 admin client 的直接 INSERT/UPDATE/DELETE/UPSERT；
3. 状态构造只调用带 fixture tag guard 的专用 RPC；
4. 静态测试持续检查上述代码边界。

## 4. 去敏运行证据格式

真实运行后，每个 fixture 仅输出：

- `alias`：`A` 或 `B`；
- `redactedId`：原始 UUID 的 12 位不可逆 SHA-256 截断；
- 清理前、后 `profiles/spaces/memberships/preferences` 计数。

成功清理的预期格式为每个别名清理前 `1/1/1/1`，清理后 `0/0/0/0`。报告不包含原始 UUID、邮箱或凭据。

membership 边界的去敏断言只输出通过项，不输出业务行内容：

- active + removed/missing membership：本人 profile 计数 `1`，空间相关三表计数均为 `0`；
- A→B、B→A 的跨用户 profile 计数仍为 `0`；
- pending_deletion/purging：四表计数均为 `0`。

## 5. 真正过期 token 的限制与独立验证方法

托管项目的已签发 JWT 不能通过数据库 migration 或当前 project-scoped MCP 安全地“立即过期”；改变 Auth JWT 生命周期也不属于本轮数据库整改范围。伪造、篡改或固定无效 token 不得替代真实过期证据。

独立验证方法：

1. 由环境所有者或测试部在受控进程中取得该项目真实签发的合成账号 access token，并仅保存在进程环境或秘密管理器中。
2. 保留非敏感的签发来源记录与 `expires_at` 时间戳，等待该时间真实经过。
3. 将原 token 以 `LABFLOW_TEST_EXPIRED_ACCESS_TOKEN` 安全注入同一受控进程，同时注入既有三项 Supabase 服务端运行变量。
4. 运行 `npm.cmd run test:g4-i1-auth`。harness 在内存中验证 JWT `exp < 当前时间`，再调用 Supabase Auth `getUser(token)`，只有服务端拒绝才输出 `expiredSession.status=passed`。
5. 未注入该变量时，整体输出为 `status=incomplete`，并明确 `requires_naturally_expired_supabase_issued_token`；不得判定完整 B 通过。

此流程需要真实时间流逝，不能在本轮静态整改中伪造完成。

## 6. Prep-3 静态验证（历史记录）

- Prep-2 TDD 红灯：先后 5 个和 1 个预期失败。
- PRE-03 TDD 红灯：新增 2 个预期失败；最小修复后 harness 专项 10/10 通过。
- 全量 Vitest：10 个文件、46/46 通过。
- TypeScript strict typecheck：通过。
- ESLint：通过。
- Next.js production build：通过。
- `git diff --check`：通过。
- 远端 migration history：4/4 顺序一致。
- 远端函数 ACL/search_path/definer 复核：通过。
- 远端 fixture guard 负向探针：通过。
- Security Advisor：0。
- 生产依赖 `npm audit --omit=dev`：0 漏洞。

Prep-3 阶段开发部未执行 `npm.cmd run test:g4-i1-auth`，因为该阶段禁止读取、索取或自行注入 secret。后续用户受控运行结果见第 8 节。

## 7. 部署与门禁

- Supabase：Prep-2 migration 已应用。
- Web/Sites：本轮无部署、无 UI 变更。
- G4-I1/A：已通过。
- G4-I1/B：真实 Auth 主体运行已形成证据，仍待自然过期 token 与测试部正式验收。
- G4-I1/C：禁止开始。

`MEMORY.md` 不存在，本轮未创建或更新。

## 8. 用户受控真实运行证据

本次运行证据关联最后获准候选 `603d6cd0404c37454c26cde5d102e9f0bf69981b`。用户在受控 PowerShell 会话运行 `npm run test:g4-i1-auth`。开发部未接触运行变量、Key、JWT、邮箱或原始 UUID，仅接收以下去敏结果：

- `status=incomplete`
- `projectRef=ogvqegmgcuwlynczasop`
- fixtures A/B：`emailConfirmed=true`，各自仅输出 12 位不可逆 `redactedId`
- 以下断言全部 `passed`：
  - `failureRollback`
  - `firstBootstrap`
  - `sequentialIdempotency`
  - `sameUserConcurrency`
  - `crossUserConcurrency`
  - `revision`
  - `crossAccountIsolation`
  - `directMutationDenial`
  - `removedMembership`
  - `missingMembershipRow`
  - `pendingDeletionOldSession`
  - `purgingOldSession`
  - `invalidSession`
  - `localSignOut`
- 唯一未执行项：
  - `expiredSession.status=not_run`
  - `reason=requires_naturally_expired_supabase_issued_token`
- `cleanup.status=passed`；A/B 的 profiles、spaces、memberships、preferences 均由清理前 `1` 变为清理后 `0`。

### 8.1 远端只读独立核验

开发部通过 project-scoped Supabase OAuth/MCP 对唯一目标项目执行聚合计数查询，没有读取身份字段或行内容。结果为：

- 带 `labflow_fixture=g4_i1_b` 标记的 Auth 用户：0
- fixture 关联 profiles：0
- fixture 关联 spaces：0
- fixture 关联 memberships：0
- fixture 关联 preferences：0
- 四张业务表总行数分别为：profiles=0、spaces=0、memberships=0、preferences=0

用户去敏清理回执与远端聚合事实一致；未发现本轮 fixture 或业务行残留。开发部没有执行删除或其他远端写操作。

### 8.2 门禁判断

- `QA-G4-I1-B-RUN-01`：原 Fixture A 创建阶段失败已不再复现，且真实运行完成全部后续 Auth/RLS/清理断言，可提交测试部关闭。
- `PRE-02`：除自然过期 token 的服务端拒绝证据外，其余真实运行证据均已形成，可按子项关闭；`PRE-02` 整体仍不能关闭。
- `G4-I1/B`：测试部结论为有条件通过，但未完全关闭；完整 `G4-I1` 仍未通过。
- 从技术与质量风险看，其余 I1 身份空间、并发、隔离、账户状态和清理路径已经覆盖，自然过期会话可作为独立并行门禁保留。
- 只有产品部明确批准“条件式进入下一增量”后才能进入；在正式放行前不启动下一增量，且不得把进入下一增量解释为 `expiredSession`、PRE-02 或完整 I1 已通过。

## 9. `expiredSession` 安全执行方案

推荐使用一次性、用户本地受控的“单进程自然过期探针”，避免 token 在进程间传递：

1. 仅在用户受控本地进程内创建独立合成账号并取得 Supabase 正式签发的 access token。
2. token 只保存在该进程内存中；不得输出、写入环境文件、普通文件、日志、剪贴板、聊天或 commit。
3. 进程只记录非敏感的 `expires_at` 和阶段状态，并等待该签发 token 自然超过 `exp`，再增加至少 60 秒安全余量；不得修改项目 JWT 生命周期、系统时钟或伪造 token。
4. 到期后由同一进程调用 Supabase Auth `getUser(token)`；只有本地 `exp < now` 且服务端明确拒绝时，才输出 `expiredSession.status=passed`。
5. 无论通过、失败或用户中断，均在 `finally`/退出处理器中清理该独立合成账号；随后再通过 project-scoped OAuth/MCP 只读核验 fixture 与四表聚合计数为 0。
6. 输出仍只允许固定的 `status`、`stage`、安全错误类别和聚合计数，不得包含 token、邮箱、UUID、响应正文或请求头。

该探针需要先以 TDD 实现并通过测试部静态安全复核，再授权用户运行。现有真实 harness 不应通过聊天接收 token，也不应要求用户把 token 保存到文件。
