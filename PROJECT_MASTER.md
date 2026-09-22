# SVG Box Designer — Project Master

## 1. Purpose and authority

This document describes the **current** product and architectural truth. Code on the accepted `main` branch wins if this document drifts. Browser verification is the acceptance authority for pointer sequences and visible interaction; tests are supporting regression evidence. `PROJECT_HISTORY.md` preserves evolution, `CHANGELOG.md` is a concise completed-change record, and `Architecture.md` is a construction-pipeline orientation map.

Status terms used here are **Implemented**, **Browser-verified / regression-sensitive**, **Planned**, and **Known limitation**. Historical proposals and diagnostics under `docs/` are not current authority.

## 2. Product organization

SVG Box Designer is a React/TypeScript/Vite application with SVG-based presentation. It has three named application areas:

1. **2D Drawing — Implemented and actively developed.**
2. **Puzzle — Planned; the disabled selector is not an implementation.**
3. **Box / Construction — Implemented.** Manufacturing is part of this area rather than a fourth workspace.

The accepted Box / Construction compatibility baseline is v1.2 (`package.json` version `1.2.0`). Later Drawing work does not rename that release.

## 3. Document models and shared boundary

Construction uses `SvgDocumentModel`, which preserves SVG root information, source edges, panels, contours, containment, dimensions, and diagnostics. Panel Manager adds panel identity/thickness authority needed by construction.

Drawing owns a separate versioned `DrawingDocumentV2`. It contains ordered sketches, stable points and entities, dimensions, and geometric constraints. Drawing state is not currently embedded in a global project document.

A shared, versioned cross-workspace `ProjectDocument`, cross-workspace references, and global History remain planned. Existing Drawing and construction models should be wrapped or migrated deliberately rather than implicitly conflated.

## 4. 2D Drawing architecture

### 4.1 Scope and topology

The current workspace implements Select, Profile, Line, Dimension, a floating Constraints tool, Direct Manipulation, snapping/inference, solver-backed constraints, and bounded Drawing Undo/Redo. Profile and standalone Line are browser-verified and accepted as separate authoring workflows: Profile authors continuing/chained connected straight segments, while Line accepts P1 and P2, creates exactly one straight segment, and completes without chaining from P2. Normal Line activation returns to Select after completion; persistent Line activation remains active but resets completely so the next click defines a fresh independent P1.

Both workflows reuse the neutral straight-segment foundation rather than duplicating snapping, inference, constraints, topology, presentation, or mutation behavior. Circle Stage 1 is **Implemented / merged — browser acceptance pending** because its visible, live P1–P2 authoring preview works, but its committed Circle normally has no semantic presentation class and is therefore invisible until selected. Arc remains planned. Their accepted architecture direction is to extend shared Drawing systems wherever geometry semantics allow, including selection, hit testing, snapping/inference, topology, Constraints, Dimensions, presentation, Direct Manipulation, History, persistence, and deletion, while retaining true semantic circular geometry and one authoritative radius rather than geometry-specific duplicate subsystems. Every committed segment remains an ordinary `DrawingLineEntity` with persistent `type: 'line'`; neither Profile nor Line introduces a separate geometry type or authoring-origin metadata. Consequently topology, selection, Direct Manipulation, Constraints, Dimensions, and History operate on the committed geometry without distinguishing which authoring workflow created it. Menu visibility does not prove implementation of other prospective geometry tools.

`drawingLineSegmentSupport.ts` owns neutral straight-segment support, while `drawingProfileTool.ts` owns the chained Profile lifecycle and `drawingLineTool.ts` owns the standalone Line lifecycle. Generic document mutation remains in `drawingDocumentMutation.ts`. The delayed commit/double-click boundary in `drawingProfileCommitBoundary.ts` remains Profile-specific. Shared cursor, preview, and inference presentation consume neutral segment interaction state rather than treating Profile as their owner.

