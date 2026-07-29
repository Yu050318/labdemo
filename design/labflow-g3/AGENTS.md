# Prototype Instructions

Run the local server yourself and open the preview in the browser available to this environment. Do not give the user server-start instructions when you can run it.

Before making substantial visual changes, use the Product Design plugin's `get-context` skill when the visual source is unclear or no longer matches the current goal. When the user gives durable prototype-specific design feedback, preferences, or decisions, record them in `AGENTS.md`.

When implementing from a selected generated mock, treat that image as the source of truth for layout, component anatomy, density, spacing, color, typography, visible content, and hierarchy.

Build app UI in `src/`. Keep `.openai/hosting.json`, `worker/index.js`, `scripts/prepare-sites-build.mjs`, and `tests/sites-worker.test.mjs` intact so the same local prototype can be handed to Sites. Before a Sites handoff, run `npm run build` and `npm run test:sites`; the build must leave `dist/client/index.html`, `dist/server/index.js`, and `dist/.openai/hosting.json`.

## LabFlow G3 Visual Direction

- The sole visual source is direction 1, “Field Ledger / 实验记录台”.
- Preserve ivory paper surfaces, deep ink green, oxide alerts, sage completion, editorial typography, and low paper texture.
- Do not show lunar-calendar information or a `P0` version label in production UI.
- Borrow the strong due/running/paused timer differentiation from direction 2 without switching to a dark interface.
- On mobile, order content as current step → due/active timers → next action → today’s schedule; conflicts and tomorrow’s tasks are secondary collapsible regions.
- Every state uses text and an icon/shape in addition to color; maintain 44×44 targets, visible focus, and WCAG 2.2 AA.
- Use fixed representative data only. Do not add real data integration or business persistence.
