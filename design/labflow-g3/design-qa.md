# LabFlow G3 Design QA

## Comparison Target

- Source visual truth: `D:\学习\labdemo\design\labflow-g3\public\reference\field-ledger-selected.png`
- Source pixels: `1586×992`
- Implementation: `http://127.0.0.1:4173/?page=D01&state=normal&qa=1`
- Implementation screenshot: `D:\学习\labdemo\design\labflow-g3\output\playwright\desktop-1440x900.png`
- Implementation pixels / CSS viewport: `1440×900`, device scale factor `1`
- Full comparison: `D:\学习\labdemo\design\labflow-g3\output\playwright\design-qa-comparison.png`
- Focused comparison: `D:\学习\labdemo\design\labflow-g3\output\playwright\design-qa-focus-core.png`
- State: D01 今日工作台，固定正常数据。

源图与实现接近同一纵横比。完整对照将两者分别等比裁切到 `720×450`；聚焦对照分别裁切核心实验区与计时器后归一到 `720×360`。对比不包含浏览器外框。

## Findings

最终对照未发现可执行的 P0、P1 或 P2 差异。

- 字体与排版：实现保留源图的编辑式衬线标题、清晰无衬线正文和等宽计时数字；中文换行与层级稳定。未显示源稿中的农历信息或 `P0` 标签，属于产品部明确要求的修订。
- 间距与布局：左侧稳定导航、连续实验工作表面、右侧实时状态栏和下方早中晚计划与源图一致；实现为 1440×900 重排并提高了当前步骤与下一动作的间距清晰度。
- 颜色与 Tokens：象牙白、深墨绿、氧化橙与鼠尾草色保持一致。计时器吸收方向 2 的到点/运行/暂停辨识，但未改变浅色 Field Ledger 方向。
- 图像与资产：产品 UI 不依赖摄影或插画；所有可见图标来自 Phosphor 图标库。选定 PNG 仅作为参考，不嵌入生产 UI。
- 文案与内容：核心实验、步骤、参数、计时器、早中晚日程和冲突内容与固定数据一致；删除农历与版本标签；未添加 P1/P2 功能。

## Comparison History

### Iteration 1

- `[P1]` D01 在 320px 出现 50px 页面级横向溢出。根因是八步轨道的固定列宽参与 Flex 项的最小内容宽度计算。
- `[P2]` W03 同时存在页面标题和当前步骤两个 `h1`，破坏标题层级。
- Fixes:
  - 为移动实验工作表面与步骤轨道设置 `width/max-width: 100%` 和 `min-width: 0`，把超出部分限制为轨道内部横向查看；
  - 将当前步骤标题降为 `h2`，页面保持唯一 `h1`；
  - 将跳转到主要内容链接补齐到 44px 高。
- Post-fix evidence:
  - `scripts/playwright-audit.js`：23 页面 × 1440/320 两视口，共 46 条检查，`issues=[]`、`consoleErrors=[]`；
  - `scripts/accessibility-audit.js`：D01、W03、C01 无未命名按钮，无小于 44×44 的可见操作目标，焦点态均为 3px 实线。

## Responsive And State Evidence

- 1440×900：`output/playwright/desktop-1440x900.png`
- 390×844：`output/playwright/mobile-390x844.png`
- 320×844：`output/playwright/mobile-320.png`
- 200% 等效布局：`output/playwright/zoom-200.png`
- Outbox 完成阻断：`output/playwright/states/w04-offline-outbox.png`
- `PARENT_COMPLETED`：`output/playwright/states/w04-parent-completed-conflict-full.png`
- 完成—撤销—再次完成：`output/playwright/states/h02-complete-undo-complete.png`
- 通知不可用：`output/playwright/states/n01-notification-unavailable.png`
- 账户待删除：`output/playwright/states/c01-account-pending-deletion.png`
- 高密度列表：`output/playwright/states/k01-dense-load-more.png`
- 加载：`output/playwright/states/d01-loading.png`
- 恢复失败：`output/playwright/states/r01-restore-error.png`

## Accessibility And Interaction Evidence

- 代表性文本/背景对比度：`4.96:1–11.82:1`；
- 主内容、导航、页面标题和按钮标签存在；
- 所有代表性键盘焦点使用 3px 可见实线；
- D01 开始计时到 W03、主导航到 S01、冲突区域折叠、C01 导航隔离：4/4 通过；
- 浏览器控制台：0 errors、0 warnings。

## Residual Test Gap

Playwright CLI 不支持设置浏览器 UI 的原生页面缩放。`zoom-200.png` 使用 720×450 CSS 视口验证 1440×900 在 200% 等效布局宽度下的重排，且无横向溢出；测试部仍需用真实浏览器 200% 缩放执行独立复核。

## Final Result

final result: passed
