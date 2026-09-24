# Unreleased

## Drawing — Arc Stage 1 accepted

- Completed and browser-accepted three-point Arc authoring (Start → End → Form/Radius Point) with canonical endpoint `SketchPoint` references plus bulge persistence; center, radius, angles, signed sweep, P3, and the support Circle remain derived.
- Integrated finite Arcs with selection and directional Window/Crossing semantics, Point-on-Arc foundations, topology, deletion, History, persistence, and shared Drawing presentation; authoring reference/support geometry remains transient.
- Completed Arc center drag as whole-Arc translation and endpoint drag with geometric least-change selection of the remaining circular form degree of freedom under shared solver authority.
- Corrected Arc body/radius drag to the browser-verified radial behavior: the free-case derived drag-start center and endpoint angles stay fixed, both endpoint SketchPoints move, and bulge/signed sweep remains unchanged. Hard constraints project ideal endpoint targets through the shared component solver.
- Removed dead Circle/Arc helper APIs as targeted maintenance before the final radius behavior. Radius/Diameter Dimension and Constraint, Concentricity, and Tangency remain unimplemented; Radius/Diameter Dimension is next.

## Drawing — Circle Stage 1 accepted

- Completed and browser-accepted the semantic Center + Radius Circle workflow: P1 defines or reuses a persistent center `SketchPoint`, the live preview follows P2, and P2 commits one authoritative scalar radius without creating a persistent radius point.
- Integrated committed Circles with normal shared Drawing presentation, visible derived center presentation, persistence, History, selection, hit testing, deletion cleanup, and directional Window/Crossing selection.
- Made persistent SketchPoints global snap candidates and added accepted Circle P1 acquisition for points, Line Midpoints, finite Lines, existing Circle circumferences through global Point-on-Curve semantics, applicable Alignment, and free placement.
- Added circumference-driven P2 acquisition of existing persistent points through the same global Point-on-Curve foundation; this is not Tangency and creates no duplicate point or persistent P2 point.
- Completed Circle center and circumference/body Direct Manipulation; body dragging changes the persistent radius about the free-case fixed center with no-jump radial grabbing through shared constraint machinery.
- Included Circle in the global Ctrl authoring bypass and shared Line/Profile/Circle geometry-authoring cursor policy. At Circle Stage 1 acceptance, Arc and the later circular Dimensions/Constraints remained unimplemented; Arc Stage 1 was subsequently accepted as recorded above.

## Documentation — global Drawing Presentation Standard

- Defined `PROJECT_MASTER.md` as the normative global authority for committed geometry states, interaction overrides, Authoring Preview, Inference, support/reference geometry, Constraints, Dimensions, Points, directional selection overlays, precedence, and explicitly tracked future decisions.
- Recorded the semantic pipeline from entity-specific freedom/relation derivation through shared presentation classification to geometry-specific SVG primitives, with Line as reference implementation rather than owner.
- Recorded the presentation standard before Circle Stage 1's later committed-presentation integration and final browser acceptance; the accepted current status is recorded above.

## Documentation — circular Drawing direction and placeholder status

- Corrected current documentation to match accepted code truth: the implemented Constraint set is Midpoint, Coincidence, Parallelism, Perpendicular, Horizontal, and Vertical; Concentricity, Tangency, and Radius / Diameter remain inactive, not-implemented choices.
- Recorded Circle — Center + Radius as the then-next planned Drawing geometry and the standalone three-point Arc order as Start → End → Form Point, including the decided Circle topology, radius-input, and directional-selection semantics.
- Recorded the global/shared Drawing architecture direction and the planned sequence for later Radius/Diameter Dimension, Radius/Diameter Constraint, Concentricity, and Tangency work without promoting any placeholder to implemented status.

## Drawing — directional box selection

- Added directional Line multi-selection in Drawing Select: left-to-right Window selection requires complete strict enclosure, while right-to-left Crossing selection includes enclosed, crossed, partly enclosed, and boundary-touching Lines.
- The transient box switches its visual treatment live when drag direction changes; selection commits on release, with an ordinary box replacing selection and Ctrl toggling qualifying Lines.
- Kept points outside independent box qualification and preserved click selection, Direct Manipulation, and the separate Dimensions interaction workflow.

## Drawing — accepted snap tuning

- Tuned Drawing snap areas for a less magnetic feel: Endpoint and Midpoint capture/release at 7/9 CSS px, while finite Line, alignment, and Point Reference use 5/7 CSS px.
- Parallel and Perpendicular now capture at 5 CSS px, release after leaving their 7 CSS px lateral client-space corridor, and can reacquire immediately on returning within capture range.
- Preserved Ctrl bypass, H/V arbitration, compatible positional composition, and zoom-consistent directional behavior; the resulting snap feel was accepted in real-browser validation.

## Drawing — Profile tool identity

- Renamed the current chained authoring tool from its legacy Line identity to Profile, changed its tool ID from `'line'` to `'profile'`, and preserved its interaction and commit behavior; the merged migration was subsequently browser-verified and accepted.
- Separated Profile workflow ownership from reusable straight-Line resolution and generic Drawing document mutation; committed geometry and serialization remain `type: 'line'`.
- Reserved Line for the separate standalone one-segment workflow that was subsequently implemented.

## Drawing — standalone Line tool

- Added the accepted standalone Line tool: P1 to P2 creates exactly one straight segment and completes without automatically chaining from P2.
- Normal activation returns to Select; persistent activation keeps Line active but fully resets each completed construction so the next click is a fresh independent P1.
- Reused Profile's neutral straight-segment foundations for inference, constraints, topology, presentation, and document mutation while keeping Profile's chained lifecycle and delayed commit boundary separate.
- Kept persisted geometry as ordinary `DrawingLineEntity` / `type: 'line'` data with no authoring-origin metadata, allowing existing selection, Direct Manipulation, Constraints, Dimensions, topology, and History systems to operate unchanged.
- The merged standalone Line tool was tested by the user in the real browser and accepted.

## Documentation and product-definition synchronization

- Established the expanded Roadmap as future-direction and feature-status authority, added collaboration working-rules navigation, and synchronized the central documentation workflow.
- Clarified the legacy chained `Line` authoring as the Profile foundation versus the then-planned standalone Line product, and recorded J as Joint and P as Pattern without presenting those future tools as implemented.
- Synchronized the separate Dimensions/Constraints architecture and the browser-verified Constraints selection workflows and implemented set, including the correction that Concentricity and Tangency are inactive placeholders and have never been implemented; retained Fix, Symmetry, Radius / Diameter, Angle, Length, and Distance as not implemented Constraints.
- Aligned current TB/W/S status and documentation authority without changing application behavior or promoting planned Construction, Puzzle, or 3D capabilities.

## Drawing — Line inference and transaction authority

- Made every chained segment a fresh Line interaction while preserving shared `SketchPoint` topology; manual restarts and continuations now use the same inference path.
- Separated Line direction authority from position authority and applied compatibility-before-priority across Endpoint, Midpoint, finite-Line, alignment, and Point Reference placement.
- Established direction authority remains stable during longitudinal pointer travel while compatible positional evidence is sought, and committed geometry is visible to inference in the same event.
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
