# Unreleased

## Drawing — Profile tool identity

- Renamed the current chained authoring tool from its legacy Line identity to Profile while preserving its interaction and commit behavior.
- Separated Profile workflow ownership from reusable straight-Line resolution and generic Drawing document mutation; committed geometry and serialization remain `type: 'line'`.
- Reserved Line for the planned standalone one-segment tool; that future tool is not implemented by this migration.

## Documentation and product-definition synchronization

- Established the expanded Roadmap as future-direction and feature-status authority, added collaboration working-rules navigation, and synchronized the central documentation workflow.
- Clarified the current chained `Line` authoring as the Profile foundation versus the planned standalone Line product, and recorded J as Joint and P as Pattern without presenting those future tools as implemented.
- Synchronized the separate Dimensions/Constraints architecture and the browser-verified Constraints selection workflows and implemented set, including Concentricity and Tangency; retained Fix, Symmetry, Radius / Diameter, Angle, Length, and Distance as not implemented Constraints.
- Aligned current TB/W/S status and documentation authority without changing application behavior or promoting planned Construction, Puzzle, or 3D capabilities.

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
