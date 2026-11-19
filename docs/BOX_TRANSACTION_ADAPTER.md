# Stage C PR 5 — BOX transaction boundary

Baseline verified on 18 November 2026 with `git ls-remote origin refs/heads/main`.
The clean branch started at `0085f4e8738429dc124e5ea6eca99ae9a8ec4bbe`,
which includes the capture, owner, history core and Drawing adapter from #637–#640.

## Mutation inventory and local history

App's shared project owner holds the fields below. Each accepted action in this table
prepares a complete project transition. Only the SVG file read is asynchronous.

| Production entry point | Acceptance and affected data | Active BOX local history |
| --- | --- | --- |
| `handleImport` → `replaceSource` | Exclusive admission, read, parse, initialize PM, calculate viewBox/diagnostics, validate token and publish replacement | Reset both stacks on success |
| `updatePanelThickness` | A PM number input updates on change. A difference marks PM pending and dirty. Positive, finite thickness for every panel is required at Apply. The previous output stays available. | No push |
| `acceptDefaultPanelThickness` | Use the existing positive default or 3 mm, set every panel thickness, mark pending and dirty. Accepting defaults on an applied PM still makes it pending even if the values match. A repeated equivalent pending action is a no-op. | No push |
| `applyPanelManager` | Validate PM, calculate automatic connection sizes, regenerate eligible tools, select authority, build the snapshot and accept PM with its applied/dirty flags in one publication | Push the pending baseline once on success |
| `openManufacturing` | First visit to MFG creates the existing entry in workflow order. Subsequent visits only select the tool. | No push |
| `updateProjectSettings`, profile toggle and Clear Selection | Normalize all four numeric parameters and ordered profile targets. Toggle against the current owner selection. Equivalent normalized settings preserve project identity and Redo. | One push per changed commit or selection |
| `applyPanelPaths` | The existing shared Geometry Apply for TB/W/S and MFG validates construction and Wall inputs, generates TB/W/S, selects authority, then publishes connections, accepted output and any changed settings stamp together | No separate push. Existing authoring/parameter steps supply Undo grouping. |

Manufacturing text drafts stay in the field until blur or Enter. Escape and incomplete
drafts discard the text. Current settings still drive preview against stored geometry
while the applied stamp records the settings accepted by Geometry Apply.

PM import-summary dismissal, panel/hole selection, tool selection, modal visibility,
pointer movement, view changes and error messages stay in the UI. Finish PM clears
its existing assignment/display/edge context together and closes the editor. History
navigation can change that restoration context. Neither action advances project history.
Rendering FinalGeometry, manufacturing compensation, preview and export reads the
accepted snapshot and settings. None of these readers publishes an owner root.

## Admission, preparation and publication

`createBoxTransactionAdapter(owner)` exposes `transact(label, prepare, recordLocal?)`
for synchronous BOX actions and `replaceSource(token, svgModel, panelManager, resetLocal)`
for validated source replacement. The pure history core creates a private baseline from
the owner's latest root and the existing `boxStateFields` inventory. Preparation reads
that root. Returning it unchanged yields a no-op. A thrown validation or generation
error rejects all staged work. Recursive adapter calls during preparation poison the
outer action. A synchronous subscriber reentering this BOX adapter during publication
receives a rejection.

The core freezes/detaches mutable candidate records and shares unchanged immutable
records. The accepted owner root references the exact Drawing, source, workflow,
connection, PM, settings, generated operations/geometry/metadata and restoration
fields in the accepted frame. `batchIfCurrent` requires the original root and an outer
owner boundary. Only after admission does App enqueue the local push or reset, inside
the same batch and before owner notification. The local snapshot is taken from the
supplied baseline before React can defer its updater. Local snapshots omit SVG source
and retain the legacy selected-label fallback. The complete project frame preserves
the three actual context fields separately, including explicit nulls.

App discards the returned transition after handling its outcome. The next action starts
from the then-current owner, including after a local Undo, Redo, Clear or Drawing edit.
PR 7 can retire this one-action lifecycle when project-wide restore, lifecycle handling
and execution-history cutover are ready. Drawing's 100 steps and BOX's 10 steps
continue to execute the toolbar and keyboard actions.

### Source replacement

The lock resets the input immediately after taking the File. Failed reads, malformed or
non-SVG input, parser exceptions, PM initialization exceptions and diagnostic exceptions
all finish before publication. They preserve the current project and histories and can
report a UI error while the token is current. Successful parsing retains the original
markup, root attributes, panel/hole geometry, source-edge identities and import diagnostics.
The selected viewBox and diagnostic message are prepared before the synchronous transaction.

Sequence and BOX revision guard both admission and the actual owner import write. A
stale/completed token cannot publish, and late cleanup cannot unlock a newer import.
Unmount invalidates admission. An owner refusal keeps both local histories. Success
preserves Drawing and connection definitions, resets dependent assignments, groups,
settings, applied geometry and context, initializes PM and resets local BOX history.
The lock covers success UI cleanup and releases in `finally`. The same file can then
be selected again. Pure frame traversal reuses both stored sources. A future native
Open starts a fresh global session under its own lifecycle policy.

### Geometry and failure handling

