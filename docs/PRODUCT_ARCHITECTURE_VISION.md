# Product Architecture Vision

**Decision date: 2026-11-03; history requirements revised 2026-11-09, aligned 2026-11-10. Status: APPROVED FUTURE PRODUCT REQUIREMENTS — NOT IMPLEMENTED.**

This document owns the detailed approved long-term requirements for a connected,
multi-module SVG Box Designer. It does not claim implementation or authorize application
changes. [PROJECT_MASTER.md](../PROJECT_MASTER.md) owns current architecture and its
concise product direction; [ROADMAP.md](../ROADMAP.md#4-connected-product-development)
owns planning and implementation status. [Architecture.md](../Architecture.md) maps the
current/target boundaries, and [PROJECT_HISTORY.md](../PROJECT_HISTORY.md#1127-connected-product-architecture-decision-2026-11-03)
records this decision and superseded recommendations. Explicit future requirements here
are authoritative for this scope; historical analyses do not override them.

The [Global Workspace UI Specification](GLOBAL_WORKSPACE_UI_SPECIFICATION.md) owns the
approved seven-region workspace layout and contextual controls. It refines placement
without implementing these requirements or changing A–G status; its UI-1–UI-4 sequence
is a proposed incremental plan, dependent on the existing project/history foundations.

## 1. Status and documentation inventory

The inventory and source inspection used GitHub `main`
`958e19609023984d10707a60f4a10c66ce6e0bd8`, verified by
`git ls-remote --heads origin main` on 2026-11-03. This is a fresh verification of the
previously supplied baseline, not an assumption that it remained current. No new
application tests or browser acceptance are claimed by this documentation update.

**2026-11-04 clarification:** The history ownership observations below were rechecked
against GitHub `main` `8630f40d31c7c7e71cab3d7cce7ac6673648c4b9` (merged PR #627).
The earlier functional-issue classification is corrected below following the user's
clarification; this source review does not establish exhaustive Undo/Redo verification.

| Area | Existing evidence and current boundary | Future direction / consistency finding |
| --- | --- | --- |
| Modules | [Master §§2–3](../PROJECT_MASTER.md#2-product-organization), [README](../README.md#application-areas), and [App](../src/App.tsx): implemented Drawing and BOX; disabled Puzzle reservation. | The current two-workspace implementation remains accurate; the target adds 3D Modeling and makes BOX/Puzzle parallel downstream modules. |
| 3D | [Roadmap §3G](../ROADMAP.md#g-deferred-assembly-presentation) planned only a static Construction preview; no modeling module is implemented. | That earlier preview-only scope does not limit the newly approved separate extrusion-based modeling module. Preview and modeling remain distinct capabilities. |
| Drawing | [Master §4](../PROJECT_MASTER.md#4-2d-drawing-architecture), [drawingTypes](../src/app/drawingTypes.ts), and [DrawingWorkspace](../src/app/DrawingWorkspace.tsx): semantic geometry, topology, Constraints, Dimensions, solver and transactions. | Preserve the accepted foundation; add independent and 3D-derived authoring roles without conflating source and downstream geometry. |
| BOX | [Architecture pipeline](../Architecture.md#pipeline), [Master §5](../PROJECT_MASTER.md#5-box--construction-architecture), and [boxDocument](../src/app/boxDocument.ts): SVG source/panels, construction contributors, FinalGeometry and manufacturing/export. | Drawing transfer must enter the established pipeline through an explicit contract; internal construction lineage is not complete cross-module provenance. |
| Puzzle | [Roadmap §2](../ROADMAP.md#2-puzzle) contains planned outer shapes, piece controls, optional frame and physical uniqueness; only a disabled selector exists in code. | Retain those prior commitments and open questions. This decision defines module integration without selecting algorithms, joint catalogs, manufacturing parameters or UI. |
| Drawing history | [drawingHistory](../src/app/drawingHistory.ts) stores document snapshots, with `DRAWING_HISTORY_LIMIT = 100`. `DrawingWorkspace` owns `historyRef` initialized to empty. `App` conditionally mounts that component. | Drawing history is lost when switching away and back, according to source inspection; the Drawing document itself remains in `App`. This is not a new browser reproduction. |
| Construction history | `App` owns snapshot Undo/Redo stacks capped by `maxHistoryEntries = 10`; it remains mounted across workspace switches. Its `HistoryState` excludes Drawing and active workspace. | Neither existing history is a complete project timeline. The earlier recommendation for separate histories is superseded as the future target, not removed from the current code. |
| History panels | `App` has a Construction workflow-group navigator using single-click; Drawing renders explanatory History text. | These are not the required persistent construction-operation panel or cross-module double-click editor navigation. |
| Persistence | `DrawingDocumentV2`, canonical validation/normalization and Construction snapshots are current foundations. `App` renders a disabled Save placeholder. [Stage 6](../ROADMAP.md#circlearc-implementation-stages-and-status) explicitly excluded actual Drawing Save/Reload. | Complete native Save/Open, a global project document and cross-module restoration are not implemented. SVG export is not native persistence. |
| Import / export / Clear / Fit | `App` imports SVG into Construction and exports Construction SVG; confirmed Clear resets Construction state and history without clearing Drawing. Construction Fit uses geometry bounds; Drawing Fit resets `initialDrawingViewBox`. | Preserve SVG's BOX destination. Current controls are not the complete global toolbar, whole-project Clear, or geometry-based Drawing Fit. |
| Circle/Arc | [Locked canonical model](../PROJECT_MASTER.md#locked-target-circlearc-architecture) and accepted [Stages 0–6](../ROADMAP.md#circlearc-implementation-stages-and-status). | Closed and unchanged. Preserve acceptance records, regression evidence, constraints/solver semantics and deferred issues. |
| Historical recommendation | [Drawing Dimension analysis §16](DRAWING_DIMENSION_ARCHITECTURE_ANALYSIS.md#16-history--undo--redo) recommended Drawing-owned snapshot history. Its audit also predates implemented Drawing history and tools. | Preserve the report as historical design evidence; one global history now supersedes separate workspace histories as the long-term direction. |

Status distinctions apply throughout:

- **Current implementation** means source-inspected behavior at the baseline; inspection
  alone does not establish browser acceptance.
- **Accepted and verified** refers to the existing recorded acceptance, especially the
  closed Circular Support migration; no historical test result is rewritten.
- **Approved future requirement** states intended product behavior, not a completed feature.
- **Proposal / DESIGN REQUIRED** states a possible plan or unresolved technical design,
  not a selected implementation. All new capabilities below remain unimplemented.

The user clarified that no current functional defect was found or confirmed during
their testing of Drawing Undo/Redo. This does not establish exhaustive action coverage.
Separate history ownership and loss of Drawing history on workspace unmount are
architectural limitations relative to the approved global project history, not evidence
of a defect while working within Drawing. Existing Stage 6 browser acceptance remains
intact. The known Arc empty/blind Undo issue remains separately **DEFERRED — accepted
known limitation** and is not fixed or reclassified by this correction.

## 2. Connected modules and optional workflows

The intended primary workflow is **3D Modeling → 2D Drawing → BOX or Puzzle**:

```text
3D Modeling (optional)
  -> 2D Drawing (also an independent starting point)
       -> BOX / Construction
       -> Puzzle
```

BOX and Puzzle are parallel destinations; Puzzle does not require passage through BOX.
This is not a mandatory linear wizard. Projects may use Drawing alone, Drawing + BOX,
Drawing + Puzzle, or a complete workflow starting in 3D. Every project need not use all
modules. Users must be able to move between modules without discarding existing work.

### 2.1 Simple 3D Modeling

The principle is **2D geometry + extrusion = simple 3D geometry**. Intended concepts are:

- Closed 2D profiles extruded into solids, including rectangular/polygonal panels,
  Circles extruded into cylinders, and profiles combining straight Lines and Arcs.
- Open Lines and Arcs extruded into surfaces, with optional thickness to create solid
  walls or panels. A bare open Arc does not by itself enclose a solid.
- Configurable extrusion depth and direction; positioning and rotation of multiple
  extruded objects; simple assemblies of those components.
- Editing source profiles and extrusion parameters rather than only storing final meshes.

Initial scope explicitly excludes advanced freeform sculpting, complex lofting and
general-purpose high-end mechanical solid/surface CAD. No extrusion kernel, topology
representation, 3D constraint system or rendering architecture has been selected.

### 2.2 Exploded View and Flatten to 2D

**Exploded View** is a separated 3D assembly view showing component relationships.
**Flatten to 2D** generates planar manufacturing or drawing representations from 3D
components. These are distinct operations; separating components visually does not
produce planar manufacturing geometry.

Generated 2D geometry should open in Drawing for inspection and further editing.
Source-to-generated relationships should remain traceable so source changes can
propagate without complete reconstruction. Regeneration, synchronization and conflict
resolution algorithms require later design.

There is no promise that every curved surface can be flattened without distortion.
Developable-surface handling and curved-panel manufacturing flattening require separate
technical design, eligibility rules and validation.

### 2.3 2D Drawing

Drawing remains both an independent authoring module and the drawing/editing environment
for geometry derived from 3D. Its geometry can become source material for either BOX or
Puzzle. The future project model must distinguish original 2D authoring geometry,
3D-derived geometry, and downstream construction/manufacturing geometry.

The accepted Circle/Arc model is preserved: Circle has persistent `centerPointId` and
radius; Arc has persistent center, radius, P1/P2 and CW/CCW orientation, with derived
angles/sweep. Persistent centers/endpoints, intrinsic equations, shared topology,
Constraints, Dimensions, solver and Direct Manipulation semantics remain authoritative.
Accepted transaction behavior and the Stage 0–6 acceptance/regression records remain
intact. This vision does not reopen that migration or fix its deferred Arc Undo issue.

### 2.4 BOX / Construction

BOX remains the downstream construction/manufacturing module for panel construction,
edge connections, joint generation, manufacturing preparation and SVG export. Drawing
geometry should eventually transfer through an explicit, traceable workflow into the
existing source → Panel Manager → construction → generated geometry → composition →
reconciliation → FinalGeometry → manufacturing → preview/export pipeline.

External SVG imported through the future Open menu must target BOX, regardless of the
active module. This preserves the current importer destination; it does not turn the
importer into a native project reader or silently extend supported SVG geometry.

### 2.5 Puzzle

Puzzle is a separate downstream module. A user creates a figure or contour in Drawing,
then uses it in Puzzle to produce puzzle-specific geometry and settings without BOX.
Prior [Puzzle roadmap commitments](../ROADMAP.md#2-puzzle) remain planned; this decision
adds integration requirements rather than selecting detailed puzzle features. Generation
algorithms, joint types, manufacturing settings and UI remain undefined/design-required.

## 3. One global project history

**Product decisions revised 2026-11-09 for PR #629.** These requirements supersede the
earlier module-switch history requirement and settle Clear/Open session boundaries.
The [Stage B analysis](GLOBAL_PROJECT_HISTORY_ARCHITECTURE_ANALYSIS.md) remains a technical
proposal for review; this does not approve the complete architecture or implementation.

The approved future requirement is **one global Undo/Redo system across 3D Modeling,
Drawing, BOX and Puzzle project edits**, plus the separate permanent parametric
construction history defined below. It supersedes the previous recommendation
to retain independent workspace histories. Existing implementations remain unchanged
until a separately authorized migration.

The shared limit is **30 reversible committed project-editing transitions**, including
editable settings. This differs from today's separate 100-entry Drawing and 10-entry
Construction limits. Ordinary module switches are navigation only: no history entry,
capacity use, cursor movement or Redo clearing. Undo reverses the latest committed
project edit regardless of the visible module and automatically opens that edit's module;
Redo behaves correspondingly. Only a newly committed edit after Undo discards its Redo
branch. Active-module UI state must not override the affected edit's restore context.

For example:

1. Create a Circle in Drawing.
2. Switch to BOX and change material thickness.
3. Switch back to Drawing.
4. Undo opens BOX and immediately restores the previous thickness.
5. A second Undo opens Drawing and removes the Circle.
6. Redo restores the Circle in Drawing, then the thickness edit in BOX.

There are two reversible edits in this sequence; navigation adds none.

**Approved tape-recorder behavior:** each completed state-changing user action creates
one logical Undo step across the entire project. This includes creating a Line, Circle,
Arc, sketch/profile or construction object; editing Dimensions, Constraints or BOX
parameters; moving/rotating/resizing; deletion; repair; and suppression/unsuppression.
One completed gesture/drag creates one step. Preserve accepted multi-click completion/
cancellation semantics; intermediate previews and invalid/cancelled/no-op input add none.

All automatic consequences belong to that same action, even when computed asynchronously:
Drawing source edit + solver effects + compatible BOX regeneration + failed/blocked
dependency diagnostics require **one Undo**, never a second step for late completion.
Undo of creation removes the object; Redo restores its captured identity/relationships.
Undo of deletion restores the original identity. Dimension Undo restores value and all
solved geometry. The combined past/future tape retains at most 30 transitions;
construction-operation definitions survive expiry of their creation transitions.

Pointer movement, hover and similar incidental interactions must not create history
steps. Navigation and project-editing history are architecturally distinct. Accepted
tool boundaries remain authoritative; exact restore/storage, BOX field acceptance and
interruption UI remain **DESIGN REQUIRED**. One-step automatic consequences, 30 positions
and navigation exclusion are settled requirements.

### 3.1 Interactive history panel

**Double-click a history entry to navigate to its relevant module and open the
corresponding object's settings.** The intended interaction is to locate the represented
operation/object, activate its module, locate/select the object if it still exists,
open its settings or editing controls, and allow a new change. Affected downstream
geometry then updates according to the future dependency rules.

Double-click navigation is distinct from chronological Undo/Redo. It must not
create an Undo step, move the history cursor, mutate Redo or rewind the project to an old
snapshot. It selects/reveals the object's **current** state and opens current controls.
A later accepted edit is a normal global transaction: for example, current Line length
30 mm → 50 mm gives Undo to 30 mm and Redo to 50 mm, including constraint-driven changes.
The panel therefore requires identifiable operations and persistent references, not merely
an opaque list of snapshots. No command-log, event-sourcing or snapshot storage design
is selected here.

Later design must handle deleted objects, renamed/regenerated objects, invalidated
references, reused local IDs with different object lifetimes, unmounted/unavailable
modules and expired reversible snapshots. Retained entries may still navigate to a current
object after snapshot eviction. Missing objects are never resurrected by double-click.
Detailed identity/selection adapters and downstream-conflict algorithms remain proposals;
see Stage B §9. Current construction operations remain available/editable after their
original Undo transition expires; native persistence is mandatory. No arbitrary
100/250-entry journal quota may bound construction history.

### 3.2 Permanent parametric construction history

**APPROVED FUTURE REQUIREMENT — NOT IMPLEMENTED (2026-11-09).** This persistent,
project-owned system is inspired by Fusion 360's parametric design timeline. It contains
meaningful construction operations with stable identities, editable current parameters,
object references and dependency relationships. It is distinct from Undo snapshots,
event logs, semantic transaction journals and audit logs, and is not limited by Undo's
30 steps or an arbitrary journal quota. Persist it with the complete editable native
project. The previous Stage B bounded session-journal proposal is explicitly superseded
as a solution for construction history; an optional descriptive event journal is not an
approved requirement.

Create a 30 mm Line: one construction operation and one Undo step. Edit to 50 mm, then
70 mm: update the **same** operation each time, with one new Undo transaction per
accepted edit. Undo/Redo restores the corresponding current parameters and complete
geometry consistently. Expired Undo transitions do not remove the operation. Double-click
opens its current settings without rewinding or changing Redo.

Operations support conceptual Edit, Review Warning/Error, Repair Reference, Suppress
and Delete actions. Preserve identities across Undo restoration; genuine recreation
with reused local IDs is a new lifetime. Every completed meaningful construction operation
has an editable entry: Line, Circle, Arc, profile, independently authored Dimension or
relationship/Constraint, BOX, finger joints and other geometry/manufacturing operations.
Multi-step tools record accepted completed operations, not mouse clicks; Profile retains
per-segment completion, and groups retain editable member definitions. One operation may
produce multiple objects; edits update existing definitions, and automatic solver mutations
create no separate entries. Selection, tool/panel opening and unfinished previews create
neither operation nor Undo action. Exact catalog/grouping, parameter bindings, migration
and UI remain **DESIGN REQUIRED**, within this coverage contract and accepted tool semantics.
The [Stage B model and acceptance criteria](GLOBAL_PROJECT_HISTORY_ARCHITECTURE_ANALYSIS.md#9-permanent-parametric-construction-history-and-navigation)
are technical recommendations for review, not implementation.

## 4. Cross-module dependencies are separate from history

Global history provides chronological Undo/Redo. Dependencies let users correct earlier
source geometry and update affected downstream work. Undo/Redo alone does not satisfy
the requirement to correct a late-discovered error without rebuilding everything.

Required future scenarios include a 3D profile changed after generating a drawing, a
Drawing Circle diameter changed after transfer to BOX, a figure changed after puzzle
generation, and a panel shape changed after manufacturing settings were configured.

The future architecture should support stable object identity where applicable,
traceable source-to-derived relationships and provenance, affected-geometry detection,
controlled regeneration, preservation of unaffected downstream edits, explicit handling
of incompatible changes, and avoidance of silent data loss. Not every downstream
setting can necessarily survive every source change automatically.

Invalidate explicit entity, profile/contour, sketch or source-set dependencies, then
evaluate only the affected closure in dependency order, including necessary solver or
composition units. Creating Circle B does not regenerate BOX A referencing only Line A;
it may affect a consumer if its referenced profile/sketch/set changes. Editing old Line A
50→70 mm in place updates affected Drawing/constraints→BOX→finger joints as one Undo
action, preserving valid later operations and unrelated branches; no Undo rewind is needed.

**Approved dependency failure behavior — Option A:** keep an otherwise valid source
edit, update compatible branches, and retain failed/blocked downstream definitions,
parameters, refs, diagnostics and unaffected authored work for repair or removal. A
downstream failure cannot automatically reject the source edit, silently delete dependents
or guess replacement refs. Distinguish valid, warning, error, stale/pending, blocked and suppressed
states. Retained last-known-good artifacts must be visibly distinguished from validated
current geometry. Each failed or blocked operation has its own visible diagnostic state.
Click/select a marked operation to identify it, see the failure/blocking reason and causal
reference/dependency, and open current editable settings where supported. An accepted
parameter/reference repair re-evaluates the affected closure in one Undo action without
silently removing later authored work; not every error is repairable. Suppression/deletion
must detect consequences and be Undoable.

One controlled mutation boundary must keep operation state, geometry, dependency
statuses and affected results consistent. A valid source edit and **all** its automatic
valid/failed consequences are one logical Undo action, regardless of timing. The prior
proposal of a source/stale transaction plus a second regeneration transaction is
**superseded**. Sealed Undo/Redo restores exact captured outcomes without generator replay.
Navigation, mount effects and failed previews cannot create hidden history edits.

**Technical recommendation for review, not implementation:** Stage B §11 compares three
async models and recommends one pending logical action with serialized admission as a
possible initial implementation baseline.
It reserves one of the 30 positions, stages results off-store and seals the same slot
once. Undo suspends it and rejects late callbacks; unfinished Redo restores the captured
source/identities and resumes under a fresh attempt; sealed Redo restores the exact final
result. While pending, further project-edit requests are visibly unaccepted, never
queued or merged. Navigation remains available; completion never switches modules.
Save waits for settlement or cancels, preserving editable failure records on successful
Save; Export is blocked while pending and still validates the full scope after settlement.
Clear/Open use session barriers. The global wait belongs only to this baseline.

**Approved long-term requirement:** dependency-aware responsive authoring must allow
unrelated Drawing creation without waiting for unrelated BOX regeneration merely because
another module is busy. Preserve every accepted interaction and its logical Undo position;
reject stale async results and restore coherent project states. Stage E refines concurrency
and scheduling. The proposed single-slot/no-successor model may need significant changes;
C/D must preserve compatible identity, action-ordering and immutable content boundaries
([Stage B risk and contract](GLOBAL_PROJECT_HISTORY_ARCHITECTURE_ANALYSIS.md#alternatives-and-recommendation)).
Concurrent editing is not solved here; bounded budgets and evaluator design remain deferred.

**Manufacturing safety:** stale, failed or otherwise unvalidated geometry cannot silently
be valid laser/export output. Independent valid output requires explicit scope and full
validation; the availability/UX of partial export remains a design decision. No implicit
export of last-known-good artifacts is allowed.

Dependency graph representation, verified feature mapping, scheduling/async acceptance,
generated-versus-authored ownership and regeneration algorithms remain design work.
Fusion's warning/error repair workflow is behavioral inspiration; no claim is made that
every implementation detail has been verified.
Current within-sketch solver propagation and Construction reconciliation are useful
foundations, not evidence that project-wide dependency propagation already exists.

## 5. Global toolbar contract

The top bar must consistently group module navigation, project commands and Undo/Redo.
Keep the shared project controls ordered across modules:

Project control order: **Open → Save → Export → Clear → Undo → Redo**.

The approved [workspace UI placement](GLOBAL_WORKSPACE_UI_SPECIFICATION.md#3-seven-approved-ui-regions)
supersedes the earlier top-bar Fit requirement: Fit appears only with canvas zoom
controls. Module tools occupy the left toolbar; Apply/Finish Group are contextual canvas
controls only where relevant; permanent construction history is a shared bottom timeline.
Relocation preserves tool acceptance, cancellation and Undo boundaries.

Unavailable functionality may be disabled with a clear explanation. Module-specific
tools remain contextual. The present conditional Construction/Drawing action groups
do not yet implement this contract.

| Control | Approved future behavior | Current boundary / design work |
| --- | --- | --- |
| Open | One control with explicit **Open Project** and **Import SVG** options. Open Project restores the complete editable project. Import SVG always targets BOX, regardless of active module. | Existing SVG import is Construction-only; native Open Project is unimplemented. Import replacement/confirmation and navigation details require design. |
| Save | Preserve the complete editable project across relevant modules, including source relationships and downstream authoring state. | Disabled placeholder today; native format, serialization and restoration require design. |
| Export | Produce output for the relevant manufacturing/downstream use case; behavior may differ by module. | Current Construction SVG export does not establish Drawing, 3D or Puzzle export. Export is distinct from Save. |
| Clear | Permanent whole-project session reset, never Undoable. Offer Save and Clear / Clear Without Saving / Cancel. Save and Clear requires successful complete native Save; failure/cancellation leaves project/history untouched. Reset all project/module states and Undo/Redo into a clean empty session; clearing itself never deletes or overwrites saved files. | Existing Construction-only Clear is insufficient. Session/async guards must prevent stale callbacks repopulating the project. First Save requests a destination; save completion must be verified. See Stage B §10 for the proposed lifecycle gate. |
| Fit to screen (canvas only) | Keep alongside canvas zoom; remove the redundant top-bar control while preserving functionality. Viewport action, no construction entry or Undo step. Compute bounds from relevant active-module geometry; eventually use suitable 3D fitting. | Drawing's current fixed view reset is insufficient. Bounds policy and the 3D camera design remain open; relocation does not implement them. |
| Undo / Redo | Use the single 30-edit global timeline; automatically open the affected edit's module. Navigation preserves Redo and consumes no steps. | Current toolbar controllers route to isolated histories. Transaction and persistence architecture remain open. |

## 6. Native project persistence

Save/Open must restore a complete editable multi-module project. It must preserve enough
information for editable source geometry; Drawing entities and persistent identities;
Constraints and Dimensions; canonical Circle/Arc geometry; 3D extrusion definitions and
assembly relationships; BOX construction state and manufacturing settings; Puzzle
geometry/settings; permanent construction operations, parameters, input/output and
dependency relationships, suppression/evaluation/diagnostic state; generated geometry and provenance;
and appropriate project metadata and schema version.

`DrawingDocumentV2`, Construction models and stored generated snapshots are current
foundations to wrap or migrate deliberately, not a completed native format. Ordinary
SVG export cannot stand in for restoring native authoring state and relationships.

Format/container choice, validation, schema evolution and restore boundaries require
technical design. **Approved:** native Open restores saved editable content into a fresh
Undo/Redo session, with the loaded project as baseline; previous execution snapshots are
not restored or required in the native file. Invalidate pending work from the previous
runtime session, even when reopening the same project. Save alone does not reset current
history. Permanent construction history is required saved editable content, including
repairable failed/blocked states. An optional descriptive journal is not a requirement;
viewport, selection and active-module disk preferences remain unresolved. In-session Undo/Redo activation
comes from the affected edit, never an obsolete saved tab.

## 7. Proposed delivery structure and unresolved decisions

The [Roadmap A–G sequence](../ROADMAP.md#4-connected-product-development) is a planning
proposal, not a release schedule. All stages are **NOT STARTED**. Shared controls may
appear disabled before their correct project-wide operations exist; native persistence,
history and transfer must build on designed ownership boundaries. Drawing-first transfer
and dependencies need not wait for 3D. Later 3D and Puzzle integration must extend those
boundaries rather than reopen accepted Circle/Arc stages.

**Recommended implementation dependency plan, awaiting review:** B defines ownership,
identity, persistent operations, transaction integration and dependency interfaces. C
implements shared ownership/global Undo and reserves one pending action's admission,
finalization, suspension/resumption, abandonment and lifecycle guards; synchronous edits
seal immediately. The dependency evaluator/scheduler and feature mapping stay in E.
A distinct **C.2 construction-history
foundation** should implement operation maintenance/bindings and current-settings
navigation before D's format freeze. D preserves the complete editable operation graph
with fresh executable history on Open. E supplies tracking, controlled regeneration,
warning/error propagation, reference repair and downstream management. C.2 is a proposed
substage, not an approved implementation or status change; C must not silently absorb
the full Stage E engine.

The following remain unresolved, rather than implicitly approved implementations:

| Design area | Questions requiring later decisions |
| --- | --- |
| Project ownership | Complete project-state boundary; wrapping/migration of existing models; module document ownership. |
| Undo/Redo | Exact store/restore and pending-action admission UX, lifecycle gate/defaults and remaining field/interruption boundaries. One action including automatic consequences, 30 positions, navigation exclusion, permanent Clear and fresh Open history are settled. |
| Construction operations | Catalog/granularity, parameter bindings, output identity/mapping and legacy baseline migration; proposed C.2 and current-settings adapters. Permanent project ownership, persistence and independence from Undo capacity are settled. |
| Persistence | Native format, operation/schema compatibility, validation/migration, Save completion and optional disk UI preferences. Operations/relationships must persist; Open never restores previous Undo/Redo snapshots. |
| Geometry transfer | Source/derived ownership, supported transfer geometry, identity/provenance and compatibility with the existing straight-edge SVG importer. |
| Dependencies | Bounded scheduling, deterministic/versioned unfinished evaluation, coherent units, mapping/repair and generated/authored ownership; suppress/delete UX and manufacturing scope validation. Option A, one logical action across async consequences and no silent invalid export are settled. |
| 3D | Kernel, topology, constraint handling, rendering/camera, surface versus thickened-solid extrusion, assembly representation and supported flattening/developability. |
| Puzzle | Generation, joint types, uniqueness validation, manufacturing settings and UI, subject to existing roadmap commitments. |
| Existing history migration | Analyze separate history ownership and Drawing history lifetime for global-history migration; preserve existing working behavior and keep the accepted deferred Arc empty/blind Undo limitation separate. |

No application functionality, migration, refactoring, test change or new acceptance
result is part of this documentation decision.
