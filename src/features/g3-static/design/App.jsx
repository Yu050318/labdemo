"use client";

import { useState } from "react";
import {
  Archive,
  ArrowClockwise,
  Bell,
  BookOpen,
  CalendarBlank,
  CaretDown,
  CaretRight,
  Check,
  CheckCircle,
  Clock,
  CloudSlash,
  DownloadSimple,
  Export,
  Eye,
  Flask,
  GearSix,
  House,
  Info,
  LockKey,
  MagnifyingGlass,
  Pause,
  Play,
  Plus,
  SignOut,
  Timer,
  Trash,
  Warning,
  WifiHigh,
} from "@phosphor-icons/react";
import { pageRegistry, PAGE_IDS, GLOBAL_STATES } from "./pageRegistry.js";
import {
  deletedItems,
  GLOBAL_STATE_COPY,
  history,
  mockUser,
  notifications,
  protocols,
  steps,
  tasks,
  timers,
} from "./mockData.js";
import { normalizeVisualQuery } from "../visual-query";

const NAV_ITEMS = [
  ["D01", "今日", House],
  ["S01", "日程", CalendarBlank],
  ["K01", "知识库", BookOpen],
  ["H01", "历史", Archive],
];

const STATE_LABELS = {
  normal: "正常",
  loading: "加载",
  empty: "空",
  error: "错误",
  disabled: "禁用",
  offline: "离线",
  conflict: "冲突",
  "notification-unavailable": "通知不可用",
  "account-pending-deletion": "账户待删除",
  dense: "高密度列表",
};

function readQuery() {
  return normalizeVisualQuery(
    typeof window === "undefined" ? "" : window.location.search,
  );
}

function toneForState(state) {
  if (["已到点", "冲突", "时间冲突", "错误"].includes(state)) return "danger";
  if (["已完成", "已确认", "再次完成", "可下载"].includes(state)) return "success";
  if (["运行中", "进行中", "当前步骤"].includes(state)) return "active";
  if (["已暂停", "待同步", "待准备", "待复核"].includes(state)) return "warning";
  return "neutral";
}

function IconForState({ state, size = 16 }) {
  const tone = toneForState(state);
  if (tone === "danger") return <Warning size={size} weight="fill" aria-hidden="true" />;
  if (tone === "success") return <CheckCircle size={size} weight="fill" aria-hidden="true" />;
  if (tone === "active") return <Play size={size} weight="fill" aria-hidden="true" />;
  if (tone === "warning") return <Clock size={size} weight="fill" aria-hidden="true" />;
  return <Info size={size} weight="fill" aria-hidden="true" />;
}

function StatusChip({ children, tone, icon = true }) {
  const resolvedTone = tone || toneForState(children);
  return (
    <span className={`status-chip status-chip--${resolvedTone}`}>
      {icon && <IconForState state={children} size={14} />}
      <span>{children}</span>
    </span>
  );
}

function ActionButton({ children, kind = "secondary", icon: Icon, disabled = false, onClick }) {
  return (
    <button className={`button button--${kind}`} disabled={disabled} onClick={onClick}>
      {Icon && <Icon size={18} weight="bold" aria-hidden="true" />}
      <span>{children}</span>
    </button>
  );
}

function PageHeader({ meta, pageId, actions }) {
  return (
    <header className="page-header">
      <div>
        <p className="eyebrow">{meta.eyebrow}</p>
        <div className="title-line">
          <h1>{meta.title}</h1>
          <span className="page-id" aria-label={`页面编号 ${pageId}`}>{pageId}</span>
        </div>
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </header>
  );
}

