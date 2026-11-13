# UI-3 — Unified Construction History validation

**IMPLEMENTED / Chromium-checked (2026-11-13); pending user acceptance and separate merge.**
**READY TO MERGE for implementation review.** The PR must remain open and unmerged.

## Verified baseline and authorization

Repository: `glimman79/svg-box-designer`. Fresh `git fetch origin main` established
`68f46ff4a7c2a5ebbdcf0c5a603b58883a305e7e`. Connected GitHub PR #634 metadata confirmed
`merged: true` with that merge commit; ancestry verification passed. The remote was fetched
again before delivery and main remained at the same SHA.

Fresh branch: `feat/ui3-shared-construction-history`, created directly from `origin/main`.
Immediately before editing, HEAD matched the SHA above, the branch matched, and
`git status --porcelain=v1 --untracked-files=all` was empty. No previous implementation,
cherry-pick or feature branch was reused. The supplied UI-3 brief explicitly authorizes
implementation, validation, documentation, commit, push and one new PR against main;
it excludes automatic merge. The final source commit is recorded in that PR and delivery.

## Existing owner and the user's clarification

The existing BOX row in `App.tsx` displayed History, the PM document icon, and TB/W/S/MFG
workflow-group buttons. Its authoritative state already belongs to `App`: active/completed
groups, `connections`, `workflowGroupOrder`, selected label and active tool. The memoized
`buildWorkflowHistoryItems` derives its ordered display; `navigateToWorkflowHistoryItem`
selects the existing group/context and expands TB/S as before. Its pressed predicates use
the current selected label or PM/MFG active tool. It never represented permanent operations.

The user explicitly requires reusing this row, not adding a second timeline. UI-3 moves
that presentation outside the BOX grid into the application-level shell and removes
Drawing's separate explanatory History row. There is exactly one bottom aside and one
native scroll track in the whole DOM, including mounted inactive workspaces. No row is
inside either canvas SVG. The History label stays visible beside the scrollable track.

`App` renders one unkeyed `SharedHistoryRegion` after both mounted workspace shells.
Its typed `workflowNavigation: ReactNode` slot receives the existing BOX buttons, with
original IDs, labels, titles, active/pressed predicates and callbacks. Byte comparison
against baseline confirms that the item derivation, navigation handler and mapped button
fragment are unchanged. No duplicate handler or workflow state was added. BOX remains
`App`-owned; no project/operation state moved into the shell.

Drawing uses the same region and shows only:

> Construction history will appear here when persistent operations are available.

BOX content stays mounted but hidden/inert during Drawing; it is absent from accessible
button navigation. No Drawing entities, dimensions, constraints, snapshots or pointer/tool
states produce entries. No history engine, permanent-operation adapter, registry, store,
localStorage records, fabricated chronology or conversion of group IDs was introduced.

## Typed future integration boundary

`HistoryPresentation` distinguishes `workflow-navigation` from `operations-unavailable`.
The generic, presentation-only `ConstructionOperationPresentation<OperationRef>` reserves:

- An opaque stable reference supplied by the future authoritative C.2 owner.
- Owning module and operation type; display label and icon category.
- Selection, warning/error severity, blocked and editing-unavailable flags.
- Selection callback and optional current-settings navigation callback using that reference.

There are no production instances or renderer for persistent operations. Generic reference
shape, operation identity creation, operation catalog, schema/versioning, parameter bindings,
selection authority, diagnostics/evaluation and navigation adapters remain C.2/UI-4 work.
The type is not an operation registry or serialized project record and does not freeze
Stage B's proposed persistent reference schema. Existing BOX clicks retain workflow meaning;
there is no double-click operation editor, fake parameter dialog or Undo cursor navigation.

Permanent operations will belong to the shared project foundation and survive native Save;
Undo/Redo remains a separate transition tape. Today Drawing still has its local 100-entry
history and BOX its local 10-entry history. The future global 30-transition system is
unchanged and unimplemented. C, C.2, D, E and UI-4 are deferred; A–G statuses are unchanged.

## Layout, input and module preservation

