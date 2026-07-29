# LabFlow P0 G3 Static UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a responsive, editable static LabFlow UI that covers all 23 G1 page IDs, required states, fixed representative data, and G3 screenshot QA without real data integration.

**Architecture:** Use the bundled Product Design React/Vite prototype in `design/labflow-g3`. A single static screen registry maps page IDs to focused renderers, while shared shell, state, component, and mock-data modules keep the visual language consistent. URL query parameters and an in-app design inspector expose deterministic page/state combinations for QA.

**Tech Stack:** React 19, Vite 6, CSS custom properties, Phosphor React icons, local fixed JavaScript data, Playwright CLI for browser verification.

## Global Constraints

- Preserve `G1-Countersign-5` and `G2-Review-3.1`; do not change product rules.
- Use only fixed representative data; no Supabase, API calls, auth implementation, storage, or persistence.
- Visual direction is `Field Ledger`: ivory, deep ink green, oxide alert, sage completion, editorial typography.
- No lunar calendar text and no `P0` label in production UI.
- Cover `1440×900`, `390×844`, `320px`, and `200%` zoom.
- Meet WCAG 2.2 AA design targets and 44×44 CSS px targets.
- Keep screenshots under `design/labflow-g3/output/playwright/`.

---

### Task 1: Prototype Foundation And Visual Truth

**Files:**
- Create: `design/labflow-g3/`
- Create: `design/labflow-g3/public/reference/field-ledger-selected.png`
- Create: `design/labflow-g3/src/tokens.css`
- Create: `design/labflow-g3/src/mockData.js`
- Modify: `design/labflow-g3/package.json`

**Interfaces:**
- Produces: CSS tokens consumed by every screen; `mockUser`, `tasks`, `protocols`, `steps`, `timers`, `notifications`, `history`, and `stateFixtures`.

- [ ] Bootstrap the Product Design prototype template at `design/labflow-g3`.
- [ ] Copy the selected direction image to `public/reference/field-ledger-selected.png`.
- [ ] Install dependencies and Phosphor React icons without adding data or UI frameworks.
- [ ] Encode the approved palette, typography, spacing, focus, and responsive tokens in `tokens.css`.
- [ ] Encode deterministic G1 §14 fixed data in `mockData.js`.
- [ ] Run `npm run build`; expected result is exit code 0.

### Task 2: Shared Shell, State Controller, And Components

**Files:**
- Create: `design/labflow-g3/src/pageRegistry.js`
- Create: `design/labflow-g3/src/components/AppShell.jsx`
- Create: `design/labflow-g3/src/components/DesignInspector.jsx`
- Create: `design/labflow-g3/src/components/StatusPrimitives.jsx`
- Create: `design/labflow-g3/src/components/LabComponents.jsx`
- Create: `design/labflow-g3/src/components/components.css`
- Modify: `design/labflow-g3/src/App.jsx`
- Modify: `design/labflow-g3/src/styles.css`

**Interfaces:**
- Consumes: mock data and CSS tokens from Task 1.
- Produces: `pageRegistry`, `AppShell`, `DesignInspector`, `StatusBanner`, `StatusTag`, `ExperimentHeader`, `TimerRow`, `ScheduleBand`, `RecordList`, and `ConflictPanel`.

- [ ] Add deterministic URL parsing for `?page=<ID>&state=<STATE>`.
- [ ] Add a keyboard-operable design inspector for page and state selection.
- [ ] Build desktop and mobile navigation shells matching G1 §6.
- [ ] Build shared state and laboratory components with visible focus and semantic labels.
- [ ] Verify every control has a label and every persistent target measures at least 44×44 CSS px.
- [ ] Run `npm run build`; expected result is exit code 0.

### Task 3: Public, Onboarding, Dashboard, And Schedule Screens

**Files:**
- Create: `design/labflow-g3/src/screens/AuthScreens.jsx`
- Create: `design/labflow-g3/src/screens/PlanningScreens.jsx`

**Interfaces:**
- Produces page renderers for `A01 A02 A03 O01 D01 S01 S02`.

- [ ] Implement public auth screens without showing personal experimental data.
- [ ] Implement the four-step onboarding state and save-failure fixture.
- [ ] Implement D01 with selected Field Ledger hierarchy and mobile priority order.
- [ ] Implement S01 day/week presentation and S02 create/edit form using frozen fields only.
- [ ] Add loading, empty, error, disabled, offline, conflict, and notification-unavailable mappings.
- [ ] Verify routes for all seven page IDs render without console errors.

### Task 4: Task Workspace And Execution Screens

**Files:**
- Create: `design/labflow-g3/src/screens/WorkspaceScreens.jsx`

