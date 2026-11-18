# Stage C PR 2 — Shared project owner

**Ownership implementation on the task branch; review and user acceptance pending.**
Baseline: remote `main` `d654213d369d0f20c8be7789113830c6fabd5c19`, verified with
`git ls-remote origin refs/heads/main` on 2026-11-17. GitHub confirms PR #637 merged
at that commit. Branch: `stage-c-pr2-shared-project-owner`.

This implements the ownership slice of [Stage B §13](GLOBAL_PROJECT_HISTORY_ARCHITECTURE_ANALYSIS.md#13-incremental-migration-strategy),
using the [PR #637 inventory](PROJECT_STATE_CAPTURE_BOUNDARY.md). It does not complete
Stage C or enable global Undo/Redo, permanent operations, persistence, multiple-Sketch
workflows or dependencies. Existing A–G/UI statuses and Circle/Arc acceptance are unchanged.

## Production ownership inventory and mutation paths

`App` creates one `createProjectOwner()` instance for its mounted lifetime.
`ProjectStateSource` is its exact root contract; no V3 or second domain model is added.

| Root data | Production access and updates |
| --- | --- |
| `drawingDocument` | Complete `DrawingDocumentV2`: Sketch maps/order/active ID, points/entities, Dimensions, Constraints and their identities. `DrawingWorkspace` receives the document and a setter/accessor into this same owner. Existing model functions and local history supply immutable documents. |
| `box.svgModel` | Complete original/parsed SVG, edges, panels, source references, markup and diagnostics. Import replaces source and dependent BOX fields in one publication; BOX Clear uses its original reset list. |
| `box.connections`, `edgeAssignments` | Connection creation/property edits, edge/role assignment/removal, automatic next connections, TB/W/S helpers and Apply use owner-backed compatibility setters. |
| `box.panelManager` | Default/panel thickness and applied/dirty flags. Pending thickness edits stay distinct from PM Apply; only existing Apply paths regenerate accepted output. |
| `box.activeTBGroup`, `completedTBGroups`, `activeWallGroup`, `completedWallGroups`, `activeSGroup`, `workflowGroupOrder` | Existing creation, continuation, trailing cleanup, completion and History navigation. Completed S presentation remains derived; no invented completed-S model. |
| `box.projectSettings`, `lastAppliedManufacturingSettings` | Current manufacturing parameters/targets and separate Apply stamp. Preview still uses current settings with stored applied geometry. Settings edits do not implicitly Apply geometry. |
| `box.generatedGeometrySnapshot` | Complete accepted geometry, operations and metadata, including stored composition authority and timestamp. Items and composition mode in App are read-only projections of this snapshot. Only existing Apply/reset paths construct new snapshots; restore retains the entire stored snapshot. |
| BOX assignment/display/selected-edge context | Same owner fields and original restoration fallback semantics; no independent writable App copies. Selected-label ID remains a display-ID alias. |

UI tools, selection outside the inventory, views, hover/preview/drag candidates, dialogs,
DOM refs, local histories and debug captures retain their existing session ownership.
FinalGeometry, compensated contours and other derived presentations retain their existing
memoized calculation paths. No source-to-BOX transfer or regeneration scheduler is added.

## Publication and adapters

`projectOwner.ts` is a small external store with `getSnapshot`, `subscribe`, immutable
`update`, synchronous `batch`, `setDrawingDocument` and typed `setBoxField` adapters.
`useSyncExternalStore` connects App to the committed root without a synchronization effect.
There is no mirrored project `useState`, independent document ref or generated-output
state. The owner adds no active history service or tape.

Related legacy setter calls run in explicit synchronous batches. Setters resolve
functional updates against the latest private candidate; subscribers and `getSnapshot`
continue to see the previous complete committed root until publication. An outer batch
publishes once. Nested batches support rollback savepoints; uncaught failures publish no
partial candidate. Updates returning the existing value/root send no notification. This is a
publication boundary, not a declaration that every old handler is a future Undo action.
The existing history call sites and limits remain authoritative for execution history.

Drawing's production `documentRef` is a getter/setter into this owner. Accepted mutations
and same-event Profile continuation therefore read the latest committed document without
waiting for React. The optional standalone component adapter remains for existing callers;
it is unused/null in the application. Rendering cannot write an older prop over the owner.
The existing pending-Profile cancellation/identity logic remains unchanged.

BOX compatibility setters replace the old React fields directly. They do not synchronize
copies. Their removal/replacement belongs to later module transaction-adapter work.
The whole generated snapshot replaces the former items/mode state and memoized snapshot
factory, so unrelated edits and history restore cannot mint new snapshot timestamps.

## Automatic sizing and local restore

Source review confirms `recalculateAutomaticSSlotLengths` and
`recalculateAutomaticTBFingerWidths` are identity compatibility functions: each returns
its connection map unchanged. Automatic TB width is derived from Panel Manager thickness
in `getFingerJointPanelEdgeOperations` (three times the smaller mating thickness when not
manual); S sizing is likewise derived in the existing S readers/generators. The old App
effect therefore had no state-changing result. It is removed without adding normalization,
geometry dependencies or write-back to the owner. Existing explicit calls at Apply remain
unchanged. A focused pending-PM test verifies that connection records stay identical,
while PM Apply still produces geometry through the original automatic-size policy.

BOX local history restore publishes its existing normalized settings/assignment buckets,
all stored workflows/PM/context and complete generated snapshot as one batch. The owner
never recalculates or normalizes restored content, selects authority or implicitly
Applies geometry. No generated geometry is replayed or recomposed at restore.

Drawing keeps its 100-entry local history. BOX keeps its 10-entry stacks, call sites,
Redo branching and PM-modal restoration. Both stay mounted across navigation. Keyboard
and toolbar routing and the shared History region are unchanged. BOX Undo/Redo captures
the current snapshot **before** scheduling React stack updaters: deferred execution must
not accidentally read the root after restoration. A focused deferred-updater test and
Chromium Finish/Undo/navigate/Redo flow cover this boundary.

## Runtime lifecycle and preserved legacy limits

- SVG import now exclusively locks application interaction until success or failure,
  as explicitly approved for the PR #638 correction. The existing owner import sequence
  and monotonic BOX revision remain unchanged: external newer imports, BOX publications,
  Clear or App cleanup reject stale success/error callbacks, including an
  edit/restore-to-identical-object race. Ordinary Drawing edits and navigation are
  blocked by the UI while importing; they do not become owner-revision dependencies.
- `File.text()` itself is not cancellable; invalidated reads can retain their captured
  BOX references until settlement, but cannot publish.
- This is a narrow import guard, not the later global pending-action/attempt protocol.
  Native Open, global Clear, cross-module restores and dependency jobs are still absent.
- Drawing's current timer/gesture cleanup is retained. Remounting Drawing against the
  same owner preserves project data but creates a fresh local Drawing history, as before;
  ordinary module switching does not unmount it. Unmounting App ends the in-memory owner.
- Legacy SVG import retains connection definitions while resetting assignments/workflow/
  applied state and BOX history. Legacy BOX Clear preserves Drawing and retains the old
  reset list (including its Wall-group omission). These are existing behaviors, not a
  new global session reset contract.
- PM Apply still records its existing local snapshot before generation and calls the
  identity connection recalculators before the authority-success check. A rejected
  authority decision preserves project data but can retain that legacy history entry.
  Geometry Apply still does not create a new local history entry.
  Later BOX transaction-adapter work must review these semantics explicitly.
- Preview still combines current manufacturing settings with stored geometry. No new
  validity policy, manufacturing algorithm or deferred Arc Undo fix is introduced.

### Exclusive SVG import lifecycle

`useSvgImportLock` owns transient UI state, not project data or history. Admission stores
the owner's import token in a ref synchronously, before reading the file or scheduling
the modal. A second admission is rejected. Window capture listeners consult that same
ref to stop pointer, keyboard, input, focus and activation events before React and
Drawing's window shortcuts. This covers the selecting event before the modal commits.

A native modal `<dialog>` displays “Importing SVG…” and the wait explanation, with an
accessible name/description. The app becomes `inert`; the browser's top layer/backdrop
blocks underlying controls and contains focus. Tab/Escape/shortcuts cannot dismiss or
bypass the lock. Native modal closing restores focus. Capturing `focusout` also prevents
the modal's focus change from committing an underlying manufacturing numeric draft.
There is no cancellation control or workspace redesign.

App captures the `File` and clears the input immediately. No later cleanup writes the
input, so every outcome permits reselection without erasing a later selection. Parsing,
PM initialization, view and diagnostic preparation happen before atomic owner
publication. Accepted import keeps connection definitions and the existing PM/history
transitions; only success clears BOX history. Failure preserves the committed project
and both local histories and uses the existing error message. Stale callbacks stay silent.
`finally` releases only the matching lock after synchronous import transitions. Unmount
clears UI admission, invalidates owner imports and removes listeners; settled reads then
publish neither project nor UI updates. The owner remains the only writable project root.

This import-only policy does not implement the future pending-action protocol, global
history or general asynchronous task management. `File.text()` is still not cancellable;
a read that never settles continues to show the lock. Parsing is synchronous on the
main thread; no responsiveness/large-file latency guarantee is added.

## Performance

Publication uses structural sharing and recursively freezes newly encountered graph nodes;
a WeakSet skips previously visited branches. Initial adoption visits the complete graph,
including children of shallow-frozen snapshot factories. Changed maps require visiting
that map's entries; this is not a constant-time or large-project latency claim.
No capture/projection clone runs on ordinary project edits. A focused counter test makes
50 Drawing edits and one context edit with **zero `structuredClone` calls**, preserving
BOX source and accepted snapshot by reference. Existing local BOX history still clones its
legacy snapshot at its explicit boundaries; Apply still pays existing generator/snapshot
costs. No new history retention is added.

App subscribes to the root, as it previously rerendered on its individual project fields.
Transient pointer/hover/preview state stays outside the owner. Existing memo dependencies
keep FinalGeometry/manufacturing independent of Drawing and context changes. No universal
frame-time, memory budget or representative large-SVG benchmark is claimed; profiling
large-project retention remains required before global history integration.

## Validation

Exact commands, results and actual browser flows are recorded in the
[validation report](SHARED_PROJECT_OWNER_VALIDATION.md). Unit tests execute
the production App/Drawing adapters with the real owner and domain helpers. They include
coherent publication, same-event edits, exact local history restoration, pending/applied
state, workflow state/order, generated authority, rejected operations, import races,
immutability and structural sharing. Browser tests use real UI input without project-state
injection; they do not substitute for user acceptance after merge.

## Deferred

Stage C PR 3 and later must separately supply the transaction/history core, reviewed
Drawing/BOX adapters and global cutover. The 30-transition global target, pending-action
protocol, permanent Sketch-level operations/C.2, UI-4, native Save/Open, global Clear,
qualified identities and dependency regeneration remain future work. Multiple Sketch
records remain intact without adding New/Finish Sketch or completion versions. The
approved future Finish behavior can add separate dependency input/version ownership:
internal edits need not regenerate downstream operations, and Finish can update affected
branches in dependency order while retaining valid Sketch edits on downstream failure.