`DrawingSketchV2` stores `DrawingSketchPoint` (`SketchPoint`) records separately from `DrawingLineEntity` records. Each Line references `startPointId` and `endPointId`; connected Lines share a SketchPoint identity. Resolved coordinates are derived from those references. Equal coordinates alone do not create topology, and migration of old coordinate-embedded Lines does not invent connectivity.

Every committed segment is its own Line. A Profile continuation begins a **fresh Profile segment interaction** at the committed end SketchPoint. No candidate, acquired snap, direction authority, or other transient inference state is inherited. For equivalent document geometry, topology, pointer input, and viewport, a manually started Profile segment and a chained continuation use the same inference architecture. A persistently activated standalone Line also begins a fresh interaction after every commit, but it does not reuse the preceding endpoint unless the user explicitly snaps the new P1 to existing geometry.

### 4.2 Drawing selection

Directional drag-box selection is browser-verified and accepted for Lines in Select. A
primary-button drag beginning on empty canvas activates after the existing 4 CSS-pixel
client-space threshold; an existing geometry hit instead continues through ordinary
selection or Direct Manipulation. Left-to-right is Window mode, which requires both
finite Line endpoints to be strictly inside the rectangle. Right-to-left is Crossing
mode, which includes contained, partly contained, crossing, and boundary- or
corner-touching Lines. Mode and the visually distinct rectangle presentation switch
continuously when horizontal drag direction crosses the origin.

The existing common selection remains unchanged while dragging and commits on release.
An unmodified box replaces it, including with an empty result; Ctrl toggles qualifying
Lines against the ordered selection, preserves selected points, and preserves all
selection when no Line qualifies. The box currently qualifies Lines only—SketchPoints
and endpoints remain available to click selection but are not independently box
selected. Constraints consumes the common `selectedGeometry` using its existing
applicability rules; Dimensions continues to use its separate interaction state.

Pointer travel, direction, and the 4 CSS-pixel threshold use client coordinates, while
rectangle bounds, rendering, and Line qualification use Drawing model coordinates via
the existing SVG CTM conversion. The captured gesture survives leaving the visible SVG
and is cleaned up on Escape, pointer cancellation or lost capture, tool change, and
workspace cleanup. The rectangle follows the raw transformed pointer without
snap/inference. It is transient SVG presentation—not document geometry, topology,
Constraints, Dimensions, export, or Drawing History—and selecting multiple Lines adds
neither group Direct Manipulation nor batch deletion.

### 4.3 Dimensions, constraints, and solver

Dimensions is the dedicated dimensional authoring workflow. The model supports driving and reference dimensions over stable point/Line references: aligned, horizontal, and vertical point distances; point-to-Line distance; Line-to-Line distance; and Line-to-Line angle. Reference dimensions annotate but add no equation.

Constraints is a separate floating workflow. It browser-verifiably consumes points and Lines selected before the panel opens and updates applicable operations when point/Line selection changes while the panel remains active. Its implemented operations are Midpoint, Coincidence, Parallelism, Perpendicular, Horizontal, and Vertical. Concentricity and Tangency appear only as inactive future choices; they have no current Constraint or solver implementation and are not browser-verified capabilities.

Fix, Symmetry, Radius / Diameter, Angle, Length, and Distance are not currently implemented as Constraints. Circle Radius/Diameter Dimensions are also not implemented; the current Dimensions system remains point/Line-oriented. Existing Dimension functionality for Distance, Length, and Angle does not make those Constraint operations implemented; future integration must reuse appropriate common geometric and semantic foundations rather than duplicate them.

SketchPoint coordinates are solver variables. Typed driving dimensions and geometric constraints produce equations, connected-component solving produces resolved geometry, and rank/null-space analysis classifies degrees of freedom. Invalid, degenerate, duplicate, or unsatisfied requests fail closed. Direct Manipulation requests movement through this semantic authority; it does not permanently bypass constraints.

### 4.4 Snap and inference channels

Line placement deliberately separates:

- **position authority** — the one effective accepted endpoint;
- **direction authority** — an established construction direction such as H/V, angular, Parallel, or Perpendicular;
- **topology authority** — reuse of an existing SketchPoint versus creation of a new one;
- **semantic evidence** — compatible geometric relations true at the accepted placement;
- **presentation** — transient guides/markers derived from accepted inference;
- **persistence** — the minimal durable semantic constraints created with the Line.

