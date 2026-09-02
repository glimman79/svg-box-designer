# Drawing Dimension Architecture Analysis

> **D2.5a implementation note:** The implemented V2 sketch model intentionally contains only aligned, horizontal, and vertical two-point dimensions over existing Line endpoints. Value editing validates input but refuses a changed value until D2.5b can atomically solve geometry. For that next stage, an otherwise unconstrained Line keeps start A fixed and moves end B. Axis-aligned Lines use aligned as the canonical length interpretation, suppressing its identical axis-distance choice; zero projection remains available. No Circle, Arc, solver, or geometric constraint types were introduced.

## 1. CURRENT ARCHITECTURE

### Audit baseline

This report audits repository `HEAD` `2ef4d68` (`Add global Drawing X/Y alignment snap (#412)`). The checkout has no configured Git remote, so there is no remote branch to fetch or independently compare; `HEAD` is the available current merged baseline. This is an analysis-only document: no production source, solver, or UI is changed.

### Document and entities

- `src/app/drawingTypes.ts` defines `DrawingDocumentV1`, fixed to `schemaVersion: 1` and `unit: 'mm'`. It owns ordered sketches by `sketchOrder` and `activeSketchId`.
- `DrawingSketchV1` stores entities twice in complementary forms: `entities: Record<string, DrawingEntity>` is the identity lookup and `entityOrder: string[]` is rendering/order authority.
- The sole current entity is `DrawingLineEntity`: stable string `id`, discriminant `type: 'line'`, and value-coordinate `start`/`end` `DrawingPoint`s. Endpoints do not have independent IDs; their current semantic identity can nevertheless be derived as `(entityId, 'start' | 'end')`.
- `createDrawingDocumentV1()` creates one empty `sketch-1`. `App` owns it only as React state (`drawingDocument`); there is currently no Drawing save/load serializer, local storage, Drawing import, or Drawing export path.
- `appendEntityToActiveSketch()` in `drawingLineTool.ts` immutably inserts a line into both entity collections and rejects missing active sketches or duplicate IDs. IDs are generated in `DrawingWorkspace` from time plus a component-local sequence.

### Tool and interaction model

- `DrawingActiveTool` is currently `'select' | 'line'`. `DrawingToolLifecycle` adds normal/persistent activation, with nonpersistent construction finishing back at Select. Tool-local transient state remains intentionally outside this generic lifecycle.
- Select and Line are the only controls in `.drawing-tool-sidebar`, the left geometry rail. The application header `.top-toolbar` contains brand/workspace navigation and only renders `.toolbar-actions` for Construction. CSS already names a `.drawing-toolbar`, but no Drawing toolbar action group is rendered in current JSX.
- Line transient state is `LineToolInteraction`: start, raw pointer, exact effective preview, and angular-snap metadata. `resolveLinePreviewPoint()` performs the accepted 22.5-degree inference within 3 degrees. `applyResolvedLineClick()` commits the already-resolved point and deliberately does not recalculate inference.
- `DrawingWorkspace.resolvePlacement()` is the current arbitration seam: client point to model point; collect global candidates; global snap; otherwise Line angular inference; update preview and screen overlay; return one immutable `effectivePoint`. Primary acceptance captures that exact point before its delayed single-click commit.
- Escape uses `useCadEscapeToolExit()`. It cancels Line state and returns to Select. A double-click currently finishes Line construction. Tool-chrome pointer and mouse defaults are prevented early to preserve the Edge browser fix.

### Global snap and reference extraction

- `collectDrawingInferenceCandidates()` operates in client pixels against committed active-sketch lines. It emits endpoint candidates, closest points on finite line bodies (including `segmentParameter`), and X/Y alignment candidates.
- Endpoint semantics are already explicit as `entityId + endpoint`. Finite line-body semantics are `entityId + segmentParameter`, where the closest point is clamped to `[0,1]`.
- `collectDrawingReferencePoints()` extracts endpoint IDs such as `${entity.id}:start`. It deduplicates coincident coordinates for alignment display; that deduplication is useful for visible snap candidates but must **not** define persistent constraint identity because two coincident endpoints remain different references.
- Alignment candidates are restricted to reference points inside the current model-space `viewBox`. `resolveDrawingSnap()` provides deterministic priority and hysteresis: endpoint over line-body, then X/Y alignment; Ctrl returns unsnapped raw position. The accepted ring, triangle, square, and dashed guides are derived in the screen overlay.

### Transform, rendering, and hit testing

- The Drawing geometry SVG is model-space and controlled by `DrawingViewBox`. `clientToModelPoint()` inverts the SVG CTM; `modelToOverlayPoint()` passes through both real CTMs rather than duplicating scale arithmetic.
- Wheel zoom is cursor-anchored through `useCadWheelCapture()` and `zoomViewBoxAtPoint()`. Right-button pan has first priority in pointer handlers through `useCadPanGesture()` and uses pointer capture.
- Rendering order is grid, axes, committed geometry group, and Line preview in the model SVG. A separate viewport-pixel SVG displays coordinate labels and snap presentation. Committed lines are plain visual SVG `<line>` nodes without entity event handlers or a current Select hit-test implementation.
- There is no general geometry-selection model yet. Current “hit testing” exists as global proximity candidate computation for the Line tool, not Select-tool entity selection.

### History, constraints, and dependencies

- Drawing history is explicitly not implemented in the Drawing history panel. Construction has an independent snapshot-based `HistoryState` in `App`, capped at ten entries; it contains no `drawingDocument` and must not be reused by merely adding Drawing fields to Construction history.
- No Drawing constraint, solver, or solver math code exists. Runtime dependencies are only React and React DOM; there is no matrix/nonlinear optimization or geometric-constraint package.
- Drawing entities are not connected to `FinalGeometry`, `ManufacturingGeometry`, Box `TB`/`W`, `panelComposer`, or manufacturing export. That separation is the safety boundary to preserve.

## 2. PRODUCT REQUIREMENTS

Dimension is one global Drawing tool in the upper toolbar, not another primitive in the left rail. It creates persistent, selectable CAD annotations whose numeric values are **driving dimensional constraints**. Editing a value must solve and atomically update referenced geometry.

