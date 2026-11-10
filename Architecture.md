# Application Architecture and Box / Construction Pipeline Map

> **Status: current orientation and future-boundary map.** [PROJECT_MASTER.md](PROJECT_MASTER.md) is the authority for current architecture. [Product Architecture Vision](docs/PRODUCT_ARCHITECTURE_VISION.md) owns the detailed approved future requirements; its target is not implemented. Historical pipeline snapshots and investigations are indexed in [docs/README.md](docs/README.md).

## Current application versus connected target

The current application has separate Drawing and Construction documents owned in `App`,
a mounted `DrawingWorkspace` hidden while inactive, and a disabled Puzzle selector. There is no
3D Modeling module, complete native project Save/Open, cross-module geometry-transfer
contract or dependency/regeneration system. `DrawingDocumentV2`, Construction models and
generated snapshots are foundations rather than a completed shared project format.

Historical source inspection rechecked on 2026-11-04 at main
`8630f40d31c7c7e71cab3d7cce7ac6673648c4b9` confirms:

- Drawing uses document snapshots capped at 100 Undo entries (`drawingHistory.ts`). Its
  `historyRef` belongs to `DrawingWorkspace` and is lost on unmount during a workspace
  switch; `App` retains the Drawing document. This is source evidence, not a browser test.
- Construction snapshots are capped at 10 and owned in `App`; they remain mounted but
  do not include Drawing or active workspace. Neither history is global.
- Construction's single-click workflow-group History navigator and Drawing's explanatory
  History panel are not an identifiable global operation timeline.
- Import and SVG export serve Construction. Save is disabled; confirmed Construction
  Clear does not clear Drawing. Construction Fit derives geometry bounds while Drawing
  Fit resets a fixed view. Conditional toolbar groups are not the target global toolbar.

**UI-1 current checkpoint (2026-11-10):** `WorkspaceTopBar` consolidates module navigation,
BOX-scoped project commands and active-module local Undo/Redo. `WorkspaceShell` shares
layout boundaries and keeps module owners mounted; Drawing history/tool/selection state
now survives ordinary switches. Hidden Drawing keyboard and activation events are gated.
Drawing Dimension/Constraints launchers join its left tools. Import/Export/Clear retain
BOX semantics; Open/Save remain disabled. Existing Fit/Apply/Finish Group and bottom
History are unchanged. [Validation](docs/UI1_SHARED_WORKSPACE_SHELL_VALIDATION.md) records
the automated checks; user acceptance is pending. The historical observations above
remain evidence of the earlier architecture, not the current mounting/placement behavior.

**APPROVED FUTURE REQUIREMENTS — NOT IMPLEMENTED:**

```text
3D Modeling (optional, simple profile extrusion)
  -> 2D Drawing (also independent authoring)
       -> BOX / Construction
       -> Puzzle
```

This is an optional connected workflow, not a linear wizard. BOX/Puzzle are parallel.
Exploded View shows separated 3D components; Flatten to 2D generates planar geometry for
Drawing. Curved-surface flattening/developability needs separate design. The 3D kernel,
topology, constraints and rendering are unselected; high-end freeform/general CAD is
outside initial scope. The earlier static Construction preview is a separate planned
capability, not the limit of the new modeling direction.

The future project boundary must distinguish authored 2D sources, 3D-derived geometry,
and downstream manufacturing geometry, with stable references and provenance. Drawing
transfer into BOX must respect the existing pipeline below. SVG import through Open
always targets BOX, while native Open Project restores the whole editable project.

The separate history systems and dependency boundary require technical design:

