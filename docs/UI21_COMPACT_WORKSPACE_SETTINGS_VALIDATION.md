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


## UI-2.1 follow-up — Layout & Size Correction (2026-11-11)

This section supersedes only the original placement/sizing evidence above. Historical
UI-1/UI-2/UI-2.1 records and accepted CAD evidence are preserved.

### Clean baseline and scope

- Repository: `glimman79/svg-box-designer`.
- Fresh `git ls-remote --heads origin main` and `git fetch origin` established baseline
  `b4dc0ec2e5465609c07f165e85141e4b97f51f2d`. GitHub PR #633 metadata confirmed
  `merged: true`, with that exact merge commit.
- New worktree/branch: `fix/ui21-header-layout-size-correction`, created from that exact
  SHA with clean status verified before the first edit. The supplied task authorizes
  this correction and a new open PR targeting main; it does not authorize merging.
- Old commit `4f2632f536e7797ca4387505dcf07590ab214365` was unavailable. No old branch,
  merge or cherry-pick was used. The PR contains only an incremental correction atop #633.

### Implementation

The shared header has a typed `HTMLDivElement | null` portal target directly after local
Undo/Redo and before module navigation. Drawing renders its existing Dimension and Constraints
buttons into that target using `createPortal`, preserving the same pointer/keyboard handlers,
active state and CAD owner. There is no duplicate state or command dispatcher. In BOX the
slot is absent, so it takes no space. Module navigation stays right-aligned when space permits.

The old Drawing upper-toolbar element and CSS rules are removed. Its canvas-card grid has
one flexible row containing the canvas frame; no empty toolbar row remains. Select, Line,
Circle, Arc and Profile remain left in their original order. Drawing and BOX stay mounted.

| CSS token | Small | Normal (default) | Large |
| --- | --- | --- | --- |
| `--ui-control-height` | 20px | 24px | 28px |
| `--ui-control-padding` | 4px | 5px | 7px |
| `--ui-gap` | 2px | 3px | 4px |
| `--ui-font` | 10px | 11px | 12px |
| `--ui-icon` | 12px | 14px | 16px |
| `--ui-tool-width` | 44px | 48px | 52px |

Normal uses previous Small tokens; Large uses previous Normal. Header gaps and Undo/Redo
widths now consume the central tokens instead of doubled gaps/fixed 30px icon widths.
The existing Settings menu, default Normal, named preferences, storage key and guarded
localStorage fallback are unchanged. There is no preference migration. Inspector forms,
CAD units, viewBox/zoom, geometry, tolerances, manufacturing and transaction semantics are unchanged.

This is mouse-first desktop CAD with compact controls, tooltips, shortcuts and visible focus.
A precision stylus/digital pen may be recommended for future touchscreen work; touch layouts,
pen input, palm rejection and gestures are not implemented or tested.

### Chromium layout results

Each cell reports **Drawing rows / BOX rows (header height)**. All 18 combinations pass:
no horizontal page overflow, overlapping controls or header controls outside the viewport.

| Viewport | Small | Normal | Large |
| --- | --- | --- | --- |
| 1920×1080 | 1 / 1 (31px / 31px) | 1 / 1 (37px / 37px) | 1 / 1 (43px / 43px) |
| 1366×768 | 1 / 1 (31px / 31px) | 1 / 1 (37px / 37px) | 1 / 1 (43px / 43px) |
| 1024×768 | 1 / 1 (31px / 31px) | 1 / 1 (37px / 37px) | 2 / 1 (75px / 43px) |

At every combination the browser checks all six exact tokens. Drawing checks direct DOM
adjacency after Undo/Redo, Dimension before Constraints, navigation immediately after their
slot, original left-tool order, a sole canvas frame child and no gap above the canvas.
BOX checks the complete absence of the slot and both Drawing controls. The only wrapping is
the shared header in 1024px Large Drawing; no separate Drawing toolbar exists.

Functional checks cover Dimension keyboard activation/pressed styling, Constraints activation
and Escape, menu hover/click/keyboard/Escape/Tab/outside dismissal/collision, reload preference
persistence and denied-storage fallback. An unfinished Circle retains its first point and
active tool across all size changes, completes afterward, and preserves Drawing Redo/viewBox.
An active BOX Panel Manager retains fields, viewBox and incomplete OK state across size changes.
Drawing/BOX DOM owner identities are unchanged. UI-1 additionally tests actual Dimension
creation/editing/Undo and Constraints across module switches; UI-2 tests PM/TB/W/S,
manufacturing Apply, workflow history and original Undo boundaries.

The first exploratory layout run exposed unnecessary 1024px Normal wrapping. Token-based
header gaps/history widths fixed it. Subsequent complete matrix/functional checks pass.
Only affected legacy locators and placement assertions changed; CAD assertions were retained.

### Follow-up commands and final results

All **81/81** commands from the original regression sweep were executed again on this branch and passed.
The TypeScript check, production build and full `npm test` are included. Browser suites use
Vite at `http://127.0.0.1:5173/`, Chromium `/usr/bin/chromium`, with no CAD state injection.