The architecture must cover line true length; general horizontal and vertical point separation; point-to-point Euclidean distance; point-to-underlying-line perpendicular distance; parallel-line perpendicular separation; cursor-selected angle regions; circle diameter; arc radius; and circle/arc centers as first-class point references. Placement is model-space semantic data and remains stable across view transforms, reopen, and geometry edits. Annotation graphics are derived and excluded from manufacturing geometry and snap geometry.

All linear values are millimetres, angular values degrees, and dimension-model validity is finite `value >= 0`. Display precision is independent of solver precision. Create, value edit, placement move, deletion, cascading reference deletion, solve result, undo, redo, and persistence must never split document and solver state.

Locked behavior remains unchanged: Line construction and committed geometry, global snap priority/hysteresis and Ctrl override, all accepted indicators and visible-reference rule, 22.5-degree inference, exact `effectivePoint` commit, right-pan priority, wheel zoom, Escape, browser default prevention, and all Box/Puzzle/manufacturing systems.

## 3. DIMENSION UX STATE MACHINE

Use one tool controller with data-driven reference compatibility rather than one state tree per dimension kind:

```text
inactive
  -> acquiring { references: [] }
  -> acquiring { references: [first], candidates }
  -> placing   { references, interpretations, activeInterpretation, preview }
  -> commit one document transaction
  -> acquiring { references: [] }       (persistent activation)

placed dimension selected
  -> editingValue { dimensionId, originalText, draft }
  -> solve-and-commit | cancel
```

1. Activating the top-toolbar Dimension action exits any Line construction through the existing lifecycle contract and starts `acquiring`.
2. Hover uses a new semantic reference-picking adapter built from geometry reference providers. Click stores a stable reference, never the transient projected coordinate.
3. A pure compatibility function maps the ordered/current reference set to possible interpretations and whether another reference is useful. One line immediately permits three interpretations and can enter placement; an optional second line replaces that proposal with line-line distance/angle after selection. Circle and arc enter placement after one entity reference. Point requires a second reference.
4. To avoid ambiguity between “place one-line dimension” and “add second line,” the first-line state should show the three-dimension preview as the cursor moves away from it, while a click on another highlighted line adds it; a click in a valid annotation zone places the one-line dimension. Reference hit priority therefore wins only inside a small screen-space pick tolerance.
5. `placing` computes preview entirely from current geometry plus model-space cursor. Pointer movement may change interpretation/placement but never mutates the document or runs a driving solve.
6. Primary click commits the dimension and its initial measured value in one Drawing history transaction. The first stage should not force immediate editing; double-click is the explicit edit contract.
7. Escape is hierarchical: close/cancel an inline editor first; otherwise clear current references/preview while keeping the Dimension tool active; a second Escape with no transient selection exits to Select. This extends, rather than weakens, the current single-Escape Line exit contract by having the workspace dispatch Escape to the active modal interaction first.
8. Right-button down always reaches pan before Dimension handlers. Wheel zoom remains available except while an HTML number editor owns focus, where wheel input must be prevented from modifying the value but may still be routed to canvas zoom only by an explicit product decision.

The state stores generic `GeometricReference[]` and derived `DimensionProposal[]`; kind-specific calculations live in proposal strategies, preventing a combinatorial UI state explosion.

## 4. CURSOR-DRIVEN LINE DIMENSIONS

For endpoints `p1`, `p2`, let midpoint `m`, segment vector `d = p2-p1`, length `L = |d|`, tangent `t=d/L`, normal `n=(-t.y,t.x)`, and cursor displacement `q=c-m`. For nondegenerate, non-axis-aligned lines define three candidate annotation families and compute the **screen-space distance from the cursor to each family’s legal placement locus**:

- True length: lines parallel to the segment through offsets `m + s n`; score `|q·t|` after allowing any signed normal offset beyond a small deadband. Placement stores signed normal offset `s=q·n`.
- Horizontal distance: horizontal dimension lines at `y=c.y`; their useful locus is outside/near the horizontal span between endpoint extension lines. A robust score is distance from `c` to the horizontal span `[min(x1,x2), max(x1,x2)]` with a preference term based on extension offset `c.y-m.y`. Placement stores signed Y offset from a stable baseline (prefer midpoint Y) and text position along the dimension span.
- Vertical distance: the transposed construction; score distance to the vertical span plus X extension offset. Placement stores signed X offset.

An even more predictable implementation is to build the actual three preview primitives at the current cursor offset and score the cursor against their dimension-line/text anchors in **client space**, using the current CTM. This is vector geometry, not fixed screen quadrants, and keeps a constant pixel feel across zoom and nonuniform transforms. Choose the lowest normalized score with:

1. a screen-pixel hysteresis margin so the active interpretation does not flicker at a boundary;
2. a minimum extension offset/dead zone around the source line so clicking the line can still select another reference;
3. deterministic ties (retain previous; otherwise true, horizontal, vertical);
4. axis-degenerate filtering: if `|dx| <= epsilon`, horizontal span is zero and should normally be omitted as misleading; if `|dy| <= epsilon`, omit vertical span; a zero-length line yields no line-dimension proposal.

Geometrically, this is a nearest-valid-annotation-family Voronoi choice. It automatically rotates the true-length region with the segment while horizontal/vertical remain tied to sketch axes. It is more stable than “above means horizontal/right means vertical,” which fails as orientation changes. Preview should visibly morph between the three families before click.

For persistence, true length references the line entity (or its two endpoint references) with `interpretation: 'aligned'`; horizontal/vertical are **general two-point dimensions**, referencing the line’s start/end points with `axis: 'x' | 'y'`. They must not be Line-only kinds.

## 5. CURSOR-DRIVEN ANGLE DIMENSIONS

Resolve the intersection `o` of the two underlying infinite lines; reject parallel/near-parallel pairs. Normalize each line direction but treat each as undirected. The two lines create four sectors. For cursor vector `r=c-o`:

