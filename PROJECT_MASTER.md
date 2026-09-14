# SVG Box Designer — Project Master

## 1. Document authority and status language

This is the durable authority for **current** product scope, architecture, accepted behavior, known debt, and next work. `PROJECT_HISTORY.md` records why the architecture evolved; `CHANGELOG.md` records releases. Historical reports and passing tests are evidence, not authority over this document or a contrary browser result.

- **[IMPLEMENTED]** — present in the current repository.
- **[ACCEPTED / LOCKED]** — browser-accepted or release-accepted behavior that must not regress without an approved change.
- **[IN PROGRESS]** — present work whose direction is understood but whose required behavior has not passed final browser acceptance.
- **[KNOWN DEBT]** — an observed limitation, inconsistency, or cleanup obligation.
- **[PLANNED]** — approved direction not yet implemented.
- **[CONCEPT / NOT YET DECIDED]** — a hypothesis or unresolved design question.
- **[HISTORICAL]** — context only, not current authority.

For interactive Drawing behavior, unit, solver, state, and render-level SVG tests are necessary but not sufficient. Browser acceptance is authoritative for pointer sequences, inference acquisition/release, transient previews, Direct Manipulation, selection arbitration, and cursors. A user-observed browser failure remains unresolved even when automated tests pass.

## 2. Project identity and organization

SVG Box Designer is a React/TypeScript/Vite application using SVG presentation. Its top-level product organization remains:

1. **2D Drawing — [IMPLEMENTED, actively developing]**
2. **Puzzle — [PLANNED]**
3. **Box / Construction — [IMPLEMENTED]**

Manufacturing belongs to Box / Construction; it is not a fourth module. Drawing is substantial post-v1.2 development, not a claim that the whole product has a new formal release.

## 3. Locked Box release baseline

- **Release:** v1.2 — TB + Wall Stabilization
- **Semantic version:** `1.2.0`
- **Locked release commit:** `e787eb5b1f3ff530fbae9292d56ec4a1da0e2ba2`
- **Official tag recorded by project governance:** `v1.2.0`

**[IMPLEMENTED][ACCEPTED / LOCKED]** v1.2 is the accepted Box / Construction compatibility boundary. Its rectangular TB/W ownership, composition, reconciliation, FinalGeometry, manufacturing, and restore semantics remain locked. Drawing work occurred afterward and does not rename or reopen that release.

## 4. Shared project architecture: current boundary

**[IMPLEMENTED]** `SvgDocumentModel` remains the imported/resolved geometry model used by construction. It preserves SVG root information, detected edges, panels, contours, containment, dimensions, and diagnostics; Panel Manager supplies construction panel thickness.

**[IMPLEMENTED]** Drawing currently owns a separate versioned `DrawingDocumentV2`, sketch state, stable identities, constraints, dimensions, solver, and bounded Drawing History. This is real application architecture, but it is not yet a global multi-workspace document.

**[PLANNED]** A shared versioned `ProjectDocument` must eventually aggregate or reference Drawing, imported SVG, Puzzle, construction, manufacturing settings, stable cross-module references, dependency/revision metadata, and workspace state. Global cross-workspace History and invalidation are also future work. Existing useful models must be wrapped and migrated, not rewritten merely to obtain a common root.

## 5. 2D Drawing — current implementation

### 5.1 Scope

**[IMPLEMENTED]** Drawing has a workspace, Line and Dimension authoring, explicit sketch topology, snapping/inference, solver-backed dimensions and geometric constraints, Direct Manipulation, constraint presentation, a floating Constraints tool, and its own Undo/Redo transactions. Other prospective profile, curve, trim, mirror, rectangle, circle, and construction tools are **[PLANNED]** unless present in code; visibility in a menu is not implementation.

### 5.2 Sketch topology

**[IMPLEMENTED]** `DrawingSketchV2` stores `DrawingSketchPoint` records and `DrawingLineEntity` records. A Line references `startPointId` and `endPointId`; it does not own unrelated endpoint coordinates. Connected Lines can share a SketchPoint identity. Points, entities, dimensions, and geometric constraints have stable IDs and explicit order arrays. Resolved Line coordinates are derived from referenced points. Legacy coordinate-embedded documents migrate without inventing connectivity from equal coordinates.