**Compatibility comes before priority.** Priority selects among incompatible positional alternatives; it must not discard compatible direction or semantic truth. A hard Endpoint, Midpoint, or finite-Line target can own position while an independently acquired direction remains authoritative, provided final geometry satisfies it.

Endpoint is authoritative for shared topology and exact endpoint position. Endpoint authority does not become a semantic allow-list: a selected direction is truth-checked against that fixed position and may remain accepted. Midpoint and finite-Line acquisition similarly own their appropriate positional result without silently acquiring unrelated authority.

Candidate discovery includes existing endpoints/shared points, Midpoint, finite Line body, X/Y alignment, H/V, angular construction, Parallel, Perpendicular, and normal-to-incident-Line Point References. Screen-space tolerances govern acquisition while candidate membership comes from committed sketch geometry, not only the visible viewport.

During Profile or Line authoring, Ctrl is a raw bypass: it suppresses automatic acquisition, associated guides, and automatic semantics for that live placement. It does not remove committed topology or constraints. In Select, Ctrl instead toggles selection.

### 4.5 Established direction and Point Reference invariant

A Line may establish a direction authority (for example Parallel) and independently acquire a compatible positional Point Reference. Once direction is established, Point Reference support is evaluated against that construction:

- a support with a unique valid forward intersection may define position;
- a parallel/coincident or behind support that cannot uniquely locate a point remains **reference-only evidence** and cannot steal position authority.

This distinction is geometric and general, not a chained-Line exception. It prevents a normal associated with a start-incident Line, coincident with the established construction direction, from masking a later useful support.

**Browser-verified / regression-sensitive invariant:** with Parallel active, natural pointer movement along the construction can acquire the compatible Perpendicular-derived Point Reference at its useful intersection. Sideways or off-Line pointer movement is not required.

Drawing snap acquisition and retention use browser-accepted, family-specific client-space hysteresis. Endpoint and Midpoint capture at 7 CSS px and release at 9 CSS px. Finite Line, alignment, and Point Reference capture at 5 CSS px and release at 7 CSS px. These thresholds tune acquisition and release only; they do not change candidate geometry, priority, topology, persistence, or automatic constraint validation.

Parallel and Perpendicular direction authority likewise captures at 5 CSS px and remains authoritative only while the matching candidate stays within a 7 CSS px lateral client-space corridor. Longitudinal movement along the valid construction direction does not itself release authority, and the client-space measurement keeps the feel consistent across zoom. Leaving the corridor releases the transient authority and its semantic evidence; ordinary acquisition still runs in that frame, so returning within 5 px can reacquire immediately without a cooldown, neutral frame, timer, or re-arm action. Ctrl remains an immediate bypass, H/V arbitration is unchanged, and compatible positional snaps continue to compose with direction authority. This tuned behavior is browser-verified and accepted. Presentation and persistence consume the accepted placement; they do not rerun competing authority selection.

### 4.6 Transient and persistent semantics

Detection, presentation, and persistence are different stages. A transient inference is evidence during authoring; a persistent geometric constraint is durable document meaning. Geometrically equivalent direction demands may be normalized for construction and minimal persistence without erasing their semantic identity prematurely.

Transient inference and persistent constraint presentation use shared semantic layout authorities where available. Midpoint is the regression-sensitive example: its transient and persistent `—□—` use the same placement geometry and differ by state styling. Parallel markers likewise derive from shared layout rules. UI-specific or solver-specific duplicate marker geometry should not be introduced.

### 4.7 Accepted placement and commit ownership

A click first accepts a resolved placement; the transaction that owns that accepted result must also own its commit. Profile retains its delayed, native-double-click-safe commit boundary because it continues a chain: a later same-tool primary click flushes the pending owner before resolving the next placement, and timer identity prevents stale callbacks from committing into a later interaction. Standalone Line commits synchronously when its valid P2 is accepted and needs no separate double-click-finish semantic because that point completes the construction.