1. Determine, for each line, the sign of `cross(direction, r)`. The sign pair identifies one of four stable sectors at that geometry state.
2. Equivalently, generate the four directed ray pairs `(±u, ±v)` that bound a sector, determine which counter-clockwise sweep contains `atan2(r)`, and choose that sector. This supports both acute/obtuse supplementary values and both opposite placements.
3. Preview an arc at radius `|r|` (clamped to a screen-space minimum), place text on the sector bisector, and use screen-space hysteresis around line boundaries.

Persistent identity must not be merely “minor angle” or a numeric angle. Store one directed ray selector per reference (`directionSign: 1 | -1`) plus a sweep (`'cw' | 'ccw'`) and, optionally, the last valid sector orientation for continuity. The entity order is canonicalized by reference key so reload does not reverse the meaning. After geometry edits, reconstruct the same directed rays and sweep; it therefore stays on the chosen topological region rather than flipping to the numerically smaller angle. Continuous solves should additionally unwrap the residual around the prior solution branch. If a line collapses or the pair becomes parallel, mark the dimension invalid/suppressed and exclude it from solving; never silently switch sectors.

Segment selection is finite for picking, but angle semantics use the associated underlying infinite lines. Annotation placement stores arc radius in model mm and optional normalized text offset within the selected sector, not pixels or an absolute copied intersection.

## 6. GEOMETRIC REFERENCE MODEL

Use a discriminated, serializable reference grammar and a central resolver/provider registry:

```ts
type EntityId = string;

type GeometricReference =
  | { kind: 'entity'; entityId: EntityId }
  | { kind: 'point'; entityId: EntityId; feature: PointFeature }
  | { kind: 'linear'; entityId: EntityId; extent: 'segment' | 'infinite' }
  | { kind: 'curve'; entityId: EntityId; feature: 'circumference' | 'arc' };

type PointFeature =
  | 'start' | 'end' | 'center'
  | { kind: 'vertex'; index: number }       // only until topology has stable vertex IDs
  | { kind: 'vertex'; id: string };         // preferred for editable profiles/polygons
```

References are scoped by their containing sketch; dimensions stored inside a sketch can omit `sketchId`, while document-global references must include it. Prefer sketch-owned dimensions so cross-sketch constraints are impossible until explicitly designed.

A `GeometryReferenceProvider<T>` for each entity type should expose stable point/linear/curve features, resolve them against the current entity, enumerate pick candidates, and declare solver variables. It separates semantic identity from current coordinates and scales to rectangle, polygon, profile, circle, arc, and future spline anchors. The resolver returns `ResolvedReference | Missing | Invalid`, and all constraint evaluation accepts only resolved semantic capabilities.

Do not persist `segmentParameter` for endpoints or whole-line constraints. A transient line-body pick may carry it to show selection location, but point-line and line-line dimensions reference the line semantically. A future intentional “point on curve at parameter” reference needs its own explicit topology/parameter contract.

## 7. DIMENSION DOCUMENT MODEL

Dimensions are both the user-visible record and the dimensional constraint definition; duplicating the same driving value into a second `constraints` collection creates synchronization risk. Reserve a separate `geometricConstraints` collection for non-dimensional relations. Conceptually:

```ts
type DimensionId = string;
type DimensionKind =
  | 'distance'            // point-point Euclidean
  | 'distance-x'          // general point references
  | 'distance-y'
  | 'point-line-distance'
  | 'parallel-line-distance'
  | 'angle'
  | 'diameter'
  | 'radius';

type DimensionPlacement =
  | { kind: 'linear'; offsetMm: number; textAlong: number }
  | { kind: 'point-line'; offsetAlongLineMm: number; textOffsetMm: number }
  | { kind: 'angle'; radiusMm: number; textRadialOffsetMm: number }
  | { kind: 'leader'; shoulder: DrawingPoint; textOffset: DrawingPoint };

interface DrivingDimension {
  id: DimensionId;
  kind: DimensionKind;
  references: readonly GeometricReference[];
  value: number;                    // mm except angle in degrees
  placement: DimensionPlacement;   // model-space/semantic
  interpretation?:
    | { axis: 'x' | 'y' }
    | { angleRegion: { firstDirection: 1 | -1; secondDirection: 1 | -1; sweep: 'cw' | 'ccw' } };
  status?: 'active' | 'suppressed-invalid-reference'; // recovery only, never solver authority
}

interface DrawingSketchV2 {
  id: SketchId;
  name: string;
  entities: Record<EntityId, DrawingEntity>;
  entityOrder: EntityId[];
  dimensions: Record<DimensionId, DrivingDimension>;
  dimensionOrder: DimensionId[];
  geometricConstraints: Record<string, GeometricConstraint>;
  constraintOrder: string[];
}
```

Do not persist formatted text, extension endpoints, arrow paths, measured coordinates, residuals, or screen pixels. Cache solver diagnostics and derived presentation outside the saved document. Persist only genuinely authored display choices such as placement, optional text side, and angle branch.

IDs need a document-level collision-safe allocator (UUID/ULID or persisted monotonic namespace), not component-local counters. Reference keys are canonical serialized tuples, not string parsing of display IDs.

## 8. DIMENSION TYPES

Let `A,B` be resolved points, `u,v` nonzero line directions, `P` a point, `L=(O,u)` an underlying line, and `r` circle/arc radius:

| Kind | References | Value/residual semantics |
|---|---|---|
| `distance` | point, point | `||B-A|| = value` |
| `distance-x` | point, point | `abs(B.x-A.x) = value`; preserve a signed branch internally during solve |
| `distance-y` | point, point | `abs(B.y-A.y) = value`; preserve signed branch |
| line true length | line entity resolved to start/end, represented by `distance` | `||end-start|| = value` |
| `point-line-distance` | point, infinite linear ref | `abs(cross(P-O,u))/||u|| = value`, with a persistent signed side branch |
| `parallel-line-distance` | two infinite linear refs | requires parallelism as a precondition/companion geometric relation; perpendicular signed origin separation magnitude equals value |
| `angle` | two infinite linear refs | selected directed-ray sweep equals `value` degrees, normalized on the persistent branch |
| `diameter` | closed circle curve/entity | `2r = value` |
| `radius` | arc curve/entity | `r = value` |

Horizontal and vertical dimensions must be general point-reference dimensions. A line’s projection simply supplies its endpoint references. This reuses the same constraints for rectangle corners, polygon vertices, centers, and profile points.

