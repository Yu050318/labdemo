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