The committed document snapshot is made visible to candidate collection in the same event. This preserves rapid Line segments, exposes newly committed topology immediately, and keeps manual and chained starts equivalent. Cancellation may clear a pending transaction; a new click must not silently replace and lose it.

### 4.8 Interaction and History

Left mouse authors/selects, right-drag pans, the wheel zooms, and Esc exits the applicable interaction. Drawing transactions group semantic user actions for Undo/Redo. A completed standalone Line is one transaction containing its accepted geometry, topology, and automatic semantics; persistent Line activation produces one transaction per completed independent Line. UI-only panel state does not create document History. Deleting geometry cleans dependent dimensions/constraints through model operations.

### 4.9 Normative Drawing Presentation Standard

This section is the global, normative authority for Drawing presentation. Numeric values here describe current accepted behavior; production token names remain current implementation details until a later code generalization. Line is the accepted reference implementation for applicable committed curves, but does not own these meanings.

```text
semantic geometry / semantic relation
  -> semantic presentation classification
  -> global Drawing Presentation Standard
  -> geometry-specific SVG presentation (<line>, <circle>, future <path>, or role-specific glyphs)
```

Global policy means shared semantics consume shared roles; it does **not** make curves, Points, Dimensions, Constraints, and support graphics look identical.

#### 4.9.1 Committed Geometry

| Semantic role | Current code value | Color | Width | Fill | Dash | Opacity | Applicability/status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `FREE` | `--drawing-line-free` | `#39ff5a` | `1.8` | none | solid | `1` | Established global state for applicable committed curve geometry. |
| `CONSTRAINED` | `--drawing-line-constrained` | `#00a83e` | `1.8` | none | solid | `1` | Established global state for applicable committed curve geometry. |
| `FULLY_LOCKED` | `--drawing-line-fully-locked` | `#111827` | `1.8` | none | solid | `1` | Established global state for applicable committed curve geometry. |
| Inference target | `--drawing-inference` | `#38bdf8` | `1.8` | none | solid | `1` | Temporary inference-target override; separate semantic token/role from Authoring Preview. |

Strokes are non-scaling where applicable. The current CSS names say “line” because Line is the reference implementation; the semantic states are global and future production generalization must remove conceptual Line ownership without changing these values.

#### 4.9.2 Geometry Constraint State

`FREE`, `CONSTRAINED`, and `FULLY_LOCKED` form the global `GeometryConstraintVisualState`, but each entity type derives that classification from its own authoritative mobility/freedoms:

```text
entity-specific mobility / freedom derivation
  -> global GeometryConstraintVisualState
  -> global committed-geometry presentation
```

A Line currently derives state from endpoint mobility. A Circle must derive state from Circle-authoritative freedoms; a future Arc must use Arc-authoritative freedoms. For Circle Stage 1 the center is a persistent `SketchPoint` and radius is an authoritative scalar. A fully constrained center cannot make the whole Circle `FULLY_LOCKED` while radius remains free. A Point-on-Circle relation must not make a Circle `CONSTRAINED` merely because its record references that Circle. Future implementation must calculate actual Circle-relevant freedom; this documentation does not prescribe that calculation.

#### 4.9.3 Selection / Preselection / Direct Manipulation

| Temporary role | Semantic token/current value | Color | Width | Applicability/status |
| --- | --- | --- | --- | --- |
| Selected committed curve | geometry selection / `--drawing-hover` | `#06b6d4` | `2.6` | Established Line behavior; standard for Circle and future applicable curves as interaction support is integrated. |
| Preselected committed curve | geometry preselection / `--drawing-hover` | `#06b6d4` | `2.6` | Established. |
| Direct Manipulation | geometry dragging / `--drawing-hover` | `#06b6d4` | `2.6` | Established. |
| Dimension-input geometry preselection | dimension preselection / `--drawing-hover` | `#06b6d4` | `2.4` | Established. |

