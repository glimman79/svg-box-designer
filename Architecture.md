# Box / Construction Pipeline Map

> **Status: current orientation document.** This file is a concise map of the Box / Construction geometry pipeline. [PROJECT_MASTER.md](PROJECT_MASTER.md) is the authority for current product architecture, including Drawing and Puzzle. Historical pipeline snapshots and investigations are indexed in [docs/README.md](docs/README.md).

## Drawing architecture

Drawing presentation follows a semantic pipeline rather than geometry- or tool-owned paint:

```text
semantic geometry / semantic relation
  -> semantic presentation classification
  -> shared Drawing Presentation Standard
  -> geometry-specific SVG primitive or role-specific glyph
```

Thus a Line renders as `<line>`, true semantic Circle geometry as `<circle>`, and true finite Arc geometry as `<path>`, while Points, Dimensions, and Constraints use their own glyphs/primitives and consume global roles wherever semantics are shared. Entity-specific mobility derives the global geometry constraint visual state; temporary selection or inference paint does not change that underlying state. Entity-defining persistent points such as Circle centers, and the currently derived Arc-center presentation, receive semantic roles rather than duplicate entity-owned geometry or persisted presentation state. Transient and persistent forms may share relation/layout derivation while retaining distinct paint. Line, Profile, Circle, and Arc share the Drawing authoring, selection, topology, History, deletion, and presentation foundations where applicable. The normative roles, values, and precedence are owned by [PROJECT_MASTER.md](PROJECT_MASTER.md#49-normative-drawing-presentation-standard), not duplicated here.

Persistent `SketchPoint`s are discovered globally as positional snap candidates regardless of which geometry references them, so shared topology is reused rather than duplicated. Point-on-Curve is likewise a global semantic relationship represented by `COINCIDENT` / `point-curve`, not a Circle- or Arc-owned constraint system. Circle Stage 1 and Arc Stage 1 reuse this foundation, including Point-on-Arc semantics.

Circle persistence is `centerPointId` plus a radius scalar; its center is a real shared
SketchPoint and authoring P2 is not persistent. Current Arc persistence is
`DrawingArcEntity { id, type: 'arc', startPointId, endPointId, bulge }`, where bulge is
`tan(signedSweep / 4)` and is the current curvature/signed-sweep authority. Arc center,
radius, start/end angles, signed sweep, authoring P3/form point, and support Circle are
derived. This is the current serialized/runtime representation, not a locked final
architecture. The Arc authoring P1-to-P2
reference line and P3 support Circle are transient presentation only—not entity
geometry, topology, History, or export geometry.

Direct Manipulation uses shared constrained solving while respecting canonical storage.
A grip defines the semantic subspace of an interaction: persistent Constraints and
driving Dimensions restrict motion inside it but do not redefine the grip. Exact grip
invariants enter as transient semantic equations rather than weighted preferences.
Circle center drag moves the persistent center with unchanged free-case radius; Circle
body drag varies radius about an exact fixed-center pivot. Arc center drag is rigid
translation subject to persistent hard equations; Arc body/radius drag keeps the
free-case derived center stationary while radius and endpoints change consistently; Arc
endpoint drag keeps the opposite endpoint as an exact transient fixed pivot throughout
full feasible branch continuation.

Conceptually, Tier 0 contains persistent hard geometric Constraints, driving Dimensions,
and exact transient grip-semantic equations. Tier 1 expresses pointer/geometric intent
within the feasible semantic manifold. Continuity, least-change, and other non-semantic
tie-breaking are lower priority. Canonical mobility is likewise per variable: Circle
center X/Y plus radius, and Arc P1 X/Y, P2 X/Y plus bulge, allowing partial and fully
constrained visual states to be distinguished.

Ordinary Dimensions share the existing system for the Circle persistent center, Arc
persistent endpoints, and Arc derived semantic center. Circular-size Dimensions are
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

The next technical task is **ARC COMMON-ARCHITECTURE REASSESSMENT**. Line, Circle, and
Arc must use the same common Drawing architecture wherever possible, with Arc-specific
structure only where mathematically necessary. The open decision is whether the Arc
center remains a derived semantic point or becomes a first-class persistent SketchPoint
analogous to Circle center; neither option is predetermined. Compare topology, minimum
independent state and curvature authority, solver/overconstraint behavior, each grip's
variables, Dimensions and Coincidence references, snap/inference, dependency components,
deletion, serialization/restore/migration, History, authoring, and preservation of
accepted behavior.

Under the current model, durable authoring to an Arc center uses narrow `COINCIDENT` /
`point-derived-point` between a persistent SketchPoint and the derived center. Current
selection can detect and manipulate that center but collapses ordinary center selection
to the parent Arc; semantic center ownership and manual Constraints Coincidence remain
unresolved until reassessment. Selection must follow the feature clicked, not silently
substitute its parent. Concentricity and Tangency remain unimplemented.

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