“Distance between parallel lines” must not silently force arbitrary nonparallel lines parallel merely because the dimension exists. At creation, require parallel within policy tolerance. For long-term driving semantics, either create an explicit paired `parallel` geometric constraint in the same transaction or define this one dimensional constraint as compound (parallel residual plus separation residual). The former is clearer for future diagnostics and deletion; deleting the dimension should also delete only its owned implicit companion unless the user separately authored parallelism.

Point-line uses the underlying infinite line for shortest perpendicular distance, while line-body picking stays finite. Product copy should say so; otherwise users may expect distance to a segment endpoint.

## 9. DISPLAY FORMATTING

Create a presentation-only units/format module. Solver values remain IEEE-754 doubles and are never rounded back from text formatting. Recommended policy:

1. Reject non-finite values before formatting.
2. Normalize `-0` and values within a display-only zero epsilon to `0`.
3. Convert with a configurable **maximum significant/decimal precision** suitable for UI (initially up to 12 significant digits or 6–9 fractional digits), solely to suppress binary noise such as `0.30000000000000004`.
4. Use a fixed `.` decimal separator for initial parsing/storage/display consistency; do not silently accept comma until locale support is designed.
5. Trim trailing fractional zeros and the dangling decimal point.
6. Add unit decoration from dimension semantics, not geometry entity code.

Required results are explicit:

```text
120     -> "120 mm"
120.5   -> "120.5 mm"
120.125 -> "120.125 mm"
0       -> "0 mm"
45      -> "45°"
50 diameter -> "Ø50 mm"
25.25 radius -> "R25.25 mm"
```

The formatter API should accept `{ quantity: 'length' | 'angle', decoration?: 'diameter' | 'radius', unitSystem }`, preparing for future units without adding multi-unit UI now.

## 10. DOUBLE-CLICK EDITING

- Render the text with an SVG-native transparent hit target. A double-click on that value stops propagation so it cannot finish Line or place a dimension, selects the dimension, and opens one absolutely positioned HTML `<input>` over the text using model-to-overlay/client transforms. HTML gives reliable focus, selection, validation, and accessibility.
- Initialize with the compact numeric value only (or select the numeric portion), not a rounded three-decimal string. Accept surrounding whitespace and case-insensitive optional `mm` for linear values; angular editing accepts optional `°` and may accept `deg`. The grammar should be strict decimal/scientific policy, not permissive `parseFloat`: entire input must match, convert to finite number, and be `>= 0`. Reject negatives, `NaN`, infinity, empty text, junk suffixes, and comma decimals.
- Enter parses, validates, executes a trial solve against a cloned sketch, and on success commits dimension value plus solved entities as one history action. Failed solve leaves the editor open, retains draft/focus, and shows a local error without changing the document.
- Escape restores the original value and closes without history. It must stop the global Escape handler from also exiting the Dimension tool.
- Click-away should **commit if valid and solvable**, otherwise keep the editor open and focus it; silently canceling valid work or silently accepting invalid work is unpredictable. Explicit toolbar/tool switching should follow the same commit-or-block rule. A product team may choose cancel-on-blur, but it must be one tested policy; commit-on-valid-blur is recommended.
- Focus selects text on open. While editing, canvas pointer shortcuts, Delete, tool hotkeys, Ctrl snap override, and Line double-click behavior are suspended. Ctrl/Cmd+A/C/X/V/Z remain native editor operations; application undo begins again after editor commit/close. Right-pan initiated outside the editor may be blocked until edit resolves to avoid moving the target under an active input.

## 11. SOLVER ARCHITECTURE

### Required direction

Ad-hoc per-dimension endpoint mutation is **not acceptable**. Even the first driving edit must enter a solver-shaped API, because direct “move line.end” logic cannot compose two lengths, shared points, angle constraints, or future parallel/coincident/fixed constraints and cannot correctly diagnose conflicts.

A real 2D sketch-constraint foundation is needed now, but it can begin small and deterministic. “Real” means a common variable vector, residual/Jacobian model, anchoring policy, component solve, convergence diagnostics, and atomic result—not that every requested kind ships at once.

### Variables and topology

- Represent current Line geometry initially as coordinate variables `(start.x,start.y,end.x,end.y)`. Later circle/arc add center coordinates and radius/arc parameters. A provider maps entity features to variable indices.
- Current coincident coordinates are not shared point identity. Do not infer topology from equality. Future `coincident` constraints connect distinct point variables; a later normalized sketch graph may share explicit point IDs, but migrating Line storage is not prerequisite for stage one.
- Build a bipartite graph of variables and active constraints. Solve only connected components affected by the edited/new constraint.

### Numerical method

Use a deterministic damped nonlinear least-squares core (Levenberg–Marquardt or trust-region Gauss–Newton) with analytic Jacobians for initial constraints, rank analysis, scale-normalized residuals, bounded iteration count, and deterministic variable/constraint ordering by IDs. Linear constraints such as X/Y distance can be exact rows; nonlinear length/angle/radius join the same residual system. A hybrid approach—analytic simplification and Jacobians plus numerical iteration—is appropriate.

Do not add a third-party solver in the first foundation without a dedicated dependency spike. The current package has no candidate. Mature desktop choices such as SolveSpace/libslvs are C++ and would require WASM packaging, browser-worker integration, license review (SolveSpace is GPLv3), entity/constraint adaptation, deterministic build assets, and TypeScript bindings. General JS optimizers do not provide sketch topology, DOF/rank, branch continuity, or geometric diagnostics. Network/package maintenance was not evaluated for this report, so no library recommendation is validated. A small internal foundation limited to supported residuals is lower risk, provided it is explicitly not a pile of mutation handlers.

### Solve protocol

1. Validate schema and references; reject invalid or unsupported constraints.
2. Extract the affected component and current variable vector.
3. Add edit intent as the new target value plus temporary anchor/stay residuals.
4. Solve a cloned candidate with double precision; never mutate React/document state during iteration.
5. Check finite values, normalized residual tolerance, degeneracy policy, rank, and iteration status.
6. Return `{status, solvedEntities, diagnostics, dof}`. Only `solved` may enter the document transaction; failure leaves the original snapshot untouched.

