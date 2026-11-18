# Stage C PR 3 — Global transaction and history core

**Pure foundation on the task branch; review/acceptance pending. Global Undo/Redo is
not active. Stage C is not complete.** Drawing's 100-entry history, BOX's 10-entry
history, import lock, Clear/import handlers and shared History UI are unchanged.

## Baseline and architecture review

Remote `main` was verified with `git ls-remote origin refs/heads/main` on 2026-11-18
at 11:00 CET as `0488003135a49069f7088f8a9281cf00eab725de`. GitHub confirms #637
merged at `d654213d369d0f20c8be7789113830c6fabd5c19` and #638, including its
exclusive-import correction, merged at this main HEAD. A clean isolated worktree on
`stage-c-pr3-global-history-core` started at that exact baseline. The initial environment
checkout was older; it was preserved. Main has not advanced beyond the supplied baseline.

Reviewed the collaboration rules and all six central project documents, plus the
[Stage B analysis](GLOBAL_PROJECT_HISTORY_ARCHITECTURE_ANALYSIS.md),
[capture inventory](PROJECT_STATE_CAPTURE_BOUNDARY.md), [owner design](SHARED_PROJECT_OWNER.md)
and [validation](SHARED_PROJECT_OWNER_VALIDATION.md), [multi-Sketch target](MULTI_SKETCH_UNFOLD_BOX_ARCHITECTURE.md),
[product vision](PRODUCT_ARCHITECTURE_VISION.md) and [workspace specification](GLOBAL_WORKSPACE_UI_SPECIFICATION.md).
The following distinctions resolve older descriptions without inventing product policy:

- Stage B's historical owner/unmount/effect observations predate UI-1 and #638. Current
  source has one App-lifetime owner, mounted workspace shells, immutable publication
  batches and no automatic TB/S write-back effect. Drawing still owns local history;
  BOX still clones its selected local history fields and restores full generated output.
- Stage B §13 proposes a broader transaction-core slice, including identity registry and
  asynchronous pending actions. The current explicit PR 3 brief authorizes **synchronous
  pure transactions only**. Those proposed runtime protocols are deferred, not fulfilled
  by keeping a synchronous transaction handle alive across an await.
- The latest multi-Sketch decision supersedes primitive-level permanent operations.
  This core creates no permanent records. Frame identity, transaction ID and a future
  permanent Sketch-operation identity are distinct concepts.
- #638 publication batches can recover from a caught inner exception. History action
  nesting is deliberately stricter: a rejected/failed child rejects the complete logical
  action. No owner change is needed; later adapters must prepare before publishing.

Drawing's mutation/solver helpers already return accepted complete documents and use
identity for no-ops. BOX still has pre-change pushes, distinct Apply boundaries and
legacy Clear/import reset behavior. None are reclassified or migrated here. Stored
manufacturing output and composition authority remain authoritative; history traversal
never asks the current pipeline to select or recreate them.

## Data model and API

[projectHistory.ts](../src/app/projectHistory.ts) imports only the existing
`ProjectStateCapture` type. The accepted frame is exactly that contract: complete
`DrawingDocumentV2`, BOX authoritative `data` and separate restoration `context`.
`ProjectStateSource` remains the owner-facing domain model. No alternate geometry model,
project owner, React store or native schema is added.

| Public export | Contract |
| --- | --- |
| `PROJECT_HISTORY_LIMIT` | Fixed at 30 transitions. |
| `createProjectHistory(capture)` | Establish an immutable baseline with empty stacks. |
| `resetProjectHistory(capture)` | Establish a fresh timeline even for the same baseline. |
| `transactProjectHistory(history, metadata, action)` | Stage a synchronous logical action; return `{ outcome, history, frame, error? }`. |
| `undoProjectHistory(history)` | Return the exact preceding stored frame and new history, with `changed` and associated `transaction` metadata. |
| `redoProjectHistory(history)` | Return the exact undone frame and new history with the same action metadata. |
| `ProjectHistory`, `ProjectHistoryEntry` | Read-only current frame and oldest-first Undo/Redo entry arrays. Each entry pairs one frame with the action it reverses/reapplies. |
| `ProjectTransactionMetadata` | Caller-supplied `id`, edit-associated `module` (`drawing`/`box`) and `label`; no clock, generated IDs, callbacks or operation records. |
| `ProjectTransaction`, `ProjectTransactionAction`, `ProjectTransactionDecision` | Callback scope with `getCandidate()`, `update(change)` and `nest(action)`; decision is `accept`, `reject` or `noop`. |
| `ProjectTransactionOutcome`, `ProjectTransactionResult`, `ProjectHistoryRestore` | Explicit result types; failures preserve the input history, with an exception diagnostic when applicable. |

