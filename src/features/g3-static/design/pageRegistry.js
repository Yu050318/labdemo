export const PAGE_IDS = [
  "A01", "A02", "A03", "O01", "D01", "S01", "S02", "W01", "W02", "W03",
  "W04", "K01", "K02", "K03", "T01", "N01", "H01", "H02", "M01", "P01",
  "X01", "R01", "C01",
];

export const GLOBAL_STATES = [
  "normal", "loading", "empty", "error", "disabled", "offline", "conflict",
  "notification-unavailable", "account-pending-deletion", "dense",
];

const page = (title, group, kind, eyebrow) => ({
  title,
  group,
  kind,
  eyebrow,
  render: () => null,
});

export const pageRegistry = {
  A01: page("登录", "账户", "auth-login", "欢迎回来"),
  A02: page("注册与邮箱验证", "账户", "auth-register", "创建个人实验空间"),
  A03: page("找回与重置密码", "账户", "auth-reset", "恢复账户访问"),
  O01: page("首次设置", "账户", "onboarding", "第 2 步，共 4 步"),
  D01: page("今日工作台", "今日", "dashboard", "2026 年 7 月 29 日 · 星期三"),
  S01: page("实验日程", "日程", "schedule", "本周 · 7 月 27 日—8 月 2 日"),
  S02: page("任务创建与编辑", "日程", "task-form", "固定字段"),
  W01: page("任务概览", "任务工作区", "workspace-overview", "RNA 提取与纯化"),
  W02: page("准备清单", "任务工作区", "preparation", "RNA 提取与纯化"),
  W03: page("实验执行", "任务工作区", "execution", "步骤 3 / 8"),
  W04: page("完成确认", "任务工作区", "completion", "主动完成与归档"),
  K01: page("个人知识库", "知识库", "knowledge-list", "500 个代表性方案"),
  K02: page("方案详情与版本", "知识库", "knowledge-detail", "RNA 提取与纯化标准方案"),
  K03: page("方案创建与编辑", "知识库", "protocol-form", "手工维护标准方案"),
  T01: page("计时中心", "全局工具", "timers", "3 个活跃计时器"),
  N01: page("通知中心", "全局工具", "notifications", "站内提醒与 Push 降级"),
  H01: page("实验历史", "历史", "history-list", "不可变执行记录"),
  H02: page("执行记录", "历史", "history-detail", "完成—撤销—再次完成"),
  M01: page("晚间汇总", "汇总", "summary", "今天 21:00"),
  P01: page("设置", "设置与数据", "settings", "账户与偏好"),
  X01: page("数据导出", "设置与数据", "export", "JSON / CSV"),
  R01: page("最近删除", "设置与数据", "deleted", "30 天恢复窗口"),
  C01: page("账户待删除", "设置与数据", "account-delete", "7 天撤销期"),
};
