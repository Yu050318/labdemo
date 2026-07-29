# LabFlow P0 / G3 Static UI

LabFlow G3 的可编辑视觉事实来源。该原型使用固定代表性数据，不接入 Supabase、API、认证或持久化。

## 本地预览

```powershell
npm.cmd install --prefer-offline --no-audit --no-fund
npm.cmd run dev -- --host 127.0.0.1 --port 4173 --strictPort
```

预览：`http://127.0.0.1:4173/?page=D01&state=normal`

页面与状态切换详见 `PAGE_STATE_MATRIX.md`。右下角设计检查器用于手动切换；追加 `qa=1` 可隐藏检查器。

## 视觉事实来源

- 规格：`../../docs/superpowers/specs/2026-07-29-labflow-p0-g3-visual-spec.md`
- Tokens：`src/tokens.css`
- 固定数据：`src/mockData.js`
- 页面注册表：`src/pageRegistry.js`
- 可编辑 UI：`src/App.jsx`、`src/styles.css`
- 选定参考图：`public/reference/field-ledger-selected.png`
- 设计 QA：`design-qa.md`

## 验证

```powershell
npm.cmd run test:coverage
npm.cmd run build
npm.cmd run test:sites
```

浏览器 QA 脚本：

- `scripts/playwright-audit.js`：23 页面 × 2 视口；
- `scripts/accessibility-audit.js`：键盘、焦点、标签、地标、44×44；
- `scripts/interaction-audit.js`：核心跳转、折叠和账户隔离。

## 截图

- `output/playwright/desktop-1440x900.png`
- `output/playwright/mobile-390x844.png`
- `output/playwright/mobile-320.png`
- `output/playwright/zoom-200.png`
- `output/playwright/states/`
- `output/playwright/design-qa-comparison.png`
- `output/playwright/design-qa-focus-core.png`

`zoom-200.png` 使用 720×450 CSS 视口验证 1440×900 在 200% 等效布局宽度下的重排。Playwright CLI 无法改变浏览器 UI 的原生缩放级别，因此测试部仍需在独立验收时用真实浏览器 200% 缩放复核。

## 静态边界

- 所有按钮、表单与状态切换仅用于展示设计行为；
- 无网络写入、无本地持久化、无真实通知；
- 不包含 P1/P2 能力；
- G3 是否最终通过由产品部结合开发部与测试部验收决定。
