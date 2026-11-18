# Stage C PR 2 validation

Baseline: `d654213d369d0f20c8be7789113830c6fabd5c19`; isolated branch
`stage-c-pr2-shared-project-owner`. This evidence covers the ownership implementation,
not global history, permanent operations or user acceptance. See [design and limits](SHARED_PROJECT_OWNER.md).

## Exclusive SVG import correction — 2026-11-18

Correction baseline: PR #638 remote head
`618b8c58b5d45239b675c40a96ba430b200ccc88`, verified through GitHub PR metadata and
`git ls-remote origin refs/heads/stage-c-pr2-shared-project-owner`. Work uses that exact
commit on the existing branch with an initially clean tree. Remote `main` remains
`d654213d369d0f20c8be7789113830c6fabd5c19`; this correction does not restart from main.

Completed correction checks:

| Command / inventory | Result |
| --- | --- |
| `npm run test:project-owner` | **29/29 PASS** |
| All 138 regression commands listed below | **138/138 PASS** |
| `npm run build` | **PASS**, TypeScript and Vite |
| `npm run test:svg-import-lock:browser` | **PASS**, all four workflow groups below |
| `npm run test:workspace-shell:browser` | **PASS** |
| `npm run test:shared-history:browser` | **PASS** |
| `npm run test:contextual-canvas-controls:browser` | **PASS** |
| `npm run test:project-owner:browser` | **PASS**, TB/W/S flows |
| `node tests/drawing-arc-direct-manipulation.browser.cjs` | **23/23 PASS** |
| `node tests/drawing-coincidence-drag.browser.cjs` | **10/10 PASS** |
| `git diff --check` | **PASS** |

The 138-command inventory was rerun sequentially, removing only the generated shared
`.test-build/package.json` marker before each command, as in the original run. The four
workspace/BOX browser suites were rerun against the final production source after
adding focusout isolation. No baseline test failures remain.

The focused suite executes the actual App handler, owner and import-lock hook, using
scheduled hook commits/native EventTarget for isolated lifecycle checks. It covers
same-turn admission; a rejected second read; lock retention through publication and
PM/history setters; read rejection and synchronous throw; parser, PM initialization,
diagnostic and publication exceptions; refused/stale publication; project/history
preservation; input reset/retry; owner sequence/revision safeguards; older cleanup versus
later selection/lock; and no UI updates after unmount. These isolated failure injections
are not claimed as browser coverage.

Actual headless Chromium verification uses the real production App at 1366×768, native
modal/inert/focus behavior and production handlers. Only `File.text()` settlement is
delayed or rejected; project/store state is not injected:

1. Author two Drawing Lines, import/apply BOX panels, start TB and edit manufacturing
   settings with Undo/Redo available. While a read is pending, verify the modal, inert
   app and focused dialog; block actual pointer clicks on module/Clear/history/PM/TB/W/S/
   manufacturing/import targets, keyboard Tab/Shift+Tab/Escape/Enter/Space/Ctrl+Z/Ctrl+Y/
   Ctrl+Shift+Z/Meta+Z/Delete/Backspace, direct hidden-Drawing events and attempts to
   refocus/click underlying controls. Also attempt controls synchronously inside
   `File.text()` before the modal commits. A numeric draft must not commit on modal blur.
   Read failure preserves Drawing/BOX presentation, draft and Undo/Redo availability,
   releases the lock, restores focus and leaves the file input empty.
2. Select the exact same on-disk `06_two_independent_panels.svg` again after rejection.
   Import succeeds, the input is empty, PM initializes both panels, BOX history resets
   only on success, and Drawing toolbar/keyboard Undo/Redo resumes normally.
3. Real parser rejection of malformed SVG and non-SVG XML preserves prior BOX data,
   releases the lock and resets the input; a subsequent valid import succeeds.
4. Mount and unmount a separate real App in StrictMode during a pending read, then
   settle it successfully. No late PM modal, publication or page error appears, and
   the remaining App accepts navigation, proving listener cleanup.

Original P2 finding: **addressed in code** by clearing the file input immediately after
capturing its File, before any await or stale return. No late cleanup resets the input.
The review thread is left for reviewer confirmation; no merge or user acceptance is
claimed. All seven Chromium suites pass. Firefox/WebKit, screen-reader testing and
large-file latency are not covered. `File.text()` remains non-cancellable, a never-settled
read continues to block interaction, and parsing remains synchronous on the main thread.

## Original ownership commands and results

The original ownership implementation recorded the results below. The correction's
fresh results above supersede the focused-test count and add the import-lock suite.

- `npm run test:project-owner`: 17/17 focused owner/production-adapter checks pass.
- `npm run build`: TypeScript and Vite pass.
- Existing regression inventory: **138/138 commands pass** (listed below).
- Chromium: **all six suites pass**; Arc manipulation 23/23, Coincidence drag 10/10.
- `git diff --check`: pass.