### Precision policy

Use scale-aware tolerances rather than one epsilon everywhere: coordinate equality around `absTol + relTol * sketchScale` (starting candidates `1e-9 mm` absolute and `1e-10` relative, validated with tests); angular residual around `1e-10` radians; parallel/cross products normalized by direction lengths; convergence by both residual norm and step norm. UI hit tolerances remain pixels and are never solver epsilons. Never quantize solved coordinates to display precision.

### Answers to the solver questions

1. **Real solver now?** Yes, a minimal genuine foundation before driving edits ship.
2. **Incremental?** Yes: start with point coordinates, fixed/stay policy, distance residual, diagnostics, and component transactions.
3. **Point-coordinate variables?** Yes initially, through entity providers rather than Line-specific global assumptions.
4. **Fixed/anchored DOF?** Explicit Fixed geometric constraints in the future; temporary edit anchors/stays now.
5. **Which geometry moves?** Solve priorities and explicit anchors, not dimension-kind code.
6. **Multiple dimensions?** Simultaneous residual system per connected component.
7. **Conflicts?** Residual failure plus Jacobian rank/dependency analysis, classified before commit.
8. **Under-constrained?** Successful solutions with reported remaining DOF; stays select the nearest deterministic solution.
9. **Future geometric constraints?** Add residual/Jacobian implementations to the same graph and solver protocol.
10. **Method?** Hybrid analytic residual/Jacobian modeling with damped numerical solve; defer dependency choice pending a spike.

## 12. DEGREES OF FREEDOM

A free line has four coordinate DOF. One length removes one DOF, leaving translation (2) and rotation (1). Therefore “100 to 120” has infinitely many solutions unless edit intent supplies an anchor policy.

Recommended deterministic hierarchy:

1. Hard user-authored Fixed constraints (future) and externally locked variables never move.
2. Existing hard geometric/dimensional constraints must remain satisfied.
3. The actively edited constraint receives its new hard target.
4. Temporary edit anchors preserve a logical reference point when possible.
5. Weak stay objectives minimize weighted displacement from the pre-edit solution, deterministically breaking remaining freedom.

For the first isolated Line-length edit, preserve `start` as a temporary anchor and its current direction, moving `end` along the current ray from start. This behavior is an **edit-intent/stay policy expressed to the solver**, not special endpoint mutation. If start is constrained, that naturally remains fixed and end moves. If end alone is fixed, start moves. If both endpoints are fixed and their separation is not 120, the edit is unsatisfiable and must not commit. If neither is explicitly fixed but the line participates in other constraints, solve the entire component and minimize weighted displacement; shared/constrained points decide the motion. If both ends can move symmetrically and no preferred anchor exists (for example a generic selected point pair), preserve midpoint as the temporary anchor.

Persisting “which endpoint moved last time” is generally wrong; persist only authored constraints. Edit anchors are transaction-time intent. A future drag operation can anchor all non-dragged geometry and make the dragged feature the preferred mover through the same mechanism.

## 13. CONSTRAINT CONFLICTS

- **Under-constrained:** Jacobian rank leaves positive DOF. This is valid. Show a future DOF status, use stays for a stable nearest solution, and do not invent hidden permanent constraints.
- **Fully constrained:** zero meaningful DOF and residuals satisfied. Valid.
- **Redundant:** a new constraint is satisfied but its Jacobian row adds no independent rank (for example duplicate length). Prefer rejecting creation with “already constrained/redundant,” or store it only if future reference-dimension support is explicitly added; do not create two driving authorities accidentally.
- **Over-constrained:** independent constraints remove more DOF than available or a new row conflicts with the rank structure. If still numerically consistent it may be redundant; if residuals cannot be satisfied it is unsatisfiable. Preserve this distinction.
- **Unsatisfiable:** no solution reaches tolerances, including fixed endpoints with an incompatible length, contradictory distances, or invalid angle branch. Reject the transaction, retain old geometry/value, and identify implicated constraint IDs.

Never commit a “best effort” visibly wrong dimension. Solver diagnostics should be structured (`code`, affected constraint/reference IDs, residual, rank/DOF), while UI messages remain comprehensible. Creation conflict leaves placement preview active so the user can cancel; edit conflict leaves the editor open.

## 14. DIMENSION RENDERING LAYER

Add a dedicated `<g class="drawing-dimensions">` in the model SVG after committed geometry and before transient tool previews (or after previews if selection emphasis requires it). A pure `deriveDimensionPresentation(dimension, resolvedReferences)` produces extension lines, dimension line/arc/leader, arrows, and model-space anchor positions. Stroke widths, arrow size, text size, and hit padding should remain screen-constant via `vector-effect="non-scaling-stroke"` and/or the existing pixel overlay conversion.

Use the pixel overlay for HTML editor positioning and optionally text if consistent screen size proves difficult, but keep persistent placement and geometric derivation in model coordinates. Annotation nodes must be marked as annotation roles and omitted from all entity/provider enumeration. They are not `DrawingEntity`, not bounds authority by default, not snap candidates, and never inputs to Final/Manufacturing geometry or export paths. An eventual “export drawing with annotations” is a separate explicit exporter.

## 15. HIT TESTING

Use a hybrid approach:

- Geometry reference acquisition reuses pure geometry-based candidate generation in client pixels, extended through reference providers. It yields semantic references, deterministic priorities, and consistent zoom behavior.
- Dimension interaction uses SVG-native event targets with transparent enlarged strokes/rectangles and `data-dimension-id`; text gets the highest priority for double-click. SVG event delegation at the dimension group avoids one complex geometry hit index initially.
- If large-sketch performance later requires it, presentation builders can also emit hit primitives for a shared spatial index. Do not make annotation primitives look like geometry candidates to the snap engine.

Event priority is: active HTML editor, right-pan, dimension text/selected annotation, active Dimension reference selection, geometry tool. Stop propagation only for an accepted dimension interaction. Empty-canvas events continue to the tool. Line behavior sees no dimension hits while Dimension is inactive except Select/delete behavior deliberately added later.

## 16. HISTORY / UNDO / REDO

