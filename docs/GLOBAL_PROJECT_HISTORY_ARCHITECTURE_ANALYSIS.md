# Global Project & History Architecture Analysis — Stage B

**Status: REVISED ANALYSIS / PROPOSAL FOR REVIEW. Approved product decisions are identified
separately from technical recommendations; the complete Stage B architecture is not approved.**

Repository: `glimman79/svg-box-designer`. Source baseline:
`97469bd8274edae335254188dc8805f1141dc874`.
Investigation date: 2026-11-05; product-decision revision: 2026-11-09.
No application implementation, refactoring, test change,
native persistence, dependency propagation, or roadmap-status change is included.
This revision also synchronizes the narrowly affected architecture/roadmap requirements
and records which earlier decisions it supersedes (§2).

## 1. Executive summary

Recommend a **single project owner with immutable, complete restorable project frames,
one 30-transition Undo/Redo buffer, and separate semantic history metadata**. This is
Alternative C below: a snapshot-based hybrid, initially without inverse commands or
event replay. Preserve the current Drawing and BOX models inside module boundaries;
move ownership and transaction orchestration rather than rewrite CAD mathematics.

The source reasons are concrete:

- Drawing already returns complete candidate documents, including solved geometry,
  Dimensions, Constraints, points and entity identities. Its current history stores
  immutable document roots and commits successful edits once (`S03`–`S09`).
- Drawing history belongs to the conditionally mounted `DrawingWorkspace`; its document
  and viewBox belong to `App`. History is recreated on return while the document survives.
  This is an architectural limitation relative to the future target (`S01`, `S03`, `S04`).
- BOX history lives in `App`, clones selected construction state, and restores stored
  generated output with its composition model. It excludes the imported/source model,
  Drawing and active workspace. Wrapping that existing `HistoryState` alone would still
  omit part of a complete project (`S02`, `S10`, `S11`).
