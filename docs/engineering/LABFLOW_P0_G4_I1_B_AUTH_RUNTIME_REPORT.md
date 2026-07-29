# LabFlow P0 / G4-I1/B Auth 运行态与隔离报告

> 版本：G4-I1-B-Prep-1
> 日期：2026-07-29
> 目标项目：`LabFlow` / `ogvqegmgcuwlynczasop`
> 当前结论：测试支撑已就绪；Auth Admin 运行证据受安全凭据注入阻断，B 尚未通过

## 1. 本轮完成

- 锁定 `@supabase/supabase-js` 2.111.0。
- 新增服务端 Auth 隔离 harness：`scripts/g4-i1-auth-isolation.ts`。
- 新增 migration `20260729104223_g4_i1_auth_fixture_support.sql` 并应用到目标项目。
- 新增 fixture-only 状态/快照 RPC，供 pending_deletion、purging、removed membership 与清理计数验证。
- 新增事务失败注入 RPC，用于确认 bootstrap 中途异常不残留 profile/space/membership/preferences。
- 新增迁移 ACL 契约测试、harness 配置脱敏测试和远端只读 SQL 契约。

没有接入页面、真实 Auth UI、日程或后续业务表，没有创建真实用户。

## 2. Migration 与远端状态

新增 migration：

- 文件：`supabase/migrations/20260729104223_g4_i1_auth_fixture_support.sql`
- SHA-256：`4C0FEB3773F4217E864483707333F47D7F8282A9866612AB530CFB293E46CE16`
- 依赖：`20260729080019_g4_i1_identity_spaces_rls`、`20260729080358_g4_i1_enforce_iana_timezone`

远端 history：

1. `20260729080019 / g4_i1_identity_spaces_rls`
2. `20260729080358 / g4_i1_enforce_iana_timezone`
3. `20260729104223 / g4_i1_auth_fixture_support`

A 的既有 migration 未修改。

## 3. 测试支撑安全边界

- 所有状态修改先验证 `auth.users.raw_app_meta_data.labflow_fixture = g4_i1_b`；不能作用于未标记用户。
- account/membership/snapshot public wrapper 为 SECURITY INVOKER，仅 `service_role` 有 EXECUTE。
- PUBLIC、anon、authenticated 对上述状态 wrapper 均无 EXECUTE。
- 失败注入 wrapper 只允许 authenticated；私有 helper 再核对当前 `auth.uid()` 对应用户带 fixture 标记，且函数总是抛错回滚。
- 所有私有 SECURITY DEFINER 固定 `search_path=''`，PUBLIC EXECUTE 已撤销。
- service_role 只新增四张 G4-I1 表的 SELECT 和精确 fixture RPC EXECUTE；没有授予直接 INSERT/UPDATE/DELETE。
- 测试支撑必须在 G5 前通过追加 migration 删除，不允许成为生产公开功能。

## 4. Harness 覆盖范围

安全注入运行时变量后，`npm.cmd run test:g4-i1-auth` 将：

1. 在服务端生成随机合成 A/B 邮箱和高熵密码，不写盘、不打印。
2. 通过 Auth Admin `createUser({ email_confirm: true })` 创建两名带 fixture app_metadata 的用户。
3. 用 publishable key 完成 A/B 密码登录并获得各自会话。
4. 验证无效时区和中途失败注入均为 0 残留。
5. 验证 A 首次 bootstrap 与顺序重复幂等。
6. 验证 B 首次同用户双并发只产生一套资源，并返回同一 ID。
7. 验证 A/B 并行重复调用保持隔离。
8. 断言每人恰好 1 profile、1 active personal space、1 owner membership、1 preferences，preferences revision=1。
9. 验证 A/B 双向跨账号 SELECT 为 0。
10. 验证跨账号 INSERT/UPDATE/DELETE、owner/user/space 归属篡改和 service-only RPC 均失败。
11. 验证 membership=`removed` 时所有普通业务读取为 0，bootstrap 失败；随后恢复 active。
12. 用状态变化前的同一会话验证 pending_deletion/purging 立即阻断普通业务读取与 bootstrap；随后恢复 active。
13. 验证无效/过期代表 token 被拒绝，local sign-out 后客户端不再持有会话且无法读取。
14. `finally` 中通过 Auth Admin 删除本轮用户，并断言四张业务表针对两名用户的计数均为 0。

标准输出只包含 A/B 别名、不可逆 12 位哈希标识和通过项；不输出邮箱、密码、JWT、refresh token、service-role 或连接串。

## 5. 当前阻断

当前进程仅检查了环境变量是否存在，结果如下：

- `SUPABASE_URL`：未注入
- `SUPABASE_PUBLISHABLE_KEY`：未注入
- `SUPABASE_SERVICE_ROLE_KEY`：未注入

Supabase MCP 的 OAuth 项目连接只提供数据库/开发工具，没有 Auth Admin create/delete user 工具。官方 Auth Admin `createUser({ email_confirm: true })` 和 `deleteUser` 必须使用服务端 service-role/secret；普通 publishable-key signup 在邮箱确认开启时不能获得已验证会话，也不能安全清理用户。禁止通过 SQL 直接写 `auth.*` 系统表。

因此本轮没有创建合成用户，也没有伪造首次/并发/跨账号/pending/旧 token 运行证据。四张业务表仍为 0 行。

解除阻断的最小安全动作：由环境所有者在本机受控终端会话或秘密管理器中注入上述三个变量，然后运行 `npm.cmd run test:g4-i1-auth`。不得把变量值粘贴到聊天、commit、日志或报告。

## 6. 已完成验证

- migration TDD：新增用例先 2 失败，完成后专项 7/7。
- harness + migration 专项：10/10。
- 全量 Vitest：10 个文件、37/37。
- TypeScript strict typecheck：通过。
- ESLint：通过。
- Next.js production build：通过。
- 生产依赖 audit：0 漏洞。
- 无变量运行：按预期失败，仅输出缺失变量名。
- 远端只读 SQL：history、ACL、search_path、未标记 UUID 拒绝全部通过。
- Supabase Security Advisor：0。
- Supabase Performance Advisor：仅既有空库 `space_memberships_user_id_idx` unused-index INFO。

## 7. 复验与清理

不含 secret 的检查：

- `npm.cmd test -- tests/database/g4-i1-auth-harness.test.ts tests/database/g4-i1-migration-contract.test.ts`
- `npm.cmd run typecheck`
- 在项目 `ogvqegmgcuwlynczasop` 受控管理连接执行 `supabase/tests/g4_i1_auth_fixture_contract.sql`
- `Get-FileHash supabase/migrations/20260729104223_g4_i1_auth_fixture_support.sql -Algorithm SHA256`

含 secret 的 harness 只能由安全注入后的受控进程运行；它不接受命令行参数形式的密钥，并在所有退出路径执行本轮用户清理。若进程被操作系统强制终止，应使用 Auth Admin 按 `app_metadata.labflow_fixture=g4_i1_b` 和本次去敏运行记录定位本轮用户，再执行相同 delete/cascade 复验；不得按模糊邮箱范围批量删除。

## 8. 部署与门禁

- Supabase：fixture-support migration 已应用。
- Auth 合成用户：未创建。
- Web/Sites：未部署、未接真实 Auth UI。
- G4-I1/A：已通过。
- G4-I1/B：尚未通过；等待安全凭据注入后形成真实运行证据，再提交测试部独立验收。
- G4-I1/C：禁止开始。

`MEMORY.md` 不存在，本轮未创建或更新。
