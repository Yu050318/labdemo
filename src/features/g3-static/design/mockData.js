export const mockUser = {
  name: "林晓",
  initials: "林",
  timezone: "Asia/Shanghai",
  summaryTime: "21:00",
  syncTime: "10:42",
};

export const tasks = [
  { id: "EXP-0729-01", time: "09:15", band: "早", title: "RNA 提取与纯化", state: "进行中", tone: "active" },
  { id: "EXP-0729-02", time: "13:30", band: "中", title: "细胞沉淀与重悬", state: "待准备", tone: "pending" },
  { id: "EXP-0729-03", time: "13:45", band: "中", title: "NanoDrop RNA 质量检测", state: "时间冲突", tone: "danger" },
  { id: "EXP-0729-04", time: "19:30", band: "晚", title: "数据整理与结果初步分析", state: "计划中", tone: "neutral" },
  { id: "EXP-0729-05", time: "21:00", band: "晚", title: "记录明日实验材料清点", state: "未关联方案", tone: "warning" },
];

export const steps = [
  { number: 1, title: "样本准备", state: "已完成", detail: "组织样本 30–50 mg" },
  { number: 2, title: "加入裂解液", state: "已完成", detail: "RLT 700 μL" },
  { number: 3, title: "裂解与混匀", state: "当前步骤", detail: "室温静置 3 min，再进行离心" },
  { number: 4, title: "离心分离", state: "未开始", detail: "12,000 × g，2 min" },
  { number: 5, title: "上柱结合", state: "待同步", detail: "离线操作等待同步" },
  { number: 6, title: "洗涤 1", state: "冲突", detail: "服务器记录与本机操作不同" },
  { number: 7, title: "洗涤 2", state: "已跳过", detail: "需填写跳过原因" },
  { number: 8, title: "洗脱与质检", state: "未开始", detail: "预热无 RNase 水" },
];

export const timers = [
  { id: "tm-1", title: "裂解孵育", task: "RNA 提取与纯化", step: "步骤 3", display: "00:00", target: "10:42", state: "已到点", tone: "danger" },
  { id: "tm-2", title: "离心", task: "RNA 提取与纯化", step: "步骤 4", display: "01:22", target: "10:45", state: "运行中", tone: "active" },
  { id: "tm-3", title: "洗脱孵育", task: "细胞沉淀与重悬", step: "步骤 6", display: "04:35", target: "11:03", state: "已暂停", tone: "warning" },
];

export const protocols = [
  { name: "RNA 提取与纯化标准方案", version: "v2.1", state: "已确认", updated: "今天 09:02" },
  { name: "哺乳动物细胞总 RNA 提取与 DNase 处理的长适用条件方案", version: "v1.4", state: "待复核", updated: "昨天 18:20" },
  { name: "细胞沉淀与重悬", version: "v3.0", state: "执行版本", updated: "7 月 27 日" },
  { name: "NanoDrop 质检", version: "v1.2", state: "草稿", updated: "7 月 25 日" },
  { name: "旧版柱式纯化", version: "v4.7", state: "已停用", updated: "6 月 10 日" },
];

export const notifications = [
  { time: "10:42", title: "裂解孵育已到点", body: "请返回 RNA 提取与纯化 · 步骤 3。", tone: "danger", unread: true },
  { time: "10:31", title: "时间冲突待处理", body: "13:30–14:30 两项实验任务重叠。", tone: "warning", unread: true },
  { time: "09:12", title: "Push 投递失败", body: "提醒已保留在站内通知中。", tone: "neutral", unread: false },
];

export const history = [
  { completion: "CMP-0728-02", title: "细胞传代", event: "再次完成", at: "7 月 28 日 18:42", active: true },
  { completion: "CMP-0728-01", title: "细胞传代", event: "撤销完成", at: "7 月 28 日 18:31", active: false },
  { completion: "CMP-0728-00", title: "细胞传代", event: "首次完成", at: "7 月 28 日 18:10", active: false },
];

export const deletedItems = [
  { type: "任务", title: "梯度 PCR 预实验", remaining: "剩余 29 天", action: "可恢复" },
  { type: "方案", title: "旧版琼脂糖凝胶电泳方案", remaining: "剩余 1 天", action: "可恢复" },
  { type: "任务", title: "失效样本复核", remaining: "已进入永久删除流程", action: "不可恢复" },
];

export const GLOBAL_STATE_COPY = {
  loading: ["正在读取本页固定数据", "页面结构保持可见，完成后更新内容。"],
  empty: ["这里还没有内容", "可从本页主要操作开始建立第一条记录。"],
  error: ["部分内容未能载入", "已显示的数据不会被清空，请重试失败区域。"],
  disabled: ["当前操作不可用", "任务状态或必填信息尚不满足操作条件。"],
  offline: ["当前处于离线状态", "显示 10:42 的缓存；允许的勾选会标记为待同步。"],
  conflict: ["发现需要确认的冲突", "本机操作尚未覆盖服务器数据，请选择处理方式。"],
  "notification-unavailable": ["Push 通知不可用", "站内提醒继续有效；LabFlow 不替代专用报警设备或人工值守。"],
  "account-pending-deletion": ["账户处于删除撤销期", "普通业务内容不可访问，仅可撤销删除或退出。"],
  dense: ["代表性高密度列表", "当前显示第 2/3 批；继续加载不会移动正在阅读的位置。"],
};