Metadata describes the edit's module, not the visible tab. Traversal returns it for a
future navigation adapter; the core cannot activate a workspace. The caller assigns
action IDs within its future session; the core does not supply an identity registry,
concurrency token or permanent operation identity.

## Transactions, nesting and rollback

A callback begins against `history.current`. `update` supplies a **complete** next
capture, protecting it immediately from subsequent candidate mutations. Callers can
compose captures by replacing an affected Drawing/BOX subtree while retaining all
unchanged immutable subtrees. Existing capture/projection helpers remain available:

```ts
const history = createProjectHistory(captureProjectState(source));
const result = transactProjectHistory(history,
  { id: 'edit-1', module: 'drawing', label: 'Edit Sketch' }, tx => {
    tx.update(frame => ({ ...frame, drawingDocument: captureDrawingState(nextDocument) }));
    return 'accept';
  });
// result.frame is data only. No owner publication occurs here.
const detachedWorkingSource = projectProjectState(result.frame);
```

The example uses a previously prepared, domain-validated `nextDocument`; the history
core does not solve, generate or validate CAD intent. Projections create independent
mutable working data. A future hot-path adapter should replace affected captures and
share unchanged data, rather than call whole-project capture/projection for every edit.

| Callback result | Effect |
| --- | --- |
| `accept`, with a different protected candidate root | Commit one transition at the outermost scope, preserve the whole before frame, clear Redo. |
| `accept`, with the identical root | No-op; return the original history object. |
| `noop` | Discard all staging in that scope; preserve history and Redo. A child noop returns to its savepoint. |
| `reject` | Discard the entire outer action. Child rejection is sticky even if its result is ignored. |
| Thrown exception, including an updater failure | Return `rejected` plus the first error, discard the entire outer action, preserve history/Redo. An ignored child exception cannot partially commit. |

Accepted nested scopes stage data without appending entries. The outer scope alone
can commit: many internal Drawing/BOX updates still create one Undo step. An outer
noop/reject discards accepted children. Scope methods throw after the scope closes or
after failure, preventing late use of leaked handles. The API accepts no asynchronous
callbacks; invalid/Promise decisions are rejected. Exceptions from external side effects
cannot be undone: callbacks must only prepare project data and must not publish to the
owner, invoke setters, schedule work or modify external state.

**No-op contract:** the adapter decides whether a meaningful accepted domain change
occurred. Return `noop` for semantic equality, navigation, failed previews or unaccepted
drafts. Root identity is an additional reliable shortcut. A distinct newly allocated
equal-valued root accompanied by `accept` is trusted as a change; there is no deep tree
equality, serialization or generated-timestamp comparison. Accepted Circle/Arc policies
are not modified. A stage-then-return-to-original-root action also produces no entry.

Future Option A downstream failure is not necessarily a rejected transaction. A valid
source plus explicit failed/blocked downstream statuses can be one **accepted coherent
frame**; future evaluators must handle expected regeneration failures accordingly.
Uncaught exceptions and explicit transaction rejection mean atomic action failure here.
Finish Sketch and any async pending/finalize/suspend/resume semantics remain future work.

## Traversal, capacity and branching

Undo pops the last Undo entry, returns its frame verbatim and places the former current
frame on Redo with the same transaction metadata. Redo performs the inverse. There is
no capture, projection, solver, SVG parser, snapshot factory, authority selection,
geometry regeneration, Panel Manager reapplication or manufacturing recomposition in
either path. IDs, generated timestamps, operations and even an absent legacy composition
marker survive unchanged. Undo/Redo do not call the transaction callback or add an action.
Unavailable traversal returns the identical input history and frame, `changed: false`
and `transaction: null`.

