# LabFlow G3 页面与状态矩阵

> 静态预览基址：`http://127.0.0.1:4173/`  
> 通用参数：`?page=<PAGE_ID>&state=<STATE>`  
> Windows CLI 兼容参数：`?page=<PAGE_ID>;state=<STATE>;qa=1`  
> `qa=1` 隐藏设计检查器，适合截图。

## 23 个页面/视图

| ID | 页面/视图 | 静态入口 | 代表性专属状态 |
|---|---|---|---|
| A01 | 登录 | `?page=A01&state=normal` | 错误、禁用、离线 |
| A02 | 注册与邮箱验证 | `?page=A02&state=normal` | 加载、错误、禁用 |
| A03 | 找回/重置密码 | `?page=A03&state=normal` | 错误、禁用 |
| O01 | 首次设置 | `?page=O01&state=normal` | 加载、错误、禁用、离线、冲突 |
| D01 | 今日工作台 | `?page=D01&state=normal` | 加载、空、错误、离线、冲突、高密度 |
| S01 | 日程日/周视图 | `?page=S01&state=normal` | 空、错误、离线、冲突、高密度 |
| S02 | 任务创建/编辑 | `?page=S02&state=normal` | 错误、禁用、离线、冲突 |
| W01 | 任务概览 | `?page=W01&state=normal` | 加载、禁用、离线、冲突 |
| W02 | 准备清单 | `?page=W02&state=normal` | 错误、禁用、离线、冲突 |
| W03 | 实验执行 | `?page=W03&state=normal` | 空、错误、禁用、离线、冲突 |
| W04 | 完成确认 | `?page=W04&state=normal` | 禁用、离线、冲突 |
| K01 | 知识库 | `?page=K01&state=normal` | 加载、空、错误、离线、高密度 |
| K02 | 方案详情与版本 | `?page=K02&state=normal` | 加载、错误、禁用、离线 |
| K03 | 方案创建/编辑 | `?page=K03&state=normal` | 错误、禁用、离线、冲突 |
| T01 | 计时中心 | `?page=T01&state=normal` | 空、错误、禁用、离线、冲突、高密度 |
| N01 | 通知中心 | `?page=N01&state=normal` | 空、错误、离线、通知不可用、高密度 |
| H01 | 实验历史 | `?page=H01&state=normal` | 加载、空、错误、离线、高密度 |
| H02 | 执行记录 | `?page=H02&state=normal` | 加载、错误、禁用、离线 |
| M01 | 晚间汇总 | `?page=M01&state=normal` | 加载、空、错误、离线、冲突 |
| P01 | 设置 | `?page=P01&state=normal` | 加载、错误、禁用、离线、冲突、通知不可用 |
| X01 | 数据导出 | `?page=X01&state=normal` | 加载、空、错误、禁用、离线 |
| R01 | 最近删除 | `?page=R01&state=normal` | 加载、空、错误、禁用、离线、冲突、高密度 |
| C01 | 账户待删除 | `?page=C01&state=account-pending-deletion` | 加载、错误、禁用、离线 |

## 全局固定状态

| 参数值 | 中文状态 | 推荐检查入口 |
|---|---|---|
| `normal` | 正常 | `D01` |
| `loading` | 加载 | `D01` |
| `empty` | 空 | `K01` 或 `M01` |
| `error` | 错误 | `R01` |
| `disabled` | 禁用 | `W04` |
| `offline` | 离线 | `W04` |
| `conflict` | 冲突 | `W04` |
| `notification-unavailable` | 通知不可用 | `N01` 或 `P01` |
| `account-pending-deletion` | 账户待删除 | 任意页面会强制进入 `C01` |
| `dense` | 高密度列表 | `K01` |

原型右下角“静态设计检查器”可直接切换页面与固定状态；截图时追加 `qa=1` 隐藏检查器。

## G2 用户可见增量

| 要求 | 入口 |
|---|---|
| 完成—撤销—再次完成的多份不可变快照 | `?page=H02&state=normal` |
| 本机 outbox 未清空时阻止完成 | `?page=W04&state=offline` |
| 其他离线设备尚未上报提示 | `?page=W04&state=normal` |
| `PARENT_COMPLETED` 冲突反馈 | `?page=W04&state=conflict` |
| 最新仍生效的知识库完成归档 | `?page=K02&state=normal` |