**Interfaces:**
- Produces page renderers for `W01 W02 W03 W04`.

- [ ] Implement stable overview—preparation—execution—record stage navigation.
- [ ] Implement categorized preparation with completed, pending, outbox, and conflict items.
- [ ] Implement eight-step execution with current, skipped, pending-sync, and conflict states.
- [ ] Implement completion confirmation with active timer, unhandled step, outbox, open conflict, and other-offline-device warnings.
- [ ] Add `PARENT_COMPLETED` to the existing conflict panel without a new route.
- [ ] Verify the mobile order is current step, timers, next action, schedule.

### Task 5: Knowledge, Timers, Notifications, History, And Summary

**Files:**
- Create: `design/labflow-g3/src/screens/LibraryScreens.jsx`
- Create: `design/labflow-g3/src/screens/ActivityScreens.jsx`

**Interfaces:**
- Produces page renderers for `K01 K02 K03 T01 N01 H01 H02 M01`.

- [ ] Implement knowledge list/detail/edit with draft, review, confirmed, inactive, execution, and archive labels.
- [ ] Implement timer rows with unmistakable due, running, paused, offline-estimate, and conflict variants.
- [ ] Implement notification degradation states and permanent safety-boundary copy.
- [ ] Implement explicit “load more”, retry, and end-of-list states.
- [ ] Implement H02 immutable completion snapshots for complete—undo—complete and latest-effective archive.
- [ ] Implement evening summary including empty-summary and timezone-change fixtures.

### Task 6: Settings, Export, Deletion, And Account Pending Deletion

**Files:**
- Create: `design/labflow-g3/src/screens/DataScreens.jsx`

**Interfaces:**
- Produces page renderers for `P01 X01 R01 C01`.

- [ ] Implement settings categories and notification permission variants.
- [ ] Implement JSON/CSV generating, ready, failed, and expired states.
- [ ] Implement recently deleted rows for 29 days, 1 day, restore failure, and permanent-delete confirmation.
- [ ] Implement the account-pending-deletion-only shell with deadline, revoke, retry, and logout.
- [ ] Verify ordinary navigation is absent or disabled on C01.

### Task 7: Coverage And Mechanical Verification

**Files:**
- Create: `design/labflow-g3/scripts/verify-coverage.mjs`
- Create: `design/labflow-g3/PAGE_STATE_MATRIX.md`

**Interfaces:**
- Consumes: page registry and state fixtures.
- Produces: mechanical evidence that 23/23 IDs and required states exist.

- [ ] Write the coverage script to assert exact page IDs and required global states.
- [ ] Generate the page ID → query entry matrix and state-switch instructions.
- [ ] Run `node scripts/verify-coverage.mjs`; expected output is `23/23 pages` and all states present.
- [ ] Run `npm run build` and `npm run test:sites`; both must exit 0.

### Task 8: Browser, Responsive, Accessibility, And Design QA

**Files:**
- Create: `design/labflow-g3/output/playwright/desktop-1440x900.png`
- Create: `design/labflow-g3/output/playwright/mobile-390x844.png`
- Create: `design/labflow-g3/output/playwright/mobile-320.png`
- Create: `design/labflow-g3/output/playwright/zoom-200.png`
- Create: `design/labflow-g3/output/playwright/states/`
- Create: `design/labflow-g3/design-qa.md`

**Interfaces:**
- Consumes: local Vite preview and selected reference image.
- Produces: screenshot and interaction evidence for G3 handoff.

- [ ] Start the local Vite preview on a deterministic port.
- [ ] Capture D01 at 1440×900, 390×844, 320px, and 200% zoom.
- [ ] Capture representative offline, conflict, loading, error, notification, account-deletion, and dense-list states.
- [ ] Test keyboard navigation, focus return, labels, landmarks, live regions, and absence of horizontal page overflow.
- [ ] Compare the 1440×900 source and implementation in a combined visual input.
- [ ] Fix all P0/P1/P2 findings and repeat the comparison.
- [ ] Save `design-qa.md` with `final result: passed`.

### Task 9: Handoff

**Files:**
- Create: `design/labflow-g3/README.md`
- Modify: `LABFLOW_P0_EXECUTION_STATUS.md`

**Interfaces:**
- Produces: complete local preview instructions, paths, coverage, evidence, limitations, and G3 readiness statement.

- [ ] Document local start commands, page/state query syntax, screenshot paths, and fixed-data scope.
- [ ] Record design delivery status without claiming product/UI runtime testing beyond available evidence.
- [ ] Re-run coverage, build, Sites worker test, diff check, and design QA gate.
- [ ] Notify product, development, and QA threads with exact paths and verification summary.
