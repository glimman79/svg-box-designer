# UI-2.1 – Compact Workspace & Settings

Date: 2026-11-11. Branch: `feat/ui-2.1-compact-workspace-settings`.
Baseline: `1ff28c75b987941409f050059bcbdaf0bef65678`.
GitHub PR #632 metadata confirmed `merged: true` before implementation; a fresh
`git fetch origin main` identified that merge as main HEAD. A final
`git ls-remote --heads origin main` confirmed main still points to the same SHA.
One PR targets main; no automatic merge. User acceptance remains pending.

## Implementation and behavior

- Header uses wrapping flex regions in the requested order: brand, five project commands,
  Settings, local history and module navigation. No commands or navigation labels are removed.
- CSS variables centralize control height, padding, gap, font, icon and rail width.
  Small/Normal/Large control heights are 24/28/36px; rail widths are 48/52/64px.
  Inspector form typography and SVG units, viewBox definitions and hit-testing are unchanged.
- `WorkspaceSettings` owns chrome preference only. `sbd.ui.iconSize` in guarded localStorage
  accepts exactly `small`, `normal`, `large`, defaults to Normal, and tolerates unavailable
  storage. A root data attribute selects the CSS tokens across mounted workspaces.
  The setting never enters a project document, CAD transaction or Undo timeline.
- Nested accessible menu supports hover, click, arrows, Home/End, initial-letter focus,
  Enter/Space, Escape per level, Tab, outside pointer dismissal and restored trigger focus.
  Position is clamped to the viewport; submenu flips left when needed. CAD keys are
  intercepted only while the menu is open. No new dependency was added.
- Only Dimension/Constraints move to the Drawing upper toolbar. Pointer and keyboard
  activation handlers, active states and the existing Constraints state remain unchanged.
- BOX Apply/OK and validation predicates retain their handlers. Accept default thickness
  is before the panel list, immediately below main actions. Visible PM names are now
  Panel Manager, including the compact workflow chip's accessible name and tooltip.
- Finish PM/TB/W/S buttons read OK. Group titles/heading retain workflow context.
  Persistent PM identifiers, group structures, project/history logic and solver/manufacturing
  algorithms are untouched. Switching sizes does not remount document owners or cancel tools.

## Chromium matrix

Both Drawing and BOX were checked at all nine viewport/size combinations (18 layouts).
No document horizontal overflow, header overlap or inaccessible header region was observed.

| Viewport | Small header | Normal header | Large header |
| --- | --- | --- | --- |
| 1920×1080 | 1 row, 37px | 1 row, 43px | 1 row, 57px |
| 1366×768 | 1 row, 37px | 1 row, 43px | 1 row, 57px |
| 1024×768 | 1 row, 37px | 1 row, 43px | 2 rows, 100px |

UI-2.1 browser assertions cover default size, three settings, selected checkmarks,
reload persistence, denied storage, hover pointer traversal, click, keyboard selection,
Escape levels, Tab focus, outside click, forced right-edge submenu collision, tool placement,
Panel Manager name/tooltip and thickness-action order, unchanged PM Apply/OK availability,
retained owners, active Circle continuation and preserved Drawing Redo after size changes.
UI-1 additionally exercises Dimension creation/editing/Undo, Constraints and unfinished
state across module switches. UI-2 covers complete/incomplete TB/W/S, Apply, Manufacturing,
Panel Manager validation, original Undo/Redo boundaries, keyboard actions, long-list sticky
main actions, pan and Fit. Arc browser: **23/23 PASS**. Coincidence browser: **10/10 PASS**.
All browser suites completed without page errors.

## Commands and results

Vite served the production UI source using `npm run dev -- --host 0.0.0.0`.
The following commands were executed sequentially in the regression sweep.
All have passing final results. Four initially failed because tests referenced the
intentionally moved/renamed controls: UI-2 browser, Constraints placement, Dimension
placement, and cleanup placement. Their locators/scoped source assertions were updated
and the commands re-executed successfully, preserving functional CAD assertions.
No CAD behavior was changed to satisfy these tests.