These are temporary paint overrides. They never replace or mutate the underlying constraint visual state.

#### 4.9.4 Authoring Preview

| Role | Semantic token/current value | Color | Width | Fill | Dash | Applicability/status |
| --- | --- | --- | --- | --- | --- | --- |
| Ordinary Authoring Preview | currently painted with `--drawing-inference`; future dedicated preview role | `#38bdf8` | `1.25` | none | `5 4` | Established for Line, Profile segment, and Circle previews; non-scaling stroke where applicable. |
| Line/Profile angular-authority modifier | preview modifier | `#38bdf8` | `1.7` | none | solid | Established exception for genuine Line-direction semantic state. |

Authoring Preview and Inference are separate semantic roles even though both currently use `#38bdf8`; implementations must not couple their future values. Arc, Rectangle, Ellipse, Spline, and other applicable geometry default to ordinary Authoring Preview unless an explicit, documented tool semantic requires a modifier. The Circle P1–P2/radius preview is browser-observed, visible, and updates live. There is no dedicated mandatory Circle radius helper line in current code; any straight line seen during authoring belongs to the actual inference/reference role that produces it.

#### 4.9.5 Inference

Inference is its own transient category with semantic color `#38bdf8`. Alignment, Point Reference, Midpoint, Parallel, Perpendicular, and inference-target geometry may share that color while retaining role-specific glyphs, widths, dash, opacity, and support geometry. Shared color does not flatten distinct semantic feedback.

#### 4.9.6 Helper / Reference / Support Geometry

There is no generic “helper line” role. Presentation must retain the following semantic ownership:

| Role | Current color | Width | Dash | Opacity/fill | Status |
| --- | --- | --- | --- | --- | --- |
| Alignment inference guide | `#38bdf8` | `1.25` | `5 4` | default / none | Established. |
| Point Reference guide | `#38bdf8` | `1` | `5 5` | `0.8` / none | Established. |
| Transient Perpendicular relation support | 55% inference cyan mixed with transparent | `1` | `3 3` | mixed/faded / none | Established. |
| Persistent Perpendicular relation support | `#94a3b8` | `1` | `3 3` | default / none | Established. |
| Dimension witness/extension | Dimension `currentColor` | `0.65` | solid | `0.72` / none | Established Dimension-owned geometry. |
| Construction/reference geometry | unresolved | unresolved | unresolved | unresolved | Future category only if it becomes a real product concept. |

Support graphics are presentation only unless their owning semantic model explicitly says otherwise; they do not silently become selectable/exported Drawing entities, topology, solver authority, or History state.

#### 4.9.7 Constraints

Constraints remain a separate presentation system. Implemented Constraints are **Midpoint, Coincidence, Parallelism, Perpendicular, Horizontal, and Vertical**. Tangency, Concentricity, Radius/Diameter, Fix, Symmetry, Distance Constraint, Length Constraint, and Angle Constraint are not implemented.

| State | Semantic token/current value | Color | Applicability/status |
| --- | --- | --- | --- |
| Persistent Constraint base | `--drawing-geometric-constraint` | `#2563eb` | Established; relation-specific glyphs and support presentation remain distinct. |
| Constraint hover | current `--drawing-hover`; semantically Constraint hover | `#06b6d4` | Established current behavior; separate role despite numeric sharing. |
| Constraint selected | current `--drawing-dimension-active`; semantically Constraint selected | `#137a3e` | Established current behavior; separate role despite numeric sharing. |

Midpoint, Parallel, and Perpendicular demonstrate the rule that transient and persistent forms may share semantic relation/layout derivation while paint/state differs. Persistent Midpoint currently uses width `1`; transient Midpoint uses `1.4`.

#### 4.9.8 Dimensions

Dimensions are not Constraints and retain a separate presentation category.

