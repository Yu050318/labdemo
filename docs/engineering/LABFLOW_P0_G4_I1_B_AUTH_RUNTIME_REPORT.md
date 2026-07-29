# LabFlow P0 / G4-I1/B Auth 运行态与隔离报告

> 版本：G4-I1-B-Prep-2
> 日期：2026-07-29
> 目标项目：`LabFlow` / `ogvqegmgcuwlynczasop`
> 当前结论：PRE-01 已关闭，PRE-02 所需 harness 已就绪；真实 Auth 与真实过期 token 证据仍等待环境所有者安全注入，B 尚未通过。

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

未创建合成用户，未运行真实 Auth harness，未读取或输出任何 key、密码、邮箱、JWT、refresh token、连接串或 `.env`。

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

## 5. 真正过期 token 的限制与独立验证方法

托管项目的已签发 JWT 不能通过数据库 migration 或当前 project-scoped MCP 安全地“立即过期”；改变 Auth JWT 生命周期也不属于本轮数据库整改范围。伪造、篡改或固定无效 token 不得替代真实过期证据。

独立验证方法：

1. 由环境所有者或测试部在受控进程中取得该项目真实签发的合成账号 access token，并仅保存在进程环境或秘密管理器中。
2. 保留非敏感的签发来源记录与 `expires_at` 时间戳，等待该时间真实经过。
3. 将原 token 以 `LABFLOW_TEST_EXPIRED_ACCESS_TOKEN` 安全注入同一受控进程，同时注入既有三项 Supabase 服务端运行变量。
4. 运行 `npm.cmd run test:g4-i1-auth`。harness 在内存中验证 JWT `exp < 当前时间`，再调用 Supabase Auth `getUser(token)`，只有服务端拒绝才输出 `expiredSession.status=passed`。
5. 未注入该变量时，整体输出为 `status=incomplete`，并明确 `requires_naturally_expired_supabase_issued_token`；不得判定完整 B 通过。

此流程需要真实时间流逝，不能在本轮静态整改中伪造完成。

## 6. 本轮验证

- TDD 红灯：先后 5 个和 1 个预期失败；实现后专项 17/17 通过，全量 44/44 通过。
- TypeScript strict typecheck：通过。
- ESLint：通过。
- Next.js production build：通过。
- `git diff --check`：通过。
- 远端 migration history：4/4 顺序一致。
- 远端函数 ACL/search_path/definer 复核：通过。
- 远端 fixture guard 负向探针：通过。
- Security Advisor：0。
- 生产依赖 `npm audit --omit=dev`：0 漏洞。

未执行 `npm.cmd run test:g4-i1-auth`，因为当前任务禁止读取、索取或自行注入 secret；真实 A/B、旧 token、pending_deletion/purging 和真正过期 token 运行证据仍待后续安全执行。

## 7. 部署与门禁

- Supabase：Prep-2 migration 已应用。
- Web/Sites：本轮无部署、无 UI 变更。
- G4-I1/A：已通过。
- G4-I1/B：仍待真实 Auth 运行与测试部正式验收。
- G4-I1/C：禁止开始。

`MEMORY.md` 不存在，本轮未创建或更新。