At every reachable state, `undo.length + redo.length <= 30`. A full timeline has 31
reachable endpoints: current plus 30 transitions. Moving between stacks preserves that
total. Appending after Undo first drops the old Redo branch, then appends to Undo and
evicts the oldest entry if necessary. Overflow retains the oldest reachable endpoint
of the remaining 30 transitions. Rejection and no-op preserve both stacks by identity.
Old immutable histories remain usable by their callers; the core neither retains nor
mutates them. Callers must release obsolete histories if they want evicted data collected.

## Frame ownership, memory and performance limits

Accepted frames and history containers are deeply read-only in TypeScript and frozen
at runtime. The core recursively audits an incoming plain object/array graph. Fully
frozen subtrees can be shared once their descendants are proven immutable. Mutable
nodes are copied into frozen private nodes; caller data is never frozen in place.
An initially shallow-frozen root with mutable descendants is copied as needed, so it
cannot smuggle mutable geometry into a stored frame. Aliases within the current domain
graph survive, including SVG contour aliases. Input is supported in-memory plain project
data, not an untrusted-file validation boundary or a general JavaScript object serializer.

A weak cache remembers only proven immutable nodes. It holds no project/history roots,
is not a second owner and does not change transaction results. Mutable source identities
are never cached. Subsequent composed updates visit changed paths and skip unchanged
proven nodes. Every accepted mutable candidate is detached before later staging or
external mutation can affect it. Undo/Redo retain stored frame references directly.

Thirty independently replaced large projects can approach **31 × project data size**.
With sharing, retained data is approximately one baseline plus changed allocations for
the retained actions and small entry metadata. The 30-transition count is not a byte
budget. Initial capture/audit is O(project size), including an initial traversal and
temporary copy allocations for already-frozen incoming graphs. Changed maps still cost
their number of entries; updating a mutable whole-project projection still copies it.
No persistence, compression, patches, workers or new state library are introduced.

The focused synthetic test uses a large SVG string and 5,000 generated items, then
30 Drawing edits and one BOX setting edit. It asserts identical source/output references
and zero `structuredClone` calls during those edits. This proves isolation/sharing in
that case, **not measured large-project latency or heap scalability**. Profile real
projects, transient candidates and retained memory before runtime integration.

## Lifecycle and remaining PR 4–7 work

Initialization/reset simply chooses a complete new baseline and empties both stacks.
Future successful native Open and approved whole-project Clear should use a fresh
timeline; failure/cancel must preserve the previous one. The core does not decide save
confirmation, create session epochs or invalidate async callbacks. SVG import is a BOX
source edit with separately reviewed future semantics, not native Open. No current
Clear/import handler changes. Ordinary module/history-panel navigation never calls a
state-changing transaction and cannot destroy Redo.

Following the supplied Stage C sequence, remaining PR 4–7 integration must separately
cover Drawing and BOX adapters, coherent owner publication/restoration, toolbar/keyboard
cutover, transient-interaction and lifecycle barriers, and integration/regression
validation. Those slices must preserve same-event Drawing/Profile behavior, characterize
BOX numeric/Apply acceptance, reject stale work, retain original SVG/stored authority,
activate the edit-associated module, and remove local execution ownership only at the
reviewed cutover. They must reserve/design asynchronous action lifetimes before claiming
Stage B's full tape-recorder contract. Exact later PR scopes require their own tasks.

Permanent construction operations/C.2 and UI-4, native Save/Open, New/Finish Sketch,
multi-Sketch interaction, Drawing-to-BOX transfer, dependency regeneration, 3D/Unfold and
new manufacturing algorithms are excluded. Future operation data can coexist in the
project contract without making each primitive edit a permanent top-level operation.
The existing Arc empty/blind Undo limitation and all accepted CAD semantics are unchanged.

Validation commands/results and browser limitations are recorded in
[GLOBAL_HISTORY_CORE_VALIDATION.md](GLOBAL_HISTORY_CORE_VALIDATION.md).