Create Drawing-owned history rather than extending Construction `HistoryState`. The simplest correct initial model is bounded immutable `DrawingDocumentV2` snapshots plus optional labels, owned beside `drawingDocument` in `App` or a `useDrawingHistory` reducer.

- Start/reference hover/placement preview: transient, no history.
- Place dimension: one action containing the dimension and any owned companion constraint. Initial measured geometry is unchanged.
- Edit value: trial-solve first, then one action replacing both target dimension and all solved entity coordinates.
- Drag placement later: one action from pointer-down snapshot to pointer-up result, not per move.
- Delete dimension: one action removing dimension/owned companion while leaving current solved geometry untouched.
- Delete geometry: one action removing the entity and all dependent dimensions/owned constraints.

Undo/redo restores the entire Drawing document snapshot, so value and solved geometry cannot diverge. New commits clear redo. Tool hover/editor state is canceled on restore and derived presentation/solver caches are rebuilt. If a command/delta history is later used, its command must still contain before/after document revisions and restore atomically.

## 17. SAVE / RESTORE / DELETE

Introduce `DrawingDocumentV2`, migrating V1 by adding empty dimension/geometric-constraint collections to every sketch without changing entities. Persistence must use a validating boundary, not a TypeScript cast:

1. Parse schema version and migrate sequentially.
2. Validate finite coordinates/values, IDs/order lists, discriminants, placement, and `value >= 0`.
3. Resolve every reference through its entity provider.
4. Validate dimension arity/capabilities and angle branch.
5. Build solver constraints only from fully valid records.

Fail closed: a missing entity, unsupported feature, corrupted reference, or degenerate required direction never becomes a live solver row. On load, preserve recoverable invalid records only in a quarantined/suppressed diagnostics collection if lossless repair is a product need; otherwise drop them with a surfaced warning. Do not render a plausible numeric annotation from copied fallback coordinates.

Exact delete behavior:

1. Deleting a dimension removes its driving constraint and owned implicit companions, but leaves entities at their current solved coordinates. The component becomes under-constrained/freer; no automatic “spring back.”
2. Deleting an entity must cascade-delete all dimensions and geometric constraints that reference it in the **same transaction**. This is recommended over leaving visible invalid annotations during normal editing. Load-time corruption may be quarantined, but normal delete must leave no orphan solver constraint.

Order arrays must be reconciled with maps during validation. Future unknown entity/dimension types should cause version/feature diagnostics rather than unsafe partial solving.

## 18. ZERO VALUES

At the dimension-model level, finite zero is valid for every nonnegative dimensional value. Geometry validity is a separate per-kind result:

- Point-point, X, or Y distance zero is valid and may create coincidence in one or both measures.
- Point-line or parallel-line distance zero is valid incidence/coincidence.
- Angle zero is model-valid but makes the directions parallel in the chosen branch; whether the selected angle UI permits it is a solve/geometry question.
- Line length zero collapses a line. Current Line creation rejects near-zero lines, so a driving edit to zero must either support an explicit degenerate Line state throughout render/reference providers or reject the **solve result** with “this entity cannot currently collapse,” not reject zero parsing/model validity.
- Diameter/radius zero collapses a circle/arc. Future entity invariants decide whether such a degenerate entity may remain active/suppressed.

First implementation should encode entity/provider degeneracy capabilities. If Line entities do not yet support collapsed solver geometry safely, accept `0` in the editor grammar, run validation, and report an unsupported-degenerate-result without commit. This preserves the required model contract while avoiding NaNs and undefined directions. Ultimately collapsed entities need deterministic rendering and disabled direction-dependent references.

## 19. FUTURE CIRCLE / ARC SUPPORT

Proposed entities expose semantic features through providers:

```ts
type DrawingCircleEntity = { id: string; type: 'circle'; center: DrawingPoint; radius: number };
type DrawingArcEntity = {
  id: string; type: 'arc'; center: DrawingPoint; radius: number;
  startAngle: number; sweepAngle: number;
};
```

`{kind:'point', entityId, feature:'center'}` is a genuine reference for center-point, center-line, and center-center dimensions. `{kind:'curve', feature:'circumference'}` supports diameter; `{kind:'curve', feature:'arc'}` supports radius. Circle diameter and arc radius constraints target their radius variable (`2r-d=0`, `r-target=0`) while center coordinates remain separate DOF. Do not derive a center from rendered SVG bounds or persist a copied center in the dimension.

Closedness belongs to entity semantics: full `circle` permits diameter, open `arc` permits radius. If a generalized circular-curve entity is chosen later, expose `closed: boolean` through its provider rather than guessing from equal endpoints.

## 20. RELATION TO SNAP

Preserve `resolveDrawingSnap()` and accepted visual contract. Extract a shared **reference enumeration/provider** layer underneath both systems:

- Snap asks providers for visible point candidates and finite curve/segment proximity, then continues current arbitration and hysteresis.
- Dimension asks for the same semantic candidates but uses its own compatibility and selection priority.
- Current endpoint candidate `(entityId, endpoint)` maps directly to a point reference.
- Current line-body candidate maps to a finite picking hit but resolves to a semantic linear reference; `segmentParameter` remains preview metadata.
- Current alignment reference extraction can later include circle/arc centers. Keep its viewport-visible filtering for alignment only.

Do not reuse `collectDrawingReferencePoints()` coordinate deduplication as constraint identity. Do not add derived dimension extension lines/arcs/text to entity lists or inference inputs. Ctrl continues to disable global spatial snap for geometry construction; Dimension reference picking should not disappear under Ctrl unless separately specified, because selecting a semantic entity is not placement snapping.

## 21. PERFORMANCE

- Reference hover and dimension preview run on pointer move; both are pure and must not update the document or solver. Cache provider output by sketch entity revision and use a client-space spatial index once linear scans become measurable.
- Run the driving solver only on create if the initial constraint requires enforcing a target, on value confirmation, and on future constrained geometry commits—not on annotation placement pointermove. Trial solve operates outside React state and commits once.
- Solve only the affected constraint-graph component. Deterministic iteration caps and cancellation/version tokens prevent stale asynchronous results.
- Begin on the main thread for small sketches with timing instrumentation. Move the pure solver protocol to a Web Worker when component size/time crosses an evidence-based threshold; serializable IDs and variable vectors make that possible.
- Keep hover/preview in refs or a small reducer, coalesce pointer moves with `requestAnimationFrame`, and memoize derived annotation presentation by document revision plus view scale. Do not call multiple React setters per candidate as current Line code does when scaling to many dimensions.
- Right-pan remains first in pointer dispatch. Pan/zoom recompute screen presentation only; semantic placement and geometry do not change and no solve runs.