The module grids now reserve one flexible Tools/Canvas row. The shared History row is a
normal flex child after them, so it consumes its own compact height without covering the
canvas or leaving a second reserved row. It spans the application width including the rail.
Header, Drawing header utilities, module-specific rails and viewport controls retain their
existing handlers and placement, including #634's 1024px Large Drawing header wrapping.

Small/Normal/Large consume the existing six UI tokens without altering model units or SVG
geometry scale. History control heights are exactly 20/24/28px; row heights are 25/31/37px.
The minimum measured canvas height is 656px at 1024×768 Large Drawing. Normal remains default.

The shell owns only a track ref and per-presentation horizontal scroll positions.
The same region, track and both workspace owner nodes survive Drawing → BOX → Drawing → BOX.
Native horizontal overflow is confined with min-width constraints and overscroll containment;
no wheel, drag/reorder, CAD pointer or project-edit handlers were added. Native keyboard
scrolling and visible focus remain. Scrolling neither zooms the canvas nor authors geometry,
changes workflow state or creates an Undo transaction. A long fixture is inserted only by
the browser test as explicitly labelled test-only DOM buttons; production creates none.

The UI-3 test authors a Line and Circle through normal UI, undoes, switches with Redo and an
unfinished Circle, then finishes it and verifies the exact Undo depth. It also imports and
applies PM, TB and W through real UI, navigates via original pointer/keyboard history buttons,
and verifies selected/active state, unfinished W, output geometry, viewBox and Finish Redo
across repeated switches. Scroll tests compare workflow inspector, generated contours,
viewBox and history capabilities before/after native wheel/keyboard input and switching.

## Exact checks and results

All **82 sequential regression commands** below pass in their final runs. This includes
TypeScript, production build, full `npm test`, the previous 81-command sweep and the new
2/2 presentation component tests. UI-1 browser passes 6 acceptance groups, UI-2 passes 7,
UI-2.1 passes all 18 layouts and its functional checks. Arc browser passes 23/23;
Coincidence browser passes 10/10. Shared workspace component checks pass 5/5.

Three existing aliases (`test:d2-1b`, `test:d2-1c`, `test:d2-1d`) initially failed the same
source assertion that required History inside each module grid. That one placement assertion
now verifies a single flexible module row, the application-level History after both mounted
shells, and no separate Drawing row. All three commands were rerun and passed. CAD assertions
were retained. UI-1/UI-2 browser changes only update their shared-region accessible-name
locator; none of their behavior assertions were removed or weakened.

| Exact command | Final result |
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
| `npm run test:d2-1b` | PASS (placement assertion updated; rerun) |
| `npm run test:d2-1c` | PASS (placement assertion updated; rerun) |
| `npm run test:d2-1d` | PASS (placement assertion updated; rerun) |
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
| `npm run test:shared-history` | PASS |
| `npm run test:compact-workspace-settings:browser` | PASS |
| `node tests/drawing-arc-direct-manipulation.browser.cjs` | PASS |
| `node tests/drawing-coincidence-drag.browser.cjs` | PASS |
| `UI3_BROWSER_OUTPUT=screenshots/ui3-shared-history npm run test:shared-history:browser` | PASS — 4 acceptance groups, all 18 layouts, zero page errors |
| `git diff --check` | PASS |

Browser tests use Vite at `http://127.0.0.1:5173/` and Chromium `/usr/bin/chromium` with
Playwright. Geometry/workflow/history state is authored through the production UI, never
injected. Only the explicitly isolated long-track presentation fixture edits DOM.

## Chromium viewport matrix

Every cell passes for both modules at that viewport and size. Values are measured canvas
heights **Drawing / BOX**, in pixels. Every combination checks exactly one visible/total
History region, stable instance/track/owners, bottom placement, no canvas overlap, no
horizontal page overflow, no clipped History buttons, usable TB/W and all six exact tokens.
The separate UI-2.1 browser suite also checks header overlap/clipping and Drawing utility order.

| Viewport | Small | Normal | Large |
| --- | --- | --- | --- |
| 1920×1080 | 1024 / 1024 | 1012 / 1012 | 1000 / 1000 |
| 1366×768 | 712 / 712 | 700 / 700 | 688 / 688 |
| 1024×768 | 712 / 712 | 700 / 700 | 656 / 688 |

