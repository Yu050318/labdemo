# LabFlow P0 / G4-I2 Data Model Delta

> 版本：G4-I2-Delta-1
>
> 日期：2026-07-29
>
> 基线：G2-Review-3.1 Data Model
>
> 状态：产品部已冻结，仅补充 Schedule 取消原因事实来源

## 1. 适用边界

本差异只补充 `public.experiment_tasks` 的取消原因，不改变 G2-Review-3.1 的其他表、权限、保留期或 P0/P1/P2 范围。

## 2. `public.experiment_tasks` 新增字段

| 字段 | 类型 | 规则 |
|---|---|---|
| `cancellation_reason` | text null | 纯文本；trim 后 1–500 字符；不得复用 `notes` |

约束：

- `execution_state = 'cancelled'` 时 `cancellation_reason` 必须非空。
- `execution_state <> 'cancelled'` 时 `cancellation_reason` 必须为 `null`。
- 存储值必须等于自身 trim 后结果；边界集合固定为 Unicode White_Space：U+0009–000D、U+0020、U+0085、U+00A0、U+1680、U+2000–U+200A、U+2028、U+2029、U+202F、U+205F、U+3000，并补 U+FEFF。
- U+200B 不属于本集合，不自动裁剪；前端必须镜像同一明确字符集合。
- 只裁首尾边界空白，正文内部换行原样保留。
- 取消不物理删除任务。

## 3. 事务与审计

- `cancel_experiment_task` 原子设置 `execution_state='cancelled'`、`cancellation_reason`、revision、mutation receipt。
- reason 为空白或 trim 后超过 500 字符时返回 `VALIDATION_FAILED`；task、receipt、audit、revision 均无副作用。
- 相同 mutation/hash 返回原结果；相同 mutation/不同 hash 返回 `IDEMPOTENCY_KEY_REUSED`。
- `private.audit_events.metadata` 只记录状态、revision 等既有白名单字段，不保存取消原因正文。
- 不新增 `cancelled_at`；取消事件时间使用不可变 audit event `created_at`。

## 4. 展示与导出

- 原因按纯文本保存和展示，不解析 Markdown/HTML，输出到 HTML 时转义。
- 后续 JSON 导出把 `cancellation_reason` 作为任务字段包含。
- CSV 是否包含及列映射留到 G4-I6，按冻结导出规格处理。

## 5. 实施顺序

- G4-I2 schema migration 直接创建该字段与状态一致性 check。
- G4-I2 RPC migration 负责 trim、长度验证、幂等、receipt 和不含正文的 audit。
- 本差异不授权提前实现 Protocols 或其他后续增量。
