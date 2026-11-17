# Stage C PR 2 validation

Baseline: `d654213d369d0f20c8be7789113830c6fabd5c19`; isolated branch
`stage-c-pr2-shared-project-owner`. This evidence covers the ownership implementation,
not global history, permanent operations or user acceptance. See [design and limits](SHARED_PROJECT_OWNER.md).

## Commands and results

All results below are from the completed runs on this branch.

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