function AppShell({ pageId, meta, setPage, children, message }) {
  const isAuth = pageId.startsWith("A");
  const isDeletion = pageId === "C01";

  if (isAuth) {
    return (
      <div className="auth-shell">
        <div className="auth-brand">
          <Flask size={26} weight="duotone" aria-hidden="true" />
          <span>LabFlow</span>
        </div>
        <main className="auth-main" id="main-content">{children}</main>
        <p className="auth-note">个人实验工作台 · 你的实验数据只在登录后显示</p>
      </div>
    );
  }

  if (isDeletion) {
    return (
      <div className="deletion-shell">
        <div className="auth-brand auth-brand--dark"><Flask size={26} weight="duotone" /><span>LabFlow</span></div>
        <main className="deletion-main" id="main-content">{children}</main>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">跳到主要内容</a>
      <aside className="sidebar" aria-label="主导航">
        <div className="brand"><Flask size={28} weight="duotone" /><span>LabFlow</span></div>
        <nav>
          {NAV_ITEMS.map(([id, label, Icon]) => (
            <button
              key={id}
              className={`nav-item ${pageId === id || meta.group === label ? "is-active" : ""}`}
              aria-current={pageId === id ? "page" : undefined}
              onClick={() => setPage(id)}
            >
              <Icon size={22} weight={pageId === id ? "fill" : "regular"} aria-hidden="true" />
              <span>{label}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-tools" aria-label="全局工具">
          <button className="tool-row" onClick={() => setPage("T01")}><Timer size={20} /><span>计时器</span><b>3</b></button>
          <button className="tool-row" onClick={() => setPage("N01")}><Bell size={20} /><span>通知</span><b>2</b></button>
        </div>
        <div className="sync-line"><WifiHigh size={16} weight="bold" /><span>已同步 · {mockUser.syncTime}</span></div>
        <button className="account-row" onClick={() => setPage("P01")}>
          <span className="avatar">{mockUser.initials}</span>
          <span><b>{mockUser.name}</b><small>个人账户</small></span>
          <CaretRight size={16} />
        </button>
      </aside>
      <header className="mobile-topbar">
        <div className="brand"><Flask size={24} weight="duotone" /><span>LabFlow</span></div>
        <button className="icon-button" aria-label="打开通知" onClick={() => setPage("N01")}><Bell size={22} /></button>
      </header>
      <main className="main-area" id="main-content">
        {children}
      </main>
      <div className="mobile-timer-bar" role="status">
        <Warning size={18} weight="fill" />
        <span><b>裂解孵育已到点</b><small>目标 10:42</small></span>
        <button onClick={() => setPage("T01")}>处理</button>
      </div>
      <nav className="mobile-nav" aria-label="移动端主导航">
        {[
          ["D01", "今日", House],
          ["S01", "日程", CalendarBlank],
          ["W03", "当前实验", Flask],
          ["K01", "知识库", BookOpen],
          ["P01", "更多", GearSix],
        ].map(([id, label, Icon]) => (
          <button key={id} className={pageId === id ? "is-active" : ""} onClick={() => setPage(id)} aria-current={pageId === id ? "page" : undefined}>
            <Icon size={21} weight={pageId === id ? "fill" : "regular"} />
            <span>{label}</span>
          </button>
        ))}
      </nav>
      <div className="sr-only" aria-live="polite">{message}</div>
    </div>
  );
}

function GlobalState({ state, onAction }) {
  if (state === "normal" || state === "dense" || state === "account-pending-deletion") return null;
  const [title, body] = GLOBAL_STATE_COPY[state] || [];
  const tone = ["error", "conflict"].includes(state) ? "danger" : state === "offline" ? "warning" : "info";
  const StateIcon = state === "offline" ? CloudSlash : state === "conflict" ? Warning : state === "notification-unavailable" ? Bell : Info;
  return (
    <section className={`global-state global-state--${tone}`} role={tone === "danger" ? "alert" : "status"}>
      <StateIcon size={22} weight="fill" aria-hidden="true" />
      <div><b>{title}</b><p>{body}</p></div>
      <ActionButton onClick={onAction} kind="ghost" icon={ArrowClockwise}>{state === "conflict" ? "查看冲突" : "重试"}</ActionButton>
    </section>
  );
}

function EmptyState({ title = "这里还没有内容", action = "创建第一条记录", onAction }) {
  return (
    <section className="empty-state">
      <Archive size={42} weight="duotone" />
      <h2>{title}</h2>
      <p>完成后，新记录会在这里持续保留并可追溯。</p>
      <ActionButton kind="primary" icon={Plus} onClick={onAction}>{action}</ActionButton>
    </section>
  );
}

function ExperimentProgress({ compact = false }) {
  return (
    <div className={`step-rail ${compact ? "step-rail--compact" : ""}`} aria-label="实验步骤进度：已完成 2 步，共 8 步，当前第 3 步">
      {steps.map((step) => (
        <div key={step.number} className={`step-node step-node--${toneForState(step.state)}`}>
          <span>{step.state === "已完成" ? <Check size={17} weight="bold" /> : step.number}</span>
          {!compact && <small>{step.title}</small>}
        </div>
      ))}
    </div>
  );
}

function TimerRow({ timer, onAction }) {
  const Icon = timer.state === "已到点" ? Warning : timer.state === "已暂停" ? Pause : Play;
  return (
    <article className={`timer-row timer-row--${timer.tone}`}>
      <div className="timer-icon"><Icon size={22} weight="fill" /></div>
      <div className="timer-copy">
        <div><b>{timer.title}</b><StatusChip tone={timer.tone}>{timer.state}</StatusChip></div>
        <small>{timer.task} · {timer.step}</small>
      </div>
      <div className="timer-time"><strong>{timer.display}</strong><small>目标 {timer.target}</small></div>
      <button className="icon-button" aria-label={`${timer.title} ${timer.state === "已暂停" ? "继续" : "暂停"}`} onClick={onAction}>
        {timer.state === "已暂停" ? <Play size={19} weight="fill" /> : <Pause size={19} weight="fill" />}
      </button>
    </article>
  );
}

function ScheduleBands({ dense = false }) {
  const visible = dense ? [...tasks, ...tasks, ...tasks] : tasks;
  return (
    <div className="schedule-bands">
      {["早", "中", "晚"].map((band) => (
        <section key={band}>
          <header><span>{band}</span><small>{band === "早" ? "06:00–12:00" : band === "中" ? "12:00–18:00" : "18:00–24:00"}</small></header>
          <div className="schedule-list">
            {visible.filter((task) => task.band === band).map((task, index) => (
              <button key={`${task.id}-${index}`} className={`schedule-row schedule-row--${task.tone}`}>
                <time>{task.time}</time>
                <span>{task.title}</span>
                <StatusChip tone={task.tone}>{task.state}</StatusChip>
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function ConflictPanel({ parentCompleted = false, onAction }) {
  return (
    <section className="conflict-panel" aria-labelledby="conflict-title">
      <div className="conflict-heading"><Warning size={22} weight="fill" /><div><p className="eyebrow">数据尚未被覆盖</p><h2 id="conflict-title">{parentCompleted ? "父任务已完成，后到步骤需确认" : "步骤 6 状态冲突"}</h2></div></div>
      {parentCompleted && <code>PARENT_COMPLETED</code>}
      <dl>
        <div><dt>本机操作 · 10:18</dt><dd>将“洗涤 1”标记为已完成</dd></div>
        <div><dt>服务器最新状态 · 10:21</dt><dd>实验已完成并生成不可变记录</dd></div>
      </dl>
      <p>不会直接覆盖服务器记录。你可以采用最新状态，或在最新 revision 上重新应用本机意图。</p>
      <div className="button-row">
        <ActionButton onClick={onAction}>采用最新状态</ActionButton>
        <ActionButton kind="primary" onClick={onAction}>重新应用我的动作</ActionButton>
      </div>
    </section>
  );
}

function AuthScreen({ kind, notify }) {
  const content = {
    "auth-login": ["登录个人空间", "使用已验证的邮箱继续", "登录", "还没有账户？创建账户"],
    "auth-register": ["创建个人实验空间", "验证邮箱后完成首次设置", "创建账户", "已有账户？返回登录"],
    "auth-reset": ["重置密码", "我们会向已验证邮箱发送重置链接", "发送重置链接", "返回登录"],
  }[kind];
  return (
    <section className="auth-panel">
      <p className="eyebrow">{content[1]}</p>
      <h1>{content[0]}</h1>
      <form onSubmit={(event) => { event.preventDefault(); notify("静态演示：表单已提交"); }}>
        <label>邮箱地址<input type="email" defaultValue="linxiao@example.com" /></label>
        {kind !== "auth-reset" && <label>密码<input type="password" defaultValue="labflow-demo" /></label>}
        {kind === "auth-register" && <label className="check-row"><input type="checkbox" defaultChecked /> <span>我了解这是个人实验工作台，不替代机构安全制度</span></label>}
        <ActionButton kind="primary" icon={LockKey}>{content[2]}</ActionButton>
      </form>
      <button className="text-button" onClick={() => notify("静态演示：已切换账户流程")}>{content[3]}</button>
    </section>
  );
}

function Onboarding({ notify, disabled }) {
  return (
    <div className="onboarding-grid">
      <ol className="onboarding-steps">
        {["时区", "晚间汇总", "通知", "方案偏好"].map((item, index) => <li className={index === 1 ? "is-current" : index < 1 ? "is-done" : ""} key={item}><span>{index < 1 ? <Check size={16} /> : index + 1}</span>{item}</li>)}
      </ol>
      <section className="form-paper">
        <p className="eyebrow">晚间汇总</p><h2>什么时候回顾今天？</h2>
        <p>汇总包含当日状态与次日任务；无任务时保留空摘要，不发送无内容 Push。</p>
        <label>汇总时间<input type="time" defaultValue="21:00" /></label>
        <label className="check-row"><input type="checkbox" defaultChecked /><span>开启每日晚间汇总</span></label>
        <div className="button-row"><ActionButton>上一步</ActionButton><ActionButton kind="primary" disabled={disabled} onClick={notify}>保存并继续</ActionButton></div>
      </section>
    </div>
  );
}

function Dashboard({ setPage, state, notify }) {
  return (
    <div className="dashboard-grid">
      <section className="experiment-sheet">
        <div className="experiment-kicker"><StatusChip tone="active">进行中</StatusChip><span>EXP-0729-01 · 09:15 开始</span></div>
        <div className="experiment-title"><div><p className="eyebrow">当前实验</p><h2>RNA 提取与纯化</h2></div><span className="record-stamp">执行记录<br />2026-07-29</span></div>
        <ExperimentProgress />
        <div className="current-step">
          <div className="step-number"><span>步骤</span><strong>03</strong><small>共 8 步</small></div>
          <div className="step-copy"><p className="eyebrow">裂解与混匀</p><h3>将裂解液与样本充分混匀，静置 3 min</h3><dl><div><dt>裂解液体积</dt><dd>700 μL</dd></div><div><dt>样本质量</dt><dd>30–50 mg</dd></div><div><dt>后续离心</dt><dd>12,000 × g，2 min</dd></div></dl></div>
        </div>
        <div className="next-action">
          <div><p className="eyebrow">下一动作</p><b>启动 3 min 裂解计时</b></div>
          <ActionButton kind="primary" icon={Play} onClick={() => { notify("静态演示：裂解计时已准备"); setPage("W03"); }}>开始计时</ActionButton>
          <ActionButton onClick={() => setPage("W03")}>查看步骤详情</ActionButton>
        </div>
      </section>
      <aside className="live-rail">
        <div className="section-heading"><div><p className="eyebrow">实时状态</p><h2>活跃计时器</h2></div><button className="text-button" onClick={() => setPage("T01")}>查看全部</button></div>
        <div className="timer-stack">{timers.map((timer) => <TimerRow key={timer.id} timer={timer} onAction={() => notify(`${timer.title}：静态状态已切换`)} />)}</div>
        <details className="secondary-details" open>
          <summary><Warning size={18} weight="fill" /> 冲突与提醒 <span>1</span></summary>
          <div className="notice-card"><b>13:30–14:30 时间重叠</b><p>细胞沉淀与 NanoDrop 质检发生冲突。</p><button onClick={() => setPage("S01")}>查看日程</button></div>
        </details>
      </aside>
      <section className="today-plan">
        <div className="section-heading"><div><p className="eyebrow">实验记录簿</p><h2>今日计划</h2></div><button className="text-button" onClick={() => setPage("S01")}>打开完整日程</button></div>
        <ScheduleBands dense={state === "dense"} />
        {state === "dense" && <LoadMore notify={notify} />}
      </section>
      <details className="tomorrow-panel"><summary>次日任务预览 <CaretDown size={18} /></summary><p>明天 09:00 · 细胞沉淀与重悬 · 预计 2 h 30 min</p></details>
    </div>
  );
}

function ScheduleScreen({ state, notify, setPage }) {
  return (
    <div className="split-layout">
      <section className="paper-section">
        <div className="toolbar"><div className="segmented"><button className="is-active">周</button><button>日</button></div><div className="date-nav"><button aria-label="上一周">‹</button><b>7 月 27 日—8 月 2 日</b><button aria-label="下一周">›</button></div><ActionButton kind="primary" icon={Plus} onClick={() => setPage("S02")}>新建任务</ActionButton></div>
        <ScheduleBands dense={state === "dense"} />
        <div className="inline-warning"><Warning size={19} weight="fill" /><span><b>13:30–14:30 时间冲突：</b>细胞沉淀与 NanoDrop 质检存在重叠。</span><button onClick={() => notify("静态演示：已打开改期字段")}>调整时间</button></div>
        {state === "dense" && <LoadMore notify={notify} />}
      </section>
      <aside className="context-panel"><p className="eyebrow">选中任务</p><h2>细胞沉淀与重悬</h2><StatusChip>待准备</StatusChip><dl><div><dt>日期</dt><dd>2026-07-29</dd></div><div><dt>时间</dt><dd>13:30–14:30</dd></div><div><dt>方案</dt><dd>细胞沉淀与重悬 v3.0</dd></div></dl><ActionButton onClick={() => setPage("W01")}>进入任务工作区</ActionButton></aside>
    </div>
  );
}

function TaskForm({ notify, disabled }) {
  return (
    <section className="form-paper form-paper--wide">
      <div className="form-grid">
        <label className="span-2">任务名称<input defaultValue="RNA 提取与纯化" /></label>
        <label>日期<input type="date" defaultValue="2026-07-29" /></label>
        <label>时段<select defaultValue="早"><option>早</option><option>中</option><option>晚</option></select></label>
        <label>精确开始时间<input type="time" defaultValue="09:15" /></label>
        <label>精确结束时间<input type="time" defaultValue="11:30" /></label>
        <label className="span-2">关联方案<select defaultValue="RNA 提取与纯化标准方案 v2.1"><option>RNA 提取与纯化标准方案 v2.1</option><option>暂不关联方案</option></select></label>
        <label className="span-2">备注<textarea rows="5" defaultValue={"样本需全程置于冰上。\n**此处按纯文本显示** <script>不会执行</script>"} /></label>
      </div>
      <div className="plain-note"><Info size={18} /><span>备注保留换行；Markdown、HTML 和脚本样式字符不会解析或执行。</span></div>
      <div className="button-row button-row--end"><ActionButton>取消</ActionButton><ActionButton kind="primary" disabled={disabled} onClick={notify}>保存任务</ActionButton></div>
    </section>
  );
}

function WorkspaceTabs({ active, setPage }) {
  return <nav className="workspace-tabs" aria-label="任务阶段">{[["W01", "概览"], ["W02", "准备"], ["W03", "执行"], ["H02", "记录"]].map(([id, label]) => <button key={id} className={active === id ? "is-active" : ""} aria-current={active === id ? "page" : undefined} onClick={() => setPage(id)}>{label}</button>)}</nav>;
}

function WorkspaceHeader({ pageId, setPage }) {
  return <section className="workspace-header"><div><p className="eyebrow">EXP-0729-01 · 2026-07-29 · 早</p><h2>RNA 提取与纯化</h2><div className="chip-row"><StatusChip>进行中</StatusChip><StatusChip tone="success">方案 v2.1 已冻结</StatusChip><StatusChip tone="neutral">已同步 10:42</StatusChip></div></div><ExperimentProgress compact /><WorkspaceTabs active={pageId} setPage={setPage} /></section>;
}

function WorkspaceScreen({ kind, pageId, setPage, state, notify }) {
  if (kind === "workspace-overview") return <><WorkspaceHeader pageId={pageId} setPage={setPage} /><div className="two-column"><section className="paper-section"><h2>任务阶段</h2><div className="stage-list">{[["准备清单", "7 / 9 已完成", "继续准备", "W02"], ["实验执行", "步骤 3 / 8", "返回当前步骤", "W03"], ["完成与记录", "存在活动计时器", "暂不可完成", "W04"]].map(([title, detail, action, id]) => <button key={title} onClick={() => setPage(id)}><span><b>{title}</b><small>{detail}</small></span><span>{action}<CaretRight size={16} /></span></button>)}</div></section><aside className="context-panel"><p className="eyebrow">关联方案</p><h2>RNA 提取与纯化标准方案</h2><p>执行版本 v2.1 已冻结，后续方案编辑不会覆盖本次实验。</p><ActionButton onClick={() => setPage("K02")}>查看执行版本</ActionButton></aside></div></>;
  if (kind === "preparation") return <><WorkspaceHeader pageId={pageId} setPage={setPage} /><section className="paper-section checklist-section"><div className="section-heading"><div><p className="eyebrow">7 / 9 已准备</p><h2>开始前准备</h2></div><StatusChip tone="warning">2 项待处理</StatusChip></div>{["器材", "试剂", "材料", "前置准备"].map((group, groupIndex) => <div className="check-group" key={group}><h3>{group}</h3>{steps.slice(groupIndex * 2, groupIndex * 2 + 2).map((step) => <label className="check-item" key={step.number}><input type="checkbox" defaultChecked={step.number < 6} /><span><b>{step.title}</b><small>{step.detail}</small></span><StatusChip>{step.state}</StatusChip></label>)}</div>)}<div className="sticky-actions"><ActionButton onClick={() => setPage("W01")}>返回概览</ActionButton><ActionButton kind="primary" onClick={() => setPage("W03")}>开始实验</ActionButton></div></section></>;
  if (kind === "execution") return <><WorkspaceHeader pageId={pageId} setPage={setPage} /><div className="execution-layout"><aside className="step-list">{steps.map((step) => <button key={step.number} className={step.number === 3 ? "is-current" : ""}><span>{step.number}</span><div><b>{step.title}</b><small>{step.state}</small></div></button>)}</aside><section className="execution-main"><div className="mobile-priority priority-1"><p className="eyebrow">当前步骤 · 3 / 8</p><h2>裂解与混匀</h2><p className="lead">将裂解液与样本充分混匀，室温静置 3 min，然后进行离心。</p><div className="parameter-grid"><div><span>裂解液体积</span><b>700 μL</b></div><div><span>样本质量</span><b>30–50 mg</b></div><div><span>混匀时间</span><b>60 s</b></div><div><span>离心条件</span><b>12,000 × g</b></div></div></div><div className="mobile-priority priority-2 timer-stack">{timers.slice(0, 2).map((timer) => <TimerRow key={timer.id} timer={timer} onAction={notify} />)}</div><div className="mobile-priority priority-3 next-action"><div><p className="eyebrow">下一动作</p><b>确认裂解完成并进入离心</b></div><ActionButton kind="primary" icon={Check} disabled={state === "disabled"} onClick={notify}>完成步骤</ActionButton><ActionButton onClick={notify}>跳过</ActionButton></div><details className="mobile-secondary"><summary>冲突与次日任务</summary><p>步骤 6 存在一条待确认冲突；明天 09:00 有一项实验。</p></details></section></div></>;
  return <CompletionScreen state={state} notify={notify} setPage={setPage} pageId={pageId} />;
}

function CompletionScreen({ state, notify, setPage, pageId }) {
  const blocked = ["disabled", "offline", "conflict"].includes(state);
  return <><WorkspaceHeader pageId={pageId} setPage={setPage} /><div className="two-column"><section className="paper-section"><p className="eyebrow">归档前检查</p><h2>确认实验已完成</h2><div className="completion-checks">{[["实验步骤", "7 / 8 已处理", false], ["准备清单", "9 / 9 已确认", true], ["活动计时器", "1 个仍在运行", false], ["本机待同步", state === "offline" ? "2 条 outbox 未发送" : "0 条", state !== "offline"], ["未解决冲突", state === "conflict" ? "1 条 open conflict" : "0 条", state !== "conflict"]].map(([title, detail, ok]) => <div key={title} className={ok ? "is-ok" : "is-blocked"}>{ok ? <CheckCircle size={21} weight="fill" /> : <Warning size={21} weight="fill" />}<span><b>{title}</b><small>{detail}</small></span></div>)}</div>{state === "offline" && <div className="inline-warning"><CloudSlash size={20} weight="fill" /><span><b>完成已阻止：</b>当前设备 outbox 未清空，请联网同步后重试。</span></div>}<div className="offline-device-note"><Info size={19} /><p>无法提前发现其他离线设备尚未上报的操作；其稍后同步可能产生冲突。</p></div><ActionButton kind="primary" disabled={blocked} onClick={notify}>确认完成并保存记录</ActionButton></section><aside className="context-panel"><p className="eyebrow">完成后</p><h2>生成不可变记录</h2><p>本次执行版本、准备、步骤、计时和备注将形成独立快照。30 天内可撤销完成。</p><StatusChip tone="success">执行事实不会被后续编辑覆盖</StatusChip></aside></div>{state === "conflict" && <ConflictPanel parentCompleted onAction={notify} />}</>;
}

function KnowledgeScreen({ kind, state, notify }) {
  if (kind === "knowledge-list") return <section className="paper-section"><div className="toolbar"><label className="search-box"><MagnifyingGlass size={19} /><span className="sr-only">搜索方案</span><input placeholder="搜索方案名称、适用条件" /></label><select aria-label="筛选方案状态"><option>全部状态</option><option>已确认</option><option>待复核</option></select><ActionButton kind="primary" icon={Plus}>新建方案</ActionButton></div><div className="record-list">{(state === "dense" ? [...protocols, ...protocols, ...protocols] : protocols).map((protocol, index) => <button className="record-row" key={`${protocol.name}-${index}`}><div><b>{protocol.name}</b><small>{protocol.version} · 更新于 {protocol.updated}</small></div><StatusChip>{protocol.state}</StatusChip><CaretRight size={18} /></button>)}</div><LoadMore notify={notify} end={state !== "dense"} /></section>;
  if (kind === "knowledge-detail") return <div className="split-layout"><article className="paper-section prose"><div className="chip-row"><StatusChip>已确认</StatusChip><StatusChip tone="success">最新生效归档</StatusChip></div><h2>RNA 提取与纯化标准方案</h2><p>适用于哺乳动物组织与培养细胞的总 RNA 提取。执行时保留每次完成对应的不可变版本。</p><h3>适用条件</h3><p>样本量 30–50 mg；所有器材需完成 RNase 去除处理。长文本会自然换行，不截断关键说明。</p><h3>注意事项</h3><p>{"保持样本低温。\n**Markdown 符号** 与 <script>样式字符</script> 均按纯文本展示。"}</p><h3>步骤概览</h3><ol>{steps.slice(0, 5).map((step) => <li key={step.number}>{step.title} — {step.detail}</li>)}</ol></article><aside className="context-panel"><p className="eyebrow">版本历史</p><h2>v2.1</h2><p>最新生效完成归档来自 CMP-0728-02。</p>{["v2.1 · 已确认", "v2.0 · 已归档", "v1.4 · 已停用"].map((version) => <button className="version-row" key={version}>{version}<CaretRight size={16} /></button>)}</aside></div>;
  return <TaskForm notify={notify} disabled={state === "disabled"} />;
}

function ActivityScreen({ kind, state, notify }) {
  if (kind === "timers") return <section className="paper-section"><div className="legend-row"><StatusChip tone="danger">已到点</StatusChip><StatusChip tone="active">运行中</StatusChip><StatusChip tone="warning">已暂停</StatusChip><StatusChip tone="neutral">离线推算</StatusChip></div><div className="timer-list">{(state === "dense" ? [...timers, ...timers, ...timers] : timers).map((timer, index) => <TimerRow key={`${timer.id}-${index}`} timer={state === "offline" ? {...timer, state: "离线推算", tone: "neutral"} : timer} onAction={notify} />)}</div><LoadMore notify={notify} end={state !== "dense"} /></section>;
  if (kind === "notifications") return <section className="paper-section"><div className="safety-boundary"><Bell size={21} weight="fill" /><p><b>提醒能力边界</b><br />尽力分钟级发送，不替代专用报警设备、机构安全制度或人工值守。</p></div><div className="record-list">{notifications.map((item) => <article className={`notification-row ${item.unread ? "is-unread" : ""}`} key={item.time}><span className={`notification-dot notification-dot--${item.tone}`} /><div><small>{item.time}</small><b>{item.title}</b><p>{item.body}</p></div><button className="icon-button" aria-label={`查看 ${item.title}`}><CaretRight size={18} /></button></article>)}</div><LoadMore notify={notify} end={state !== "dense"} /></section>;
  if (kind === "history-list") return <section className="paper-section"><div className="toolbar"><label className="search-box"><MagnifyingGlass size={19} /><input aria-label="搜索实验历史" placeholder="搜索任务或日期" /></label><select aria-label="筛选历史"><option>已完成和已取消</option></select></div><div className="record-list">{[...history, {completion: "CMP-0727-04", title: "qPCR 扩增", event: "已完成", at: "7 月 27 日 17:20", active: true}].map((item) => <button className="record-row" key={item.completion}><div><b>{item.title}</b><small>{item.completion} · {item.at}</small></div><StatusChip tone={item.active ? "success" : "neutral"}>{item.event}</StatusChip><CaretRight size={18} /></button>)}</div><LoadMore notify={notify} end={state !== "dense"} /></section>;
  if (kind === "history-detail") return <HistoryDetail notify={notify} />;
  return <SummaryScreen notify={notify} state={state} />;
}

function HistoryDetail({ notify }) {
  return <div className="history-layout"><section className="paper-section"><p className="eyebrow">不可变执行记录</p><h2>细胞传代 · 完成历史</h2><div className="timeline">{history.map((item, index) => <article key={item.completion} className={item.active ? "is-active" : ""}><span>{index + 1}</span><div><div className="chip-row"><StatusChip tone={item.active ? "success" : "neutral"}>{item.event}</StatusChip><code>{item.completion}</code></div><h3>{item.at}</h3><p>{item.active ? "该完成记录当前生效，知识库默认展示对应归档。" : "该快照保持只读，不被撤销或再次完成覆盖。"}</p></div></article>)}</div><ActionButton onClick={notify}>查看方案快照</ActionButton></section><aside className="context-panel"><p className="eyebrow">当前生效归档</p><h2>CMP-0728-02</h2><StatusChip tone="success">最新仍生效</StatusChip><dl><div><dt>准备</dt><dd>9 / 9</dd></div><div><dt>步骤</dt><dd>8 / 8</dd></div><div><dt>计时事件</dt><dd>5 条</dd></div></dl><p>所有内容只读；30 天内可使用独立的撤销完成流程。</p></aside></div>;
}

function SummaryScreen({ state, notify }) {
  if (state === "empty") return <EmptyState title="今天没有实验任务" action="查看次日任务" onAction={notify} />;
  return <div className="summary-grid"><section className="summary-hero"><p className="eyebrow">2026 年 7 月 29 日 · 21:00</p><h2>今天的实验记录已整理</h2><div className="summary-stats"><div><strong>2</strong><span>已完成</span></div><div><strong>1</strong><span>进行中</span></div><div><strong>1</strong><span>未完成</span></div><div><strong>1</strong><span>已取消</span></div></div></section><section className="paper-section"><h2>次日任务</h2><div className="record-row"><div><b>细胞沉淀与重悬</b><small>明天 09:00 · 方案 v3.0</small></div><StatusChip>待准备</StatusChip></div><ActionButton onClick={notify}>调整时间</ActionButton></section><section className="paper-section"><h2>仍需处理</h2><p>RNA 提取与纯化仍有 1 个活动计时器，不会自动完成或顺延。</p><StatusChip tone="warning">需要人工确认</StatusChip></section></div>;
}

function DataScreen({ kind, state, notify }) {
  if (kind === "settings") return <div className="settings-layout"><nav className="settings-nav">{["账户", "时区与汇总", "通知", "方案偏好", "数据管理"].map((item, index) => <button className={index === 2 ? "is-active" : ""} key={item}>{item}<CaretRight size={16} /></button>)}</nav><section className="form-paper"><p className="eyebrow">通知</p><h2>提醒方式</h2><div className="permission-row"><Bell size={24} weight="duotone" /><div><b>{state === "notification-unavailable" ? "Push 已拒绝" : "Push 已启用"}</b><p>{state === "notification-unavailable" ? "可在浏览器设置中恢复；站内提醒继续可用。" : "当前设备会接收尽力分钟级提醒。"}</p></div><ActionButton onClick={notify}>{state === "notification-unavailable" ? "查看恢复方法" : "测试提醒"}</ActionButton></div><div className="safety-boundary"><Warning size={20} weight="fill" /><p>LabFlow 不替代专用报警设备、机构安全制度或人工值守。</p></div></section></div>;
  if (kind === "export") return <section className="paper-section export-layout"><div><p className="eyebrow">数据副本</p><h2>导出个人实验数据</h2><p>JSON 包含有效对象与保留期内软删除对象；CSV 只包含当前有效任务、方案和执行记录。</p></div><div className="export-options"><label><input type="radio" name="format" defaultChecked /><span><b>JSON · 完整结构</b><small>包含 deleted_at、可恢复截止时间和对象状态</small></span></label><label><input type="radio" name="format" /><span><b>CSV · 三张表</b><small>任务、方案、执行记录</small></span></label></div><div className="export-job"><DownloadSimple size={26} /><div><b>{state === "error" ? "导出失败" : "labflow-export-2026-07-29.json"}</b><small>{state === "loading" ? "正在生成 · 42%" : state === "error" ? "未生成下载文件" : "可下载 · 24 小时后过期"}</small></div><StatusChip tone={state === "error" ? "danger" : state === "loading" ? "warning" : "success"}>{state === "error" ? "失败" : state === "loading" ? "生成中" : "可下载"}</StatusChip></div><ActionButton kind="primary" icon={Export} onClick={notify}>{state === "error" ? "重新生成" : "生成导出"}</ActionButton></section>;
  if (kind === "deleted") return <section className="paper-section"><div className="section-heading"><div><p className="eyebrow">30 天保留规则</p><h2>可恢复记录</h2></div><StatusChip tone="neutral">不包含永久删除对象</StatusChip></div><div className="record-list">{deletedItems.map((item) => <div className="record-row" key={item.title}><div><small>{item.type}</small><b>{item.title}</b><small>{item.remaining}</small></div><StatusChip tone={item.action === "可恢复" ? "success" : "neutral"}>{item.action}</StatusChip><ActionButton disabled={item.action !== "可恢复"} onClick={notify}>恢复</ActionButton></div>)}</div><LoadMore notify={notify} end={state !== "dense"} /><div className="danger-zone"><Trash size={22} weight="duotone" /><div><b>永久删除需要再次确认</b><p>历史锁定对象和已进入永久删除流程的对象不可恢复。</p></div><ActionButton kind="danger" onClick={notify}>查看永久删除说明</ActionButton></div></section>;
  return <AccountDelete notify={notify} state={state} />;
}

function AccountDelete({ notify, state }) {
  return <section className="deletion-card"><div className="deletion-mark"><Trash size={32} weight="duotone" /></div><p className="eyebrow">账户待删除</p><h1>删除计划将在 6 天 14 小时后生效</h1><p>撤销期截止：2026 年 8 月 5 日 00:00（Asia/Shanghai）。在此期间普通业务导航与实验内容不可访问。</p><div className="deadline"><span>永久删除规则</span><b>撤销期结束后进入正式删除流程；相关备份按冻结保留期限处理。</b></div>{state === "error" && <div className="inline-warning"><Warning size={20} weight="fill" /><span>撤销失败，删除计划保持不变。请检查网络后重试。</span></div>}<div className="button-row"><ActionButton kind="primary" icon={ArrowClockwise} onClick={notify}>撤销账户删除</ActionButton><ActionButton icon={SignOut} onClick={notify}>退出</ActionButton></div></section>;
}

function LoadMore({ notify, end = false }) {
  return <div className="load-more" aria-live="polite">{end ? <span><CheckCircle size={18} weight="fill" /> 已显示全部</span> : <ActionButton onClick={notify} icon={Plus}>加载更多 · 第 3 批</ActionButton>}</div>;
}

function ScreenContent({ pageId, meta, state, setPage, notify }) {
  if (state === "empty" && !["summary", "account-delete"].includes(meta.kind)) return <EmptyState onAction={notify} />;
  if (meta.kind.startsWith("auth-")) return <AuthScreen kind={meta.kind} notify={notify} />;
  if (meta.kind === "onboarding") return <Onboarding notify={notify} disabled={state === "disabled"} />;
  if (meta.kind === "dashboard") return <Dashboard setPage={setPage} state={state} notify={notify} />;
  if (meta.kind === "schedule") return <ScheduleScreen state={state} notify={notify} setPage={setPage} />;
  if (meta.kind === "task-form") return <TaskForm notify={notify} disabled={state === "disabled" || state === "offline"} />;
  if (["workspace-overview", "preparation", "execution", "completion"].includes(meta.kind)) return <WorkspaceScreen kind={meta.kind} pageId={pageId} setPage={setPage} state={state} notify={notify} />;
  if (meta.kind.startsWith("knowledge") || meta.kind === "protocol-form") return <KnowledgeScreen kind={meta.kind} state={state} notify={notify} />;
  if (["timers", "notifications", "history-list", "history-detail", "summary"].includes(meta.kind)) return <ActivityScreen kind={meta.kind} state={state} notify={notify} />;
  return <DataScreen kind={meta.kind} state={state} notify={notify} />;
}

function DesignInspector({ pageId, state, onPage, onState, hidden }) {
  const [open, setOpen] = useState(false);
  if (hidden) return null;
  return (
    <aside className={`design-inspector ${open ? "is-open" : ""}`} aria-label="静态设计检查器">
      <button className="inspector-toggle" aria-expanded={open} onClick={() => setOpen(!open)}><Eye size={19} /><span>{pageId} · {STATE_LABELS[state]}</span><CaretDown size={16} /></button>
      {open && <div className="inspector-panel">
        <label>页面 / 视图<select value={pageId} onChange={(event) => onPage(event.target.value)}>{PAGE_IDS.map((id) => <option key={id} value={id}>{id} · {pageRegistry[id].title}</option>)}</select></label>
        <label>固定数据状态<select value={state} onChange={(event) => onState(event.target.value)}>{GLOBAL_STATES.map((item) => <option key={item} value={item}>{STATE_LABELS[item]}</option>)}</select></label>
        <small>查询参数：?page={pageId}&state={state}</small>
      </div>}
    </aside>
  );
}

export function App({ initialQuery }) {
  const [initial] = useState(() => initialQuery ?? readQuery());
  const [pageId, setPageId] = useState(initial.page);
  const [state, setStateValue] = useState(initial.state);
  const qa = initial.qa;
  const [message, setMessage] = useState("");
  const effectivePageId = state === "account-pending-deletion" ? "C01" : pageId;
  const meta = pageRegistry[effectivePageId];

  const updateQuery = (nextPage, nextState) => {
    const params = new URLSearchParams(window.location.search.replaceAll(";", "&"));
    params.set("page", nextPage);
    params.set("state", nextState);
    window.history.replaceState({}, "", `${window.location.pathname}?${params}`);
  };

  const setPage = (next) => {
    setPageId(next);
    updateQuery(next, state);
    window.scrollTo({ top: 0, behavior: "instant" });
  };
  const setState = (next) => {
    setStateValue(next);
    updateQuery(pageId, next);
  };
  const notify = (text = "静态演示：展示状态已更新") => {
    setMessage(typeof text === "string" ? text : "静态演示：展示状态已更新");
  };

  return (
    <>
      <AppShell pageId={effectivePageId} meta={meta} setPage={setPage} message={message}>
        {!effectivePageId.startsWith("A") && effectivePageId !== "C01" && (
          <PageHeader meta={meta} pageId={effectivePageId} actions={<StatusChip tone={state === "offline" ? "warning" : "success"}>{state === "offline" ? "离线 · 缓存 10:42" : `已同步 · ${mockUser.syncTime}`}</StatusChip>} />
        )}
        <GlobalState state={state} onAction={notify} />
        {state === "loading" ? (
          <section className="loading-sheet" aria-busy="true" aria-label="页面正在加载">
            <div /><div /><div /><div />
          </section>
        ) : (
          <ScreenContent pageId={effectivePageId} meta={meta} state={state} setPage={setPage} notify={notify} />
        )}
      </AppShell>
      <DesignInspector pageId={pageId} state={state} onPage={setPage} onState={setState} hidden={qa} />
    </>
  );
}
