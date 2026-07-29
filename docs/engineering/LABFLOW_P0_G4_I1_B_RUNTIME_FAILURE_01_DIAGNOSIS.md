# LabFlow P0 / G4-I1/B 受控运行失败诊断

> 事件：QA-G4-I1-B-RUN-01
> 日期：2026-07-29
> 目标项目：LabFlow / `ogvqegmgcuwlynczasop`
> 诊断范围：Fixture A 创建阶段；未运行真实 Auth harness

## 结论

本次失败发生在 Auth 管理请求进入目标项目业务处理之前，不是 RLS、数据库约束或 bootstrap RPC 缺陷。

根因由两个相互关联的 harness 缺陷组成：

1. `@supabase/supabase-js 2.111.0` 的 Auth 客户端会把新格式 API Key 同时写入 `apikey` 与 `Authorization: Bearer ...`。新 `sb_secret_` / `sb_publishable_` Key 不是 JWT，Supabase 官方要求只用 `apikey` 传递；相同的 `auth.admin.createUser` 失败模式已有官方 GitHub 问题记录。
2. 原 harness 仅序列化 `error.code`。部分 Auth SDK 错误没有 `code`，因此用户只看到 `Fixture A creation failed (unknown)`，丢失了安全可用的状态和错误类别。

原 harness 还在完成报告中硬编码项目 ref，而未在首次写操作前核验 `SUPABASE_URL`。这不会证明本次用户配置错误，但不满足目标项目写入前的 fail-closed 要求，已一并补齐。

## 只读证据

- 本地 `HEAD` 与 `origin/main` 在诊断开始时均为 `b68ae47fc58af09e39f732f63dc29ce7ce979e59`。
- 目标项目最近 Auth/API 日志中没有对应的 `/auth/v1/admin/users` 成功进入记录。
- 目标项目中 `labflow_fixture = g4_i1_b` 的去敏计数：
  - Auth 用户：0
  - `user_profiles`：0
  - `spaces`：0
  - `space_memberships`：0
  - `user_preferences`：0
- 未发现需要清理的本轮半成品；没有执行删除或其他远端写操作。
- 未读取、索取、复制、哈希或输出任何 Key、JWT、邮箱或原始 UUID。

## 最小修复

- 在 harness 的统一 fetch 边界中，仅当新格式 API Key 被原样复制为 Bearer 时删除 `Authorization`，保留 `apikey`。
- 真实用户 session Bearer 不受影响。
- 所有 harness Supabase 客户端共用该边界，包括管理员、publishable、失效会话探针。
- 首次远端操作前核验 URL 必须使用目标 HTTPS origin：protocol 为 `https:`、hostname 精确为 `ogvqegmgcuwlynczasop.supabase.co`，且不得内嵌凭据或使用非标准端口。
- Fixture 创建、登录和清理失败只输出：
  - `stage`
  - `status`
  - `code`
  - `category`
- 不输出响应正文、错误 message、请求头、标识符或凭据。

## 测试边界

开发部不会运行真实 Auth harness。真实凭据只保留在用户受控 PowerShell 会话中。候选通过静态与模拟 fetch 验证后，唯一允许的下一次运行命令仍为：

```powershell
npm.cmd run test:g4-i1-auth
```

用户只应回传命令产生的去敏 JSON，不应回传任何环境变量或凭据。真正自然过期 token 的服务端拒绝证据如仍缺失，必须继续单独标记为未关闭。

## RUN-03：Node 24 启动兼容性

- 复现环境为 Node.js `v24.15.0`；`test:g4-i1-auth` 通过 Node 直接执行 `.ts` 文件，采用原生 strip-only TypeScript。
- 根因为 `AuthHarnessFailure` 构造函数使用 TypeScript parameter property。该语法需要转换，不能仅靠类型擦除，因此脚本在任何客户端创建、fetch 或远端操作前解析失败。
- 使用 TypeScript `erasableSyntaxOnly` 对项目进行同类扫描，只发现这一处不可擦除语法。
- 最小修复将 parameter property 改为显式只读字段和构造函数赋值，没有新增运行器或依赖。
- 启动级回归使用当前 Node 可执行文件、空白受控环境和真实脚本入口，证明脚本完成解析并在创建客户端或 fetch 前，以固定去敏的缺变量错误退出。
- RUN-02 的目标 HTTPS origin 锁定、新 API Key/Bearer 分离和安全诊断回归继续由专项测试覆盖。

RUN-03 经测试部关闭且产品部重新授权前，用户不得运行真实 Auth harness。