| Role | Current token/color | Width/other value | Status |
| --- | --- | --- | --- |
| Dimension normal | `--drawing-dimension`, `#2db65b` | — | Established. |
| Dimension hover | `--drawing-dimension-hover`, `#2fb85f` | — | Established. |
| Dimension active | `--drawing-dimension-active`, `#137a3e` | — | Established. |
| Dimension line | `currentColor` | `0.75` | Established. |
| Witness/extension | `currentColor` | `0.65`, opacity `0.72`, solid | Established. |
| Text | `currentColor` with `#f8fafc` halo | `10` screen px; halo `2` px | Established. |
| Arrows | state-colored current triangular marker system | existing `7 × 7` marker geometry | Established. |
| Preview Dimension | owning Dimension paint | opacity `0.7` | Established. |

Distance, Length, and Angle exist as Dimensions. Radius/Diameter Dimension is not implemented.

#### 4.9.9 Points

Points participate in shared semantic interaction where appropriate but retain point-specific glyphs rather than being forced into curve strokes. Preserve distinct presentation for the invisible `SketchPoint` hit target, selected and preselected point glyphs, Endpoint snap, Midpoint relation, Dimension point preselection and selected point, Coincidence point glyph, and reference points.

#### 4.9.10 Interaction Overlays

| Overlay | Stroke | Width | Fill | Dash | Status |
| --- | --- | --- | --- | --- | --- |
| Directional box selection — Window | `#0e7490` | `1.25` | `rgb(14 116 144 / 10%)` | solid | Browser-accepted. |
| Directional box selection — Crossing | `#16803d` | `1.25` | `rgb(22 163 74 / 9%)` | `6 4` | Browser-accepted. |

#### 4.9.11 Presentation Precedence

1. Entity-specific freedom analysis establishes the persistent underlying `GeometryConstraintVisualState`.
2. Normal committed paint represents that state.
3. Applicable transient context can override paint without changing semantic state: inference target, Dimension-input preselection, geometry preselection, selection, and Direct Manipulation.
4. Points, Constraints, Dimensions, previews, inference glyphs, supports, and interaction overlays remain within their own systems rather than inheriting curve paint.

Current curve override behavior is implemented by CSS class rules and source order: the later dimension-preselection and geometry selection/preselection/dragging rules override normal and inference-target curve rules. That observable current behavior is preserved, but the ordering mechanism itself has not been approved as permanent product semantics. Future production generalization must encode/test explicit precedence rather than silently canonize accidental CSS ordering.

#### 4.9.12 OPEN / FUTURE PRESENTATION DECISIONS

Every item below is normative tracking: the triggered implementation must resolve and document the question rather than silently invent behavior.

| Question | Why unresolved | Current behavior | Decision trigger / mandatory action |
| --- | --- | --- | --- |
| Which category owns the future three-point Arc's full support/reference Circle? | Its eventual semantic purpose determines whether it is Dimension/reference, Constraint/support, or another already-established category. | Arc and its support Circle are not implemented; no style is assigned. | Resolve during Arc presentation design before implementation; reuse an established semantic category where truthful and document the decision. |
| How should future construction/reference entities look? | Construction/reference geometry is not yet a real defined product concept. | No global category exists. | When the entity concept is designed, define ownership and presentation explicitly; do not invent per-tool paint. |
| How should future Radius/Diameter presentation work? | Neither Radius/Diameter Dimension nor Constraint is implemented, and the two systems must remain distinct. | No presentation exists. | Decide when either capability is designed; do not infer a style now. |
| Should persistent and transient Midpoint intentionally retain widths `1` and `1.4`? | Current difference has not been explicitly normalized or approved as permanent. | Persistent `1`; transient `1.4`. | Preserve until a focused presentation decision; that work must explicitly resolve and document it. |
| Are Alignment dash `5 4` and Point Reference dash `5 5` intentionally distinct? | Both are accepted current behavior but permanent differentiation has not been decided. | They remain distinct. | Preserve until explicitly revisited; any convergence must be a documented decision. |
| Should Constraint hover permanently equal geometry hover numerically? | Both are `#06b6d4`, but roles are semantically independent. | Values match. | Maintain separate roles/tokens when production tokens are generalized; any future coupling or divergence requires an explicit decision. |
| Should Constraint selected permanently equal Dimension active numerically? | Both are `#137a3e`, but roles are semantically independent. | Values match. | Maintain separate roles/tokens when production tokens are generalized; any future coupling or divergence requires an explicit decision. |
| May a future special authoring tool deviate from ordinary Authoring Preview? | No such tool-specific semantic has been established. | Applicable current tools use the global preview, except the explicit Line/Profile angular-authority modifier. | Default to the global standard; before deviation, identify a genuine semantic reason and document the modifier. |