| Exact command | Final result |
| --- | --- |
| `npx tsc -b --pretty false` | PASS |
| `npm run build` | PASS |
| `npm test` | PASS |
| `npm run test:contextual-canvas-controls:browser` | PASS after locator/placement update |
| `npm run test:workspace-shell:browser` | PASS |
| `npm run test:drawing-entity-foundation` | PASS |
| `npm run test:drawing-circular-support` | PASS |
| `npm run test:drawing-arc` | PASS |
| `npm run test:drawing-arc-reference-types` | PASS |
| `npm run test:drawing-circle` | PASS |
| `npm run test:drawing-acquisition-tolerances` | PASS |
| `npm run test:drawing-semantic-point-inference` | PASS |
| `npm run test:drawing-sketch-point-hit` | PASS |
| `npm run test:drawing-constraints-tool` | PASS after locator/placement update |
| `npm run test:drawing-line-to-line-angle` | PASS |
| `npm run test:drawing-constraint-rank` | PASS |
| `npm run test:drawing-dimension-solver` | PASS |
| `npm run test:drawing-dimension-screen-ui` | PASS |
| `npm run test:drawing-dimension-tool-lifecycle` | PASS after locator/placement update |
| `npm run test:drawing-dimension-interaction` | PASS |
| `npm run test:drawing-dimension-foundation` | PASS |
| `npm run test:wall-v2-authoring-ui` | PASS |
| `npm run test:wall-v2-session-ui-path` | PASS |
| `npm run test:d2-1b` | PASS |
| `npm run test:d2-1c` | PASS |
| `npm run test:d2-1d` | PASS |
| `npm run test:d2-1e` | PASS |
| `npm run test:d2-1f` | PASS |
| `npm run test:d2-1g` | PASS |
| `npm run test:d2-1h` | PASS |
| `npm run test:d2-2` | PASS |
| `npm run test:d2-2a` | PASS |
| `npm run test:d2-2b` | PASS |
| `npm run test:d2-3` | PASS |
| `npm run test:cad-interaction-contract` | PASS |
| `npm run test:cad-tool-ui` | PASS |
| `npm run test:cad-tool-ui-c2` | PASS |
| `npm run test:cad-tool-ui-c3` | PASS |
| `npm run test:cad-tool-ui-c4` | PASS |
| `npm run test:cad-tool-cleanup` | PASS after locator/placement update |
| `npm run test:d2-3a` | PASS |
| `npm run test:box-empty-start` | PASS |
| `npm run test:generated-geometry-authority-restore` | PASS |
| `npm run test:wall-v2-production-path` | PASS |
| `npm run test:wall-v2-manufacturing` | PASS |
| `npm run test:wall-v2-restore` | PASS |
| `npm run test:drawing-primary-mousedown` | PASS |
| `npm run test:drawing-box-selection` | PASS |
| `npm run test:drawing-direction-diagnostic` | PASS |
| `npm run test:drawing-history-controls` | PASS |
| `npm run test:drawing-history-transactions` | PASS |
| `npm run test:drawing-alignment-snap` | PASS |
| `npm run test:drawing-angular-reference` | PASS |
| `npm run test:drawing-line-authority` | PASS |
| `npm run test:drawing-profile-production-boundary` | PASS |
| `npm run test:drawing-line-inference-arbitration` | PASS |
| `npm run test:drawing-inference-product-regressions` | PASS |
| `npm run test:drawing-live-direction-coexistence` | PASS |
| `npm run test:drawing-endpoint-direction-inference` | PASS |
| `npm run test:drawing-dimension-role` | PASS |
| `npm run test:drawing-line-topology` | PASS |
| `npm run test:drawing-entity-domain` | PASS |
| `npm run test:drawing-direct-manipulation` | PASS |
| `npm run test:drawing-constraint-scoped-drag` | PASS |
| `npm run test:drawing-geometry-visual-state` | PASS |
| `npm run test:drawing-point-to-point-dimension` | PASS |
| `npm run test:drawing-component-solver` | PASS |
| `npm run test:drawing-point-to-line-dimension` | PASS |
| `npm run test:drawing-line-to-line-distance` | PASS |
| `npm run test:drawing-horizontal-vertical` | PASS |
| `npm run test:drawing-parallel-marker` | PASS |
| `npm run test:drawing-perpendicular` | PASS |
| `npm run test:drawing-coincident` | PASS |
| `npm run test:drawing-line-tool` | PASS |
| `npm run test:drawing-circle-direct-manipulation` | PASS |
| `npm run test:drawing-arc-direct-manipulation` | PASS |
| `npm run test:drawing-circular-dimension` | PASS |
| `npm run test:drawing-pointer-arbitration` | PASS |
| `npm run test:drawing-circle-coincidence-runtime` | PASS |
| `npm run test:drawing-coincidence-drag` | PASS |
| `npm run test:workspace-shell` | PASS |

