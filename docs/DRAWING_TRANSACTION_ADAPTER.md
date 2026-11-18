# Stage C PR 4 — Drawing transaction adapter

Review branch based on remote `main` at `571d98303e85867181d0f1b576aa611da5f9acdc`,
verified with `git ls-remote origin refs/heads/main` on 18 November 2026. The first-parent
history contains #637 (complete capture), #638 (shared owner) and #639 (transaction core).

## Ownership and publication

`App` creates one adapter for its project owner and passes its synchronous publisher to
`DrawingWorkspace`. The workspace still owns the existing 100-step local history ref.
Standalone renderers retain the document/setter interface. In the mounted App, event
handlers read the committed document through the owner's accessor, including when a
pending Profile click is flushed before the next pointer placement in the same event.

`createDrawingTransactionAdapter(owner).transact(local, label, action)` takes an
immutable Drawing updater or ordered, recursively nested groups of updaters. Staging
callbacks must be synchronous and free of side effects. Each receives the latest staged
DrawingDocumentV2. The complete project before-frame comes from a single owner root.
Its Drawing branch contains every Sketch and the active identity. Its BOX branch groups
the inventory from #637 into data and restoration context, including the original SVG,
stored generated snapshot, composition metadata and both sets of manufacturing settings.

| Domain outcome | Adapter behavior |
| --- | --- |
| Changed document | Stage the complete accepted Drawing result and share the BOX branch. |
| Input document | Skip the no-op. A group returning to the input document also consumes zero steps. |
| Explicit rejection or exception | Discard the entire group, including successful earlier children. An enabled Constraint command returning its input is mapped to rejection. |
| Failure before an updater exists | Tool validation or the solver handles it. The adapter receives no action. |

The adapter prepares the full transition with `transactProjectHistory` before publication.
`owner.batchIfCurrent` checks the exact root and requires a top-level publication. An
enclosing owner savepoint could otherwise roll back after the local stack had advanced.
Inside the guarded batch, the adapter stages the exact frozen result in the owner and
advances the local stack once. Both are visible when synchronous subscribers run.
A subscriber may immediately start another edit. Mutation-time calls back into the
public publisher reject the outer action. Explicit nested groups use core savepoints.

## Production action boundaries

| Drawing intent | Acceptance boundary |
| --- | --- |
| Line and Profile | An accepted segment appends endpoints and inferred relations together. Each completed Profile segment has its own local Undo step. A delayed click owns its original placement and checks its source document before it runs. Rapid continuation flushes that click first. |
| Circle and Arc | The final radius or form click appends the entity, point identities and accepted relations together. Initial clicks, collinear/degenerate forms and hover previews add zero steps. |
| Geometry drag | Pointer-down retains the starting document. Pointer moves solve against that document using total delta and render a preview. Pointer-up submits the last valid candidate once if it differs and the starting document is still current. A failed sample retains the preceding valid preview, as in the existing Circle/Arc behavior. |
| Dimension placement and editing | Creation commits at placement. Annotation dragging submits its final placement on release against its starting document. Enter parses the numeric draft and solves against the current owner document. Submitting the stored target or its unchanged formatted editor text closes the editor without a step. Solver failure keeps the error in the editor. |
| Constraint and geometry commands | A successful Constraints command includes its solved geometry and all new records. Delete commits the removal of an entity and its orphaned/dependent data, a Dimension or a Constraint. |
| Tool and workspace interactions | Hover, selection, pan, zoom and navigation do not enter the adapter. Mounted workspaces retain in-progress multi-click commands across navigation. A previously accepted delayed Profile click may complete while Drawing is hidden. |

Pointer cancellation, lost capture, Escape, tool changes, hiding Drawing and unmount
discard unfinished pointer gestures. Local Undo/Redo also invalidates pending timers,
drag sessions and in-progress placements that refer to the pre-restore geometry.
The accepted solver coordinates are used as returned. The adapter adds no new geometric
tolerance or comparison of complete project trees.

## Provisional lifetime and cost

Each call starts a fresh history at the current owner and returns its result for inspection.
The UI releases that result immediately. No shadow cursor survives a local restore, BOX
change, import, Clear or edit on a new branch. The toolbar and shortcuts still call
the local 100-step Drawing and 10-step BOX histories. A permanent Sketch construction
record is a separate future concept. Primitive edits here have no permanent operation ID.

The first history capture audits incoming frozen data. The core skips filling disposable
copies of already immutable records during that audit. A shallow-frozen input with a
mutable child still detaches safely. The adapter's weak map reuses the BOX data/context
wrapper by immutable BOX identity. Frozen descendants are shared with the owner.
Changed Sketch maps still cost up to their size to copy and freeze. Pointer previews
still run the production solver and rerender the workspace at its existing frequency.
Only submission at release captures a frame or publishes project data.