Both Apply paths retain the TB/S automatic sizing helpers and existing composition
selector. PM rebuilds TB and W when previously present or assigned, and S when present
in stored output. Geometry Apply runs all three generators on fresh inputs. The existing
DEV diagnostics capture the attempted inputs for investigation. A successful action
creates one generated snapshot with the selector's geometry and composition marker.
The existing snapshot factory supplies operations/metadata for new Apply results.
Prior stored operations, timestamps and legacy missing-marker semantics survive
capture and restoration verbatim.

At the baseline, PM pushed Undo and cleared Redo before generation and set connections
before authority selection. Today's sizing compatibility functions return the same map,
but a rejected Apply already consumed a real local step. A generator exception could
also escape the event handler. Geometry Apply caught failures inside the owner batch
after setters had begun, so a late snapshot-factory failure could publish a settings
stamp without its matching output. Both paths now finish the complete candidate before
any owner or local-history write. Rejection preserves pending values, accepted flags,
both stacks and the identity of the previously accepted snapshot. The UI displays the
domain error and leaves the PM editor available.

## Structural sharing and validation

A focused test runs 50 real manufacturing edit handlers on a populated mixed project
with two Sketches. It observes zero `structuredClone` calls, zero snapshot-factory
calls, identical Drawing/source/output references in every before/after frame and
shared accepted geometry in the bounded local Undo stack. New settings and changed PM
branches still allocate. The history core audits immutable records on first use. This
instrumentation measures identities and calls. Production heap usage and large-SVG
latency remain unmeasured.

All commands below ran in the isolated worktree. Legacy test scripts use a shared
output directory. Before each standalone Node regression we removed its generated
module-type marker with `rm -f .test-build/package.json`.

The production-handler and adapter suite passed 34/34 tests. It covers exact frames
and sharing, local history and deferred React updates, stale roots, nested rejection,
source lifecycle, mixed Apply, generator/authority/snapshot rejection and Redo
preservation. The state, pure-history and Drawing adapter suites passed 16/16, 40/40
and 8/8 respectively. The domain suites also exercise TB/W/S construction, composition,
stored snapshots, FinalGeometry and manufacturing.

```sh
npm run test:project-owner
npm run test:project-state
npm run test:project-history
npm run test:drawing-transaction-adapter
npm run test:box-empty-start
npm run test:panel-thickness-canonical
npm run test:tb-native-production
npm run test:wall-v2-native-production
npm run test:wall-v2-authoring-ui
npm run test:wall-v2-apply-placeholder
npm run test:wall-v2-production-path
npm run test:wall-v2-restore
npm run test:s-slot-offset-orientation
npm run test:s-shared-reference-edge
npm run test:generated-geometry-authority-mixed
npm run test:generated-geometry-authority-mixed-evidence
npm run test:generated-geometry-authority-mixed-invalid
npm run test:generated-geometry-authority-single-tool
npm run test:generated-geometry-authority-restore
npm run test:composed-panel-reconciliation-integration
npm run test:generated-profile-ownership
npm run test:profile-offset-ordinary
npm run test:tap-compiled
npm run test:wall-v2-manufacturing
npm run test:shared-history
npm run test:workspace-shell
npm run test:drawing-circle
npm run test:drawing-arc
npm run test:drawing-circle-direct-manipulation
npm run test:drawing-arc-direct-manipulation
npm test
npm run build
git diff --check
```

Chromium used Playwright and the real Vite application. Start it with
`npm run dev -- --host 127.0.0.1 --strictPort`. The following suites exercise the
workspace shell, canvas, independent local histories, locked imports including
unmount/retry, Drawing transactions, TB/W/S authoring and manufacturing Apply.

```sh
npm run test:workspace-shell:browser
npm run test:contextual-canvas-controls:browser
npm run test:project-owner:browser
npm run test:shared-history:browser
npm run test:svg-import-lock:browser
npm run test:drawing-transaction-adapter:browser
```

The owner browser suite also checks that Escape and an equivalent kerf commit preserve
Redo, and that a real S generator rejection leaves PM pending with its accepted
contours and Redo intact. Browser coverage uses headless Chromium. User acceptance
and Stage C completion remain pending.

## USER TESTING / USER-VISIBLE CHANGES

The existing controls are sufficient. Two visible fixes affect Undo/Redo and error
handling. An unchanged manufacturing field preserves Redo. A failed PM Apply now
shows its error, keeps the pending thickness and preserves local history.

1. Import an ordinary two-panel SVG, accept default thickness in PM, then Apply and
   finish PM. Open MFG, change Kerf to 0.25, press Enter, and click Undo. Re-enter
   the displayed kerf with an extra trailing zero and press Enter. Redo should still
   restore 0.25.
2. To exercise a real generation failure, make an S connection between matching
   edges on the two panels, Apply, and finish the group. Start another S group using
   two unused matching edges. Click Undo once to leave only the first edge assigned.
   Open Panel Manager from the History row, change its first thickness, and click
   Apply. Expect an error about needing one S-A and one S-B edge. The previous
   contours remain visible, the new thickness remains pending, and Redo remains available
   to restore the second assignment.

PR 6 covers independent connection, edge, TB/W/S property and group start/Finish integration. See the [construction inventory and validation](BOX_CONSTRUCTION_TRANSACTIONS.md). PR 7 retains project-wide restoration, lifecycle
coordination and global control routing. Native Open and downstream regeneration
remain future work.