| Exact command | Follow-up result |
| --- | --- |
| `npx tsc -b --pretty false` | PASS |
| `npm run build` | PASS |
| `npm test` | PASS |
| `npm run test:contextual-canvas-controls:browser` | PASS |
| `npm run test:workspace-shell:browser` | PASS |
| `npm run test:drawing-entity-foundation` | PASS |
| `npm run test:drawing-circular-support` | PASS |
| `npm run test:drawing-arc` | PASS |
| `npm run test:drawing-arc-reference-types` | PASS |
| `npm run test:drawing-circle` | PASS |
| `npm run test:drawing-acquisition-tolerances` | PASS |
| `npm run test:drawing-semantic-point-inference` | PASS |
| `npm run test:drawing-sketch-point-hit` | PASS |
| `npm run test:drawing-constraints-tool` | PASS |
| `npm run test:drawing-line-to-line-angle` | PASS |
| `npm run test:drawing-constraint-rank` | PASS |
| `npm run test:drawing-dimension-solver` | PASS |
| `npm run test:drawing-dimension-screen-ui` | PASS |
| `npm run test:drawing-dimension-tool-lifecycle` | PASS |
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
| `npm run test:cad-tool-cleanup` | PASS |
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

Additional executed checks:

| Exact command | Follow-up result |
| --- | --- |
| `UI21_BROWSER_OUTPUT=screenshots/ui21-layout-size-correction npm run test:compact-workspace-settings:browser` | PASS, all 18 layouts and functional checks |
| `node tests/drawing-arc-direct-manipulation.browser.cjs` | PASS, 23/23 |
| `node tests/drawing-coincidence-drag.browser.cjs` | PASS, 10/10 |
| `npm run test:drawing-constraints-tool` | PASS, 20 tests; rerun after adding portal placement assertions |
| `git diff --check` | PASS |

UI-1 browser: 6 acceptance groups PASS. UI-2 browser: 7 acceptance groups PASS.
Shared workspace shell now passes 5 tests, including the Drawing-only slot adjacency check.
No browser page errors were observed.


### Follow-up screenshots

New captures are isolated in `screenshots/ui21-layout-size-correction/`; historical captures
in `screenshots/ui21-compact-settings/` are unchanged. The five required images were opened
and visually inspected, including actual canvas/header and submenu rendering.

- [Drawing, 1366×768, Normal](../screenshots/ui21-layout-size-correction/drawing-1366-normal.png)
- [BOX, 1366×768, Normal](../screenshots/ui21-layout-size-correction/box-1366-normal.png)
- [Drawing, 1024×768, Small](../screenshots/ui21-layout-size-correction/drawing-1024-small.png)
- [Drawing, 1024×768, Large](../screenshots/ui21-layout-size-correction/drawing-1024-large.png)
- [Settings submenu](../screenshots/ui21-layout-size-correction/settings-menu-1024-large.png)
- [BOX, 1024×768, Small](../screenshots/ui21-layout-size-correction/box-1024-small.png)
- [BOX, 1024×768, Large](../screenshots/ui21-layout-size-correction/box-1024-large.png)
- [Panel Manager, 1024×768, Large](../screenshots/ui21-layout-size-correction/panel-manager-1024-large.png)

### Follow-up changed files

- `CHANGELOG.md`
- `PROJECT_HISTORY.md`
- `PROJECT_MASTER.md`
- `ROADMAP.md`
- `docs/GLOBAL_WORKSPACE_UI_SPECIFICATION.md`
- `docs/UI21_COMPACT_WORKSPACE_SETTINGS_VALIDATION.md`
- `screenshots/ui21-layout-size-correction/box-1024-large.png`
- `screenshots/ui21-layout-size-correction/box-1024-small.png`
- `screenshots/ui21-layout-size-correction/box-1366-normal.png`
- `screenshots/ui21-layout-size-correction/drawing-1024-large.png`
- `screenshots/ui21-layout-size-correction/drawing-1024-small.png`
- `screenshots/ui21-layout-size-correction/drawing-1366-normal.png`
- `screenshots/ui21-layout-size-correction/panel-manager-1024-large.png`
- `screenshots/ui21-layout-size-correction/settings-menu-1024-large.png`
- `src/App.tsx`
- `src/app/DrawingWorkspace.tsx`
- `src/app/WorkspaceTopBar.tsx`
- `src/styles.css`
- `tests/cad-tool-cleanup.test.mjs`
- `tests/compact-workspace-settings.browser.cjs`
- `tests/contextual-canvas-controls.browser.cjs`
- `tests/drawing-constraints-tool.test.mjs`
- `tests/drawing-dimension-tool-lifecycle.test.mjs`
- `tests/shared-workspace-shell.browser.cjs`
- `tests/shared-workspace-shell.test.cjs`

### Limits and review verdict

Chromium tested; Firefox, Safari and physical touchscreen/stylus hardware were not tested.
No stylus support is claimed. Existing fixed-view Fit, SVG clipping and inspector footprint
remain outside this correction. UI-3/UI-4, Puzzle, global history and A–G statuses are unchanged.

**READY TO MERGE** for implementation review. Tests and requested Chromium checks pass;
CAD and Undo/Redo semantics are unchanged. User acceptance and the separate merge decision
remain pending. The branch is one incremental correction from the merged #633 baseline,
with no duplicated old branch history. Final remote main verification still returned
`b4dc0ec2e5465609c07f165e85141e4b97f51f2d`. The new PR must remain open and unmerged.
