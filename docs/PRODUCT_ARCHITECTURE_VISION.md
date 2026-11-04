# Product Architecture Vision

**Decision date: 2026-11-03. Status: APPROVED FUTURE PRODUCT REQUIREMENTS — NOT IMPLEMENTED.**

This document owns the detailed approved long-term requirements for a connected,
multi-module SVG Box Designer. It does not claim implementation or authorize application
changes. [PROJECT_MASTER.md](../PROJECT_MASTER.md) owns current architecture and its
concise product direction; [ROADMAP.md](../ROADMAP.md#4-connected-product-development)
owns planning and implementation status. [Architecture.md](../Architecture.md) maps the
current/target boundaries, and [PROJECT_HISTORY.md](../PROJECT_HISTORY.md#1127-connected-product-architecture-decision-2026-11-03)
records this decision and superseded recommendations. Explicit future requirements here
are authoritative for this scope; historical analyses do not override them.

## 1. Status and documentation inventory

The inventory and source inspection used GitHub `main`
`958e19609023984d10707a60f4a10c66ce6e0bd8`, verified by
`git ls-remote --heads origin main` on 2026-11-03. This is a fresh verification of the
previously supplied baseline, not an assumption that it remained current. No new
application tests or browser acceptance are claimed by this documentation update.

| Area | Existing evidence and current boundary | Future direction / consistency finding |
| --- | --- | --- |
| Modules | [Master §§2–3](../PROJECT_MASTER.md#2-product-organization), [README](../README.md#application-areas), and [App](../src/App.tsx): implemented Drawing and BOX; disabled Puzzle reservation. | The current two-workspace implementation remains accurate; the target adds 3D Modeling and makes BOX/Puzzle parallel downstream modules. |
| 3D | [Roadmap §3G](../ROADMAP.md#g-deferred-assembly-presentation) planned only a static Construction preview; no modeling module is implemented. | That earlier preview-only scope does not limit the newly approved separate extrusion-based modeling module. Preview and modeling remain distinct capabilities. |
| Drawing | [Master §4](../PROJECT_MASTER.md#4-2d-drawing-architecture), [drawingTypes](../src/app/drawingTypes.ts), and [DrawingWorkspace](../src/app/DrawingWorkspace.tsx): semantic geometry, topology, Constraints, Dimensions, solver and transactions. | Preserve the accepted foundation; add independent and 3D-derived authoring roles without conflating source and downstream geometry. |
| BOX | [Architecture pipeline](../Architecture.md#pipeline), [Master §5](../PROJECT_MASTER.md#5-box--construction-architecture), and [boxDocument](../src/app/boxDocument.ts): SVG source/panels, construction contributors, FinalGeometry and manufacturing/export. | Drawing transfer must enter the established pipeline through an explicit contract; internal construction lineage is not complete cross-module provenance. |
| Puzzle | [Roadmap §2](../ROADMAP.md#2-puzzle) contains planned outer shapes, piece controls, optional frame and physical uniqueness; only a disabled selector exists in code. | Retain those prior commitments and open questions. This decision defines module integration without selecting algorithms, joint catalogs, manufacturing parameters or UI. |
| Drawing history | [drawingHistory](../src/app/drawingHistory.ts) stores document snapshots, with `DRAWING_HISTORY_LIMIT = 100`. `DrawingWorkspace` owns `historyRef` initialized to empty. `App` conditionally mounts that component. | Drawing history is lost when switching away and back, according to source inspection; the Drawing document itself remains in `App`. This is not a new browser reproduction. |
| Construction history | `App` owns snapshot Undo/Redo stacks capped by `maxHistoryEntries = 10`; it remains mounted across workspace switches. Its `HistoryState` excludes Drawing and active workspace. | Neither existing history is a complete project timeline. The earlier recommendation for separate histories is superseded as the future target, not removed from the current code. |
| History panels | `App` has a Construction workflow-group navigator using single-click; Drawing renders explanatory History text. | These are not the required global chronological history or cross-module double-click editor navigation. |
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

The user additionally reports that Drawing Undo/Redo does not work as expected for all
actions. This is an **OPEN USER-REPORTED ISSUE — investigation required**, without a
newly established cause or claimed fix. It does not erase the recorded Stage 6 browser
acceptance. The known Arc empty/blind Undo issue remains separately **DEFERRED — accepted
known limitation**; neither issue is resolved by documenting global history.

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

The approved future requirement is **one global project history across 3D Modeling,
Drawing, BOX, Puzzle and module navigation**. It supersedes the previous recommendation
to retain independent workspace histories. Existing implementations remain unchanged
until a separately authorized migration.

The target history depth is within **10–30 steps, with 30 steps as the design target**.
This differs from today's separate 100-entry Drawing and 10-entry Construction limits.
Module switches belong to the shared timeline. Undo/Redo must cross module boundaries
and consistently restore relevant project state together with the active module.

For example:

1. Create geometry in 3D.
2. Switch to Drawing.
3. Generate or edit a 2D drawing.
4. Switch to Puzzle.
5. Change a puzzle setting.
6. Undo the setting change.
7. Undo the module switch, returning to Drawing and the corresponding project state.

Pointer movement, hover and similar incidental interactions must not create history
steps. The exact transaction boundary, policy for other navigation/UI-only state,
restore strategy and storage mechanism remain **DESIGN REQUIRED**. Today's Drawing
rule excluding UI-only panel state describes current behavior, not a final policy for
all future global navigation.

### 3.1 Interactive history panel

**Double-click a history entry to navigate to its relevant module and open the
corresponding object's settings.** The intended interaction is to locate the represented
operation/object, activate its module, locate/select the object if it still exists,
open its settings or editing controls, and allow a new change. Affected downstream
geometry then updates according to the future dependency rules.

Double-click navigation is distinct from chronological Undo/Redo. It must not
automatically discard subsequent work or rewind the project to an old snapshot. The
panel therefore requires identifiable operations and persistent references, not merely
an opaque list of snapshots. No command-log, event-sourcing or snapshot storage design
is selected here.

Later design must handle deleted objects, renamed/regenerated objects, invalidated
references, operations without editable settings, historical settings that no longer
match current geometry, and conflicts with later dependent operations. This document
does not invent completed fallback behavior for those cases.

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

Dependency graph representation, identity across regeneration, update timing,
synchronization, conflict resolution and regeneration algorithms remain design work.
Current within-sketch solver propagation and Construction reconciliation are useful
foundations, not evidence that project-wide dependency propagation already exists.

## 5. Global toolbar contract

The common controls must remain consistently visible and ordered across all modules:

**Open → Save → Export → Clear → Fit to screen → Undo → Redo**

Unavailable functionality may be disabled with a clear explanation. Module-specific
tools remain contextual. The present conditional Construction/Drawing action groups
do not yet implement this contract.

| Control | Approved future behavior | Current boundary / design work |
| --- | --- | --- |
| Open | One control with explicit **Open Project** and **Import SVG** options. Open Project restores the complete editable project. Import SVG always targets BOX, regardless of active module. | Existing SVG import is Construction-only; native Open Project is unimplemented. Import replacement/confirmation and navigation details require design. |
| Save | Preserve the complete editable project across relevant modules, including source relationships and downstream authoring state. | Disabled placeholder today; native format, serialization and restoration require design. |
| Export | Produce output for the relevant manufacturing/downstream use case; behavior may differ by module. | Current Construction SVG export does not establish Drawing, 3D or Puzzle export. Export is distinct from Save. |
| Clear | Global whole-project operation, with clear confirmation before discarding project data. Account for all module documents, generated geometry, dependencies, history and relevant settings. | Existing confirmed Construction Clear does not clear the Drawing document and is insufficient. Clear's interaction with history/recovery requires explicit design. |
| Fit to screen | Compute bounds from relevant geometry in the active module; eventually use suitable 3D viewport fitting for 3D geometry. | Drawing's current fixed view reset is insufficient. Bounds policy and the 3D camera design remain open. |
| Undo / Redo | Use the single global project timeline, including module switches. | Current toolbar controllers route to isolated histories. Transaction and persistence architecture remain open. |

## 6. Native project persistence

Save/Open must restore a complete editable multi-module project. It must preserve enough
information for editable source geometry; Drawing entities and persistent identities;
Constraints and Dimensions; canonical Circle/Arc geometry; 3D extrusion definitions and
assembly relationships; BOX construction state and manufacturing settings; Puzzle
geometry/settings; cross-module source relationships; generated geometry and provenance;
and appropriate project metadata and schema version.

`DrawingDocumentV2`, Construction models and stored generated snapshots are current
foundations to wrap or migrate deliberately, not a completed native format. Ordinary
SVG export cannot stand in for restoring native authoring state and relationships.

Format/container choice, validation, schema evolution and restore boundaries require
technical design. Whether full Undo/Redo history is serialized must be decided
explicitly; neither inclusion nor exclusion is approved here. Persistence of viewport
state, selection and active module also requires deliberate decisions. Restoring an
active module during in-session Undo/Redo is required; its disk persistence is a
separate question.

## 7. Proposed delivery structure and unresolved decisions

The [Roadmap A–G sequence](../ROADMAP.md#4-connected-product-development) is a planning
proposal, not a release schedule. All stages are **NOT STARTED**. Shared controls may
appear disabled before their correct project-wide operations exist; native persistence,
history and transfer must build on designed ownership boundaries. Drawing-first transfer
and dependencies need not wait for 3D. Later 3D and Puzzle integration must extend those
boundaries rather than reopen accepted Circle/Arc stages.

The following remain unresolved, rather than implicitly approved implementations:

| Design area | Questions requiring later decisions |
| --- | --- |
| Project ownership | Complete project-state boundary; wrapping/migration of existing models; module document ownership. |
| History | Transactions and navigation policy beyond module switches; state restoration and active-module consistency; storage mechanism; bounded retention and relationship to identifiable panel operations; Clear/recovery behavior. |
| History editing | Durable operation/object references, identity after regeneration, missing/non-editable objects, stale settings and downstream conflicts; lifetime of panel entries beyond Undo retention. |
| Persistence | Native format, schema/validation/migration, serialization of history, viewports, selections and active module. |
| Geometry transfer | Source/derived ownership, supported transfer geometry, identity/provenance and compatibility with the existing straight-edge SVG importer. |
| Dependencies | Representation, affected-work detection, regeneration, preservation of unaffected edits, incompatible changes and synchronization/conflict handling. |
| 3D | Kernel, topology, constraint handling, rendering/camera, surface versus thickened-solid extrusion, assembly representation and supported flattening/developability. |
| Puzzle | Generation, joint types, uniqueness validation, manufacturing settings and UI, subject to existing roadmap commitments. |
| User-reported history issue | Investigate action coverage and reproduction separately from the accepted deferred Arc empty/blind Undo limitation. |

No application functionality, migration, refactoring, test change or new acceptance
result is part of this documentation decision.