### 5.3 Solver and semantic authority

**[IMPLEMENTED]** Drawing is solver-backed:

```text
SketchPoint coordinate variables
+ typed driving dimensions and geometric constraints
+ residual equations and Jacobian rows
+ connected-component solving
+ rank / null-space / degree-of-freedom analysis
→ resolved sketch geometry
```

Reference dimensions contribute annotation truth but no driving equation. Solver verification fails closed for invalid, degenerate, or unsatisfied systems. Coordinates are resolved results; destructive endpoint mutation is not constraint authority.

**[IMPLEMENTED][ACCEPTED / LOCKED]** Direct Manipulation moves selected points or Lines by solving the affected constraint component and propagates motion through shared topology and constraints. It must never permanently bypass semantic constraint authority.

### 5.4 Line solver state

**[IMPLEMENTED]** Projected Line mobility from solver null-space behavior classifies Lines as `FREE`, `CONSTRAINED`, or `FULLY_LOCKED`. Current browser-used colors are `#39FF5A`, `#00A83E`, and `#111827`, respectively. `#00A83E` is temporarily accepted, **not** permanently product-locked. Hover/selection color is a separate interaction state.

## 6. Drawing interaction

**[IMPLEMENTED][ACCEPTED / LOCKED]** Left mouse performs current authoring/selection, right-drag pans, the wheel zooms, and Esc leaves the appropriate tool or interaction state. Empty canvas uses a crosshair; selectable/clickable/draggable geometry uses the normal/default arrow; active tools use tool-specific cursors; only an actual right-drag pan uses grabbing. Normal CAD geometry does not use a hand/pointer cursor.

Ctrl is deliberately contextual:

- while authoring a Line, Ctrl is a temporary raw override of automatic inference/snap;
- in ordinary Select, Ctrl adds/removes selection and remains selection-only rather than starting Direct Manipulation.

### Selection and point presentation

**[IMPLEMENTED]** Line hover has a small square marker, point hover a slightly larger square marker, and a selected point a dark-blue circular marker. Point hit areas are larger than their visible marks. A persistent Coincidence marker is an offset square. These are behavioral descriptions, not frozen pixel specifications.

## 7. Snap and inference authority

### 7.1 Separate channels

The architecture distinguishes:

1. **Position** — the one effective endpoint used to author geometry;
2. **Topology** — reuse of an existing SketchPoint or creation of a new identity;
3. **Semantics** — all compatible relations true at accepted geometry;
4. **Presentation** — transient guides and markers derived from those relations;
5. **Ctrl raw override** — temporary suppression of automatic acquisition and its guides/semantics.

**[ACCEPTED / LOCKED] COMPATIBILITY BEFORE PRIORITY.** One position/effective-point authority does **not** imply only one geometric semantic relation. Compatible relations simultaneously true at final geometry must coexist. Priority arbitrates incompatible positional alternatives; it must not erase compatible semantic truth.

### 7.2 Implemented acquisition and arbitration

**[IMPLEMENTED]** The resolver has explicit point/Line candidates and retention thresholds. Current effective authority follows these code-level classes rather than one universal flat list: existing shared-point/Endpoint topology and Midpoint special-point acquisition are strongest point authorities; H/V and compatible Parallel/Perpendicular or generic angular direction resolve authored direction; finite Line-body Point-to-Line acquisition and X/Y point-reference alignment supply positional/reference alternatives; raw cursor is fallback. H/V has explicit axis authority and suppresses redundant perpendicular semantics at axis-aligned chained corners.

Implemented inference families include Endpoint/shared point, finite Line body, X/Y point alignment, H/V, generic angular construction, Parallel, Perpendicular, Midpoint, and point-based 90-degree reference direction. Inference acquisition, a transient symbol, and a committed semantic constraint are separate capabilities and must be reported separately.