The repository has no aggregate `npm test`. Each command below was run separately,
sequentially. Some legacy suites generate `.test-build/package.json` with a CommonJS
marker at the shared build root; that generated marker was removed between suites so
ES-module suites use the repository's package type. No product/test contract was changed
to bypass a failure. The empty-BOX source assertions were updated to point to the new
owner/import path; their behavior assertions remain.

The new production-adapter tests execute real App/Drawing handlers extracted with the
TypeScript AST, supplying the real owner and domain functions. They explicitly model
React deferring history-stack updaters and the legacy selected-label assignment-target
fallback. They also test nested rollback, same-event
Drawing mutations, complete Sketch records, exact snapshot metadata/operations/all
composition markers, PM pending/applied state and automatic-size derivation, workflow
state/order, draft/applied manufacturing, rejected Apply behavior, import races and
zero full-project cloning on ordinary edits.

## Actual Chromium workflows

All tests use headless `/usr/bin/chromium` through Playwright against the running Vite
application. Browser tests author through production UI rather than injecting project
state. Passing browser automation remains separate from user acceptance after merge.

| Command | Actual coverage | Result |
| --- | --- | --- |
| `npm run test:workspace-shell:browser` | Line, Circle, Arc, delayed Profile, Dimension creation/value edit, local Undo/Redo, unfinished interactions and Drawing↔BOX navigation; BOX import/PM/TB/export/Clear; hidden-input isolation and three desktop sizes | PASS |
| `npm run test:shared-history:browser` | One stable shared region, unchanged Drawing availability, real PM/TB/W workflow navigation, BOX Finish Undo/navigate/Redo, stored manufacturing output, 18 module/size layouts and scrolling | PASS |
| `npm run test:contextual-canvas-controls:browser` | PM pending/validation/Apply, all TB/W/S authoring/Apply/Finish flows, Manufacturing Apply and local Undo/Redo, incomplete Wall rejection, Fit and contextual action placement | PASS |
| `npm run test:project-owner:browser` | Three independent real TB/W/S projects: SVG import, PM thickness edit/Apply, paired assignments, manual Tab property edits, S offset edit, generated output, Finish Undo/Redo and manufacturing settings/Apply | PASS |
| `node tests/drawing-arc-direct-manipulation.browser.cjs` | Existing Arc production drag/constraint/dimension/history regression harness | PASS |
| `node tests/drawing-coincidence-drag.browser.cjs` | Existing Line/Circle/Arc Coincidence constraint creation, propagation during drag, commit/cancel and keyboard Undo/Redo | PASS |

The four workspace/BOX suites were rerun successfully against stable source after the
final local-history compatibility changes.

No large-project frame-time/heap benchmark, native Save/Open, global history, Finish
Sketch or dependency regeneration is claimed. The counter test proves zero
`structuredClone` calls for 50 ordinary Drawing updates plus one BOX context update,
with BOX SVG and generated output shared by reference; it is not a latency guarantee.

## Existing regression inventory