- Neither current panel is a global operation timeline. The future panel needs operation
  identity, durable object references and navigation independent of snapshot restoration
  (`S12`, [approved panel contract](PRODUCT_ARCHITECTURE_VISION.md#31-interactive-history-panel)).

**No current functional defect was found or confirmed in the user's Drawing Undo/Redo
testing.** PR #628 corrects the earlier classification; this investigation does not
claim exhaustive action coverage. The accepted rare Arc empty/blind Undo limitation
remains separately deferred and unfixed. Accepted Circular Support Stages 0–6 stay closed.

The proposal makes four responsibilities explicit:

| Responsibility | Proposed owner and behavior |
| --- | --- |
| Undo/Redo execution | Project transaction core restores verified before/after frames and activates the affected edit's module from metadata; no solver replay. |
| History-panel navigation | Reference resolver plus UI navigation locate current objects/settings without moving the Undo cursor or pruning Redo. |
| Object selection/settings | Per-module UI adapters select existing semantic objects and show current settings; missing targets remain missing. |
| Dependency propagation | Future Stage E plans affected updates/conflicts and commits their outcomes through the same transaction core. |

Keep **30 reversible committed project-editing transitions**, independent of lightweight
panel metadata. Ordinary module switching and history-panel double-click are navigation:
neither creates a transition, moves the history cursor nor clears Redo. Undo/Redo restore
the latest edit's complete before/after project and open that edit's associated module.
Only a newly committed edit after Undo abandons Redo; navigation never does.

**Approved product decisions (2026-11-09):** Clear is a permanent, project-wide session
reset with Save and Clear / Clear Without Saving / Cancel; a failed or cancelled save
leaves the project untouched. Native Open restores complete editable content into a fresh
Undo/Redo session. History snapshots are not restored from disk. Journal retention and
serialization, UI preferences, interruption details and technical design still require
review. No native file extension or final container format is selected here.

Classification used throughout:

| Label | Meaning |
| --- | --- |
| **FACT** | Verified source or existing acceptance record at the named baseline; source inspection is not browser acceptance. |
| **LIMITATION** | Verified architectural boundary relative to an approved future requirement. |
| **REQUIREMENT** | Approved future product contract; implementation may not exist. |
| **PROPOSAL** | This report's technical recommendation, awaiting review. |
| **DECISION** | Product policy or architecture approval still required; alternatives are stated. |
| **FUTURE** | Interface/algorithm responsibility belonging to a later authorized stage. |

## 2. Verified repository baseline

### Baseline and isolation evidence

**FACT.** Fresh `git ls-remote --heads origin main` returned
`97469bd8274edae335254188dc8805f1141dc874` on 2026-11-05 at 20:37:00 UTC
(21:37:00 Europe/Stockholm). The remote is
`https://github.com/glimman79/svg-box-designer.git`. This is remote evidence, not an
assumption based on a local `origin/main`.

GitHub PR records were read through the connected GitHub tools:

| PR | Verified state | Merge commit | Included in the inspected main |
| --- | --- | --- | --- |
| [#627](https://github.com/glimman79/svg-box-designer/pull/627) — product architecture vision | `merged: true`, closed; merged 2026-11-04 13:43:57 UTC | `8630f40d31c7c7e71cab3d7cce7ac6673648c4b9` | Yes; `git merge-base --is-ancestor` succeeds. |
| [#628](https://github.com/glimman79/svg-box-designer/pull/628) — Drawing Undo/Redo correction | `merged: true`, closed; merged 2026-11-04 14:09:09 UTC | `97469bd8274edae335254188dc8805f1141dc874` | Yes; this is the verified main HEAD. |

Original investigation evidence (2026-11-05): checkout `/workspace/svg-box-designer`,
branch `work`, clean at that SHA.
New isolated worktree: `/workspace/work/svg-box-designer-stage-b`.
New branch: `docs/stage-b-global-project-history`.
Immediately before the first document edit, `HEAD` matched the verified SHA,
`git status --porcelain=v1 --untracked-files=all` was empty, and the task branch was
confirmed. That original brief authorized the analysis and index link only.

Revision evidence (2026-11-09): existing PR #629 is open on
`docs/stage-b-global-project-history`, head
`c79ed1a33b7fef46aa9cf3e662e2cc27383562a3`. The clean task checkout at
`/workspace/svg-box-designer` was switched to that exact fetched head. Fresh
`git ls-remote --heads origin main docs/stage-b-global-project-history` confirmed the
PR head and unchanged main `97469bd8274edae335254188dc8805f1141dc874` before editing.
The current uploaded task authorizes revisions on this existing branch plus tightly
scoped consistency updates, commit and PR delivery; no application work or merge.

### Conflicts resolved by the current product decisions

| Earlier document / recommendation | Conflict and scoped resolution |
| --- | --- |
| PR #627 vision §3, Project Master §2.1, Architecture target table, Roadmap B/C, README, historical Dimension notice | Required module switches in history and a 10–30 range with 30 as target. Current requirement is exactly 30 reversible committed edits; ordinary navigation is separate, preserves Redo and costs no steps. Updated current requirements and examples. |
| Original Stage B §§7–8 and D1/D2 | Active module embedded in every frame, reversible switches and a special reveal override could consume history, prune Redo or restore an obsolete module. Replaced with UI-owned navigation and edit-associated restore metadata. |
| Original Stage B D5; PR #627 Clear contract left recovery unresolved | Undoable Clear conflicts with the explicit permanent reset. Replaced with the three-outcome save workflow and async/session safeguards (§10). |
| PR #627 persistence registers; original Stage B D5/D6 | Session-only execution history was only a proposal; serializing Undo remained open. Native Open must now start a fresh baseline, without prior snapshots. Descriptive journal persistence remains a separate open decision. |
| Project History §11.27 and the 2026-11-03 Changelog entry | Historical module-switch requirements and persistence questions are retained as dated evidence, explicitly marked superseded and linked to the new decision record. |

These are explicit product changes, not approval of all Stage B interfaces. Unrelated
requirements, pipeline/CAD evidence and A–G status labels are preserved.

### Authorities and status constraints

Read the repository collaboration rules in
[REGLER_FOR_CHATT_MED_CHATGPT.md](../REGLER_FOR_CHATT_MED_CHATGPT.md), and reviewed the
required central documentation: [Project Master](../PROJECT_MASTER.md),
[Project History](../PROJECT_HISTORY.md), [Changelog](../CHANGELOG.md),
[Architecture](../Architecture.md), [Roadmap](../ROADMAP.md),
[Product Architecture Vision](PRODUCT_ARCHITECTURE_VISION.md), and the historical
[Drawing Dimension analysis](DRAWING_DIMENSION_ARCHITECTURE_ANALYSIS.md).
[README](../README.md) and the [documentation index](README.md) supply orientation.
Current ownership and behavior below were then checked against source and relevant tests.

The [approved flow](PRODUCT_ARCHITECTURE_VISION.md#2-connected-modules-and-optional-workflows)
is optional **3D Modeling → 2D Drawing → BOX or Puzzle**. Drawing can start independently;
BOX remains independently usable. BOX and Puzzle are parallel destinations. No module
must manufacture an upstream document merely to make the project valid.

The [A–G roadmap](../ROADMAP.md#4-connected-product-development) remains unchanged.
This report supplies a Stage B review artifact; it neither marks Stage B implemented
nor starts A, C, D, E, F or G. Product stages A–G are separate from the accepted
Circle/Arc migration Stages 0–6.

The historical Dimension analysis §16 proposed separate Drawing history. Its dated
supersession notice explicitly prevents treating that as the future architecture.
Its atomic-dimension/geometry and transient-preview principles remain useful evidence;
its original claims that Drawing history/solver were absent are historical, not current.

## 3. Current state-ownership map

### Mounting and lifetime

**FACT (`S01`, `S03`).** `App()` remains mounted while its conditional JSX either renders
`DrawingWorkspace` or the inline Construction section. Construction is not a separate
state-owning workspace component. Switching to Drawing removes Construction's rendered
section, but its React state remains in `App`. Switching away from Drawing unmounts the
component and destroys its local state/refs. `selectWorkspace()` simply returns the
requested supported workspace; Puzzle requests retain the current workspace. It does
not transact, migrate documents, or record navigation.

| State category | Current owner, update and lifetime | Persistent project? **PROPOSAL** | Global Undo/Redo? **PROPOSAL** | Transient/session boundary |
| --- | --- | --- | --- | --- |
| Active workspace | `App.activeWorkspace`, `useState`; selector calls `setActiveWorkspace(selectWorkspace(...))`; survives switches | Optional disk preference, undecided | No navigation steps; excluded from editable snapshots | UiSession owns active module; Undo/Redo explicitly open the affected edit's module (§8). |
| Drawing document | `App.drawingDocument`; `DrawingWorkspace.setDocument` after immutable model transaction; survives unmount | Yes, full `DrawingDocumentV2` | Yes, whole coherent document changes | Never infer it from rendered SVG. |
| Drawing sketches, active sketch, entity/point/order maps, Dimensions and Constraints | Inside `DrawingDocumentV2`; model helpers replace paths; survive switches with document (`S05`) | Yes; retain current activeSketchId initially | Yes as document data | Future multi-sketch navigation policy may separate active-sketch preference deliberately. |
| Drawing Undo/Redo | `DrawingWorkspace.historyRef`, empty on mount; historyRevision rerenders capabilities; lost on unmount | Session-only execution history; fresh baseline on native Open | Replace ownership with one project buffer | Never keep a second execution authority after cutover. |
| Drawing viewBox | `App.drawingViewBox`; passed `setViewBox`, pan/wheel/Fit; survives unmount | Optional saved view preference | No by default | Session view; Fit currently resets `initialDrawingViewBox`, not bounds-based fit. |
| Drawing selection | Local `selectedGeometry`, selected Dimension/Constraint IDs; updates via selection handlers; reset on unmount and explicitly cleared by Undo/Redo | Optional preference; omit by default | No independent selection steps | Validate retained selection against restored document. |
| Drawing tool lifecycle and drafts | Local toolLifecycle, segment/Circle/Arc interactions, Dimension acquisition/editor text; recreated on mount | No | No preview/draft steps | `App.drawingActiveTool` is a toolbar mirror via custom event, not canonical tool state. |
| Drawing interaction sessions | Local geometryDrag/dimensionDrag/boxSelection refs and state, pending Profile timer, snap/inference/cursor evidence | No | Only accepted result, once | Cancel/release/invalidate at navigation/restore boundary; preserve accepted-click ownership. |
| Constraints-panel UI | Open flag in `App` survives; position/drag in Drawing are lost on unmount | Optional UI preference | No | Opening/moving panel does not author geometry. |
| BOX source | `App.svgModel: SvgDocumentModel`; empty-document creation or SVG parse/set; survives switches | **Yes**, original content/root data plus parsed panels/edges | **Yes in future full project**, although omitted by current HistoryState | New import replaces BOX source, not a native Open. |
| BOX connection semantics | `App.connections`, edgeAssignments; helpers and setters; survive switches | Yes | Yes | Labels such as TB1 are current keys, not guaranteed eternal identities. |
| BOX Panel Manager | `App.panelManager`; thickness/defaults and isApplied/isDirty; survive switches | Yes, including state needed to resume authoring | Yes | Modal visibility, selected panel/hole are UI. |
| BOX workflows | active/completed TB and Wall groups, active S group, workflowGroupOrder in `App`; survive switches | Yes initially; preserve resumable semantic grouping | Yes | Do not strip group fields because their names sound like UI. Audit semantic use first. |
| BOX manufacturing settings | `App.projectSettings`, lastAppliedManufacturingSettings; normalize updates; survive switches | Yes | Yes | `selectedProfileOffsetIds` are manufacturing targets, **not incidental selection** (`S15`). |
| Applied generated BOX result | generatedGeometryItems + generatedGeometryCompositionModel; Apply selects authority; restore copies stored output | Yes for current resolved output/semantics | Yes, with source/settings | Stored applied snapshot is an authority-bearing artifact, not an expendable preview cache. |
| BOX FinalGeometry and compensated preview | `App.useMemo` from source, stored generated snapshot and settings | Rebuildable caches, normally omit | Recompute from restored authority, no own steps | Must preserve semantic metadata and compensation order. |
| BOX edge/connection inspection and assignment target | selectedEdgeId, displayConnectionId, assignmentTargetConnectionId in `App`; survive switches; currently included in snapshots | Disk preference undecided | Initially retain contextual restoration for parity, no separate selection entries | Assignment target affects the next authoring action; distinguish it from display-only selection. |
| BOX panel/hole selection, expanded groups, active tool, dialogs | `App` UI setters; survive switches while App lives; not all in HistoryState | No required editable content | No independent entries | Restore currently derives PM-modal visibility, not all UI state. |
| Canvas dimensions and platform handles | Drawing local viewport/CTM/DOM refs; BOX viewport size/DOM refs in App | No | No | Re-measure on mount; DOM refs/events/timers must never enter project data. |
| 3D camera and module state | No current 3D Modeling module | Future editable document plus optional camera preference | Future edits yes; camera motion no by default | Kernel/rendering/camera architecture not selected. |
| Puzzle document | No implementation; disabled selector | Future document, independently optional | Future edits yes | No BOX dependency is implied. |

All current state is in memory; survival across workspace switching does not imply
survival across reload. Native Save/Open is absent.

### Derived geometry and identity facts

Drawing rendering uses `geometryDrag?.candidate ?? document`; candidate previews are
local, and committed geometry is resolved from persistent point/entity IDs (`S04`, `S07`).
Constraint rank, DOF, glyphs and annotation geometry derive from canonical documents.
Runtime `DrawingEntityEquation` contains residual functions and must not be serialized
as user Constraints (`S08`).

BOX creates `generatedGeometrySnapshot` in `useMemo`, then builds `finalGeometry`, then
compensation. `restoreGeneratedGeometrySnapshot()` clones stored generated items and
restores `panelCompositionModel`; it does not re-run the authority selector (`S10`, `S11`).
Snapshot metadata defaults revision inputs to 1 and includes a creation timestamp.
These fields are not an existing globally monotonic project revision or object registry.
Fresh timestamps must not make otherwise unchanged operations appear meaningful.

Current references are string IDs in module-local structures, not pointers to live React
objects. Drawing has stable SketchPoint/entity references, legacy Line endpoint references
and datums. Creation uses both UUID-based helpers and time/component-sequence entity IDs
(`S05`, `S06`). SVG import assigns `edge-N` and `panel-N` by discovery order (`S13`),
and connection labels can be reused. Generated profile IDs encode tool/connection/panel/
source-edge identity; element IDs include tap order (`S14`). These are useful within
their current scope, not proof of stable identity across reimport, deletion/recreation
or topology-changing regeneration.

## 4. Current Undo/Redo implementation analysis

### Drawing

**FACT (`S03`, `S04`).** `DrawingHistory` is `{ undo: readonly DrawingDocumentV2[],
redo: readonly DrawingDocumentV2[] }`. `DRAWING_HISTORY_LIMIT = 100`.
`transactDrawingDocument(history, current, update)` calls `update(current)`; if the same
root returns, nothing changes. Otherwise it appends current to bounded Undo, clears
Redo and returns next. This is snapshot history, not commands; there are no semantic
operation IDs, labels or timestamps in this buffer. It trusts immutable model helpers;
the history function does not deep-clone or solve.

Undo pops the newest prior document, pushes current onto Redo, and returns the prior
root. Redo pops its newest root, appends current to bounded Undo, and returns that root.
The normal reachable Redo stack is bounded by the available Undo sequence even though
the Undo function does not separately slice it. Workspace `transactDocument()` updates
`documentRef` synchronously before calling React's setter. This matters for a second
accepted placement in the same browser event, before a new render (`S06`).

| Action | Current transaction boundary and evidence |
| --- | --- |
| Line/Profile | A valid completed segment calls appendEntityToActiveSketch once, including accepted topology and automatic semantics. Profile has one entry per completed segment, not one per whole chain. First click/preview are not document history. |
| Pending Profile click | 220 ms boundary separates single click from finishing double-click. Prior accepted segment flushes before same-tool continuation; timer ownership prevents duplicate/stale commit. Unmount cleanup cancels pending work. |
| Circle/Arc creation | Successful canonical draft append and automatic relations enter one document replacement. Authoring control/form points are not persisted merely because they were used. |
| Geometry Direct Manipulation | Pointer-down stores startDocument; pointer moves solve from start geometry plus total delta. A valid candidate is displayed locally; a failed trial retains the previous candidate. Pointer-up commits once if threshold exceeded and candidate root differs. |
| Invalid final pointer | Workspace currently retains last valid candidate. This is the existing R2 area; this report neither changes nor declares its policy resolved. |
| Dimension annotation drag | Local previewPlacement; finish produces one placement mutation. Equal placement returns original document in moveDimensionPlacement. Cancel/lost capture does not commit. |
| Dimension value edit | UI parses input, calls solveDrawingDimensionEdit; failure shows error; success transacts returned document containing target and solved coordinates together. |
| Constraint editing | applyDrawingConstraint creates/solves a candidate, returning original document on rejected/unsatisfied creation; successful whole result enters transactDocument. Radius/Diameter creates shared CIRCULAR_SIZE Dimensions, not a separate radius-constraint model. |
| Delete | Entity removal and orphan/dependent Dimension/Constraint cleanup use model helpers in one document replacement; deleting a Dimension keeps solved geometry rather than rerunning old intent. |
| Selection/pan/zoom/panel motion | UI setters, outside document history. Undo/Redo explicitly clear selected geometry/Dimension/Constraint and Dimension editor/error. Do not infer that these functions alone reset every transient tool/drag field. |

Keyboard Ctrl/Cmd+Z and Ctrl/Cmd+Y are registered inside Drawing, skip INPUT targets,
and call the same local Undo/Redo functions. The toolbar receives callbacks/capabilities
through `onHistoryControllerChange`, reset to null on unmount. `HistoryControls` is
presentation-only (`S04`, `S16`). Sharing that component does not share history ownership.

**LIMITATION.** New root identity is the generic change detector; it is not a universal
semantic/no-op test. The separately accepted Arc empty/blind step remains deferred.
The future transaction core must not introduce a broad coordinate-rounding tolerance
or change solver behavior under the guise of deduplication.

### BOX / Construction

**FACT (`S02`).** `HistoryState` in `src/App.tsx:135–152` includes manufacturing settings,
assignments, connections, inspection/assignment IDs, generatedGeometrySnapshot, active/
completed workflow groups, order, and Panel Manager. It excludes svgModel, Drawing,
activeWorkspace, both canvas views and several UI fields. `cloneHistoryState()` uses
structuredClone for nested mutable data; `maxHistoryEntries = 10`.

`pushUndoState()` captures current construction state before a caller's setters and
clears Redo. Undo/Redo move current snapshots between bounded stacks and call
`restoreHistoryState()`. Restore normalizes settings/assignment buckets, restores the
stored generated result/composition marker, workflow/Panel Manager data and context IDs,
and derives PM-dialog visibility. There is no general after-candidate transaction API.

Important source distinctions, **not newly reproduced functional-defect claims**:

- Connection/workflow/property handlers place pushUndoState at explicit call sites.
  Numeric settings updates push per handler invocation; there is no generic continuous
  edit-session coalescer (`src/App.tsx:1632–1644`).
- `applyPanelPaths()` validates, generates, chooses authority, and publishes output;
  it does **not** itself call pushUndoState (`src/App.tsx:1446–1490`).
- `applyPanelManager()` pushes before generation/authority resolution and sets connections
  before the authority success check (`src/App.tsx:1598–1625`). This ordering needs
  characterization before moving to an atomic candidate boundary; it is not evidence
  that a user has reported a current PM failure.
- An effect recalculates automatic TB finger widths and S lengths after relevant state
  changes, including while the Construction section is hidden (`src/App.tsx:718–748`).
  A future root restore must not allow follow-up effects to silently alter an old frame.
- SVG import and Construction Clear reset local stacks. Source replacement is not
  reversible through current HistoryState, and Clear does not clear Drawing. The present
  Clear function's reset list is not a complete future project schema (`S17`).
- There is no BOX geometry drag-to-history path comparable to Drawing in the inspected
  handlers. Pan/zoom are view changes. BOX continuous property inputs require their own
  grouping assessment; borrowing Drawing's grip model would be inappropriate.

### Existing evidence and its limits

Reviewed tests assert Drawing segment transaction counts, first-click/preview/cancel
behavior, 100-entry retention, branch clearing, atomic Dimension/geometry restoration,
drag history round trips and canonical identity (`T01`–`T06`). Some checks inspect source
strings; some execute model functions; `drawing-history-controls` also uses a small
local stack demonstration rather than exercising a mounted global store. These are
useful foundations, not cross-module implementation tests.

BOX's authority-restore diagnostic checks stored output/composition marker, slots,
references, FinalGeometry and manufacturing equivalence (`T07`). It does not establish
that current history contains the full project. No global module-switch/panel-retention/
native-file round-trip implementation test exists for these unimplemented features in
the inspected test paths.

Recorded Stage 6 results are historical: 136/136 inventory, 56/56 Drawing/CAD, 12/12 d2
and production build PASS after #623–#625. Browser acceptance was reported by the user.
Those tests/build/browser cases were **not rerun for this analysis**.

## 5. Confirmed limitations versus unconfirmed defects

| Classification | Finding | Implication |
| --- | --- | --- |
| FACT / accepted working behavior | PR #628 says no current Drawing Undo/Redo functional defect was confirmed during user testing. | Preserve behavior; do not resurrect #627's superseded issue classification. |
| LIMITATION | Two owners, limits 100 and 10, incomplete module coverage. | Neither can become global merely by routing the same buttons differently. |
| LIMITATION | Drawing history disappears on conditional unmount; App retains its document. | History ownership must outlive module views. This is source-derived, not a fresh browser reproduction. |
| LIMITATION | No project-level atomic restore or global edit routing. | Module switching correctly needs no history entry; cross-module Undo/Redo still needs one project orchestration boundary that opens the affected edit's module. |
| LIMITATION | BOX snapshot omits source model; source replacement resets history. | Full project restoration requires additional state, not just an enlarged stack limit. |
| LIMITATION | Current panels are workflow navigation/explanatory text, with no global operation identity. | Metadata and object-resolution design are required independently of Undo storage. |
| LIMITATION | No native Save/Open or cross-module dependency graph. | Existing schema/restore helpers are prerequisites, not implemented end-to-end features. |
| Accepted deferred limitation | Rare Arc empty/blind Undo remains unfixed; R1–R3 retain open status. | Characterize and preserve status; do not promise migration fixes it. |
| Unconfirmed | Exhaustive Undo/Redo coverage of every action and exceptional interleaving. | New characterization is proposed in §14; absence of proof is not proof of breakage. |
| Source-observed migration hazard | BOX pre-change pushes/effect synchronization and ungrouped setters. | Design atomic adapters and tests; do not label all current BOX history defective. |

## 6. Architecture alternatives and comparison

All alternatives can share a central project model and stable references. A storage
mechanism alone does not provide atomicity, correct identity, persistence or a useful
history panel. The comparison assumes equal CAD-validation requirements.

| Criterion | A — complete global snapshots | B — reversible commands/events | C — snapshot-based hybrid with semantic transactions |
| --- | --- | --- | --- |
| Implementation complexity | Moderate ownership work; low execution logic; metadata must be added for the panel. | High: commands, inverse payloads, ordering, versioning and replay contracts for all current mutation paths. | Moderate: A's restore core plus explicit transaction/result/metadata contract; no inverse CAD logic initially. |
| Existing code compatibility | Strong for Drawing; BOX needs complete source and consolidated capture. | Weak initial fit: solver and generators return complete outcomes, not inverse operations. | Strong: consume existing outcomes; annotate them at user-action boundaries. |
| Memory | Deep copies cost O(30 × project size); immutable roots can share unchanged data. | Small for simple edits; deletion, solving and generation may require large inverse payloads. | Similar to A with equivalent structural sharing, plus metadata. Hybrid is not inherently smaller. |
| Large Drawing performance | Root replacement is cheap; map/array copying and validation remain; deep-cloning whole project per move is unacceptable. | Small command logs but recomputation/replay can be expensive; inverse payload capture may still copy affected components. | Reuse immutable module/sketch roots; preview separately; profile at commit, no generic whole-project diff per pointermove. |
| Undo/Redo reliability | High for validated complete frames; restore exact results. | Depends on complete inverses; a dimensional value change has no unique inverse geometry solve. | Same exact restoration as A with semantic validation boundaries and operation context. |
| Drag handling | Before/after snapshots, one commit at finish. | Explicit begin/update/end, one command carrying sufficient inverse. | Same gesture boundary with preview token, immutable result and one semantic entry. |
| Solver integration | Store target and full solved result together; do not re-solve Undo. | Replaying pointer/value intent may choose another branch; robust commands must retain exact solved before/after data. | Store existing solver outcome; metadata explains intent without making intent the restoration authority. |
| Cross-module atomic operations | One complete root includes every touched module. | Composite command needs rollback/prepare for partial failures. | One prepared candidate root plus touched-module/causal metadata; future dependency outcomes included. |
| Module navigation | UI state separate from frames; edit metadata chooses restore module. | UI navigation separate from reversible commands. | Same UI route for selector/panel; no navigation transaction or branch change. |
| Save/Open compatibility | Serialize current document; Open establishes a fresh baseline without snapshots. | Durable replay would need command schema, solver/generator compatibility, checkpoints and assets; not required. | Persist complete current authored state; Open starts fresh execution history, with journal serialization decided separately. |
| Future dependencies | Store links/status and derived artifacts atomically; graph still needed. | Events can express causes but do not solve dependency mapping/conflicts. | Semantic cause IDs help panel/provenance; dependency graph remains separate authority. |
| History panel | Bare snapshots are insufficient; adding labels/references moves toward C. | Natural semantic operation labels, but current-object navigation still needs identity registry. | Entry metadata is first-class, independent of snapshot lifetime. |
| Testing | Root/restore completeness, immutability, retention and module parity. | All of A plus inverse laws, command schema upgrades, replay determinism and partial failure. | A plus metadata/references/navigation/retention and atomic transaction-failure tests. |
| Migration risk | Large capture omission risk, especially BOX; low solver intrusion. | Broad mutation rewrite and nondeterministic replay risk; inverse completeness is difficult to audit. | More orchestration than bare A, but permits incremental model-preserving adapters and rollback. |

**Retained recommendation: C.** It follows the existing successful candidate-document behavior
and the BOX stored-authority restore contract, while supplying the metadata required by
the approved panel. A is a useful execution foundation, but a bare unlabelled snapshot
buffer cannot satisfy navigation/reference requirements. Once A gains durable operation
metadata and explicit action boundaries, it is effectively the proposed hybrid.

B is reasonable for a new command-oriented editor or measured future storage needs.
For this codebase, robust inverse commands would often capture exact before/after solver
and generation results anyway. Event sourcing is not necessary for the stated product
requirements and introduces replay/version compatibility obligations before Stage D.
Do not use Undo to rerun a current solver against historical intent.

### Memory and performance contract

Let D be one full project size, Δi newly allocated immutable data for action i, and M
retained panel metadata. Deep-copy A/C may retain roughly 31D for a simple linear
30-transition chain; independently cloned before/after payloads can waste more. Proposed
sharing approaches D + ΣΔi + M, excluding active preview/caches and implementation
overhead. Neither estimate is a measured browser heap result. Ordinary object-map spreads
still copy maps and order arrays; snapshots are not automatically a persistent data
structure with O(1) edits.

Retain at most 30 transition pairs sharing roots, not 30 Undo plus another independent
30 Redo transitions. Traversal moves a cursor within that one retained sequence. Release
evicted roots, preview candidates, cache entries and abandoned Redo payloads; journal
metadata must not hold closures or hidden references that pin documents. Preserve raw
imported SVG once by immutable sharing; navigation allocates no reversible snapshots.

Profile representative large sketches and generated BOX projects before selecting patches,
workers, indexing or a larger state library. A later measured patch optimization can sit
behind the same restore contract, but changes neither canonical geometry nor retention
semantics without review.

## 7. Recommended global project-state architecture

### Ownership and boundaries

**PROPOSAL.** One project store, created above conditional module views, owns editable
documents, identity/provenance data, semantic edit metadata and the global history
service. Modules may unmount freely; only UI adapters are tied to their mount lifecycle.
No module retains an independent authoritative copy of a document or history buffer.

```text
App / project session (lifetime exceeds every module view)
  ProjectStore: one authoritative committed frame + monotonic runtime revision
    ProjectDocument
      DrawingDocumentV2
      BoxModuleDocument (source + construction + applied result)
      optional future Modeling/Puzzle documents
      identity registry + future dependency records
    HistoryService: 30 reversible transitions, cursor, operation metadata journal
  UiSession: active module, selections, views, editors, gesture previews
  DerivedRuntime: reference indexes, solver/rank/DOF, bounds, FinalGeometry caches
  Module views: read selected state; submit accepted candidate transactions
  Future persistence adapter: validated editable document <-> native file
```

**Proposed interface sketches, not production code or a final serialized schema:**

```ts
// PROPOSED Stage C boundary. Existing imported domain types keep their semantics.
type ModuleId = 'modeling3d' | 'drawing' | 'box' | 'puzzle';
type DocumentId = string;
type SessionToken = string; // new runtime lifetime on Clear/Open, even for same projectId
type RevisionToken = number; // runtime concurrency token; never rewound by Undo

interface ModuleSlot<T> {
  documentId: DocumentId;
  moduleSchemaVersion: number;
  data: T;
}

interface BoxModuleDocument {
  source: SvgDocumentModel; // EXISTING; absent from current BOX HistoryState
  connections: ConnectionMap;
  edgeAssignments: Record<string, EdgeAssignmentBucket>;
  panelManager: PanelManagerState;
  manufacturing: ProjectSettings;
  lastAppliedManufacturing: ProjectSettings | null;
  workflow: BoxWorkflowState; // PROPOSED wrapper of existing group/order fields
  applied: GeneratedGeometrySnapshot; // EXISTING stored authority, not preview
}

interface ProjectDocument {
  projectId: string;
  projectSchemaVersion: number; // version distinct from Drawing schemaVersion: 2
  unit: 'mm';
  modules: {
    drawing?: ModuleSlot<DrawingDocumentV2>;
    box?: ModuleSlot<BoxModuleDocument>;
    // FUTURE types defined by F/G, not invented by this report:
    modeling3d?: ModuleSlot<ModelingDocument>;
    puzzle?: ModuleSlot<PuzzleDocument>;
  };
  identities: IdentityRegistry; // PROPOSED qualified local-id/incarnation index
  dependencies: DependencyRecords; // FUTURE E; empty before E
}

interface RestorableFrame {
  document: ProjectDocument;
  boxContext?: BoxAuthoringContext; // PROPOSED parity for assignment/display IDs
}
```

`ModelingDocument`, `PuzzleDocument`, `BoxWorkflowState`, `IdentityRegistry`,
`DependencyRecords` and `BoxAuthoringContext` are conceptual proposed/future names,
not existing repository types. Optional module slots mean absent modules are valid;
an empty default document may also be instantiated lazily on first use. One slot per
module matches today's one-document-per-workspace baseline; future multiple-document
support must extend DocumentId addressing rather than depend on array position.

Preserve Drawing's current schema and every local ID. A project wrapper version must
not force an artificial Drawing V3 or reintroduce obsolete bulge/derived-center records.
Preserve BOX source content, authored relationships, original edge identity, applied
geometry and composition model. Keep applied versus draft authoring state distinct so
history can restore the existing pending-Apply workflow without silently applying it.

`RestorableFrame` is a history boundary, not a final disk envelope. Active module is
excluded: snapshots describe editable state, not whichever tab happened to be visible
at capture. Each edit's metadata carries its associated module for both Undo and Redo.
Even if a legacy capture or optional disk UI preference contains an active-module field,
history restoration must ignore it and activate the affected edit's module explicitly.
BOX authoring context is initially retained for parity; moving it to a best-effort
restoration hint requires explicit characterization. Generic selection is not promoted
into document authority merely because old BOX snapshots contain context IDs.

### UI and derived runtime separation

**PROPOSAL.** `UiSession` owns per-module view/camera, validated selection, inspector
state, hover, current tool, text drafts, capture handles, pending navigation requests
and gesture previews, including the single active-module value. Views may be retained
across unmount without becoming history.
Do not store React callbacks, DOM nodes, Maps of solver functions or timer handles in
ProjectDocument. There is no reversible active-module or panel-reveal override.

`DerivedRuntime` caches by document/module identity plus content-root identity or stable
content revision. A separate monotonic session revision/restore epoch invalidates stale
callbacks after any restore. Undo may return an older content root; it must not return
an older concurrency token that could accidentally accept a stale async result.

Rebuild resolved geometry, Circular Support, intrinsic equation functions, solver
components/rank/DOF, display annotations, bounds and compensation from restored
authorities. Rebuild does not mean re-solving and moving coordinates. Preserve stored
BOX applied output verbatim; only downstream derived presentation/manufacturing is
recomputed from that stored output and restored settings.

### Existing-stack implementation options

| Approach | Fit and cost | Recommendation |
| --- | --- | --- |
| React useReducer + split Context providers | No new dependency; pure transition core is straightforward. Broad context subscriptions can rerender large canvases; dispatch alone does not provide the synchronous current state required by accepted same-event Profile placement. | Viable if a carefully designed synchronous coordinator owns state and React is a subscriber; avoid independent mirrored authorities. |
| Small project store + React useSyncExternalStore | Built into current React; getSnapshot gives one synchronously current immutable root and subscribers observe atomic changes. Requires explicit subscription/error/selector discipline and tests. | Preferred initial host for a pure transaction core. Start with module-root subscriptions; optimize selectors only after profiling. |
| Redux Toolkit/Immer | Mature actions/devtools and immutable updates/patch support, but new dependencies and middleware conventions; patches alone do not define CAD transactions. | Compare in a measured spike if copying/diagnostics become a bottleneck; not a prerequisite for this design. |
| Zustand or similar external store | Convenient selector subscriptions, but another dependency and still needs all validation/transaction/restore contracts here. | No demonstrated need over the small existing-stack store yet. |

No library is introduced or approved. A single useRef mirror plus asynchronous React
state can become two authorities if writes bypass it; the proposed store should have
one synchronous publication path and a pure, independently testable transition core.

## 8. Recommended global history and transaction architecture

### Transaction representation and ownership

**PROPOSAL.** Transactions represent committed project edits only: geometry, Constraints,
Dimensions, BOX settings/results and future module/dependency edits. Module selection,
object reveal and editor opening use a separate UI navigation service with no access to
history commit/branch mutation. Clear and Open use a session lifecycle boundary (§10),
not reversible transactions. Navigation must not invoke the solver or duplicate geometry.

```ts
// All names below are PROPOSED. Payloads restore results; metadata explains them.
interface OperationMetadata {
  operationId: string;
  parentOperationId?: string;
  branchId: string;
  sequence: number;             // monotonic order; timestamps are informational
  timestamp: string;
  kind: 'document-edit';        // navigation/Clear/Open are not reversible edits
  label: string;                // stable human meaning, not executable text
  module: ModuleId;             // associated edit module; activate on Undo AND Redo
  touchedModules: readonly ModuleId[];
  targets: readonly ObjectRef[];
  settingsRoute?: string;       // declarative capability key, never a callback
  summary: Readonly<Record<string, string | number | boolean>>;
  causedByOperationId?: string; // FUTURE E causal information, not an Undo index
}

interface ReversibleTransition {
  metadata: OperationMetadata;
  before: RestorableFrame;
  after: RestorableFrame;
}

interface HistoryBuffer {
  transitions: readonly ReversibleTransition[]; // at most 30 total
  cursor: number; // [0, transitions.length]; next Undo is cursor - 1
}

interface PreparedTransaction {
  baseSession: SessionToken;
  baseRevision: RevisionToken;
  before: RestorableFrame;
  after: RestorableFrame;
  metadata: OperationMetadata;
}

interface ProjectTransactionService {
  current(): { frame: RestorableFrame; session: SessionToken; revision: RevisionToken };
  prepare(request: OperationRequest): PrepareResult;
  commit(candidate: PreparedTransaction): CommitResult;
  beginPreview(request: GestureRequest): PreviewToken;
  updatePreview(token: PreviewToken, candidate: ModuleCandidate): void;
  finishPreview(token: PreviewToken): CommitResult;
  cancelPreview(token: PreviewToken): void;
  undo(): RestoreResult;
  redo(): RestoreResult;
}
```

Request/result/token types above describe proposed boundaries, not a callable API.
`PrepareResult`/`CommitResult` must distinguish committed, unchanged, cancelled, rejected
and stale-base outcomes with structured diagnostics. A user-facing error does not become
an operation entry. Failed/cancelled candidates do not consume capacity, clear Redo,
increment content revision, or emit a misleading success label. A runtime invalidation
epoch may advance on cancellation to reject late work without recording a project edit.

The current Drawing `transactDocument()` becomes a model-preserving adapter; its accepted
mutation/solver result replaces only the Drawing slot in a candidate project root.
BOX's multi-setter handlers need pure candidate preparation containing source, semantic
state, normalized automatic values and applied result where relevant. Never call both
old pushUndoState and global commit for the same action.

### Prepare, validate, publish

**PROPOSAL.** One successful logical operation follows this protocol:

1. Read the authoritative committed root, runtime session and monotonic base revision synchronously.
   Capture accepted user intent, IDs and module context once.
2. Resolve references against that root. Run current module mutation/solver/generation
   functions into an isolated candidate. Collect all solver-changed points/entities,
   Dimension targets, Constraints, BOX automatic values and future dependency effects.
3. Validate the complete affected closure: maps/order/identity, reference existence,
   finite geometry/domain, current hard constraints/intrinsic equations, module schemas,
   and any generated-output/authority conditions. Reuse existing CAD validators; do not
   introduce a competing solver or new tolerance policy.
4. Determine meaningful change using the module's accepted mutation contract. Same-root
   Drawing results are unchanged; placement/setting equality may use domain-specific
   comparisons. Ignore generated timestamps/cache bookkeeping. Any new Arc no-op rule
   requires separate assessment; global history is not authorization to resolve it.
5. Verify baseSession and baseRevision still match. Reject old-session results outright;
   for a changed revision, reject or explicitly recompute under
   a separately specified intent policy; never splice an old candidate into new state.
6. Atomically publish the candidate frame, updated buffer/cursor and committed journal
   metadata. Notify React subscribers only after the complete root is ready. A subscriber
   cannot observe the new Dimension value with old solved coordinates or half a BOX Apply.

The transaction owns automatic changes caused by the action. BOX's effect-driven
automatic-property normalization must become explicit candidate derivation, with parity
tests, rather than a second authoring mutation after global restoration. This is an
incremental migration requirement, not a change to the TB/S algorithms.

### Continuous interactions and asynchronous results

Geometry dragging keeps the existing mouse-down document plus total-delta authority.
Preview updates are not commits. A matching valid finish creates one transition from
the committed baseline to the accepted last valid outcome. Pointer cancellation, lost
capture and Escape invalidate the preview token; late events cannot revive it. Preserve
current exact Circle/Arc grip semantics and R2 status. A committed outcome includes
all solved neighbors, not just the visibly grabbed object.

A Profile chain continues to commit one completed segment at a time. Do not collapse a
whole chain because global history has fewer slots. Its pending accepted-click timer
must remain exactly-once; navigation/Undo must settle or explicitly cancel it according
to a reviewed interruption policy before changing the root. Unmount must not be used
as an accidental accepted-work policy.

BOX numeric edits can use an explicit edit-session begin/accept/cancel boundary for
spinners/sliders/text entry. Whether every key/change or one accepted field edit is
the product's logical action remains **DECISION D4**. Do not silently reinterpret the
current callback granularity. Separate workflow actions and Apply stay distinct when
they are distinct accepted user actions; a helper's internal setters are not entries.

For future async generation/solver workers, prepare against a base revision and retain
a token/affected-module set. Either finish an explicitly isolated transaction before
allowing dependent edits, or reject stale results and ask the module to prepare anew.
Unmount, Undo, Open and Clear invalidate tokens. No background result is permitted to
publish into a newer frame just because its module has remounted.

### Cursor, retention and branching

For transitions T0…Tn-1 and cursor c:

- Undo when c > 0 restores Tc-1.before; only on success set cursor to c-1.
- Redo when c < n restores Tc.after; only on success set cursor to c+1.
- A successful new transaction discards reversible transitions at indices c…n-1,
  appends the new one, and sets cursor to the end. Their metadata can remain visibly
  abandoned in the journal; they are not alternative executable branches.
- Evict oldest payloads until at most 30 transitions remain, adjusting cursor and
  retaining the earliest reachable frame. A chain of 30 transitions has 31 endpoints,
  shared by references; it is not a 30-snapshot/29-Undo off-by-one contract.
- Failed operations, equality/no-op results, pan/hover, ordinary module switches,
  selection and panel reveal do not truncate Redo or move the history cursor.

Thirty counts committed project edits only, including editable settings, with past and
future sharing the same retained sequence. Navigation consumes none of this capacity.
Buffer overflow is a visible retention boundary; older panel entries are not thereby
deleted or made executable. A count cap is not a byte-memory guarantee (§6).
Clear and successful Open end the execution-history session; the new empty/loaded
project is the baseline with zero transitions. Save alone does not reset history.

### Module switching and history-panel reveal

**REQUIREMENT (approved 2026-11-09).** Switching among Drawing, BOX, Modeling or Puzzle
is navigation only. It changes UiSession.activeModule, consumes none of the 30 edits,
does not move the history cursor, and preserves all Redo transitions. History-panel
double-click follows the same navigation contract, with an optional current-object
selection/settings request (§9). Neither route needs an undoable navigation transaction.

**PROPOSAL.** One navigation service handles supported module activation and mount-ready
requests. There is one visible active module, with no hidden chronological active module
or reveal override. An already-active module is a UI no-op. Unsupported modules are
reported unavailable. Navigation may coordinate a pending interaction under D4, but any
separately accepted edit has its own normal transaction; the navigation itself cannot
commit a snapshot or prune Redo.

Each committed edit records `metadata.module`, normally the initiating authoring module,
plus `touchedModules` for every changed module. Multi-module adapters must declare that
associated module explicitly. Both Undo and Redo activate the edit's associated module
after restoring its complete project outcome, even if that module is currently unmounted.
The before-frame's previously visible module has no authority over this choice.

| Sequence | Required Undo/Redo behavior |
| --- | --- |
| Create Circle in Drawing → switch BOX → change material thickness → switch Drawing | Exactly two edits. First Undo opens BOX and immediately restores previous thickness; second Undo opens Drawing and removes Circle. Redo opens Drawing to restore Circle, then BOX to restore thickness. |
| Drawing → BOX → Drawing without edits, including an empty project | No transitions, no cursor/capacity change; any existing Redo remains available. |
| Undo while another module is displayed | Reverse the latest committed global edit immediately and open its associated module; do not first undo navigation or search for a local edit. |
| Undo → selector navigation or panel double-click → Redo | Cursor/Redo payloads unchanged by navigation. Redo restores the next edit and opens its associated module. |
| Undo → navigation → newly committed edit | Only the new edit discards the abandoned Redo branch. Its before-frame is the current editable project; Undo restores that state and opens this new edit's module. |
| Undo/Redo activates a module | Internal activation is UI navigation and creates no additional entry. |

### Restoration barrier

**PROPOSAL.** Undo/Redo use the same core restoration mechanism as a future prepared
Open result, but different validation/error policies:

1. Stop/settle active gestures and pending accepted clicks through the reviewed boundary.
   Release capture, close stale editors and invalidate deferred callbacks/work tokens.
2. Validate the target in-memory frame and identity/reference closure without normalizing
   or re-solving it into a different document. Already validated snapshots are trusted
   session data; if they fail an invariant, report the failure and retain the old root
   and cursor rather than partially installing them.
3. Publish the exact target document and buffer cursor with a UI activation request for
   the affected transition's `metadata.module`; increment the runtime epoch/revision.
   Never restore a captured active tab. No navigation entry is created.
4. Invalidate derived indexes/caches. Restore BOX's stored applied output/composition model
   rather than selecting composition authority again. Derived views may rebuild lazily.
5. Validate UI context/selection; clear stale refs, preserve the current documented
   Drawing selection reset initially, and apply BOX contextual parity where required.
   Mount the target view and deliver any settings/selection request by ID after readiness.

Restore must be independent of whether the target module is mounted. Do not call old
component closures to mutate historical state. Do not run ordinary switch handlers or
automatic authoring effects as a side effect of restoration.

## 9. History-panel navigation and retention design

### Entries, objects and settings

**PROPOSAL.** Use operation IDs independent of object IDs and Undo indexes. Store small,
serializable metadata containing module/document, semantic operation kind, target refs,
summary, ordering and optional settings capability. Separate immutable facts about
the operation from derived display status: applied, undone, abandoned branch, or outside
reversible retention. Status is not a snapshot or a dependency edge.

```ts
// PROPOSED addressing layer; existing domain IDs remain unchanged.
interface ObjectRef {
  projectId: string;
  module: ModuleId;
  documentId: DocumentId;
  scopeId?: string; // e.g. Drawing sketch ID
  kind: 'entity' | 'point' | 'dimension' | 'constraint'
      | 'panel' | 'edge' | 'connection' | 'workflow' | 'generated-feature';
  localId: string;
  incarnation: string; // unique lifetime token, not a display label
}

type ResolveTargetResult =
  | { status: 'found'; ref: ObjectRef; capabilities: readonly string[] }
  | { status: 'mapped'; ref: ObjectRef; reason: string }
  | { status: 'deleted' | 'unavailable' | 'ambiguous' | 'unsupported'; message: string };

interface HistoryNavigationRequest {
  requestId: string;
  operationId: string;
  module: ModuleId;
  target?: ObjectRef;
  settingsRoute?: string;
}
```

Incarnation identity belongs to a project registry/sidecar so existing CAD references
can remain unchanged. Allocate a new token for a new object lifetime, even if an ID such
as TB1 or a semantic constraint key is reused. Undo of deletion restores the original
object and its original token. Redo restores the same identities captured in the result.
Do not rewind an allocator and reuse a token on a different branch; UUID allocation
or a non-rewinding high-water allocator avoids that collision. Existing records receive
one identity mapping at migration; do not regenerate it on every mount.

| Target condition | Proposed panel navigation result |
| --- | --- |
| Object still exists with same qualified ID/incarnation | Reveal module, select its current semantic object, open current settings if supported. Do not populate historical values as editable current truth. |
| Object deleted | Reveal module and show operation summary/deleted status. No selection, resurrection or automatic rewind. If Undo is still available it remains a separate explicit action. |
| Same local ID recreated | Incarnation mismatch prevents selecting the replacement as though it were the old object. Offer current-context information only with an explicit mapping. |
| ID changed by supported migration | Resolve through a documented, scope-qualified old-to-new identity mapping; detect cycles/ambiguity. No coordinate-nearest fallback. |
| Geometry regenerated, same logical feature | Use Stage E's verified semantic feature mapping/provenance. Current contour index/tap order is not sufficient evidence of sameness. |
| Feature split, merged, or incompatible | Mark ambiguous/incompatible; do not choose one replacement or overwrite settings silently. Stage E defines supported mappings. |
| Module not mounted | Resolve against project data, publish pending UI request, mount view, revalidate against current revision, then select/open. A superseded request cannot act later. |
| Module unavailable in current application version | Keep summary and explicit unavailable status; do not route to BOX as a fallback. |
| Edit has no surviving object/settings target | Navigate to its available module/context and display metadata; do not fabricate an editor. Navigation and Clear do not create edit entries. |
| Snapshot evicted after 30 transitions | Retained metadata may still locate current object/settings. Mark not undoable; no reconstruction promise. |

A Dimension or Constraint target should select the current semantic record, not a
rendered arrow/glyph node. An Arc center target resolves to its persistent SketchPoint,
not an obsolete derived center. Future generic dependent points need their own semantic
reference variants rather than overloading the current Arc model.

### Retention alternatives and recommended contract

| Policy | Benefits | Costs / reason to choose or reject |
| --- | --- | --- |
| Panel metadata expires with 30-step buffer | Simple, tightly bounded | Loses navigation/provenance summaries solely because Undo payload expires; misses useful older current objects. Not recommended. |
| Independent bounded session journal | Useful chronology beyond Undo; predictable metadata budget; no persisted log required | Needs separate quota/pruning/status and dangling-reference behavior. **Recommended initial contract.** |
| Complete persistent operation journal | Long-lived project chronology across Save/Open | File growth, privacy/retention and schema/migration obligations; still not full replay unless payloads retained. Optional later product choice. |

**PROPOSAL.** Payload retention is 30 transitions. Metadata has a separate configurable
count/byte budget, strictly containing no document roots, solver functions or geometry
arrays. Its default quota, truncation UX and disk persistence remain **D3/D6**. Prefer
pruning oldest summaries with an explicit earlier-entries-omitted indicator over an
unbounded in-memory log. Never claim permanent access to every operation under a bounded
journal. Retain the metadata for every still-reversible transition even if the older
journal quota is reached; the two policies must not create unlabeled Undo actions.

Keep current-branch entries chronological. Undone entries remain marked as such; a new
edit marks discarded future entries abandoned and removes their payloads. An abandoned
entry may navigate to an object that still exists, but cannot execute Redo. Default
visibility/filtering of abandoned entries is a product decision; their identity must not
be reassigned to a new edit. This is one executable timeline, not an unrequested history
tree or an audit/security log.

Panel metadata must not become the sole owner of provenance. Editable dependency records
and stable identity needed by current objects stay in ProjectDocument when metadata is
pruned. Small tombstones for retained entry targets may expire when no journal, current
relationship or retained payload needs them. A deleted-object summary can remain useful
without keeping an entire deleted model alive.

**REQUIREMENT.** Double-click is navigation only: it never rewinds a snapshot, creates
an Undo step, changes the cursor or clears/mutates Redo. Resolve the current project
identity and object lifetime, then select/reveal its current geometry and open current
controls. If a selected object is offscreen, use the module's reveal/view behavior without
changing editable state. Revalidate any deferred mount-ready request before applying it.

Example: a Line currently measures 30 mm. Double-clicking its older entry opens Drawing
and selects that same current 30 mm Line. Accepting a length change to 50 mm commits one
normal global edit whose before-state is 30 mm. Undo restores 30 mm; Redo restores 50 mm.
If Constraints move neighboring geometry, both snapshots include the complete solved
project outcome. A rejected/cancelled editor leaves Redo intact; a newly committed edit
after Undo abandons Redo in the usual way, regardless of how the object was reached.

Snapshot expiration alone never disables current-object navigation while metadata and
a resolvable target survive. Journal pruning can remove that entry; no permanent journal
availability is approved. Moving the Undo cursor, selecting/opening settings, and
propagating a later accepted edit remain distinct responsibilities with distinct tests.

## 10. Native Save/Open architectural prerequisites

**REQUIREMENT / FUTURE D.** Native Save preserves the complete editable project. Export
is a separate output/manufacturing operation. Neither the Drawing SVG nor a compensated
BOX contour set is an adequate native project. The following is a logical boundary,
not selection of JSON, ZIP, binary format, compression, or a file extension.

### Minimum complete editable content

| Content | Required boundary |
| --- | --- |
| Project envelope | Project identity, project schema, unit, supported/required feature metadata and module inventory. Module data has independent format versions. |
| Drawing | All sketches/maps/orders, points/entities, canonical Circle/Arc values, Constraints, driving/reference Dimensions and placement/branch intent. Shared point identities and legacy supported Line references remain resolvable. |
| BOX | Full source SvgDocumentModel/root/source data, panels/edges/IDs, assignments, connections/properties, Panel Manager thickness/application state, resumable workflow data, manufacturing targets/settings, last-applied state, applied generated output and its authority/provenance. |
| Future Modeling | Editable source profiles/extrusion definitions/depth/direction/transforms/assembly relationships; meshes alone are insufficient. Stage F defines exact model types. |
| Future Puzzle | Editable input shape/source, generation intent/settings, results and manufacturing state necessary to resume. Stage G defines types independently of BOX. |
| Relationships | Qualified stable IDs, incarnation/provenance/feature mapping needed by current objects, source revisions and dependency status/links. |
| Assets | Required source/embedded assets by stable reference and integrity metadata; no dependency on an unavailable local filename or transient object URL. |

Persist applied BOX results needed to preserve stored resolved authority. Other caches
may be omitted and rebuilt. If a generator version changes, loading must not silently
regenerate applied output under a newer policy. An explicit later regenerate operation
may update it with review and history. Draft settings that differ from applied output
must remain distinguishable, rather than opening the project as though Apply occurred.

### Confirmed history boundary and remaining persistence choices

| Item | Approved boundary or remaining options | Status / recommendation |
| --- | --- | --- |
| Undo/Redo execution buffer — **approved** | Open starts a fresh session; prior snapshots are not restored | Open restores editable state as a new baseline with empty Undo/Redo. Do not serialize executable snapshots as native history; Save itself leaves the current session's history intact. |
| Panel metadata | Session-only; bounded persistent summaries; complete persistent journal | Session-only initially, with optional versioned bounded summaries if durable chronology is desired. Metadata persistence does not imply executable historical state. |
| Active module | Restore last saved supported module; or default module on Open | Save as optional navigation preference; validate availability. Undo/Redo activation comes from the affected edit's metadata, never this preference. |
| Selection | Omit; or save qualified semantic refs | Omit by default; if retained, validate and clear missing refs, never guess by position. |
| Viewport / 3D camera | Omit; optional per-module preferences; always save | Optional preferences, outside Undo; invalid/missing views fall back to geometry-based Fit once implemented. No 3D camera schema is selected here. |
| Native container | Plain structured text; manifest plus assets in archive; other versioned container | Choose after asset/size/validation spike. Do not invent extension or approve a format in Stage B. |

The execution-history boundary is settled: native Open does not restore old Undo/Redo
snapshots, including when reopening the same project ID. Descriptive journal serialization
is **D6**, not implied by complete editable Save. If later approved, imported summaries
must be explicitly outside the new executable timeline; validate their qualified identities
and never treat a saved operation ID as a recoverable snapshot or replay instruction.

### Proposed load protocol

1. Read into a detached candidate, enforce size/resource limits appropriate to the chosen
   container, inspect envelope/schema/required features, and validate asset integrity.
2. Migrate project and module formats through explicit ordered version transforms.
   Preserve IDs or supply deterministic mappings for every relationship/journal ref.
   Unsupported newer required features fail closed; do not cast unknown data into a type.
3. Validate maps/keys/order arrays, active sketch/module, finite units/coordinates/values,
   canonical entity domains, references, Constraint/Dimension semantics, BOX source-edge/
   panel relationships and composition markers. Validate reference targets before any
   solver equation is built. Existing migrateDrawingDocument and normalizeProjectSettings
   are helpers, **not complete untrusted-file validation**.
4. Validate dependency/provenance graph, revisions and supported status. Derived artifacts
   must match a valid recorded source/generator contract or remain explicitly stale/blocked.
   Verification may reject a malformed project; it must not silently solve it into a new
   shape or drop geometry because a helper filtered invalid records.
5. Only after validation and any required unsaved-work handling succeed, use a session
   barrier to invalidate old async/UI work, allocate a new runtime session token and
   publish the loaded project atomically with empty Undo/Redo. The loaded project is
   the new baseline; do not append an Open transition or import executable snapshots.
   A failed/cancelled Open leaves current editable work and buffer intact. Exact Open
   unsaved-work prompting remains a Stage D decision, separate from approved Clear UX.
6. Rebuild transient indexes/derived presentation and apply validated optional navigation
   preferences. User sees any explicit compatibility/recovery diagnostics.

The recommended session journal starts empty on Open. If journal serialization is later
approved, loaded summaries must follow D6 and remain separate from the empty execution
buffer. Do not silently carry another runtime session's journal into the loaded project.

Optional absent module data is valid. Missing data required by a present dependency or
enabled module feature is an error, not a reason to create an empty replacement silently.
For unknown optional module payloads compare: reject the whole file, preserve opaque data
without enabling editing, or offer explicit recovery into a separate project. Recommend
strict rejection for unsupported required data and lossless opaque preservation only
where the container/schema can guarantee it. Recovery must be an explicit product mode,
not partial load followed by Save that destroys unsupported content (**D7**).

Clear and successful native Open are distinct, non-reversible session boundaries;
Undo cannot cross either boundary. Runtime session tokens must change even when opening
the same saved projectId. SVG Import always targets BOX, regardless of active module;
its replace/confirm/navigation/history policy remains unresolved. It must preserve
unrelated module documents and respect links into replaced BOX data once dependencies exist.

### Clear: permanent reset with save-before-clear workflow

**REQUIREMENT (approved).** Clear affects the entire project and is not Undoable. Always
offer **Save and Clear**, **Clear Without Saving**, and **Cancel**, explaining that the
current project and its Undo/Redo will be cleared permanently. No reversible Clear
transaction, old-session recovery stack or hidden snapshot is retained by global history.

| Outcome | Required result |
| --- | --- |
| Save and Clear | Save the complete current editable project through native Save. Reset only after confirmed save success for that exact committed revision/session. |
| Clear Without Saving | After this explicit choice, reset the entire current in-memory project without writing, deleting or overwriting any existing saved project file. |
| Cancel | Close the workflow; leave project, module states, identity data, journal and Undo/Redo untouched. |
| Save fails, permission is denied, destination picker is cancelled, or save is incomplete | Do not clear anything. Keep the current project and history available, with the save error/cancellation result. |

**PROPOSAL.** Coordinate confirmation and saving through a lifecycle gate: pause new
authoring/publication while the choice/save is pending, keep the committed root and
history unchanged, and resume them on cancellation/failure. Do not flush a pending
accepted edit as an incidental consequence of pressing Clear. D4 must specify how an
already pending accepted click is settled before entering the gate; if unsettled, defer
Clear rather than silently discard accepted work. Revalidate session/revision at completion.

A successful save means complete editable content and required assets/dependencies from
the gated revision were serialized and validated and the persistence adapter reported
completion of the destination write/close. Starting serialization, opening a picker,
or starting a browser download is not proof of a completed file write. A first save
must request a native destination/name (Save As); cancelling it cancels Save and Clear.
An already-saved project may use its valid writable destination through the ordinary
explicit Save choice. Clearing itself must never delete or overwrite that file.
Stage D must choose an adapter that can establish completion; if the platform cannot
observe write success, it must define a reviewed completion/acknowledgment contract
before enabling Save and Clear, never infer success from initiating a download (**D7**).
If native Save is unavailable, Save and Clear cannot proceed; explain that status while
retaining Clear Without Saving and Cancel. Export is not a successful native Save.

At a permitted reset, atomically invalidate the old session and replace all project
documents/module authoring states, geometry, Constraints, solver outcomes, BOX source,
assignments/results, dependency/identity data and relevant editable settings with the
defined clean empty project/defaults. Empty Undo/Redo and the current-session journal;
clear selection, editors, drafts, mount requests and old-project runtime caches. Create a
new session identity/baseline, with no reversible transition. Generic application
preferences may remain outside project state; the initial visible module/default UI
choice is **D5**, not a restored old project snapshot. No cleared geometry/settings may
reappear merely by visiting an unmounted module.

**PROPOSAL: shared Clear/Open async safeguard.** Use tokens qualified by runtime session
identity plus non-rewinding revision/epoch, not projectId or restored snapshot revision
alone. Cancel/abort pending workers, imports, saves with follow-up effects, timers,
debounced settings, Profile clicks, queued module requests and dependency jobs where
possible. Release pointer captures/subscriptions and discard previews. Invalidate all
old tokens before new-session publication; every eventual callback must verify its
session and revision at the single publication gate. An abort alone is insufficient:
uncancellable or already queued completions must be rejected. A stale save completion
cannot clear a different current project, and old callbacks cannot repopulate a cleared
project or affect a newly opened one. A failed/cancelled Clear save does not cross the
session boundary or consume history.

## 11. Cross-module dependency prerequisites

**REQUIREMENT / FUTURE E.** Source correction and controlled downstream regeneration
are not chronological history navigation. Existing within-sketch solving and BOX
reconciliation do not constitute a cross-module dependency system.

```text
Optional Modeling definitions --flatten/derive--> Drawing semantic geometry
Independent Drawing authoring -------------------> Drawing semantic geometry
Drawing semantic geometry --explicit transfer-----> BOX source + construction pipeline
                         --explicit transfer-----> Puzzle input + puzzle operations
Independent BOX import/empty start ---------------> BOX source + construction pipeline
```

There is no BOX → Puzzle prerequisite. A project can have zero dependency links and
still be valid. Module navigation creates no dependency.

### Proposed structural preparation

```ts
// FUTURE E contract sketch; algorithms and accepted transfer geometry remain open.
interface DependencyRecord {
  dependencyId: string;
  sources: readonly ObjectRef[];
  targets: readonly ObjectRef[];
  derivation: { kind: string; version: number; parametersId: string };
  evaluatedSourceRevisions: Readonly<Record<string, string>>;
  status: 'current' | 'stale' | 'blocked' | 'detached';
  provenance: { createdByOperationId: string; generatorVersion: string };
  featureMappings: readonly FeatureMapping[];
}
```

`FeatureMapping` and transfer parameters are unimplemented, future design types. Stage B
must reserve qualified identity, versioned module documents, atomic multi-module changes,
recorded artifacts and explicit status; it must not implement graph scheduling, feature
matching, topology repair, flattening, meshing or conflict algorithms.

| Concern | Architectural prerequisite / proposed boundary | Later algorithm decision |
| --- | --- | --- |
| Stable geometry identity | ObjectRef + logical feature identity distinct from tessellation/contour order; retain local CAD point identities | Stage E/F/G define feature survival through split/merge/topology changes. |
| Provenance | Source/target refs, derivation/version/parameters, last evaluated revisions, producing operation ID | Exact per-module dependency semantics and update eligibility. |
| Invalidation | A source transaction records affected links as stale/blocked or includes validated new results | Affected-work detection and scheduling; compare eager, lazy and user-approved updates. |
| Regeneration boundary | Prepare all changed target artifacts/settings/mappings in a detached candidate | Generator algorithms, compatible parameter reuse and geometry correspondence. |
| Downstream edits | Separate generated base from downstream authored settings/overrides; track which logical feature owns each edit | Three-way merge/rebase/reattachment/conflict UX; never blind replacement. |
| Incompatible change | Keep original downstream work recoverable; block ambiguous mappings and dependent output explicitly | User choices: remap, detach/copy, discard affected edits, or cancel. |
| Save/Open | Restore links/mappings/versions/status and current artifacts together | Version migration and generator availability/recovery policy. |
| Undo/Redo | Restore source and all consequences/status from exact committed frames | Group asynchronous updates explicitly; do not infer a cause from journal order. |

Prefer an acyclic explicit derivation graph initially, with validation against cycles;
whether feedback links are allowed is a later product/algorithm decision. Dependency
source versions are content versions, not the global Undo cursor or timestamps. A module
switch creates no history entry and must not invalidate geometry or dependency status.

### Atomic consequences and preservation of user work

**PROPOSAL.** If regeneration is synchronous and approved as part of an action, commit
source edit, resolved downstream results, mappings and settings changes in one transaction.
Undo then restores all of them, and Redo restores those exact results. No generator replay
is required to recover them.

If regeneration cannot finish within that action, commit source plus explicit stale/blocked
status and preserved last-applied downstream artifacts atomically. Future output requiring
current geometry must respect that status. A later accepted regeneration is its own
clearly labelled transaction with causedByOperationId, unless the product explicitly
chooses a longer isolated transaction. Do not silently mutate downstream geometry after
the source transaction has completed or claim that two separately undoable operations
were one logical atomic action.

Example: change a Drawing Circle diameter after transfer to BOX. The Drawing solver
first returns one consistent canonical document. The dependency layer detects the linked
BOX source feature. It may produce an approved compatible update preserving unaffected
panel thickness, other connections and manufacturing settings. If that shape no longer
supports a referenced edge/joint, preserve existing edits and report blocked mappings;
do not replace source edge identity with the nearest generated edge. Undo restores the
old Circle, link status, target source, construction semantics and applied output together
for whatever scope was actually committed. This example does **not** declare Circle
transfer supported by today's straight-edge importer.

For Drawing → Puzzle, the same identity/invalidation contract applies without BOX.
For Modeling → Drawing, retain authored Drawing modifications separately from generated
base geometry; flattening never authorizes deleting later Drawing constraints/edits.
Which adjustments survive and which require review belongs to Stage E/F algorithms.

## 12. CAD regression risks and mitigation

The migration changes ownership and publication boundaries. It does not justify a solver,
topology, Circular Support, generator or manufacturing rewrite. Risks below are future
migration hazards, not claims that all corresponding defects currently exist.

| Risk | Source/accepted invariant | Proposed prevention and acceptance check |
| --- | --- | --- |
| Partial capture | BOX HistoryState omits svgModel; documents currently separate | Capture full module state inventories and source model. Undo source replacement must restore matching edges, assignments, panels, generated output and settings together. |
| Dimension/geometry split | solveDrawingDimensionEdit returns one complete solved document | Commit returned document once; assert target, all solved coordinates and intrinsic/hard residuals round-trip together. |
| Canonical Circle/Arc regression | Persistent center/radius; Arc P1/P2/CW/CCW; derived sweep/angles | Retain existing model types/resolvers. Compare IDs/orientation/extent before/after restore. Never store bulge or recreate center as a derived identity. |
| Shared-topology loss | Distinct SketchPoint identities may share coordinates; some identities are shared by geometry | Never deduplicate by coordinates on capture/Open/restore. Use existing defining-point/cleanup/reference boundaries. |
| Intrinsic equations become user Constraints | Arc owns two radial equations and five geometric DOF | Rebuild intrinsic functions through drawingEntityDefinition; do not serialize/append them to user collections. Verify DOF/rank parity. |
| Grip semantics altered | Circle body fixes center; Arc body fixes center; center rigidly translates; endpoint fixes opposite pivot | Reuse solveDrawingDragCandidate/geometric-intent solver. Regression covers free/constrained cases, both branches, major/near-full Arcs, exact pivots and 2R boundary. |
| Preview becomes history | Existing geometryDrag/startDocument and annotation-preview session | Keep preview outside committed store. One meaningful finish, zero on cancel/lost capture. Test event-rate independence and repeated pointer events. |
| Pending Profile action lost or duplicated | Accepted-click ownership and synchronous documentRef | Preserve flush/cancel/exactly-once contract with explicit restore/switch barrier; stale timer must not publish after Undo or remount. |
| Solver replay changes old geometry | Solver branch/tie-break and numerical tolerances | Restore exact validated outcomes; rebuild caches without solving new coordinates. Redo is not a pointer replay. |
| No-op filtering changes accepted semantics | Same-root fast path plus accepted deferred Arc empty/blind limitation | Do not use generic rounding, visible-pixel thresholds or new solver tolerance to remove entries. Any fix requires a separately approved change. |
| BOX output recomposed during restore | Stored output plus panelCompositionModel are resolved authority | Use restoreGeneratedGeometrySnapshot semantics verbatim. Verify slot/reference lineage, FinalGeometry, manufacturing and exported geometry parity. |
| BOX state changes after restore | Automatic TB/S synchronization effect; multiple setters | Consolidate candidate derivation and restoration guards. No post-restore effect may author a different frame or create a second entry. |
| BOX Apply/failure granularity changes accidentally | Explicit pushUndoState call sites differ between PM and geometry Apply | Characterize each action and failure ordering; review desired transaction boundaries before adapter migration. Failed candidate must not publish partial state in target design. |
| Authoring context mistaken for ordinary selection | assignmentTargetConnectionId influences next assignment | Retain contextual restoration initially; separate display selection only after parity checks. |
| Manufacturing target data dropped | selectedProfileOffsetIds selects compensation targets | Persist/history it with manufacturing settings, not transient selectedGeometry. |
| Dependency propagation overwrites edits | Stable source edge references and composed physical authority | Separate source/generated base from downstream authorship, identify affected features, block conflicts explicitly. No nearest-coordinate rebinding. |
| Leaked module callbacks | Drawing controller resets on unmount; local closures own handlers today | Project service acts on data independently of mounted views; navigation adapters receive ID/revision requests and clean up subscriptions. |
| Duplicate keyboard execution | Local Drawing keyboard handlers and toolbar callbacks | Cut over all entry routes to one service; respect focused INPUT/editor undo and verify exactly one transaction per shortcut. Do not keep two global handlers. |
| Hidden document mutation corrupts old frames | Readonly typing and shallow freeze do not recursively freeze all values | Restrict writes to model adapters; clone changed BOX subtrees before editing, development freeze checks and before/after immutability assertions. |
| Cross-session/recreated ID selects wrong object | edge-N/panel-N and labels may repeat | Document scope + incarnation registry; new creation gets new token, Undo resurrection gets old token. |
| Async stale result survives Undo/Open | Future workers and current delayed click callbacks | Non-rewinding base revision/epoch, token invalidation and compare-before-publish. |
| Metadata pins full history | Closures/root references can outlive buffer eviction | Metadata serialization/size contract and heap-retention checks; current provenance remains separately owned. |
| Changed UI falsely advertises global behavior | Current shared HistoryControls still uses local owners | Do not enable a global-history label until all supported modules use one edit execution authority and switch paths preserve it without recording navigation. |

Existing R1–R3, deferred Arc empty/blind Undo, unimplemented R5 and Stage 4 performance
limitations retain their authoritative status. A migrated test passing does not silently
resolve or reclassify them. Drawing annotation/support/inference presentation must not
leak into BOX manufacturing export. Preserve source → Panel Manager → construction →
generation → composition → reconciliation → FinalGeometry → compensation → preview/export.

## 13. Incremental migration strategy

**PROPOSAL FOR LATER AUTHORIZATION.** These slices describe a possible implementation
sequence within the approved roadmap. They do not create new roadmap stages or authorize
source/test/configuration changes now.

### Minimum before Stage C may safely begin

Review the detailed Stage B ownership/history interfaces while preserving the approved
foundation; decide remaining interaction policies D4 and technical lifecycle details in D5 below.
D1/D2 and the fundamental Clear/Open policy are settled product requirements; do not
reopen them as approval prerequisites. Confirm the complete module capture inventory,
transaction granularity, restoration/identity contracts and the parity test matrix.
Preserve the approved session-only execution history and fresh Clear/Open baselines
so Stage D does not require replacing the project model. Approve a separate implementation scope with a freshly
verified main baseline. **No Stage B production implementation is necessary or permitted
to manufacture approval of this report.**

Format extension/container and Stage E feature-matching algorithms need not be fully
selected before C, but C must preserve the agreed serializable content/reference boundary.
A panel implementation must not ship until its relevant metadata/navigation decisions
are resolved, even if the underlying project owner lands earlier.

| Suggested slice | Dependencies and implementation scope | Acceptance / rollback boundary |
| --- | --- | --- |
| C preparation — characterization | Approved Stage B contract; inventory current Drawing/BOX action boundaries, accepted-click behavior, contextual restore and failure cases with meaningful tests | Existing behavior recorded without asserting a new defect. No misleading global UI; revert this isolated test/analysis slice if assumptions prove wrong. |
| C ownership foundation | Wrap current documents in complete project/module structures and introduce one lifetime-above-views owner; preserve existing domain IDs and APIs through narrow adapters | Switch away/back retains documents and intended views; no changes to solver/generator results. Existing histories may temporarily remain separately labelled during internal migration, not presented as global. |
| C transaction core | Pure snapshot transition/cursor/prepare/restore service, 30-step combined retention, revision/epoch and identity registry | Invariant/property tests for atomicity, branching, retention and failed restore; not exposed as partially functioning global history. |
| C Drawing adapter | Consume unchanged mutation/solver results; preserve same-event placement and gesture-preview boundaries; replace local execution ownership | Segment/Dimension/Constraint/Circle/Arc/delete parity passes through real store adapter; no second Drawing history execution path. |
| C BOX adapter | Consolidate all authoring/settings/source/PM/Apply paths and automatic derivations into candidate transactions; retain applied result/authority and context | Source/assignments/settings/generated output restore together; mixed authority/compensation/export parity; agreed input/Apply failure semantics. No unrelated geometry rewrite. |
| C integrated cutover | Both supported modules migrated; selectors/panel use UI navigation, shortcuts/toolbar edits use one history service, restore explicitly activates the affected edit's module | Global cross-module scenarios pass, including unmounted target; remove old stacks/controller registration as execution authority. Enable truthful global controls only at this boundary. |
| C panel integration | Durable metadata/references and reviewed reveal/retention policy | Double-click locates current settings without rewind/Redo loss; stale/deleted/recreated/unmounted cases work; evicted entries clearly non-executable. |
| C/D session lifecycle | Shared epoch/publication gate and approved Clear/Open behavior; native Save completion contract before Save and Clear is enabled | Non-reversible project-wide Clear with three outcomes; failed/cancelled save preserves work; successful Open creates a fresh baseline; stale callbacks cannot publish across sessions. |
| D native persistence | Versioned project boundary + C transaction/restore; approved format/compatibility/preferences | Detached validation/migration, complete editable round trip, empty history on Open and failed-Open preservation; Save separate from manufacturing Export. |
| E dependencies | Shared owner/identity/history + D relationship persistence | Controlled Drawing-first transfers and regeneration; affected-work/conflict tests; source and consequences round-trip without silent edit loss. |
| F/G extension | Extend slots/adapters/validators/metadata with separately designed Modeling/Puzzle semantics | Optional modules, direct Drawing/BOX starts and parallel BOX/Puzzle stay valid; accepted CAD foundation is reused. |

During ownership preparation, any temporary adapter must state purpose, required callers,
exit condition and removal slice. Read-only comparisons against the legacy result can
assist development; do not maintain indefinitely divergent authoritative stores. At final
cutover, local old buffers are removed rather than synchronized with the new global one.

Do not attempt to manufacture historical semantic entries for an already-running legacy
session whose stacks lack operation metadata and full project snapshots. Prefer a new
global-history session at a deliberate release/session boundary, retaining the current
editable project as the initial frame. Any mid-session migration/recovery is a separately
specified contract. Do not clear work silently to make implementation easier.

Keep slices reviewable and independently reversible at the source-control level. Rollback
returns the coherent prior version/ownership route, not mixed old/new history execution.
If an experimental per-session gate is used, choose the route when creating the session;
do not toggle it during an in-progress drag or translate new history into incomplete old
snapshots. Verify capture-to-existing-module adapters preserve editable state before
using them as a recovery path. Once D writes new formats, rollback also requires explicit
format compatibility; reverting JavaScript alone cannot promise old-build readability.

## 14. Proposed acceptance and testing strategy

Everything in the following matrix is **proposed future validation**, not a test result
obtained for this documentation task. Reuse current domain suites; change brittle
source-shape assertions only when an authorized ownership change makes them obsolete.
Do not weaken behavioral assertions merely to pass a refactor.

| Layer | Required future cases and observable result |
| --- | --- |
| Pure history algebra | Successful commits/Undo/Redo round-trip exact frames and identities; validate zero, one, 30 and 31+ transitions; total past+future payloads ≤30; correct earliest reachable frame; no cursor movement on failed restore. |
| Branches | Undo then new committed edit discards executable future; failed/no-op/cancelled actions, ordinary switches and panel reveal preserve cursor/Redo; assert payload identities, counts and availability unchanged after navigation. |
| Global sequence | Circle in Drawing → BOX thickness edit → Drawing → Undo opens BOX and restores thickness immediately → Undo opens Drawing and removes Circle; Redo restores both in edit order. Add TB/W/S/Apply and unmounted modules; navigation contributes zero steps. |
| Navigation-only | Repeated switches, empty project, unsupported/current module and restore activation: no entries/cursor changes/Redo loss. Ignore obsolete active-module fields in snapshots; both Undo and Redo open the affected edit's module. |
| Drawing semantics | One Profile segment/standalone Line/Circle/Arc creation; automatic constraints/topology included; stable center/endpoints; Constraints/Dimensions/deletion and shared points restored together. |
| Solver/DOF | Target values plus complete solved component; two intrinsic Arc equations; canonical domains/branch; driving versus reference Dimensions; residual/rank/DOF parity before and after Undo/Redo. |
| Direct Manipulation | Mouse-down absolute geometry; one entry after many moves; fixed pivots and constrained propagation; invalid trial retention; cancel/Escape/lost capture/threshold; repeat/stale pointer-up; accepted R2/deferred no-op status preserved. |
| Accepted Profile timing | Timer/flush/double-click ownership, same-event inference reads latest committed geometry, navigation/Undo around pending click; exactly once or explicit reviewed cancellation. |
| BOX completeness | Source replacement, PM thickness/application, workflow groups, connection role/property edits, manufacturing targets/settings, generated output/composition model; each restores coherent source and authored/applied state. |
| BOX failure/derivation | Failed validation/authority/generation causes no partial root/history in target design; automatic TB/S updates included once; no post-restore mutation from effects; draft-versus-applied state preserved. |
| Manufacturing/export | Same source/applied result/settings produce equivalent FinalGeometry, metadata lineage, slots/taps, clearances then kerf and clean output. Before-Apply export behavior remains correctly distinguished. |
| Panel identities | Existing, deleted, Undo-resurrected, recreated same-label object, migrated ID, regenerated/split/ambiguous feature, missing settings, unavailable/unmounted module, cross-project ref, and evicted payload. Navigation uses current data only. |
| Panel subsequent edit | Older Line entry reveals current 30 mm Line; accept 50 mm as one edit, Undo 30 mm, Redo 50 mm, including all constraint-driven neighbor changes. After Undo, panel navigation preserves Redo until a new edit actually commits. |
| Clear lifecycle | All three choices; first-save destination cancellation, failed/partial save and denied permission leave project/history untouched; successful Save and Clear resets only the saved revision; Clear Without Saving writes no file; reset removes all module states/history; Undo cannot recover it. Late workers/timers/mount/save callbacks cannot repopulate or clear the new session. |
| Panel retention | Evict reversible payload while retaining metadata; prune old summaries without losing current dependency links or labels for retained Undo actions; no document retention through metadata/closures. |
| Restore/lifecycle | Invalidate pending async/timer tokens, no duplicate keyboard handlers, editor input owns text undo, no state from unmounted callbacks; selection/context validity and mount-ready request cancellation. |
| Persistence D | Current and supported migrated formats; empty/independent modules; canonical geometry/relationships/settings/artifacts; malformed keys/orders/refs/numbers, unsupported required module/version, missing assets, failed Open leaves project intact. Successful Open of the same or another project always creates empty Undo/Redo at the loaded baseline and rejects old-session async results; approved optional journal/view policies remain independent. |
| Dependencies E | Compatible source update preserves unaffected downstream edits; incompatible change is explicit/blocked; stale async generation rejected; source plus resolved consequences/status restore together; Drawing→Puzzle works without BOX. |
| Scale | Representative entity/constraint/annotation counts, large imported SVG/generated projects, 30 transitions and larger journal; measure prepare/validate/restore latency, preview rate, heap and released references. Agree numerical budgets from measured baselines. |

Use property-based/random operation sequences where they exercise invariants rather
than mirror implementation: immutability, identity non-reuse, cursor laws and reference
closure are good candidates. Keep source-shape assertions separate from model and
mounted-adapter integration tests. Use fault injection at prepare/validate/publish
boundaries to prove partial failures do not install a candidate.

Browser acceptance remains necessary for actual pointer sequences, selection/settings,
keyboard focus, cross-module switches, preview cancellation and history-panel reveal.
Automated tests/build do not substitute for the user's required browser acceptance.
Do not infer individual browser-case outcomes from the historical overall Stage 6 PASS.

For an authorized C rollout, run focused tests for each slice and the existing relevant
Drawing/BOX regression scripts; run the complete required regression inventory/build at
integrated cutover. Recheck script inventory rather than assume the historical count is
permanent. This report adds no tests and makes no application-pass claim.

## 15. Open decisions requiring user approval

Approved product requirements are not open design options. Technical recommendations
below still require review; approval does not authorize implementation or merge.

### Settled product decisions

| ID | Approved contract |
| --- | --- |
| D1 — resolved | Ordinary module switching is UI navigation, never an Undo step, and preserves cursor, all 30 edit slots and Redo. Undo/Redo restore the latest edit and open its associated module. |
| D2 — resolved | History double-click reveals current object/settings by stable identity, without rewind, history commit or Redo mutation. A later accepted edit is a normal transaction. No reveal override or reversible navigation stack is needed. |
| Clear/Open boundary — resolved | Clear permanently resets all current project/module/history state after the three-outcome save workflow; never Undoable. Successful native Open restores editable state as a fresh baseline without old Undo/Redo snapshots. |

### Remaining design decisions

| ID | Decision and options | Recommendation and consequence | Needed before |
| --- | --- | --- | --- |
| D0 | Detailed architecture/store host and contracts | Retain recommended C: immutable complete project snapshots + semantic metadata, one synchronous owner, no new library initially. Core product foundation is preserved; detailed interfaces/store host and the complete Stage B architecture remain unapproved. | C implementation authorization |
| D3 | Descriptive journal retention and abandoned-entry presentation | Independent bounded session journal; retain labels for all reversible transitions. Choose count/byte quota, pruning indicator and abandoned-entry visibility. No descriptive retention limit is approved. | C panel release |
| D4 | Logical action/interruption boundaries: BOX field sessions, Apply/PM behavior, accepted pending Profile click, active drag/editor on switch/Undo/Clear | Preserve accepted Drawing actions; specify exactly-once settlement versus explicit cancellation and lifecycle-gate entry. Any accepted edit is separate from navigation. Review BOX granularity before changing it. | Adapter implementation and integrated cutover |
| D5 | Technical session reset and initial UI defaults | Review cancellation/publication barrier and complete empty-project defaults; choose initial visible module and treatment of non-project preferences. Permanent Clear and fresh Open history are already settled, not alternatives. | C/D lifecycle enablement |
| D6 | Descriptive journal serialization, active-module preference, selection and views/camera | Session-only journal initially; optional versioned summaries if approved. Optional saved module/views, omit selection. Execution snapshots are excluded from native history; Open always starts empty. | D format finalization; earlier if panel promises durability |
| D7 | Native container/extension, compatibility/recovery and verifiable save completion | Select after asset/scale spike; strict required-data validation, lossless optional data only with a contract. Choose completion-capable persistence adapter or explicit reviewed completion acknowledgment for Save and Clear (§10). | D implementation / Save and Clear enablement |
| D8 | SVG Import replacement/confirmation and project-history behavior | Preserve BOX destination and unrelated documents; full replacement transaction only if approved, with dependent-link validation. | C source replacement / D Open menu |
| D9 | Dependency update timing, generated/authored ownership, conflicts and cycles | Controlled atomic updates or source plus explicit stale status; preserve unaffected edits, block ambiguous mapping; initially prefer acyclic derivations. Algorithms/UI need separate design. | E implementation |
| D10 | Performance budgets and optimization | Measure representative cases; agree latency/memory budgets before patches/selectors/workers/library. A count cap is no byte guarantee. | C scale acceptance |

## 16. Source references and evidence

All source links below are pinned to the verified baseline. Line ranges identify the
inspected contract; source symbols provide durable search terms if future code moves.
Local document references describe authority, not newly obtained runtime results.

### Source evidence

| ID | Exact source and relevant lines/symbols |
| --- | --- |
| S01 | [src/App.tsx:625–674](https://github.com/glimman79/svg-box-designer/blob/97469bd8274edae335254188dc8805f1141dc874/src/App.tsx#L625-L674): App state ownership. [2190–2223](https://github.com/glimman79/svg-box-designer/blob/97469bd8274edae335254188dc8805f1141dc874/src/App.tsx#L2190-L2223): workspace selectors, disabled Puzzle/Save and separate controllers. [2258](https://github.com/glimman79/svg-box-designer/blob/97469bd8274edae335254188dc8805f1141dc874/src/App.tsx#L2258): conditional Drawing mount. |
| S02 | [src/App.tsx:135–152](https://github.com/glimman79/svg-box-designer/blob/97469bd8274edae335254188dc8805f1141dc874/src/App.tsx#L135-L152): HistoryState. [257–300](https://github.com/glimman79/svg-box-designer/blob/97469bd8274edae335254188dc8805f1141dc874/src/App.tsx#L257-L300): limit/cloneHistoryState. [949–994](https://github.com/glimman79/svg-box-designer/blob/97469bd8274edae335254188dc8805f1141dc874/src/App.tsx#L949-L994): getCurrentHistoryState, restoreHistoryState, pushUndoState. [1492–1516](https://github.com/glimman79/svg-box-designer/blob/97469bd8274edae335254188dc8805f1141dc874/src/App.tsx#L1492-L1516): undoLastEdit/redoLastEdit. |
| S03 | [src/app/drawingHistory.ts:1–48](https://github.com/glimman79/svg-box-designer/blob/97469bd8274edae335254188dc8805f1141dc874/src/app/drawingHistory.ts#L1-L48): DrawingHistory, limit, transactDrawingDocument, undoDrawingDocument, redoDrawingDocument. |
| S04 | [src/app/DrawingWorkspace.tsx:146–200](https://github.com/glimman79/svg-box-designer/blob/97469bd8274edae335254188dc8805f1141dc874/src/app/DrawingWorkspace.tsx#L146-L200): props/UI/historyRef. [299–306](https://github.com/glimman79/svg-box-designer/blob/97469bd8274edae335254188dc8805f1141dc874/src/app/DrawingWorkspace.tsx#L299-L306): transactDocument. [1179–1230](https://github.com/glimman79/svg-box-designer/blob/97469bd8274edae335254188dc8805f1141dc874/src/app/DrawingWorkspace.tsx#L1179-L1230): Undo/Redo, controller registration, keyboard/delete. |
| S05 | [src/app/drawingTypes.ts:3–9](https://github.com/glimman79/svg-box-designer/blob/97469bd8274edae335254188dc8805f1141dc874/src/app/drawingTypes.ts#L3-L9): workspace selection. [11–179](https://github.com/glimman79/svg-box-designer/blob/97469bd8274edae335254188dc8805f1141dc874/src/app/drawingTypes.ts#L11-L179): canonical geometry/references/Dimensions/Constraints/V2 document. [202–230](https://github.com/glimman79/svg-box-designer/blob/97469bd8274edae335254188dc8805f1141dc874/src/app/drawingTypes.ts#L202-L230): migrateDrawingDocument, canonical Arc validation and independent Line migration. |
| S06 | [src/app/DrawingWorkspace.tsx:364–383](https://github.com/glimman79/svg-box-designer/blob/97469bd8274edae335254188dc8805f1141dc874/src/app/DrawingWorkspace.tsx#L364-L383): same-event committed-document inference. [591–623](https://github.com/glimman79/svg-box-designer/blob/97469bd8274edae335254188dc8805f1141dc874/src/app/DrawingWorkspace.tsx#L591-L623): accepted placement/ID creation/segment commit. [src/app/drawingProfileCommitBoundary.ts:1–51](https://github.com/glimman79/svg-box-designer/blob/97469bd8274edae335254188dc8805f1141dc874/src/app/drawingProfileCommitBoundary.ts#L1-L51): delay, schedule, flush, cancel ownership. |
| S07 | [src/app/DrawingWorkspace.tsx:758–759](https://github.com/glimman79/svg-box-designer/blob/97469bd8274edae335254188dc8805f1141dc874/src/app/DrawingWorkspace.tsx#L758-L759): drag baseline. [948–961](https://github.com/glimman79/svg-box-designer/blob/97469bd8274edae335254188dc8805f1141dc874/src/app/DrawingWorkspace.tsx#L948-L961): candidate/last-valid preview. [1135–1169](https://github.com/glimman79/svg-box-designer/blob/97469bd8274edae335254188dc8805f1141dc874/src/app/DrawingWorkspace.tsx#L1135-L1169): geometry/annotation finish. [src/app/drawingDirectManipulation.ts:242–330](https://github.com/glimman79/svg-box-designer/blob/97469bd8274edae335254188dc8805f1141dc874/src/app/drawingDirectManipulation.ts#L242-L330): solveDrawingDragCandidate, Arc center/radius semantic constraints. |
| S08 | [src/app/drawingEntityDefinition.ts:9–74](https://github.com/glimman79/svg-box-designer/blob/97469bd8274edae335254188dc8805f1141dc874/src/app/drawingEntityDefinition.ts#L9-L74): defining points/variables, intrinsic radial equations, domains. [src/app/drawingConstraintAnalysis.ts:402–420](https://github.com/glimman79/svg-box-designer/blob/97469bd8274edae335254188dc8805f1141dc874/src/app/drawingConstraintAnalysis.ts#L402-L420): analyzeDrawingConstraints and rank/DOF. |
| S09 | [src/app/drawingConstraintSolver.ts:630–636](https://github.com/glimman79/svg-box-designer/blob/97469bd8274edae335254188dc8805f1141dc874/src/app/drawingConstraintSolver.ts#L630-L636): verifyDrawingConstraints. [856–883](https://github.com/glimman79/svg-box-designer/blob/97469bd8274edae335254188dc8805f1141dc874/src/app/drawingConstraintSolver.ts#L856-L883): solveDrawingDimensionEdit circular path. [src/app/drawingConstraintsTool.ts:89–146](https://github.com/glimman79/svg-box-designer/blob/97469bd8274edae335254188dc8805f1141dc874/src/app/drawingConstraintsTool.ts#L89-L146): applyDrawingConstraint. [src/app/drawingDimension.ts:303–374](https://github.com/glimman79/svg-box-designer/blob/97469bd8274edae335254188dc8805f1141dc874/src/app/drawingDimension.ts#L303-L374): append/delete/move/cascade/ID helpers. |
| S10 | [src/app/generatedGeometrySnapshot.ts:7–59](https://github.com/glimman79/svg-box-designer/blob/97469bd8274edae335254188dc8805f1141dc874/src/app/generatedGeometrySnapshot.ts#L7-L59): version/metadata, createGeneratedGeometrySnapshot, verbatim authority restore. |
| S11 | [src/App.tsx:718–748](https://github.com/glimman79/svg-box-designer/blob/97469bd8274edae335254188dc8805f1141dc874/src/App.tsx#L718-L748): automatic property synchronization. [843–856](https://github.com/glimman79/svg-box-designer/blob/97469bd8274edae335254188dc8805f1141dc874/src/App.tsx#L843-L856): generated snapshot/FinalGeometry/compensation memos. [1446–1490](https://github.com/glimman79/svg-box-designer/blob/97469bd8274edae335254188dc8805f1141dc874/src/App.tsx#L1446-L1490): applyPanelPaths. [1598–1635](https://github.com/glimman79/svg-box-designer/blob/97469bd8274edae335254188dc8805f1141dc874/src/App.tsx#L1598-L1635): applyPanelManager/settings updates. |
| S12 | [src/App.tsx:166–233](https://github.com/glimman79/svg-box-designer/blob/97469bd8274edae335254188dc8805f1141dc874/src/App.tsx#L166-L233): buildWorkflowHistoryItems. [914–943](https://github.com/glimman79/svg-box-designer/blob/97469bd8274edae335254188dc8805f1141dc874/src/App.tsx#L914-L943): navigateToWorkflowHistoryItem. [2649–2665](https://github.com/glimman79/svg-box-designer/blob/97469bd8274edae335254188dc8805f1141dc874/src/App.tsx#L2649-L2665): single-click panel. [src/app/DrawingWorkspace.tsx:1566–1568](https://github.com/glimman79/svg-box-designer/blob/97469bd8274edae335254188dc8805f1141dc874/src/app/DrawingWorkspace.tsx#L1566-L1568): explanatory Drawing panel. |
| S13 | [src/svgUtils.ts:77–97](https://github.com/glimman79/svg-box-designer/blob/97469bd8274edae335254188dc8805f1141dc874/src/svgUtils.ts#L77-L97): SvgEdge/SvgPanel. [273–287](https://github.com/glimman79/svg-box-designer/blob/97469bd8274edae335254188dc8805f1141dc874/src/svgUtils.ts#L273-L287): SvgDocumentModel. [501–507](https://github.com/glimman79/svg-box-designer/blob/97469bd8274edae335254188dc8805f1141dc874/src/svgUtils.ts#L501-L507) and [869–876](https://github.com/glimman79/svg-box-designer/blob/97469bd8274edae335254188dc8805f1141dc874/src/svgUtils.ts#L869-L876): discovery-order IDs. [src/app/boxDocument.ts](https://github.com/glimman79/svg-box-designer/blob/97469bd8274edae335254188dc8805f1141dc874/src/app/boxDocument.ts): empty source model. |
| S14 | [src/app/generatedProfiles.ts:13–88](https://github.com/glimman79/svg-box-designer/blob/97469bd8274edae335254188dc8805f1141dc874/src/app/generatedProfiles.ts#L13-L88): GeneratedProfile/Group, qualified profile identity factory. [src/app/operationTypes.ts](https://github.com/glimman79/svg-box-designer/blob/97469bd8274edae335254188dc8805f1141dc874/src/app/operationTypes.ts): GeometryOperation/source refs are BOX operation contracts, not global reversible history. |
| S15 | [src/app/projectSettings.ts:5–43](https://github.com/glimman79/svg-box-designer/blob/97469bd8274edae335254188dc8805f1141dc874/src/app/projectSettings.ts#L5-L43): compensation targets/normalization. [src/app/panelManagerModel.ts:4–23](https://github.com/glimman79/svg-box-designer/blob/97469bd8274edae335254188dc8805f1141dc874/src/app/panelManagerModel.ts#L4-L23): PanelManagerState, creation/validation. |
| S16 | [src/app/HistoryControls.tsx](https://github.com/glimman79/svg-box-designer/blob/97469bd8274edae335254188dc8805f1141dc874/src/app/HistoryControls.tsx): presentation-only controls. [src/app/drawingDimensionDrag.ts:12–55](https://github.com/glimman79/svg-box-designer/blob/97469bd8274edae335254188dc8805f1141dc874/src/app/drawingDimensionDrag.ts#L12-L55): annotation session/preview/finish/cancel. |
| S17 | [src/App.tsx:996–1032](https://github.com/glimman79/svg-box-designer/blob/97469bd8274edae335254188dc8805f1141dc874/src/App.tsx#L996-L1032): handleImport source replacement/history reset. [1518–1552](https://github.com/glimman79/svg-box-designer/blob/97469bd8274edae335254188dc8805f1141dc874/src/App.tsx#L1518-L1552): current Construction Clear/confirmation. |
| S18 | [src/app/drawingDocumentMutation.ts:7–64](https://github.com/glimman79/svg-box-designer/blob/97469bd8274edae335254188dc8805f1141dc874/src/app/drawingDocumentMutation.ts#L7-L64): canonical Arc/Circle appends. [67–158](https://github.com/glimman79/svg-box-designer/blob/97469bd8274edae335254188dc8805f1141dc874/src/app/drawingDocumentMutation.ts#L67-L158): Line accepted topology/semantics. [src/app/drawingTopology.ts:38–57](https://github.com/glimman79/svg-box-designer/blob/97469bd8274edae335254188dc8805f1141dc874/src/app/drawingTopology.ts#L38-L57), [80–160](https://github.com/glimman79/svg-box-designer/blob/97469bd8274edae335254188dc8805f1141dc874/src/app/drawingTopology.ts#L80-L160): authoring-point identity, removeEntityAndOrphans and validateDrawingTopology. |

### Test and acceptance evidence inspected

| ID | Existing evidence, not a new execution result |
| --- | --- |
| T01 | [tests/drawing-history-transactions.test.mjs](../tests/drawing-history-transactions.test.mjs): valid segments, preview/cancel, 100-step boundary, Undo/Redo and branching. |
| T02 | [tests/drawing-history-controls.test.mjs](../tests/drawing-history-controls.test.mjs): generic controls/source wiring and a local atomic Dimension/geometry restoration demonstration; not mounted global history. |
| T03 | [tests/drawing-direct-manipulation.test.mjs](../tests/drawing-direct-manipulation.test.mjs): threshold/cancellation/last-valid source contracts and one-entry solved drag restoration. |
| T04 | [tests/drawing-circle-direct-manipulation.test.mjs](../tests/drawing-circle-direct-manipulation.test.mjs) and [tests/drawing-arc-direct-manipulation.test.mjs](../tests/drawing-arc-direct-manipulation.test.mjs): canonical grip behavior, absolute previews, constraints and History round trips. |
| T05 | [tests/drawing-circle-coincidence-runtime.test.mjs](../tests/drawing-circle-coincidence-runtime.test.mjs): manual Coincidence and shared-topology propagation through candidates/commits. |
| T06 | [tests/drawing-d2-3a-stabilization.test.mjs](../tests/drawing-d2-3a-stabilization.test.mjs): actual accepted Profile commit/transaction bodies, timer ownership, stale callbacks and same-event continuation. [tests/drawing-workspace-shell.test.mjs](../tests/drawing-workspace-shell.test.mjs) and [tests/box-empty-start.test.mjs](../tests/box-empty-start.test.mjs): current shell and BOX empty/restore source contracts. |
| T07 | [tests/diagnostics/generated-geometry-authority-restore.ts](../tests/diagnostics/generated-geometry-authority-restore.ts): TB/S/mixed stored-authority restoration, slots/references, FinalGeometry/manufacturing equivalence and fail-closed conflict checks. |
| T08 | [Roadmap Stage 0–6 record](../ROADMAP.md#circlearc-implementation-stages-and-status), [Project Master Stage 6](../PROJECT_MASTER.md#stage-6-final-acceptance-and-current-limitations), [Project History §11.26](../PROJECT_HISTORY.md#1126-stage-6-final-acceptance-and-regression-maintenance) and [§11.28 correction](../PROJECT_HISTORY.md#1128-drawing-undoredo-classification-correction-2026-11-04): recorded acceptance, historical results and current deferred/open boundaries. |

### Investigation limits and document validation

This was an ownership/transaction/restore and integration-boundary investigation, not
a complete line-by-line audit of every CAD algorithm. Inspected source areas are listed
above. The complete numerical internals of drawingConstraintSolver/geometric-objective
minimization, every snap/inference resolver, every TB/W/S workflow/generator branch,
panelComposer/reconciliation/compensation/export internals, all SVG import geometry
cases, and the entire test inventory were **not re-audited or executed**. Pipeline
invariants come from the authoritative architecture and inspected App/restore/diagnostic
boundaries. This scope does not support a new correctness or performance guarantee.

No current implementation of Modeling, Puzzle, native-file persistence, global history
or cross-module dependency propagation was available to inspect as a completed feature.
Their interface sketches are explicitly proposed/future responsibilities. No external
state-library benchmark or new dependency evaluation was performed beyond the architectural
comparison against the existing React/TypeScript stack.

Documentation validation for the 2026-11-09 revision:

- **PASS:** exact scope is ten Markdown files; the complete PR diff contains no application
  source, test or configuration changes, and no Stage C implementation.
- **PASS:** 121 local Markdown links, including 49 anchor targets; 53 baseline-pinned
  source links, including 50 source-line ranges, resolve against local baseline files.
- **PASS:** all 17 numbered sections, balanced fences and consistent table columns;
  `git diff --check` and complete diff review.
- **PASS:** protected CAD sections/acceptance records, original Dimension-analysis body,
  original source/test evidence and all seven A–G status labels remain unchanged.
- **PASS:** repository-wide requirement search; old module-switch and undoable-Clear
  policies remain only as explicitly superseded historical/conflict descriptions.

Historical source findings remain pinned to the original baseline. No documentation/
Markdown/lint script is defined in package.json. Focused scratch tooling is outside the
repository; application tests, production build and new browser acceptance were not run
or claimed for these documentation changes.

## 17. Final recommendation

Review **Alternative C: immutable complete project frames + semantic transaction metadata**
as the target architecture. It matches Drawing's existing solved-document outcomes,
preserves BOX's stored generated authority, and adds the operation/object context needed
by the panel without requiring inverse solver commands or a new state library.

Review detailed store, restoration and identity contracts before implementation,
resolve remaining transaction/lifecycle details, then separately authorize small Stage C
ownership and transaction slices with the parity gates above. Keep the 30-transition
buffer distinct from longer-lived panel summaries, and keep both distinct from future
dependency propagation. Stage D should serialize complete editable content through the
same validated project boundary; Stage E should add controlled source relationships and
regeneration without silently replacing downstream work.

The current approved product decisions are synchronized into the relevant vision,
Project Master, Architecture and roadmap requirements. Proposed interfaces/store choices
are not promoted to approved architecture, and A–G status labels stay unchanged. This
revision does not reopen accepted Circle/Arc Stages 0–6, fix deferred limitations,
authorize implementation, start Stage C, or authorize merging PR #629.