## 22. TOOLBAR

Add a Drawing-only action group in the existing application `.top-toolbar`, in the right-side area where Construction conditionally renders `.toolbar-actions`. Put **Dimension** as the first global sketch operation, followed later by Drawing Save/Undo/Redo/Fit actions. It should appear immediately to the right of the workspace selector (and left of future document/history actions), visually separated from brand/workspace navigation.

Do not place it beside Select and Line in `.drawing-tool-sidebar`. The button still activates `DrawingActiveTool: 'dimension'` through the common lifecycle, but location communicates that it constrains existing sketch geometry rather than creates a primitive. The canvas-local `+ / − / Fit` controls may remain unchanged in the first stage; do not redesign the toolbar.

## 23. IMPLEMENTATION STAGES

Each stage is independently mergeable and browser-testable:

### D2.5a — contracts, migration, and non-driving presentation

- Add V2 sketch collections, stable reference grammar/resolver/provider for Lines, dimension validation, V1→V2 migration, unit parser/formatter, and pure presentation math.
- Add Drawing history reducer/snapshot transactions before any driving mutation.
- Add top-toolbar Dimension activation and generic acquiring/placing reducer.
- Support selecting one Line and cursor-driven aligned/X/Y preview/placement as persistent annotations, clearly feature-flagged/read-only until solver stage; alternatively merge model tests first and UI in a second small PR if “dimension must always drive” forbids a temporary released UI.
- Browser tests: toolbar location, selection regions across orientations/zoom, persistence round trip, no manufacturing/snap contamination, Escape/right-pan/wheel regressions.

### D2.5b — minimum real solver and driving Line dimensions

- Add solver graph/protocol, point-coordinate variables, analytic distance/X/Y residuals, anchors/stays, rank/DOF/conflict diagnostics, and atomic Drawing history.
- Enable double-click editing for Line true/X/Y values only after this foundation exists.
- Browser tests: 100→120 movement policy; fixed-start/fixed-end test fixtures at solver level; invalid/redundant edit rejection; one-step undo/redo restores both document parts; zero-result policy.

### D2.5c — general point dimensions and deletion

- Generalize endpoint selection to point-point Euclidean/X/Y and point-line distance; add semantic selection highlighting and cascading delete.
- Tests cover endpoint identity at coincident coordinates, point on line = 0, infinite-line semantics, delete both directions, missing-reference load recovery.

### D2.5d — line-line compound constraints and angles

- Add parallel geometric constraint support, parallel-line separation, angle residual/Jacobian, branch persistence, cursor sector selection, and degeneracy diagnostics.
- Tests cover all four sectors, acute/obtuse continuity after edits, near-parallel rejection, owned companion deletion, over-constraint behavior.

### D2.5e — Circle/Arc entities and circular dimensions

- Introduce Circle/Arc through their own geometry implementation plan; add center providers, solver variables, diameter/radius constraints, leader presentation, and center participation in existing point dimensions/snap references.
- Tests cover Ø/R formatting, reopen, zero degeneracy policy, center-center/center-line, and exclusion from manufacturing.

### D2.5f — hardening and scale

- Add spatial index/worker only if profiling warrants it, schema corruption fixtures, accessibility, placement dragging, and broader constrained-component stress tests.

The key release rule: never expose editable driving UI before the common solver and atomic history path exists. D2.5a may be split into model-only and visual-only feature-flagged work to obey that rule.

## 24. FILE IMPACT

### Likely modified

- `src/app/drawingTypes.ts`: V2 entity/sketch/document unions and migration boundary (or imports from focused model files).
- `src/app/DrawingWorkspace.tsx`: tool orchestration, layers, event routing, reference picking, editor host.
- `src/app/drawingToolLifecycle.ts`: add `'dimension'` without changing existing Line semantics.
- `src/app/drawingInference.ts`: consume generalized reference providers while preserving output behavior.
- `src/App.tsx`: render Drawing top-toolbar actions and own Drawing history/document persistence boundary.
- `src/styles.css`: Dimension annotation, selection, toolbar, and editor presentation.
- `package.json`: only new focused test scripts initially; no solver dependency without a separate decision.

### Likely added

- `drawingReferences.ts`: reference grammar, providers, resolver, dependency queries.
- `drawingDimensions.ts`: model validation, compatibility/proposals, measured values.
- `drawingDimensionPlacement.ts`: line-region and angle-sector pure math.
- `drawingDimensionPresentation.ts`: derived primitives only.
- `drawingDimensionFormat.ts`: strict parser and unit-aware smart formatting.
- `drawingDimensionTool.ts`: generic reducer/state machine.
- `drawingConstraints.ts`: dimensional/geometric residual definitions.
- `drawingSolver.ts` plus small linear algebra helpers: pure solve protocol and diagnostics.
- `drawingHistory.ts`: Drawing transaction boundary.
- `drawingPersistence.ts`: version validation/migration.
- Focused unit, integration, browser-contract, and corruption fixture tests for every stage.

### Intentionally untouched

- `drawingLineTool.ts` behavior and its accepted effective-point/angular inference path, except possibly type imports required by V2 migration.
- `drawingSnapEngine.ts` arbitration, tolerances, priority, hysteresis, Ctrl behavior, and presentation semantics.
- `cadInteraction.ts`, `useCadWheelCapture.ts`, and `drawingTransform.ts` contracts unless additive, tested hooks are unavoidable.
- Box `tbGeometry.ts`, `wallGeometry.ts`, `panelComposer.ts`, FinalGeometry, ManufacturingGeometry/compensation/export, connection workflows, and Puzzle.

## 25. RISKS