[Machine-readable UI-3 measurements and acceptance results](../screenshots/ui3-shared-history/results.json).

## Screenshot evidence and visual inspection

All ten captures below were opened and visually inspected. Each shows one integrated
compact bottom History row, a canvas above it and the preserved header/rails. BOX includes
real PM/TB/W entries; navigation capture shows TB selected in its original inspector.
Drawing contains an availability message alongside authored geometry. The long-track
capture is explicitly test-only presentation, not actual construction history. Earlier
UI-1/UI-2/UI-2.1 screenshots remain unchanged in their existing directories.

- [box-1024-large](../screenshots/ui3-shared-history/box-1024-large.png)
- [box-1024-small](../screenshots/ui3-shared-history/box-1024-small.png)
- [box-1366-normal](../screenshots/ui3-shared-history/box-1366-normal.png)
- [box-1920-normal](../screenshots/ui3-shared-history/box-1920-normal.png)
- [box-workflow-navigation](../screenshots/ui3-shared-history/box-workflow-navigation.png)
- [drawing-1024-large](../screenshots/ui3-shared-history/drawing-1024-large.png)
- [drawing-1024-small](../screenshots/ui3-shared-history/drawing-1024-small.png)
- [drawing-1366-normal](../screenshots/ui3-shared-history/drawing-1366-normal.png)
- [drawing-1920-normal](../screenshots/ui3-shared-history/drawing-1920-normal.png)
- [long-test-only-track](../screenshots/ui3-shared-history/long-test-only-track.png)

## Known limits and deferred work

- Chromium was tested; Firefox/Safari and physical touch/stylus input were not tested.
- Persistent operations, combined chronology, parameter editing, diagnostic computation,
  dependency repair, native Save/Open and global Undo/Redo are unavailable. The new input
  type reserves their presentation only; no end-to-end operation integration is claimed.
- Existing Drawing fixed-view Fit, canvas intrinsic clipping and floating BOX inspector
  footprint/geometry occlusion are unchanged. No CAD/solver/manufacturing algorithm changed.
- Automated/browser checks support review; Mikael's real browser acceptance and the separate
  merge decision remain pending. Existing accepted CAD evidence and deferred Arc limitations
  are preserved. Puzzle/3D/touch/stylus/reordering/rollback/suppression remain out of scope.

## Changed-file inventory

- `Architecture.md`
- `CHANGELOG.md`
- `PROJECT_HISTORY.md`
- `PROJECT_MASTER.md`
- `README.md`
- `ROADMAP.md`
- `docs/GLOBAL_WORKSPACE_UI_SPECIFICATION.md`
- `docs/README.md`
- `docs/UI3_UNIFIED_CONSTRUCTION_HISTORY_VALIDATION.md`
- `package.json`
- `screenshots/ui3-shared-history/box-1024-large.png`
- `screenshots/ui3-shared-history/box-1024-small.png`
- `screenshots/ui3-shared-history/box-1366-normal.png`
- `screenshots/ui3-shared-history/box-1920-normal.png`
- `screenshots/ui3-shared-history/box-workflow-navigation.png`
- `screenshots/ui3-shared-history/drawing-1024-large.png`
- `screenshots/ui3-shared-history/drawing-1024-small.png`
- `screenshots/ui3-shared-history/drawing-1366-normal.png`
- `screenshots/ui3-shared-history/drawing-1920-normal.png`
- `screenshots/ui3-shared-history/long-test-only-track.png`
- `screenshots/ui3-shared-history/results.json`
- `src/App.tsx`
- `src/app/DrawingWorkspace.tsx`
- `src/app/SharedHistoryRegion.tsx`
- `src/styles.css`
- `tests/contextual-canvas-controls.browser.cjs`
- `tests/drawing-workspace-shell.test.mjs`
- `tests/shared-history-region.browser.cjs`
- `tests/shared-history-region.test.cjs`
- `tests/shared-workspace-shell.browser.cjs`