| Responsibility | Approved target / open boundary |
| --- | --- |
| Global chronological history | Tape-recorder Undo/Redo: one completed state-changing user action, including all automatic solver/dependency consequences, is one logical transition; combined past/future capacity is 30. Creation/deletion restores original identities; previews/invalid/cancelled/no-op actions add none. Ordinary switches are UI navigation and preserve cursor/Redo without consuming capacity. Undo/Redo restore the full affected project state and open the edit's associated module; never restore an obsolete captured tab. Detailed store/transaction design remains proposed. |
| Permanent parametric construction history / panel | Project-owned editable operation definitions, stable identities, current parameters, input/output refs and relationships persist without Undo/journal quotas. Repeated Line dimension edits update the same operation and add normal Undo transactions. Double-click reveals current settings without rewind/Redo mutation. Operation-to-entity mapping, grouping and migration remain proposed. |
| Source-to-derived dependencies | Approved Option A keeps valid source edits, updates compatible branches and preserves failed/blocked definitions/refs and unaffected authored work for repair/removal. Explicit diagnostic states and no guessed refs/silent deletion. Exact mixed outcomes restore without replay; algorithms/repair UI remain unselected. |

Native persistence must retain editable module data, canonical geometry, Constraints,
Dimensions, extrusion/assembly definitions, construction/manufacturing and Puzzle state,
source relationships/provenance and schema metadata. Native Open establishes the loaded
project as a fresh baseline with empty Undo/Redo and no prior snapshots. Permanent
operation definitions/order, parameter bindings, dependencies and suppression/diagnostic
states are required saved data. Disk UI preferences remain undecided; an optional
descriptive journal is not construction history or an approved requirement. SVG export
is separate: stale/failed/unvalidated artifacts cannot silently be valid manufacturing
output. Independent valid export requires explicit scope and full validation.
The target top bar groups module navigation, project commands and Undo/Redo, retaining
Open → Save → Export → Clear → Undo → Redo order. The approved
[Global Workspace UI Specification](docs/GLOBAL_WORKSPACE_UI_SPECIFICATION.md) moves Fit
exclusively beside canvas zoom, module tools to the left and relevant Apply/Finish Group
controls onto the canvas, with shared permanent construction history at the bottom.
UI-1 is implemented and browser-checked, pending user acceptance; UI-2/UI-3/UI-4 remain unimplemented; UI-4 requires C/C.2, D for saved
history and E for dependency diagnostics/repair. Placement changes preserve accepted
tool/Undo semantics and do not implement global ownership or native commands.
Clear is a permanent project-wide session reset with Save and Clear / Clear Without
Saving / Cancel. Reset only after successful Save for the save choice; failure/cancellation
leaves work/history untouched. Clearing itself never deletes or overwrites saved files.
Clear/Open invalidate pending old-session callbacks. Fit uses active-module geometry;
Undo/Redo uses global edit history. These product decisions were revised 2026-11-09;
the complete [Stage B design](docs/GLOBAL_PROJECT_HISTORY_ARCHITECTURE_ANALYSIS.md) remains
under review. B defines operation/identity/transaction/dependency contracts; C supplies
shared ownership/global Undo with reserved pending-action admit/finalize/suspend/resume/
abandon and lifecycle interfaces; a proposed separate C.2 supplies persistent operation
maintenance before D Save/Open, and E supplies the full dependency/repair engine. C
must not absorb all of E. The former bounded session-journal recommendation is superseded
as construction history. The former two-transaction source/regeneration recommendation
is also superseded: the current async recommendation stages one pending logical action
and seals that same slot. Pending Undo suspends, unfinished Redo resumes captured inputs,
and sealed Redo restores the exact result. In this possible initial serialized baseline,
new edits wait visibly; navigation remains usable, Save waits/cancels and pending Export
blocks. Stage E must refine dependency-aware scheduling for responsive unrelated authoring;
the single-slot model may need significant evolution and C/D must preserve compatibility
(Stage B §11). Global authoring lockout is not a permanent approved requirement.
See the [full contract](docs/PRODUCT_ARCHITECTURE_VISION.md#5-global-toolbar-contract)
and [proposed staging](ROADMAP.md#4-connected-product-development).

The earlier separate-history recommendation is superseded only as future direction;
this documentation does not replace either existing history. No current functional
defect was confirmed during the user's Drawing Undo/Redo testing; exhaustive action
coverage is not established. Separate history ownership remains a global-history design
limitation; UI-1 avoids navigation unmounts without introducing global history. The accepted deferred
Arc empty/blind Undo limitation remains unchanged. Accepted Circle/Arc models, solver,
transactions, Direct Manipulation and Stage 0–6 evidence below remain intact. References
to shared/global Drawing concerns below mean sharing within Drawing, not an already
implemented cross-module project history.

## Drawing architecture

Drawing presentation follows a semantic pipeline rather than geometry- or tool-owned paint:

```text
semantic geometry / semantic relation
  -> semantic presentation classification
  -> shared Drawing Presentation Standard
  -> geometry-specific SVG primitive or role-specific glyph
```

Thus a Line renders as `<line>`, true semantic Circle geometry as `<circle>`, and true finite Arc geometry as `<path>`, while Points, Dimensions, and Constraints use their own glyphs/primitives and consume global roles wherever semantics are shared. Entity-specific mobility derives the global geometry constraint visual state; temporary selection or inference paint does not change that underlying state. Entity-defining persistent points such as Circle and Arc persistent centers receive semantic roles rather than duplicate entity-owned geometry or persisted presentation state. Transient and persistent forms may share relation/layout derivation while retaining distinct paint. Line, Profile, Circle, and Arc share the Drawing authoring, selection, topology, History, deletion, and presentation foundations where applicable. The normative roles, values, and precedence are owned by [PROJECT_MASTER.md](PROJECT_MASTER.md#49-normative-drawing-presentation-standard), not duplicated here.

Persistent `SketchPoint`s are discovered globally as positional snap candidates regardless of which geometry references them, so shared topology is reused rather than duplicated. Point-on-Curve is likewise a global semantic relationship represented by `COINCIDENT` / `point-curve`, not a Circle- or Arc-owned constraint system. Circle Stage 1 and Arc Stage 1 reuse this foundation, including Point-on-Arc semantics.

Drawing entities expose their persistent defining `SketchPoint` identities and canonical
solver variables through one entity-definition boundary. Topology cleanup, semantic
authoring-point discovery, component construction, and rank/DOF analysis consume that
boundary rather than independently redispatching Line, Circle, and Arc fields.
Entity-owned intrinsic equations have a separate runtime type and rank path from
user-created Constraints and Dimensions. Target Arc owns two radial equations. Selection
uses the Arc center's persistent point identity rather than a derived center identity.

Circle persistence is `centerPointId` plus a radius scalar; its center is a real shared
SketchPoint and authoring P2 is not persistent. Arc persistence is
`DrawingArcEntity { id, type: 'arc', centerPointId, radius, startPointId, endPointId, orientation }`.
Angles and signed sweep remain derived. Restore validates canonical Arc records;
obsolete endpoint-plus-bulge records and alternate derived-center references are rejected
after Stage 5.3A. Independent Line migration and generic semantic-point discovery remain.
The Arc authoring P1-to-P2
reference line and P3 support Circle are transient presentation only—not entity
geometry, topology, History, or export geometry.

**IMPLEMENTED TARGET ARCHITECTURE.** Circle and Arc share a
Circular Support concept: semantic center, radius, and resolved support Circle. Arc adds
persistent P1/P2 and `orientation: CW | CCW`, with center as a persistent first-class
`SketchPoint`. This locks semantic/mathematical structure, not a particular TypeScript
interface. Sweep, classification, angles, SVG flags, and length are derived. Bulge and
derived Arc-center identity belong only to historical implementations, not current restore
or runtime authority.

Arc authoring remains P1 start → P2 end → P3 form/curvature. P1/P2 retain persistent
identity; P3 calculates center/radius/orientation but is not defining storage. The target's
seven continuous coordinates have five geometric DOF because the two intrinsic equations
`|P1-C| = R` and `|P2-C| = R` participate in solver rank without becoming user
Constraints. Orientation is discrete branch state.

Direct Manipulation uses shared constrained solving while respecting canonical storage.
A grip defines the semantic subspace of an interaction: persistent Constraints and
driving Dimensions restrict motion inside it but do not redefine the grip. Exact grip
invariants enter as transient semantic equations rather than weighted preferences.
Circle center drag moves the persistent center with unchanged free-case radius; Circle
body drag varies radius about an exact fixed-center pivot. Stage 4 restored the following Arc grip semantics in merged PR #613; Mikael has accepted Stage 4, including 4.2 Coincidence and 4.3 performance, after manual browser tests. Arc center drag is rigid
translation subject to persistent hard equations; Arc body/radius drag keeps the
persistent center exactly stationary while radius and endpoints change consistently; Arc
endpoint drag keeps the opposite endpoint as an exact transient fixed pivot throughout
full feasible branch continuation.

Conceptually, Tier 0 contains persistent hard geometric Constraints, driving Dimensions,
and exact transient grip-semantic equations. Tier 1 expresses pointer/geometric intent
within the feasible semantic manifold. Continuity, least-change, and other non-semantic
tie-breaking are lower priority. Canonical mobility is likewise per variable: Circle
center X/Y plus radius, and Arc center X/Y, P1 X/Y, P2 X/Y plus radius, allowing partial and fully
constrained visual states to be distinguished.

Ordinary Dimensions share the existing system for the Circle persistent center, Arc
persistent endpoints, and Arc persistent center. Circular-size Dimensions are
also shared solver entities: a full Circle produces diameter (Ø), while an Arc produces
radius (R), with no Stage 1 user chooser. The implemented Constraints-panel Radius /
Diameter operation creates these same `CIRCULAR_SIZE` Dimensions; there is no separate
Radius/Diameter geometric-constraint entity. The committed annotation placement is
authoritative while idle; transient placement is authoritative only during an intentional annotation drag,
and completion, cancellation, lost capture, or tool exit clears that transient state.

This remains one global architecture—constraints, applicability, solver, selection, hit
testing, Direct Manipulation, snap, inference, topology, Dimensions, presentation,
History, transactions, serialization, and deletion are shared concerns. Geometry-specific
math does not create separate mini-CAD systems.

The Arc representation is **LOCKED**, implemented, and Stage 3 **ACCEPTED — user
approved 2026-10-09**. Stage 4 is **ACCEPTED**. Target body/radius drag fixes center and preserves endpoint directions;
center drag is rigid translation; endpoint drag fixes the opposite endpoint. Endpoint
continuation prioritizes exact feasibility, pointer intent, representation-independent
whole-directed-Arc least change, then a neutral tie-break. Mouse-down geometry plus total
pointer delta remains normative. Fixed-radius endpoint drag respects the `2R` chord
limit and projects an outside pointer to an orientation-preserving semicircle.

Arc center selection must select the center semantic point. The shared reference system
retains generic semantic-point discovery and selection; future dependent points remain
an extensibility requirement, not a current alternate Arc-center identity.
Concentricity remains a common center relation across Circle/Arc pairs; Tangency shares
support-circle math plus finite directed-Arc contact validation. Both Constraint features remain unimplemented; canonical Arc storage is implemented. Full normative details are in
[PROJECT_MASTER.md](PROJECT_MASTER.md#locked-target-circlearc-architecture).

## Pipeline

```text
SVG import or empty BoxDocument
  -> SvgDocumentModel (source geometry, edges, panels, contours)
  -> Panel Manager (panel identity and thickness)
  -> connection authoring (TB, W, S relationships and roles)
  -> generated geometry (tool-owned semantic output)
  -> panel composition and metadata reconciliation
  -> FinalGeometry (downstream physical contract)
  -> manufacturing compensation (slot/tap clearance, then kerf)
  -> preview and SVG export
```

## Ownership boundaries

- **Source geometry** remains the reference for authoring relationships. Generated replacements do not silently redefine the imported edge identity.
- **Workflow generators** own connection semantics and produce generated geometry; UI labels are not manufacturing geometry.
- **Panel composition** is the sole authority for combining contributors into panel contours. Production uses mixed authority, with same-edge replacement conflicts rejected.
- **Post-composition reconciliation** repairs generated-profile metadata against composed boundaries before downstream consumption.
- **FinalGeometry** is the stable boundary consumed by manufacturing, preview, and export. Downstream stages must not reconstruct tool intent from UI state.
- **Manufacturing compensation** operates after final geometry. Clearance and kerf are manufacturing transforms, not authoring topology.
- **Stored applied snapshots** restore their stored resolved output; they are not silently recomposed under a newer authority policy.

## Authority modes

`mixed` is the production panel-composition policy. `single-tool` and `legacy` remain explicit rollback/diagnostic compatibility modes; they are not preferred architecture for new work. The build-time selector is `VITE_PANEL_COMPOSITION_AUTHORITY_MODE`.

For the complete current contracts—including TB/W/S status, Drawing architecture, and cross-cutting transaction rules—use [PROJECT_MASTER.md](PROJECT_MASTER.md).

## Accepted Stage 3 canonical Arc runtime

Arc runtime and new persistence use `centerPointId + radius + startPointId + endPointId + orientation`. Center and endpoints are persistent `SketchPoint` identities; orientation is the discrete CW/CCW branch authority. The finite resolver derives angles, directed sweep, SVG flags, bounds samples, and length directly from this state. Arc owns two intrinsic radial equations and exposes seven continuous variables, yielding five geometric DOF. Stage 5.3A removed obsolete Arc restore conversion and derived-center reference paths; canonical validation and independent Line migration remain. Arc own-grip Direct Manipulation was restored by merged Stage 4 PR #613 (accepted); no bulge fallback remains.

Geometric-intent solving collects the complete equation components of every addressed
variable, including both endpoints of a Line. A transient grip can couple components
without introducing permanent topology or constraints. See
[Stage 4.2 root cause](docs/DRAWING_COINCIDENCE_DRAG_4_2.md).

Stage 4.3 performance (including 4.3B) is ACCEPTED after Mikael’s manual browser tests. Nonlinear trial projection preserves completed transient objective residual vectors alongside hard and semantic equations; continuation seeds still project only hard and semantic equations. This retains the shared hierarchy and tolerances without persistent extra Constraints or another Arc runtime. See [measurements and limitations](docs/DRAWING_NONLINEAR_SOLVER_4_3B.md).

Stage 5 is **ACCEPTED / COMPLETE**: 5.1, 5.2, 5.3A, audit-only 5.3B, and 5.4 are
ACCEPTED. Stage 5.4 (#621) retired `solveDrawingConstrainedVariableIntent`,
`DrawingVariableIntent`, `minimizeDrawingVariableObjective`, and
`DrawingSoftVariableObjective`, with no compatibility wrappers. Active geometric-intent
and component solving, hierarchy, hard verification, tolerances, continuation, intrinsic
equations, and canonical Circle/Arc storage are preserved. Stage 6 is **ACCEPTED** after
test-only regression maintenance (#623–#625) and user-confirmed Circle/Arc browser
acceptance. All Circular Support migration stages 0–6 are accepted; this documentation
closure changes no architecture or behavior and does not declare the application
feature-complete.
The [Roadmap](ROADMAP.md#circlearc-implementation-stages-and-status) owns stage evidence,
open R1–R3 risks, the deferred Arc empty/blind Undo limitation, and the explicit exclusion
of Save/Reload verification/implementation from Stage 6 acceptance.