In the populated TB/S/W fixture, instrumentation saw zero snapshot property copies of
the probed SVG markup and generated-output fields on the first edit. Another 45 Line
edits kept the exact BOX wrapper and performed zero enumerations of the probed source
and generated snapshot records. The mounted Chromium test observes owner publications
during real pointer moves. These checks establish sharing and event counts. Large-project
heap usage, frame times and solver latency have not been benchmarked.

## Validation

The following commands run from the verified worktree. For the Node suites, remove the
generated `.test-build/package.json` before each command with
`rm -f .test-build/package.json` so legacy CommonJS and ESM runners use their intended
module format.

| Coverage | Exact commands |
| --- | --- |
| Adapter, nested rollback, complete immutable frames, publication, local branching, Circle/Arc/Constraint domain paths and sharing | `npm run test:drawing-transaction-adapter` |
| Capture, owner and pure project history | `npm run test:project-state`, `npm run test:project-owner`, `npm run test:project-history` |
| Local grouping, controls and workspace shell | `npm run test:drawing-history-transactions`, `npm run test:drawing-history-controls`, `npm run test:workspace-shell`, `npm run test:shared-history` |
| Circle, Arc, pointer ownership and direct manipulation | `npm run test:drawing-circle`, `npm run test:drawing-arc`, `npm run test:drawing-circle-direct-manipulation`, `npm run test:drawing-arc-direct-manipulation`, `npm run test:drawing-sketch-point-hit` |
| Dimensions, constraints and solver movement | `npm run test:drawing-dimension-solver`, `npm run test:drawing-dimension-screen-ui`, `npm run test:drawing-dimension-interaction`, `npm run test:drawing-constraints-tool`, `npm run test:drawing-coincidence-drag`, `npm run test:drawing-constraint-scoped-drag`, `npm run test:drawing-parallel-marker` |
| Profile command, timer ownership and same-event continuation | `npm run test:d2-2`, `npm run test:d2-3a`, `npm run test:drawing-profile-production-boundary` |
| BOX manufacturing authority, stored output and history | `npm run test:generated-geometry-authority-restore`, `npm run test:generated-geometry-authority-mixed-evidence`, `npm run test:wall-v2-restore`, `npm run test:box-empty-start` |
| Production build and patch hygiene | `npm run build`, `git diff --check` |

The pure-core suite exercises transaction semantics separately. The adapter suite runs
the production bridge and owner with real mutation/solver helpers. The owner suite
also executes the workspace transaction and local restoration handlers.

Start Vite with `npm run dev -- --host 127.0.0.1 --strictPort`. Chromium commands use
Playwright and `/usr/bin/chromium`.

| Browser coverage | Exact commands |
| --- | --- |
| Frame and owner coherence, multi-move drag, cancellation, drag returning to origin, local restore during a drag, pointer cancellation/unmount, delayed Profile, navigation, Dimension submission and annotation drag | `npm run test:drawing-transaction-adapter:browser` |
| Creation across workspace switches, keyboard and toolbar Undo/Redo, BOX import/Apply/Finish, shared History and manufacturing | `npm run test:workspace-shell:browser`, `npm run test:shared-history:browser`, `npm run test:contextual-canvas-controls:browser`, `npm run test:project-owner:browser` |
| Import lock, failure, retry and unmount | `npm run test:svg-import-lock:browser` |
| Circle/Arc manipulation and coincidence-driven movement | `node tests/drawing-arc-direct-manipulation.browser.cjs`, `node tests/drawing-coincidence-drag.browser.cjs` |

The adapter browser test wraps the real adapter export in the test page to count accepted
labels/publications and inspect the frames. All edits use the mounted UI. Production
contains no debug recorder. Existing browser suites exercise the ordinary application.

On 18 November 2026, all 27 Node commands above passed, including 8 adapter tests,
16 project-state tests, 29 owner tests and 40 pure-core tests. The production build
and patch check passed. All 8 Chromium commands passed, including 23/23 direct
manipulation scenarios and 10/10 coincidence scenarios. An earlier direct-manipulation
run timed out clicking the Arc toolbar button in one scenario. The complete rerun
passed on the final production code. The mounted adapter check saw zero publications
during 16 drag moves, one at accepted release, and zero on release after unmount.

## Limits and remaining Stage C work

Stage C remains open. PRs 5–7 still need BOX action grouping, project-wide restoration
and lifecycle coordination, and the eventual toolbar/keyboard cutover. Testing global
Undo/Redo through the UI belongs to that cutover. The separate, previously documented
rare Arc empty/blind Undo limitation remains open. This validation does not establish
manual user acceptance or exhaustively cover every CAD constraint combination.

New/Finish Sketch, downstream regeneration and manufacturing invalidation, permanent
operations, native Save/Open, Drawing-to-BOX transfer and 3D/Unfold remain future work.