Additional executions:

| Exact command | Result |
| --- | --- |
| `node tests/shared-workspace-shell.browser.cjs` | PASS, 6 acceptance groups |
| `node tests/contextual-canvas-controls.browser.cjs` | PASS, 7 acceptance groups after locator update |
| `node tests/drawing-arc-direct-manipulation.browser.cjs` | PASS, 23/23 |
| `node tests/drawing-coincidence-drag.browser.cjs` | PASS, 10/10 |
| `UI21_BROWSER_OUTPUT=screenshots/ui21-compact-settings npm run test:compact-workspace-settings:browser` | PASS, complete matrix and menu/state assertions |
| `npm run test:drawing-constraints-tool` | PASS rerun, 20 tests |
| `npm run test:drawing-dimension-tool-lifecycle` | PASS rerun |
| `npm run test:cad-tool-cleanup` | PASS rerun |
| `npx tsc -b --pretty false` | PASS final |
| `npm run build` | PASS final |
| `npm run test:workspace-shell` | PASS final, 4 tests |
| `git diff --check` | PASS final |

During development, the new browser harness exposed a keyboard focus timing race;
submenu keyboard focus now runs synchronously in a layout effect. Test development
also corrected row measurement to compare control centers, and placed the artificial
collision anchor above the canvas. The final complete UI-2.1 browser run passes.

## Screenshots

- [box-1024-large](../screenshots/ui21-compact-settings/box-1024-large.png)
- [box-1366-normal](../screenshots/ui21-compact-settings/box-1366-normal.png)
- [box-1920-small](../screenshots/ui21-compact-settings/box-1920-small.png)
- [drawing-1024-large](../screenshots/ui21-compact-settings/drawing-1024-large.png)
- [drawing-1366-normal](../screenshots/ui21-compact-settings/drawing-1366-normal.png)
- [drawing-1920-small](../screenshots/ui21-compact-settings/drawing-1920-small.png)
- [panel-manager-1024-large](../screenshots/ui21-compact-settings/panel-manager-1024-large.png)
- [settings-menu-1024-large](../screenshots/ui21-compact-settings/settings-menu-1024-large.png)

## Files changed

- `CHANGELOG.md`
- `PROJECT_HISTORY.md`
- `PROJECT_MASTER.md`
- `ROADMAP.md`
- `docs/GLOBAL_WORKSPACE_UI_SPECIFICATION.md`
- `docs/UI21_COMPACT_WORKSPACE_SETTINGS_VALIDATION.md`
- `package.json`
- `screenshots/ui21-compact-settings/box-1024-large.png`
- `screenshots/ui21-compact-settings/box-1366-normal.png`
- `screenshots/ui21-compact-settings/box-1920-small.png`
- `screenshots/ui21-compact-settings/drawing-1024-large.png`
- `screenshots/ui21-compact-settings/drawing-1366-normal.png`
- `screenshots/ui21-compact-settings/drawing-1920-small.png`
- `screenshots/ui21-compact-settings/panel-manager-1024-large.png`
- `screenshots/ui21-compact-settings/settings-menu-1024-large.png`
- `src/App.tsx`
- `src/app/DrawingWorkspace.tsx`
- `src/app/WorkspaceSettings.tsx`
- `src/app/WorkspaceTopBar.tsx`
- `src/styles.css`
- `tests/cad-tool-cleanup.test.mjs`
- `tests/compact-workspace-settings.browser.cjs`
- `tests/contextual-canvas-controls.browser.cjs`
- `tests/drawing-constraints-tool.test.mjs`
- `tests/drawing-dimension-tool-lifecycle.test.mjs`
- `tests/shared-workspace-shell.browser.cjs`

## Limits and verdict

- Chromium was tested; Firefox/Safari and physical touch hardware were not tested.
  The click path is available without hover. Small prioritizes desktop CAD density.
- Existing Drawing SVG clipping/inspector footprints and fixed-view Fit behavior remain.
  This change does not redesign viewport geometry, forms or operation history.
- Native Open/Save, Puzzle, UI-3/UI-4 and shared/global history remain unimplemented.
  Existing A–G statuses and accepted CAD evidence are unchanged.

**READY TO MERGE** for UI-2.1 implementation review. CAD and Undo/Redo semantics are
unchanged; implementation and requested browser checks pass. User acceptance and a
separate merge action remain pending. Do not merge automatically.