## 5. Box / Construction architecture

### 5.1 Import and authoring

The application can begin with an empty Box document or parse an imported SVG into source geometry. Straight edges are detected from supported SVG line/rect/polyline/polygon and straight path forms. Panel Manager identifies panels and supplies thickness before construction tools are applied.

Implemented workflows are:

- **TB (Top/Bottom):** paired edge roles and generated finger-joint profiles, accepted for current needs;
- **W (Wall):** W-A/W-B authoring with per-panel TB role guidance and TB-equivalent physical generation; broader capability remains in the Roadmap;
- **S (Slot):** paired roles, slot/tab geometry, offsets, and panel-thickness-derived depth/length behavior; broader capability remains in the Roadmap.

**J = Joint** and **P = Pattern** are not implemented. Angle-aware assembly variants and a static 3D preview are also not current implemented product capabilities.

### 5.2 Generated geometry, composition, and panel authority

Connection/workflow state is semantic authoring authority. Generators emit typed `GeneratedGeometryItem` output and metadata; they do not directly own the final panel contour.

`panelComposer` is the panel-composition authority. Production uses **mixed** authority: contributors from multiple tools may compose one panel, while same-edge replacement conflicts fail closed. Source-edge relationships remain stable—particularly S-B references to original/imported edges—rather than being silently rebound to a generated boundary.

Post-composition reconciliation maps generated-profile semantics to composed boundaries and preserves physical/nonphysical projection lineage. `FinalGeometry` is the downstream contract consumed by preview, manufacturing, and export; downstream code must not reconstruct generator intent from UI labels.

`VITE_PANEL_COMPOSITION_AUTHORITY_MODE` can select `mixed`, `single-tool`, or `legacy`. `mixed` is normal production policy. The others are rollback/diagnostic compatibility paths, not preferred architecture. Applied snapshots restore their stored resolved authority and are not silently recomposed.

### 5.3 Manufacturing and export

Manufacturing transforms operate after Final Geometry. Slot/tap clearance is applied to the appropriate generated physical roles before kerf compensation; contour classification controls inside/outside offset direction. Preview and clean SVG export consume the compensated final contours. Export before Apply remains a source/label reference export rather than pretending unresolved authoring state is manufacturing output.

## 6. Puzzle

Puzzle has a reserved, disabled workspace selector only. It has no current document, tools, solver, or export pipeline and must be described as planned.

## 7. Cross-cutting invariants

- Stable IDs and explicit semantic references outrank coordinate coincidence or UI labels.
- Exactly one layer owns each decision: resolver for accepted Drawing placement, solver for constrained coordinates, panel composer for panel composition, and FinalGeometry for downstream physical geometry.
- Compatibility is evaluated before positional priority discards information.
- Transient evidence is not persistent intent; persistence occurs only at an accepted transaction boundary.
- Restores and migrations fail closed rather than silently reinterpret stored geometry.
- Browser-observed interactive behavior overrides a contradictory synthetic test claim until reconciled.

## 8. Current limitations and documentation boundaries

- Puzzle and a shared global project document are planned.
- Drawing supports chained straight-segment authoring through Profile and independent one-segment authoring through Line, with every committed segment stored as the same Line geometry; it does not yet provide the full prospective CAD tool catalog.
- The Constraints panel intentionally displays disabled future choices alongside implemented ones.
- Box v1.2 remains the locked release baseline; post-v1.2 Drawing features are implemented without a new declared product release.
- Detailed reports under `docs/` include historical hypotheses and diagnostic evidence. Consult `docs/README.md` before treating one as a current specification.
