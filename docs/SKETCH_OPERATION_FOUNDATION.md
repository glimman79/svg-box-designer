# Stage C.2 PR 1 — Persistent Sketch operations

Each Drawing Sketch has one construction operation in the shared editable project. Lines, Profiles, Circles, Arcs, SketchPoints, Dimensions and Constraints belong to its current definition. For example, setting a Line length to 30, 50 and 70 mm produces three accepted edits with one operation ID. The bottom History row still presents the existing workspace UI.

## Identity, binding and order

`ProjectStateSource` and `ProjectStateCapture` carry `constructionOperations`, an ordered array of plain records. Each record has an opaque `id`, `kind: 'sketch'`, `kindVersion: 1`, `module: 'drawing'`, a local `sketchId` and an opaque `definitionRevision`. Both tokens use 128 random bits. The operation ID names one lifetime. The kind version identifies the record format. The revision identifies a particular admitted Sketch definition, including on divergent Undo branches. It has no numeric or chronological interpretation.

The Sketch binding resolves to `drawingDocument.sketches[sketchId]` in the **same project frame**. That record owns the name, point identities and coordinates, entity topology, dimensional targets and roles, constraints and solved results. A future member binding can qualify a local entity or Dimension ID with the operation lifetime. Current consumers can call `readSketchDefinitions(project)` for ordered, read-only operation/Sketch pairs. The array follows explicit Sketch order. Edits to a member keep its place and share untouched operation records. The model has no operation quota.

## Admission and existing data

A new project initializes the existing `sketch-1`. An in-memory project predating C.2 can enter the owner with its existing V2 Drawing document and BOX state. Admission checks a one-to-one correspondence between the Sketch map, local IDs and order, including a valid active Sketch. With no supplied operation list, admission allocates one lifetime for each current Sketch. With a list, it checks the supported kind/version, owner, order, unique IDs and bindings and preserves the supplied identities. An inconsistent list or unsupported operation version fails admission.

Bootstrap describes only the definitions present at admission. It creates zero Undo steps and makes no claim about past authors, dates, edit order or former values. It passes Drawing records through intact, including extension data and canonical Circle/Arc records. This boundary accepts V2 only. It performs no V1 conversion, geometry repair, solver replay or native-file loading.

## Publication and restoration

The global owner compares the complete staged Drawing document with the committed one after the outer action accepts. A replacement Sketch record with the same continuously present local ID gets a fresh revision. Identity follows the committed Sketch lifetime across renames, additions, drags and solver edits. A committed removal ends that lifetime. Subsequent insertion with the same local ID allocates a fresh operation even when geometry is identical. Undo of removal reinstalls the original capture. Future commands intending to replace a lifetime atomically must express that intent explicitly.

Both transaction adapters preserve the rest of the frame. Operation maintenance stages its result inside the existing transaction. A rejected, stale or no-op edit publishes none of its staged values. Subscribers receive the owner, frame and cursor together. Undo and Redo reuse admitted frames directly. BOX settings, SVG and applied manufacturing output retain their existing structural sharing. Workspace switches reuse the complete current frame. Eviction releases old edit frames while current definitions stay reachable from the owner. Project-wide Clear starts a fresh baseline and Sketch lifetime.

## Follow-on scope

This slice resolves Sketch grouping in Stage B decision D3 and in-memory V2 Sketch admission in D11. The November 17 decision supersedes Stage B's earlier standalone primitive operation examples. Operation-to-operation bindings, the BOX catalog, native Save/Open, cross-module transfer, regeneration and repair need separate contracts. New Sketch, Finish Sketch, multiple visible Sketches, reopening and History row symbols remain future work. The next proposed slice is explicit Sketch creation and finish at the Drawing transaction boundary, with the active editing context defined before UI-4.

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
