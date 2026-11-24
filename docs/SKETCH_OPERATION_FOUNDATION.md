# Stage C.2 PR 1 — Persistent Sketch operations

## BOX source binding (Stage C.2 PR 4)

Each permanent Sketch operation can contribute zero, one or several BOX panels. The operation lifetime scopes contour and edge identity even when local Sketch or entity IDs recur. A geometric change receives a new source revision. Names, hover, zoom, opening and finishing preserve the current approval. A solved point move or addition of an open Line invalidates the approval in the same global edit as the Drawing change. Undo restores the previous Sketch, source revision, assignments, thicknesses and generated snapshot. [Geometry mapping and review](MULTI_SKETCH_UNFOLD_BOX_ARCHITECTURE.md#drawing-panel-sources)

## History and visualization

**Approved requirement. Implemented and automatically tested. Pending user browser acceptance.** PR #646 merged the editor lifetime described below. PR 3 presents `readSketchDefinitions(project)` in construction order. The row renders one button per operation ID in either workspace. It reads the current Sketch name and does not enumerate members or past transactions. The separate BOX workflow group retains PM, TB, W, S and manufacturing navigation.

History double-click, keyboard activation and the left Open selector resolve the operation ID against the live project. A neutral geometry double-click converts the client point through the Drawing viewport transform and tests resolved finite members using a screen-space tolerance. A single eligible owner opens directly. Multiple owners appear as named choices in construction order. The runtime rejects stale lifetimes and requests during editing. Coming from BOX uses the existing deliberate navigation transaction. Within Drawing, opening and finishing preserve the frame and both history stacks. Finishing settles an already accepted pending Profile segment under the ordinary edit rules.

Each operation receives an immutable `presentationIndex` at creation. Admission fills a missing index on older in-memory records while retaining the ID, revision and Drawing definition. A member edit, rename, reorder, removal of another Sketch or Undo/Redo preserves the assignment. The renderer derives the stroke and History icon color from this index modulo eight. Colors repeat on larger projects. Names and explicit overlap choices identify Sketches that share a color. No visual change adds a transaction or requires a native file format.

All reference members use the same viewport and topology resolution as the editor. Opening a Sketch makes the other reference strokes neutral grey. Their SVG surfaces remain pointer-transparent. The active Sketch uses its original CAD rendering for solving state, selection, hover, Dimensions, inference and dragging. Finish restores the individual neutral colors. [UI controls](GLOBAL_WORKSPACE_UI_SPECIFICATION.md#current-sketch-controls-stage-c2-pr-3)

## Editing context

**Approved requirement (2026-11-23).** Finish the active Sketch before deliberately switching to BOX. This supersedes unrestricted switching during unfinished Drawing authoring. Automatic workspace activation during history traversal remains available.

**Implemented and tested in PR 2. Pending user browser acceptance.** The application initially opens BOX. Entering Drawing shows the neutral grid. New projects have an empty Sketch map, empty Sketch order, null document `activeSketchId` and zero permanent operations. Clear Without Saving publishes that empty project in neutral Drawing with fresh history. Cancel preserves the editing session.

- The existing global history runtime publishes `activeWorkspace` and transient `editingSketchId` atomically with the project and cursor. Only Drawing can hold an editing target. Neither the captured project nor a permanent operation stores the open editor.
- New Sketch creates an empty record with a random local ID and a readable sequential name. The accepted transaction adds one operation through PR 1 maintenance and publishes the target in the same notification. Undoing creation removes both records. Redo restores both identities.
- Populated V2 admission still requires the stored document pointer to resolve to an ordered Sketch. It preserves all member records, including canonical circles/arcs, dimensions, constraints, extensions and existing operation lifetimes. Opening an existing definition uses a transient targeted view for CAD commands. The legacy pointer in project data can differ from the editing target. Opening and finishing preserve the full project frame, operation order, revisions and both history stacks.
- Rendering uses the shared viewBox for all Sketches. Only the active definition supplies CAD hit surfaces, selection, snap/inference candidates, dimensions and constraints. Reference geometry uses the same Line/Circle/Arc resolution functions. Neutral Drawing retains zoom, pan and the existing Fit control.
- Finish flushes an accepted pending Profile click against its original definition. A resulting segment has its ordinary Undo step. Finish releases pointer captures and discards remaining previews, unfinished numeric drafts and tool-local state. A new session binds its adapter to the target and interaction epoch. Delayed events from an earlier editor cannot write into the new one.
- Deliberate navigation checks the current runtime target before any interaction settlement. Rejection leaves the publication and Redo branch intact. Traversal restores the stored frame and module directly. It retains an open editor only when Drawing still owns the same operation lifetime. Restoring BOX or removing the target returns the editor to neutral. Restoration never reopens a closed editor. The 30-transition total capacity applies to global execution history. The current operation list grows with project Sketches.

PR 3 delivers the permanent Sketch symbols and current-definition reopening proposed at the PR 2 checkpoint. Native Save/Open, BOX transfer, cross-Sketch constraints and dependency evaluation are later work.

## PR 1 checkpoint (merged in #645)

The following sections record the PR 1 baseline. PR 2 supersedes its initial-Sketch and future-editing-control descriptions.

Each Drawing Sketch has one construction operation in the shared editable project. Lines, Profiles, Circles, Arcs, SketchPoints, Dimensions and Constraints belong to its current definition. For example, setting a Line length to 30, 50 and 70 mm produces three accepted edits with one operation ID. The bottom History row still presents the existing workspace UI.

## Identity, binding and order

`ProjectStateSource` and `ProjectStateCapture` carry `constructionOperations`, an ordered array of plain records. Each record has an opaque `id`, `kind: 'sketch'`, `kindVersion: 1`, `module: 'drawing'`, a local `sketchId` and an opaque `definitionRevision`. Both tokens use 128 random bits. The operation ID names one lifetime. The kind version identifies the record format. The revision identifies a particular admitted Sketch definition, including on divergent Undo branches. It has no numeric or chronological interpretation.

The Sketch binding resolves to `drawingDocument.sketches[sketchId]` in the **same project frame**. That record owns the name, point identities and coordinates, entity topology, dimensional targets and roles, constraints and solved results. A future member binding can qualify a local entity or Dimension ID with the operation lifetime. Current consumers can call `readSketchDefinitions(project)` for ordered, read-only operation/Sketch pairs. The array follows explicit Sketch order. Edits to a member keep its place and share untouched operation records. The model has no operation quota.

## Admission and existing data

At the PR 1 checkpoint, a new project initialized `sketch-1`. An in-memory project predating C.2 can enter the owner with its existing V2 Drawing document and BOX state. Admission checks a one-to-one correspondence between the Sketch map, local IDs and order, including a valid active Sketch. With no supplied operation list, admission allocates one lifetime for each current Sketch. With a list, it checks the supported kind/version, owner, order, unique IDs and bindings and preserves the supplied identities. An inconsistent list or unsupported operation version fails admission.

Bootstrap describes only the definitions present at admission. It creates zero Undo steps and makes no claim about past authors, dates, edit order or former values. It passes Drawing records through intact, including extension data and canonical Circle/Arc records. This boundary accepts V2 only. It performs no V1 conversion, geometry repair, solver replay or native-file loading.

## Publication and restoration

The global owner compares the complete staged Drawing document with the committed one after the outer action accepts. A replacement Sketch record with the same continuously present local ID gets a fresh revision. Identity follows the committed Sketch lifetime across renames, additions, drags and solver edits. A committed removal ends that lifetime. Subsequent insertion with the same local ID allocates a fresh operation even when geometry is identical. Undo of removal reinstalls the original capture. Future commands intending to replace a lifetime atomically must express that intent explicitly.

Both transaction adapters preserve the rest of the frame. Operation maintenance stages its result inside the existing transaction. A rejected, stale or no-op edit publishes none of its staged values. Subscribers receive the owner, frame and cursor together. Undo and Redo reuse admitted frames directly. BOX settings, SVG and applied manufacturing output retain their existing structural sharing. Workspace switches reuse the complete current frame. Eviction releases old edit frames while current definitions stay reachable from the owner. Project-wide Clear starts a fresh baseline and Sketch lifetime.

## Follow-on scope

This slice resolves Sketch grouping in Stage B decision D3 and in-memory V2 Sketch admission in D11. The November 17 decision supersedes Stage B's earlier standalone primitive operation examples. Operation-to-operation bindings, the BOX catalog, native Save/Open, cross-module transfer, regeneration and repair need separate contracts. At the PR 1 checkpoint, explicit creation, finishing and reopening on a shared canvas were the next proposed slice. Merged PR #646 implements these controls. PR 3 adds the Sketch History symbols.

## Validation

`test:project-state` checks detached capture/projection. `test:project-owner` checks exact frame restoration, current definitions after eviction, 260 ordered Sketches, lifetime reuse prevention and rejected publication. `test:drawing-transaction-adapter` exercises production Line/Circle/Arc, dimension solving, constraint changes and subscriber reads. The mounted global Chromium suite reads operation and Sketch identity on publication and checks them through real authoring, navigation, mixed Undo/Redo and project-wide Clear. The PR validation report records the broader CAD and BOX regressions and the baseline browser comparison.

### In-memory performance

Run `npm run test:project-owner` in each checkout to compile its production fixtures. From the PR checkout run `node --expose-gc tests/sketch-operation-benchmark.cjs`. From the baseline checkout run the same command with the path to the PR's benchmark. The harness resolves production modules from its working directory.

Node 24.19.0 results below are medians of nine runs after one warm-up. Each run starts with two populated Sketches, a 2 MiB addition to the SVG source and 5,000 applied output items. It publishes 128 Lines, measures live heap after explicit GC with 30 retained edit transitions, traverses that history in both directions, and then switches workspaces.

| Measurement | Main at #644 | C.2 PR 1 |
| --- | ---: | ---: |
| 128 Drawing publications | 27.37 ms | 30.64 ms |
| 30 Undos and 30 Redos | 0.147 ms | 0.204 ms |
| 10,000 workspace switches | 5.41 ms | 5.65 ms |
| Retained heap above admitted baseline | 1,314,536 bytes | 1,325,448 bytes |

The median difference for Line publication was about 0.026 ms per edit. Timing and GC ranges overlap between checkouts. These measurements cover model publication and retention. The mounted tests check browser behavior. Rendering latency and native memory were unmeasured.
