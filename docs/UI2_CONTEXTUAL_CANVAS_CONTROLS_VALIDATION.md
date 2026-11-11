# UI-2 — Contextual Canvas Controls validation

Date: 2026-11-11. Baseline: `664863fa0733f0d5169637cbc9e02482896ad759`
(merged UI-1, PR #631). Verified with `git ls-remote --heads origin main` at
06:30:56 UTC; branch HEAD matched exactly and the worktree was clean before editing.
Branch: `feat/ui-2-contextual-canvas-controls`. The attached UI-2 implementation brief
authorized implementation, tests, documentation, push and one PR targeting main.
Implementation/browser verification is complete; user review/acceptance is pending.
No automatic merge.

## Placement and command ownership

- Removed the top-bar Fit/Apply/Finish rendering and its module-actions extension slot.
  Shared navigation, project-command and Undo/Redo regions retain UI-1 placement/ownership.
- BOX already had a canvas Fit wired to `fitCanvasToScreen`; reused that single control
  and removed the duplicate. Drawing's existing canvas Fit is unchanged. No new Fit
  implementation, viewport state or history mutation exists.
- Workflow actions use a sticky row inside the existing right-hand BOX tool overlay,
  within the active workspace. The established overlay position/width/scroll limits
  remain unchanged. No additional popup, pointer-following positioning, backdrop,
  gesture interception, automatic focus, keyboard shortcut or third-party dependency.
- Native buttons support Tab/Enter/Space and explicit focus-visible outlines. Actions
  remain reachable when long PM/tool content scrolls. The SVG retains its pointer
  handlers outside the established inspector footprint.

| Context | Actions and original availability |
| --- | --- |
| PM | Apply uses `applyPanelManager` / `canApplyPanelManager`; Finish PM uses `finishPanelManager` / `panelManager.isApplied`. Accept default thickness remains in PM content. |
| TB | Apply uses `applyPanelPaths`, disabled by `isProjectLocked || !hasApplyInputs`; Finish TB exists only for an active TB group and retains the lock predicate. |
| W | Same geometry Apply; Finish W only for an active Wall group. |
| S | Same geometry Apply; Finish S only for an active Slot group. |
| Manufacturing | Geometry Apply only; no group Finish. Also provides Apply after a group finishes without starting another group. |
| Select / J / P | No workflow actions, including when BOX is merely the active module. |
| Inactive BOX | Existing hidden/inert mounted shell prevents control interaction; unfinished workflow state survives navigation. |

The original `hasApplyInputs` still means pending manufacturing settings or any edge
assignment; UI-2 does not reinterpret it as a new dirty-state or validation system.
Incomplete connections can therefore enable Apply and then report the original validation
error. Incomplete active groups retain their original Finish availability/trailing cleanup.
Switching tools/modules never implicitly applies or finishes them. Returning to an active
group reuses it. Undo restores the original snapshot content without changing the selected
tool; reselect that tool to see its restored group's Finish. PM Undo still opens its
existing import-summary dialog, acknowledged through OK before interacting with the toolbar.

## Acceptance evidence

| Criteria from the implementation brief | Result |
| --- | --- |
| 1–5. Top-bar removal and one working Fit per canvas | PASS — component/browser absence assertions; Drawing fixed reset and BOX bounds Fit after zoom, including keyboard Fit. |
| 6–8. Contextual visibility and disabled states | PASS — PM invalid/ready/applied states, TB/W/S without inputs, active-group-only Finish, Manufacturing Apply-only, Select/placeholder absence. |
| 9–10. PM and relevant workflows/history | PASS — real SVG import, PM default/Apply/Finish, complete TB/W/S paired-edge assignment/Apply/Finish and existing workflow History. Manufacturing Apply updates generated output. |
| 11–12. Undo/Redo and no incidental history | PASS — PM keyboard Apply accepted once, PM Finish retains its no-new-step behavior; TB/W/S Finish restored by one Undo/Redo; failed W Apply adds no step; Fit/navigation/overlay exit/reopen preserve history/Redo. Existing snapshot/transaction suites pass. |
| 13–15. Canvas input/module preservation | PASS — real edge clicks, right-drag pan with unchanged overlay bounds, no generated-content mutation from pan; incomplete TB/W/S survive switches, hidden controls are inaccessible; UI-1 retains unfinished Circle/Arc/Profile/Dimension/Constraints and hidden Drawing input isolation. |
| 16. Desktop sizes | PASS — Drawing and BOX at 1920×1080, 1366×768, 1024×768; no document scrolling, accessible action row/focus; long 30-panel PM list retains reachable actions. Screenshots below. |
| 17. Later architecture untouched | PASS — no document/solver/manufacturing/history/persistence module changes; UI-3/UI-4 and A–G statuses preserved. |

Focused UI-2 Chromium acceptance passed all **7 groups with zero page errors**.
Existing UI-1 Chromium acceptance passed all **6 groups with zero page errors**.
Arc browser regression passed **23/23**; Coincidence browser regression passed **10/10**.
These automated browser results support review; they are not new manual user CAD acceptance.

## Executed checks

Commands ran from the repository root with installed dependencies, Playwright and
`/usr/bin/chromium`; the Vite dev server ran on port 5173. No packages were installed,
no lockfile changed and no test was skipped or disabled. There is no configured lint
command; lint is not claimed. `npm test` was completed before the sequential regression
commands because its UI script clears the shared `.test-build` directory.

| Command | Result |
| --- | --- |
| `npx tsc -b --pretty false` | PASS |
| `npm run build` | PASS — TypeScript and Vite production bundle |
| `npm test` | PASS — geometry services, tap clearance, SVG parser, UI/numeric checks |
| `npm run test:contextual-canvas-controls:browser` | PASS — 7 acceptance groups |
| `npm run test:workspace-shell:browser` | PASS — 6 acceptance groups |
| `node tests/drawing-arc-direct-manipulation.browser.cjs` | PASS — 23/23 |
| `node tests/drawing-coincidence-drag.browser.cjs` | PASS — 10/10 |
| `git diff --check` | PASS |
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

The 76 sequential regression commands above all passed. Some scripts intentionally
reuse existing aliases; this counts executed commands, not 76 independent suites.
The existing UI-1 browser test now invokes canvas Fit in place of the deliberately
removed top-bar Fit; its workflow/geometry/history/layout assertions remain intact.
The component suite adds top-bar absence coverage. The new browser suite drives real
UI input and reads DOM output; it does not inject application/history/document state.
During harness development, assertions were corrected for initial lazy loading, PM's
existing dialog-on-Undo, live BOX Fit bounds, selected-tool retention on Undo, and
keyboard focus mode. No production command/acceptance behavior was changed for tests.

## Screenshots

| Size | Drawing | BOX / Construction |
| --- | --- | --- |
| 1920×1080 | [Drawing](../screenshots/ui2-contextual-controls/drawing-1920x1080.png) | [BOX](../screenshots/ui2-contextual-controls/construction-1920x1080.png) |
| 1366×768 | [Drawing](../screenshots/ui2-contextual-controls/drawing-1366x768.png) | [BOX](../screenshots/ui2-contextual-controls/construction-1366x768.png) |
| 1024×768 | [Drawing](../screenshots/ui2-contextual-controls/drawing-1024x768.png) | [BOX](../screenshots/ui2-contextual-controls/construction-1024x768.png) |

Drawing shows existing Constraints alongside authored Line/Circle geometry; BOX shows
an unfinished TB group with disabled Apply and enabled Finish TB, preserving its existing
incomplete-workflow rules. Screenshots are generated by setting `UI2_BROWSER_OUTPUT`.

## Limits and preserved boundaries

- Drawing Fit still resets its fixed view; pre-existing intrinsic SVG height/clipping is
  unchanged. BOX Fit still derives current bounds/aspect ratio. No viewport redesign.
- Existing inspector and compact-control positions/footprints remain; this change does
  not remove pre-existing geometry occlusion by an open inspector or redesign compact inputs.
- Geometry Apply retains its existing transaction behavior; Manufacturing settings
  acceptance already records Undo, while geometry Apply does not add an independent step.
  UI-2 neither fixes nor redefines that behavior. PM and grouped Finish handlers also
  retain their original snapshot boundaries.
- Histories remain local (Drawing 100, BOX 10). Global Undo/Redo, permanent operations,
  UI-3/UI-4, native Save/Open, project-wide Clear, Puzzle and dependencies are unimplemented.
- `PROJECT_MASTER`, `ROADMAP`, `Architecture`, `PROJECT_HISTORY`, `CHANGELOG` and `README`
  were checked; README needs no UI-2 change. The specification/index now reflect this
  checkpoint while retaining UI-1 status and all accepted CAD evidence/deferred limitations.

**Verdict: READY TO MERGE for UI-2 review, subject to separate user merge approval.**