1. **False solver:** hiding direct mutations behind a “solver” function creates irrecoverable behavior once constraints compose. Require variable/residual/component tests in D2.5b.
2. **Identity loss:** deduplicating coincident endpoints or persisting projected coordinates makes constraints jump after edits. Stable semantic feature references are mandatory.
3. **Branch flipping:** `abs`, minor-angle formulas, and reordered refs can flip side/angle. Persist signed branch/sector and canonical reference order.
4. **Unspecified mobility:** a length target alone does not decide motion. Temporary anchors and documented stays must be deterministic and testable.
5. **Degeneracy/NaN:** zero-length lines and zero-radius curves destroy normalized direction formulas. Providers must surface degeneracy before residual evaluation.
6. **History split:** separate state setters for target and geometry can produce impossible undo states. Commit one document result.
7. **UI event regression:** dimension double-click can collide with current Line finish and Edge browser behavior. Explicit event priority and browser tests are required.
8. **Screen/model confusion:** storing pixels or using model tolerances for hit zones breaks zoom behavior. Persist mm; choose in client pixels through CTMs.
9. **Parallel-distance ambiguity:** distance alone does not maintain parallelism. Model its owned geometric companion explicitly.
10. **Performance:** O(entities × pointermoves) and whole-sketch solve/render will degrade. Cache candidates, solve graph components, coalesce previews, profile before workers.
11. **Schema recovery:** permissive casts could send orphan references into solver code. Validate/migrate and fail closed.
12. **Manufacturing leakage:** treating annotation primitives as entities or exporting the Drawing SVG wholesale would create laser paths. Maintain a separate annotation layer and explicit exporters.
13. **Dependency/license:** a WASM/native solver may impose GPL, build, size, maintenance, and browser-worker costs. Run a formal spike before adoption.
14. **Premature Circle/Arc coupling:** inventing their storage inside Dimension work could constrain future geometry design. Providers allow those entities to arrive later.

## 26. RECOMMENDATION

Adopt sketch-owned persistent `dimensions` plus future `geometricConstraints`, both referencing geometry through stable provider-resolved semantic references. Treat each dimension as one source of truth for its driving value and annotation intent. Render it through a separate derived annotation layer, pick it with hybrid SVG/reference hit testing, and transact the dimension plus solved geometry in Drawing-owned snapshot history.

Before releasing editable dimensions, implement a minimal but real component-based 2D solver using coordinate variables, analytic residuals/Jacobians, deterministic damped least squares, explicit temporary anchors/stays, rank/DOF/conflict diagnostics, and atomic candidate commits. Do not mutate endpoints ad hoc. Keep the accepted snap/Line/CAD interaction paths intact and place Dimension in a Drawing action group in the upper application toolbar.

The recommended next implementation task is **D2.5a-model**: V2 migration and validation, stable Line reference providers, dimension/reference types, parser/formatter, pure placement/proposal math, and Drawing history transaction tests—with no enabled production Dimension UI and no driving mutation. Follow it with **D2.5b solver foundation** before enabling value editing.

## Final questions

| Question | Answer |
|---|---|
| Should Dimension be a global Drawing tool in the top toolbar? | **YES** |
| Should dimensions be driving constraints rather than display-only annotations? | **YES** |
| Should a single Line support true-length, horizontal, and vertical dimensions? | **YES** |
| Should cursor placement choose among those three? | **YES** |
| Should cursor placement choose the angular region? | **YES** |
| Should placed dimensions be editable by double-clicking their displayed value? | **YES** |
| Should `120` display as `120 mm` rather than `120.000 mm`? | **YES** |
| Should internal precision remain independent of display formatting? | **YES** |
| Should zero be a valid dimension input value at the dimension-model level? | **YES** |
| Should dimensions use stable geometry references rather than copied coordinates? | **YES** |
| Should ad-hoc per-dimension endpoint mutation be avoided? | **YES** |
| Should the architecture prepare for a real constraint solver? | **YES** |
| Should Dimension graphics remain outside manufacturing geometry? | **YES** |
| Should existing snap, pan, wheel, Edge fix, and Box behavior remain untouched? | **YES** |

**Recommended first implementation stage:** D2.5a-model—Drawing V2 migration/validation, stable semantic Line references, dimension document contracts, parser/formatter, pure cursor-placement math, and atomic Drawing-history foundations, all tested without exposing an editable production Dimension tool; then build the minimum real solver before enabling driving edits.

## D2.5c — Point references and Drawing datum

Linear dimensions now accept a shared semantic `DrawingPointReference`: a stable
`sketchPoint` reference, the analytically resolved `ORIGIN` datum, or the legacy
Line endpoint reference retained for persisted-document compatibility. Origin is
always `(0, 0)` and is not a sketch point, entity, manufacturing object, or history
object. Unordered reference keys make A–B equivalent to B–A, including Origin–P.

Point-to-point dimensions use the existing cursor-locus resolver and annotation
renderer for aligned, horizontal, and vertical distance. Axis-aligned pairs filter
duplicate projection families in the same way as Line dimensions. Driving edits
remain bounded analytic solves: the first ordinary point is fixed and the second
moves; when Origin participates, Origin is fixed regardless of selection order.
The solve preserves the current ray for aligned distance and the current sign for
horizontal/vertical distance. Zero projections are valid; directionless aligned
or sign-changing degenerate edits return a structured solver failure.

Driving point references participate in local affected-constraint drag validation
and `CONSTRAINED` presentation. Reference dimensions remain live measurements,
add no equation, do not block drag, and do not affect visual constraint state.
Deleting the last incident geometry for a referenced sketch point removes its
dependent dimensions. Existing Line endpoint dimensions continue resolving
without an eager document rewrite.

The datum discriminant reserves `X_AXIS` and `Y_AXIS` for a future reference
family. **Axis acquisition, axis dimensions, Point-to-Line, and Line-to-Line are
NOT IMPLEMENTED.** A future Point-to-Line stage may define Point→X-axis as
`abs(y)`, Point→Y-axis as `abs(x)`, and Point→Line as perpendicular shortest
distance. A later Line-to-Line stage may cover horizontal/vertical lines against
the corresponding datum axes and distances between parallel lines. No general
rank, DOF, graph, or nonlinear solver is introduced here.