The point-based 90-degree reference is a transient construction direction from a visible endpoint incident to a Line. It uses presentation-only guide geometry, is not automatically a persistent `PERPENDICULAR` constraint, may deduplicate axis normals with H/V, and is suppressed by Ctrl.

### 7.3 Ctrl raw override

**[IMPLEMENTED][ACCEPTED / LOCKED]** During Line authoring, held Ctrl bypasses automatic Endpoint, finite Line body, X/Y, H/V, generic angular, Parallel, Perpendicular, point-reference 90-degree, and associated automatic semantics/guides in the live authoring path. It does not delete committed constraints or break already committed topology.

## 8. Drawing constraints

### 8.1 Floating Constraints tool

**[IMPLEMENTED]** The compact, movable, non-modal panel contains 14 visible choices: Distance, Length, Angle, Radius / Diameter, Symmetry, Midpoint, Fix, Coincidence, Concentricity, Tangency, Parallelism, Perpendicular, Horizontal, and Vertical. A centralized applicability function is the sole selection-to-constraint policy authority. Only Midpoint, Coincidence, Parallelism, Perpendicular, Horizontal, and Vertical are currently implemented there; implemented choices are enabled only for applicable, nonduplicate selections. The rest remain disabled/grey and must not be treated as implemented.

**[IMPLEMENTED][ACCEPTED / LOCKED]** The panel floats above Drawing, can be dragged, retains its position during the session, has a close control, remains open after apply, and is non-modal. While closed, ordinary click replaces selection and may begin Direct Manipulation; Ctrl-click toggles without manipulation. While open, ordinary geometry click accumulates/toggles without a modifier and does not begin Direct Manipulation. Empty-canvas click clears geometry selection but leaves the panel open. OK applies, clears selection, and leaves it open. Esc closes it, clears relevant selection, and restores normal Select behavior. Panel-only OK/Esc state creates no History transaction.

### 8.2 Implemented first-class constraints

- **Horizontal / Vertical — [IMPLEMENTED].** One-Line axis constraints use solver equations. Accepted automatic H/V can commit them. A Line may not silently replace or duplicate an existing opposite/same axis constraint; centralized applicability disables either axis choice once hard axis intent exists.
- **Parallel — [IMPLEMENTED].** An unordered stable Line pair uses a normalized directional/cross-product residual. It owns direction only, not position, distance, or length. Persistent presentation uses paired `II` marks. **[ACCEPTED / LOCKED]** automatic Parallel and its transient mark work in the browser while Parallel is active alone.
- **Perpendicular — [IMPLEMENTED].** An unordered Line pair uses a normalized dot-product relation. Automatic Perpendicular is used for appropriate non-axis-aligned cases; axis-aligned chained corners retain H/V rather than redundant Perpendicular. **[ACCEPTED / LOCKED]** persistent/reference presentation supports a shared point for connected Lines, infinite-support intersection for separated Lines, a support gap, dynamic marker-side choice, and side flipping as geometry changes. Support geometry is presentation only.
- **Coincidence — [IMPLEMENTED].** `point-point` constrains two stable SketchPoints together. `point-linear-support` constrains a point to an infinite Line support while retaining slide freedom. Persistent marker behavior exists. Transient symbol parity is **[KNOWN DEBT]**.
- **Midpoint — [IMPLEMENTED].** A SketchPoint plus target Line produces two midpoint equality equations. Manual Midpoint can replace redundant Coincidence for the same Point→Line support. Persistent presentation is `—□—`; automatic Midpoint acquisition and semantic commit exist.

### 8.3 Current browser-verified checkpoint

**[ACCEPTED / LOCKED]**

- Midpoint automatic snap works.
- Midpoint transient symbol works.
- Midpoint transient placement uses the persistent Midpoint marker layout authority: before click it has transient styling, after click persistent styling, without a spatial jump.
- Parallel automatic inference works while active alone.
- Parallel transient `II` works while Parallel remains active alone and follows the persistent marker layout principle.
- Perpendicular functionality and presentation exist as described above.

These acceptances do **not** accept Parallel + Perpendicular coexistence.

## 9. Dimensions

**[IMPLEMENTED]** The exact persistent `DrawingDimensionKind` values are:

