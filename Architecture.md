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

Thus a Line renders as `<line>`, true semantic Circle geometry as `<circle>`, and true finite Arc geometry as `<path>`, while Points, Dimensions, and Constraints use their own glyphs/primitives and consume global roles wherever semantics are shared. Entity-specific mobility derives the global geometry constraint visual state; temporary selection or inference paint does not change that underlying state. Entity-defining persistent points, including Circle centers and the derived Arc center presentation, receive semantic roles rather than duplicate entity-owned geometry or persisted presentation state. Transient and persistent forms may share relation/layout derivation while retaining distinct paint. Line, Profile, Circle, and Arc share the Drawing authoring, selection, topology, History, deletion, and presentation foundations where applicable. The normative roles, values, and precedence are owned by [PROJECT_MASTER.md](PROJECT_MASTER.md#49-normative-drawing-presentation-standard), not duplicated here.

Persistent `SketchPoint`s are discovered globally as positional snap candidates regardless of which geometry references them, so shared topology is reused rather than duplicated. Point-on-Curve is likewise a global semantic relationship represented by `COINCIDENT` / `point-curve`, not a Circle- or Arc-owned constraint system. Circle Stage 1 and Arc Stage 1 reuse this foundation, including Point-on-Arc semantics.

Circle persistence is `centerPointId` plus a radius scalar; its center is a real shared
SketchPoint and authoring P2 is not persistent. Arc persistence is
`DrawingArcEntity { id, type: 'arc', startPointId, endPointId, bulge }`; bulge is the
curvature/signed-sweep authority. Arc center, radius, start/end angles, signed sweep,
authoring P3/form point, and support Circle are derived. The Arc authoring P1-to-P2
reference line and P3 support Circle are transient presentation only—not entity
geometry, topology, History, or export geometry.

Direct Manipulation uses shared component solving but respects each geometry's canonical
storage. Circle body drag changes its radius scalar about the fixed free-case center.
Arc center drag translates both endpoint SketchPoints and preserves bulge; Arc
body/radius drag moves both endpoints radially about the derived drag-start center while
preserving endpoint angles and bulge/signed sweep. Arc endpoint drag makes the dragged
endpoint authoritative, keeps the opposite endpoint as the free-case pivot, and uses a
generic solver secondary objective for geometric least change of the remaining form
degree of freedom. It writes the result back as bulge from drag-start state plus absolute
pointer displacement, so it is reversible and event-rate independent without a
persistent form anchor or three-point reconstruction.

Hard persistent constraints and driving Dimensions remain authoritative. Ideal Arc
body/radius endpoint targets are projected through the shared solver while bulge stays
fixed, so constrained achieved center/radius/angles can differ from the ideal free pose.
This is one global architecture—constraints, applicability, solver, selection, hit
testing, Direct Manipulation, snap, inference, topology, Dimensions, presentation,
History, transactions, serialization, and deletion are shared concerns. Geometry-specific
math does not create separate mini-CAD systems. Compatible relations coexist; priority
chooses only among incompatible alternatives, keeping position, direction, topology,
semantic evidence, presentation, and persistence authority distinct.

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
