# Box / Construction Pipeline Map

> **Status: current orientation document.** This file is a concise map of the Box / Construction geometry pipeline. [PROJECT_MASTER.md](PROJECT_MASTER.md) is the authority for current product architecture, including Drawing and Puzzle. Historical pipeline snapshots and investigations are indexed in [docs/README.md](docs/README.md).

## Drawing presentation architecture

Drawing presentation follows a semantic pipeline rather than geometry- or tool-owned paint:

```text
semantic geometry / semantic relation
  -> semantic presentation classification
  -> shared Drawing Presentation Standard
  -> geometry-specific SVG primitive or role-specific glyph
```

Thus a Line renders as `<line>`, true semantic Circle geometry as `<circle>`, a future Arc may render as `<path>`, and Points, Dimensions, and Constraints use their own glyphs/primitives while consuming global roles wherever semantics are shared. Entity-specific mobility derives the global geometry constraint visual state; temporary selection or inference paint does not change that underlying state. Entity-defining persistent points, including Circle centers, receive a derived normal presentation role rather than duplicate entity-owned geometry or persisted presentation state. Transient and persistent forms may share relation/layout derivation while retaining distinct paint. Line, Profile, and Circle also share the Drawing geometry-authoring cursor policy. The normative roles, values, precedence, and open decisions are owned by [PROJECT_MASTER.md](PROJECT_MASTER.md#49-normative-drawing-presentation-standard), not duplicated here.

Persistent `SketchPoint`s are discovered globally as positional snap candidates regardless of which geometry references them, so shared topology is reused rather than duplicated. Point-on-Curve is likewise a global semantic relationship represented by `COINCIDENT` / `point-curve`, not a Circle-owned constraint system. Circle Stage 1 uses that foundation both when its center is authored on an existing Circle and when its circumference acquires an existing persistent point. This reusable foundation does not imply that Arc or a generic curve system is implemented.

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