- `ALIGNED_DISTANCE`, `HORIZONTAL_DISTANCE`, `VERTICAL_DISTANCE` for Line or Point-to-Point references;
- `POINT_TO_LINE_DISTANCE`;
- `LINE_TO_LINE_DISTANCE`;
- `LINE_TO_LINE_ANGLE`.

Dimensions have stable semantic references (including Origin where supported), `driving` or `reference` roles, values, and persistent linear/angular placement. Driving edits are solver-backed; reference dimensions are derived annotations. The UI supports placement and double-click editing. A reference angle is parenthesized, for example `(35°)`; a Driving angle is unparenthesized, for example `35°`.

## 10. Constraint and inference presentation

The implemented direction is:

```text
semantic constraint or accepted inference
→ shared presentation derivation
→ screen-space marker/support layout
→ transient or persistent overlay
```

**[IMPLEMENTED in part]** Midpoint and Parallel transient presentation reuse persistent marker layout authority; Perpendicular uses shared presentation derivation. This unification is ongoing and is not complete for every family. Transient inference uses `#38BDF8`; persistent constraint presentation uses `#2563EB`.

Presentation-only guides, support intersections, gaps, and marker geometry must never become SketchPoints, entities, solver authority, exported manufacturing geometry, or geometry History transactions.

## 11. Drawing History and transactions

**[IMPLEMENTED]** Drawing has bounded in-memory Undo/Redo over Drawing documents. One user-authored action is one logical transaction: for example, Line creation and the compatible automatic semantic constraints produced by that click are committed together. Direct Manipulation and accepted dimension/constraint changes transact their resolved document result; hover, panel movement, panel OK/Esc without geometry change, and transient previews do not create geometry transactions.

This is Drawing-local History. It is not the future global `ProjectDocument` History.

## 12. Current Drawing known debt and active work

### 12.1 Parallel + Perpendicular browser verification

**[IMPLEMENTED][IN PROGRESS]** Live Line authoring now groups acquired Parallel and Perpendicular channels by their actual nondegenerate reference geometry before soft positional arbitration. When the Parallel tangent is compatible with the Perpendicular normal, one common direction projects the raw pointer to the authoritative effective endpoint; both relations are then truth-checked against that same geometry, presented together, and committed in the Line transaction. Endpoint, Midpoint, and finite-Line position authorities remain exact, H/V remains exclusive, Ctrl remains raw, and incompatible or degenerate references fail closed.

The production-path regression includes the previously missing competition in which a point-reference construction is the singular positional winner while compatible first-class Parallel and Perpendicular channels are live. The implementation and automated regression are complete, but this behavior is **not [ACCEPTED / LOCKED]** and remains pending user browser verification.

### 12.2 Transient visual debt

**[KNOWN DEBT]** After the blocker, the missing/incomplete symbols are:

- Horizontal preview;
- Vertical preview;
- Coincidence Point-to-Point preview;
- Coincidence Point-to-Line preview.

Simultaneous Parallel + Perpendicular preview cannot be accepted while the live Parallel semantic relation is dropped.

## 13. Puzzle

**[PLANNED]** Puzzle remains a separate future module. A validated closed Drawing boundary should become a Puzzle boundary without manual export/import, using stable shared project identity. Standard/custom boundaries, optional frame, piece generation, and complementary mating geometry are future scope.

Every internal adjacency must eventually have physically complementary, sufficiently unique mating geometry under allowed traversal reversal and piece rotation. **[CONCEPT / NOT YET DECIDED]** subdivision, feasibility, frame-offset, signature construction, and uniqueness algorithms are not locked.

## 14. Box / Construction

Box / Construction remains the mature v1.2 module. TB and W are tool families, not duplicated permanent engines.

### 14.1 TB and W locked behavior

**[IMPLEMENTED][ACCEPTED / LOCKED]** TB uses paired A/B edge roles, per-connection finger width and auto/manual state, completed-group isolation, removal of the unused trailing connection on Finish, and the generic contributor/composition/reconciliation authority pipeline. A/B is a connection role, not an unconditional panel class.

