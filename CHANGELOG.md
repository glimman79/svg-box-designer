# Unreleased

## Drawing — Line inference and transaction authority

- Made every chained segment a fresh Line interaction while preserving shared `SketchPoint` topology; manual restarts and continuations now use the same inference path.
- Separated Line direction authority from position authority and applied compatibility-before-priority across Endpoint, Midpoint, finite-Line, alignment, and Point Reference placement.
- Established direction authority now survives ordinary pointer travel while compatible positional evidence is sought, and committed geometry is visible to inference in the same event.
- Preserved rapid consecutive Line commits with a transaction-owned, delayed/double-click-safe commit boundary.
- Added direction-aware Point Reference intersections and distinguished position-defining references from reference-only evidence.
- Browser verified that an active Parallel construction naturally acquires a compatible Perpendicular-derived Point Reference without sideways pointer movement.
- Unified transient and persistent semantic presentation paths for Midpoint and relation markers, while keeping persistence separate from live inference.

# Changelog

## V1.2 — TB + Wall Stabilization

- Added rectangular Wall authoring with W-A/W-B roles and shared TB-equivalent generation.
- Stabilized mixed multi-contributor panel composition, generated-profile reconciliation, projection lineage, and restore behavior.
- Completed per-connection tab control and release acceptance for the TB/Wall construction pipeline.

## Authority Step C

- Established `panelComposer` as the panel-composition authority and `FinalGeometry` as the downstream physical contract.
- Added mixed, single-tool, and legacy authority modes for production, restricted rollback, and oracle compatibility.

## V1.1

- Expanded SVG import/panel containment, Panel Manager, TB and S workflows, generated geometry, manufacturing compensation, preview, and export.
