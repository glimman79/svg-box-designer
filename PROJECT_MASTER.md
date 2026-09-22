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

Both workflows reuse the neutral straight-segment foundation rather than duplicating snapping, inference, constraints, topology, presentation, or mutation behavior. Circle and Arc are planned rather than implemented. Their accepted architecture direction is to extend shared Drawing systems wherever geometry semantics allow, including selection, hit testing, snapping/inference, topology, Constraints, Dimensions, presentation, Direct Manipulation, History, persistence, and deletion, while retaining true semantic circular geometry and one authoritative radius rather than geometry-specific duplicate subsystems. Every committed segment remains an ordinary `DrawingLineEntity` with persistent `type: 'line'`; neither Profile nor Line introduces a separate geometry type or authoring-origin metadata. Consequently topology, selection, Direct Manipulation, Constraints, Dimensions, and History operate on the committed geometry without distinguishing which authoring workflow created it. Menu visibility does not prove implementation of other prospective geometry tools.

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