**[IMPLEMENTED][ACCEPTED / LOCKED]** W has native identity and shared TB-equivalent finger-joint generation; exactly one W-A and W-B assignment on distinct panels; fail-closed normalization from unambiguous completed TB role evidence; preservation of valid authored orientation otherwise; per-connection width; group isolation; and the accepted rectangular terminal/mouse-hole behavior. Shared generation never means shared value ownership.

### 14.2 S, J/P, and future assembly

**[IMPLEMENTED, incomplete]** S currently provides planar paired roles, offset and slot/tab length, an S-A replacement boundary, repeated inward S-B slots, and original-source-edge `REFERENCES` semantics. Complementary half-slot assembly and partial-height/elevated walls are **[PLANNED]**; exact frames and schemas are unresolved.

**[PLANNED][CONCEPT / NOT YET DECIDED]** J is a future Joint family and P a future Pattern family (including possible living-hinge patterns). Their variants are not accepted. Non-rectangular/angle-aware TB/W and assembly relationships are future work; assembly angle must belong to a shared authoritative relationship, not a generator or 3D view. The historical main-B/surrounding-A topology remains only a hypothesis requiring proof and exact rectangular-v1 compatibility.

### 14.3 Locked geometry pipeline

**[IMPLEMENTED][ACCEPTED / LOCKED]**

```text
SVG import → SvgDocumentModel → Panel Manager
→ authored connections/assignments → TB/W/S generators
→ GeneratedGeometryItem[] → relationship audit → contributor adapters
→ panelComposer → reconciliation → fail-closed authority selection
→ GeneratedGeometrySnapshot → FinalGeometry
→ derived ManufacturingGeometry → preview/export
```

Contributors are immutable. `REPLACES` owns a physical source edge; `REFERENCES` does not. Conflicting replacements and missing/ambiguous/unsupported reconciliation fail closed—there is no tool-priority or last-writer winner. Restore reinstates stored generated authority verbatim rather than silently recomposing it.

## 15. Manufacturing and 3D preview

**[IMPLEMENTED][ACCEPTED / LOCKED]** Manufacturing remains inside Box / Construction and consumes a derived copy of immutable FinalGeometry. Its order is Profile Offset, Tap Clearance, Slot Clearance, then terminal Kerf. Preview and manufacturing export consume compensated geometry; design export may serialize FinalGeometry.

**[PLANNED]** Static 3D Preview is derived-only and must never own geometry, placement, or angle truth. Assembly entities, local frames, dihedral angles, handedness/alignment, deterministic transforms, and graph validation remain missing prerequisites.

## 16. Cross-cutting invariants

1. Preserve the v1.2 rectangular TB/W compatibility boundary and restore-verbatim snapshot semantics.
2. Drawing Lines reference stable SketchPoints; shared topology is identity, not coordinate coincidence.
3. Driving dimensions, constraints, Direct Manipulation, and resolved coordinates remain solver-backed.
4. Compatible semantics may coexist even though only one effective position is authored.
5. Presentation-only geometry never becomes model, solver, History, or manufacturing authority.
6. One authored Drawing action creates one logical Drawing History transaction.
7. Tests do not confer browser acceptance on interactive behavior.
8. Puzzle and global ProjectDocument architecture remain future scope until implemented.

## 17. Immediate next work

1. **First: fix real runtime compatible Parallel + Perpendicular coexistence.** Follow the actual pointer-move/`effectivePoint` path. When Parallel is active and compatible Perpendicular becomes valid, Parallel must remain functional, Perpendicular must also be active, one final authored Line must satisfy both, both transient previews must coexist, and one click must commit both semantics. Do not rely only on synthetic states containing both IDs. Browser-confirm the complete sequence.
2. Then add/fix Horizontal, Vertical, Coincidence Point-to-Point, and Coincidence Point-to-Line transient previews and browser-confirm them.
3. Then continue broader shared constraint/inference presentation unification.

Do not start Symmetry, Fix, Concentricity, Tangency, or other disabled catalog work merely because those entries are visible. Do not begin global ProjectDocument work ahead of this active Drawing checkpoint.
