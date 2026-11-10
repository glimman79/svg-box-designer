# UI-1 — Shared Workspace Shell validation

Date: 2026-11-10. Baseline: `7b8fe036d7454017647a9c3e2f2972c23679bfeb`
(merged main, PR #630). Branch: `codex/ui-1-shared-workspace-shell`.
Implementation/browser verification is complete; user review/acceptance is pending.
No automatic merge is requested.

## Implementation and ownership

`App` still owns module navigation, Drawing/BOX documents, Construction history and
existing BOX handlers. `DrawingWorkspace` still owns its tools, selection, previews
and 100-entry snapshot history. `WorkspaceTopBar` is presentation only; its module list
can be extended without duplicating layout/commands. `WorkspaceShell` reuses existing
left-tools/canvas/bottom-History layout boundaries. Both module owners stay mounted;
the inactive shell is hidden and inert, and Drawing's window input is gated by activity.
Construction size observation is active only when its canvas is visible.

Drawing Dimension and Constraints launchers now use the left toolbar; pointer/keyboard
activation uses existing local lifecycle/state. No geometry, solver, manufacturing,
transaction, document model or persistence module changed. Existing workflow-group
History and Drawing History content/handlers are unchanged.

## Acceptance evidence

| Criterion | Result / evidence |
| --- | --- |
| 1. Consistent navigation and active module | PASS — one registry/nav, active pressed state, disabled Puzzle. |
| 2. Grouped project commands | PASS — same region in both modules; Import/Export/Clear explicitly BOX-scoped and unavailable in Drawing. |
| 3. Top-bar Undo/Redo | PASS — one location; supplied local capabilities/handlers, no global engine claim. |
| 4. Active module left tools | PASS — shared rail layout, existing tool sets plus relocated Drawing Dimension/Constraints. |
| 5. Drawing tools functional | PASS — browser Line/Circle/Arc/Profile, Dimension creation/edit/Undo, Constraints and existing CAD suites. |
| 6. BOX tools functional | PASS — browser Import, PM Apply/Finish, TB edge assignment/export, W/S/MFG access; production/manufacturing/restore suites. |
| 7. State survives switching | PASS — same DOM shells, geometry/history/Redo, incomplete Circle/Arc/Profile, Constraints and unfinished dimension editor retained. Hidden keyboard/custom activation cannot mutate Drawing. |
| 8. Unsupported capabilities disabled | PASS — Puzzle/native Open/Save; BOX command/export gating; component and browser checks. |
| 9. Existing bottom History | PASS — existing content and single-click workflow navigation retained; no permanent timeline model. |
| 10. Fit/Apply/Finish preserved | PASS — existing handlers/top-bar placement, PM Apply/Finish, canvas Fit/zoom/pan, BOX top Fit. |
| 11. No CAD/persistence semantics changes | PASS — reviewed source diff; geometry/solver/manufacturing/document/history transaction modules untouched. |
| 12. Desktop layout | PASS — both modules at 1920×1080, 1366×768 and 1024×768; visible canvas intersection >600×500, no document scrolling, hidden shells consume no layout. |

## Commands and final results

All commands ran from the repository root with installed dependencies. No dependency
or lockfile changes were needed. TypeScript checks and production bundling passed.
There is no configured lint script or lint configuration; lint was not claimed as run.

| Command | Result |
| --- | --- |
| `npx tsc -b --pretty false` | PASS |
| `npm run build` | PASS — TypeScript project build and Vite production bundle |
| `npm test` | PASS — geometry services, tap clearance, SVG parser, UI layout/numeric checks |
| `npm run test:workspace-shell:browser` | PASS — six acceptance groups, zero page errors, headless Chromium |
| `node tests/drawing-arc-direct-manipulation.browser.cjs` | PASS — 23/23 existing scenarios, headless Chromium |
| `node tests/drawing-coincidence-drag.browser.cjs` | PASS — 10/10 existing scenarios, headless Chromium |
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

Browser commands used a running `npm run dev -- --host 0.0.0.0` on port 5173 and
installed Playwright with `/usr/bin/chromium`. Optional `WORKSPACE_BROWSER_OUTPUT`,
`ARC_BROWSER_OUTPUT` and `COINCIDENCE_BROWSER_OUTPUT` saved local screenshots/JSON;
they do not affect acceptance behavior. The workspace browser test uses real UI
input and an actual downloaded SVG; it does not inject document/history state.

Initial source assertions encoded the old top-bar tool placement, duplicated history
rendering, App's mirrored active-tool state and unconditional Escape hookup. They were
updated to the shared/local ownership and activity-gated wiring. Their geometry/lifecycle
checks remain; no checks were disabled or skipped. Final selected regression commands
all pass; no unresolved new regression or baseline test failure was found.

## Limits and deferred work

- Histories remain module-local (Drawing 100, Construction 10). Keeping owners mounted
  fixes navigation lifetime; it is not the global 30-transition history implementation.
- Native Open/Save, project-wide Clear, cross-module import/export semantics, Puzzle,
  dependencies and permanent construction operations remain unimplemented.
- Drawing Fit still resets its existing fixed view. Baseline comparison in Chromium at
  1366×768 also reproduced the pre-existing intrinsic SVG height extending below its
  clipped canvas frame; that sizing behavior is preserved, not repaired by this shell.
  Desktop assertions measure the visible canvas/frame intersection.
- Automated checks support review; they are not exhaustive manual/user CAD acceptance.
  Existing accepted CAD evidence and deferred Arc limitations are unchanged.
- UI-2/UI-3/UI-4 are untouched: BOX top Fit/Apply/Finish remain; bottom History is not
  replaced; no timeline operation model or persistence integration is introduced.
  All A–G stage statuses and the v1.2 release baseline are preserved.

**Verdict: READY TO MERGE for UI-1 review, subject to the user's separate merge approval.**