- `npm run test:drawing-entity-foundation`
- `npm run test:drawing-circular-support`
- `npm run test:drawing-arc`
- `npm run test:drawing-arc-reference-types`
- `npm run test:drawing-circle`
- `npm run test:drawing-acquisition-tolerances`
- `npm run test:drawing-semantic-point-inference`
- `npm run test:drawing-sketch-point-hit`
- `npm run test:drawing-constraints-tool`
- `npm run test:drawing-line-to-line-angle`
- `npm run test:drawing-constraint-rank`
- `npm run test:drawing-dimension-solver`
- `npm run test:drawing-dimension-screen-ui`
- `npm run test:drawing-dimension-tool-lifecycle`
- `npm run test:drawing-dimension-interaction`
- `npm run test:drawing-dimension-foundation`
- `npm run test:downstream-diagnostic-reasons`
- `npm run test:geometry-runtime-debug-serialization`
- `npm run test:wall-v2-runtime-state-replay`
- `npm run test:wall-v2-imported-model-differential-analysis`
- `npm run test:wall-v2-exact-tb-w-differential`
- `npm run test:wall-v2-browser-sequence-analysis`
- `npm run test:wall-v2-downstream-diagnostic-analysis`
- `npm run test:multi-contributor-panel-carriers`
- `npm run test:connection-labels`
- `npm run test:projected-distance-intervals`
- `npm run test:tb-native-production`
- `npm run test:coherent-generator-batch-contract`
- `npm run test:wall-v2-corner-architecture`
- `npm run test:wall-v2-corner-authoring-contract`
- `npm run test:wall-v2-tb-panel-pair-orientation`
- `npm run test:wall-v2-authoring-ui`
- `npm run test:wall-v2-tab-size-control`
- `npm run test:wall-v2-tab-size-per-connection`
- `npm run test:wall-v2-session-ui-path`
- `npm run test:wall-v2-real-tb-meeting-analysis`
- `npm run test:ui`
- `npm run test:d2-1b`
- `npm run test:d2-1c`
- `npm run test:d2-1d`
- `npm run test:d2-1e`
- `npm run test:d2-1f`
- `npm run test:d2-1g`
- `npm run test:d2-1h`
- `npm run test:d2-2`
- `npm run test:d2-2a`
- `npm run test:d2-2b`
- `npm run test:d2-3`
- `npm run test:cad-interaction-contract`
- `npm run test:cad-tool-ui`
- `npm run test:cad-tool-ui-c2`
- `npm run test:cad-tool-ui-c3`
- `npm run test:cad-tool-ui-c4`
- `npm run test:cad-tool-cleanup`
- `npm run test:d2-3a`
- `npm run test:box-empty-start`
- `npm run test:tap-compiled`
- `npm run test:generated-profile-ownership`
- `npm run test:tb-junctions`
- `npm run test:tb-edge-locality`
- `npm run test:geometry-relationships`
- `npm run test:canvas-edge-relationships`
- `npm run test:canonical-authoring-relationships`
- `npm run test:mixed-edge-authoring`
- `npm run test:profile-offset-ordinary`
- `npm run test:profile-offset-selected-joins`
- `npm run test:tb-bb-edge-local`
- `npm run test:shadow-panel-composer`
- `npm run test:shadow-panel-composer-tb`
- `npm run test:shadow-panel-composer-mixed`
- `npm run test:generated-geometry-assembly`
- `npm run test:generated-geometry-dual-run`
- `npm run test:generated-geometry-authority-single-tool`
- `npm run test:generated-geometry-authority-single-tool-evidence`
- `npm run test:generated-geometry-authority-mixed`
- `npm run test:generated-geometry-authority-mixed-evidence`
- `npm run test:mixed-s-reference-semantics`
- `npm run test:generated-geometry-authority-mixed-invalid`
- `npm run test:mixed-metadata-packaging`
- `npm run test:generated-geometry-authority-restore`
- `npm run test:panel-thickness-canonical`
- `npm run test:s-slot-offset-orientation`
- `npm run test:panel-composition-authority-default`
- `npm run test:contributor-registration`
- `npm run test:s-shared-reference-edge`
- `npm run test:wall-v2-panel-tb-role`
- `npm run test:wall-v2-apply-placeholder`
- `npm run test:composed-panel-metadata-reconciliation`
- `npm run test:tb-wall-kernel-characterization`
- `npm run test:wall-v2-tb-geometry-equivalence`
- `npm run test:wall-v2-native-production`
- `npm run test:wall-v2-coherent-batch`
- `npm run test:wall-v2-real-apply-analysis`
- `npm run test:wall-v2-production-path`
- `npm run test:wall-v2-w3-panel-resolution-analysis`
- `npm run test:wall-v2-mixed-authority`
- `npm run test:wall-v2-final-geometry`
- `npm run test:wall-v2-manufacturing`
- `npm run test:wall-v2-restore`
- `npm run test:composed-panel-reconciliation-integration`
- `npm run test:nonphysical-projection-lineage`
- `npm run test:drawing-primary-mousedown`
- `npm run test:drawing-box-selection`
- `npm run test:drawing-direction-diagnostic`
- `npm run test:drawing-history-controls`
- `npm run test:drawing-history-transactions`
- `npm run test:drawing-alignment-snap`
- `npm run test:drawing-angular-reference`
- `npm run test:drawing-line-authority`
- `npm run test:drawing-profile-production-boundary`
- `npm run test:drawing-line-inference-arbitration`
- `npm run test:drawing-inference-product-regressions`
- `npm run test:drawing-live-direction-coexistence`
- `npm run test:drawing-endpoint-direction-inference`
- `npm run test:drawing-dimension-role`
- `npm run test:drawing-line-topology`
- `npm run test:drawing-entity-domain`
- `npm run test:drawing-direct-manipulation`
- `npm run test:drawing-constraint-scoped-drag`
- `npm run test:drawing-geometry-visual-state`
- `npm run test:drawing-point-to-point-dimension`
- `npm run test:drawing-component-solver`
- `npm run test:drawing-point-to-line-dimension`
- `npm run test:drawing-line-to-line-distance`
- `npm run test:drawing-horizontal-vertical`
- `npm run test:drawing-parallel-marker`
- `npm run test:drawing-perpendicular`
- `npm run test:drawing-coincident`
- `npm run test:drawing-line-tool`
- `npm run test:drawing-circle-direct-manipulation`
- `npm run test:drawing-arc-direct-manipulation`
- `npm run test:drawing-circular-dimension`
- `npm run test:drawing-pointer-arbitration`
- `npm run test:drawing-circle-coincidence-runtime`
- `npm run test:drawing-coincidence-drag`
- `npm run test:workspace-shell`
- `npm run test:shared-history`
- `npm run test:project-state`
