# Generator-authored tap-role diagnostic

## Scope and reproduction

`npm run diagnose:tap-roles` compiles and runs a deterministic harness over TB and S fixtures. It traces generator-authored tap groups through a `GeneratedGeometrySnapshot`, `FinalGeometry`, `ManufacturingGeometry`, and the exact predicate used to construct the Tap Clearance mask. The harness deliberately makes no classification from orientation, topology, or appearance. Coordinate tests in the output answer only the requested factual questions: whether the authored segment is coincident with an imported boundary and whether it touches a source-edge endpoint.

The fixtures cover horizontal middle/start/end, vertical start/end, reversed horizontal and vertical source directions, clockwise and counterclockwise contours, and S male taps. Each segment record contains coordinates, `GeneratedTapId`, source operation, panel and edge IDs, authored role, eligibility, endpoint contact, boundary coincidence, stage index mapping, final role/ID, and final mask membership. Every contour also prints its complete mask.

Set `TAP_ROLE_DEBUG_SVG_DIR` to a disposable directory to emit optional annotated SVGs (for example, `TAP_ROLE_DEBUG_SVG_DIR=/tmp/tap-role-svg npm run diagnose:tap-roles`). Labels use `B0`/`B1` for source boundary, `TS`/`TE` for tap walls, `TIP` for tap tips, and `CC` for corner closure, followed by the mask `+`/`-`. This output is generated only by the diagnostic and does not touch production rendering.

## Result

The normal middle TB tap is emitted as:

| authored segment | coordinates | role | eligible | final index |
|---|---|---|---|---|
| 0 | `[30,5] → [30,0]` | `tap-side-start` | yes | 1 |
| 1 | `[30,0] → [60,0]` | `tap-tip` | no | 2 |
| 2 | `[60,0] → [60,5]` | `tap-side-end` | yes | 3 |

For a horizontal endpoint pattern, the start tap is `[0,5] → [0,0]` (`tap-side-start`, eligible), `[0,0] → [30,0]` (`tap-tip`, not eligible), `[30,0] → [30,5]` (`tap-side-end`, eligible). The end tap is `[60,5] → [60,0]` (`tap-side-start`, eligible), `[60,0] → [90,0]` (`tap-tip`, not eligible), `[90,0] → [90,5]` (`tap-side-end`, eligible).

The vertical endpoint tap is `[85,0] → [90,0]` (`tap-side-start`, eligible), `[90,0] → [90,40]` (`tap-tip`, not eligible), `[90,40] → [85,40]` (`tap-side-end`, eligible). Thus its first and last segments are on the adjacent original panel boundaries and are included in the mask. Reversing imported source-edge direction changes only which imported endpoint the same contour segment touches; it does not change roles or eligibility. Clockwise contours reproduce the same terminal classification with transformed coordinates.

S reproduces the defect: its endpoint male taps likewise author the terminal segment coincident with the adjacent imported panel boundary as a clearance-eligible tap side.

## First incorrect stage and hypotheses

The first incorrect classification is **generator emission**. At an endpoint, the generator authors the three exposed segments as side/tip/side. The terminal “side” is also a retained segment of the adjacent original panel boundary, but it is authored `tap-side-start` or `tap-side-end`; eligibility therefore begins incorrectly at the generator. Snapshot cloning preserves all values. `FinalGeometry` coordinate matching maps each of the three records to the correct segment without a shift. `ManufacturingGeometry` clones equal-length ID and role arrays. Finally, Tap Clearance correctly applies the authored eligibility predicate, so mask construction merely exposes the earlier error.

The trace rejects off-by-one assignment, point-versus-segment alignment, seam shift, cleanup/remapping drift, FinalGeometry role/ID mismatch, reversed-direction role swapping, and mask-construction error. Segment counts and mappings remain aligned at every stage. It confirms the remaining hypothesis: the first/last tap shares a terminal segment with the panel boundary and generator emission assigns that segment tap-side eligibility.

## Recommended correction (not implemented)

The smallest corrective change is confined to TB and S generator emission: when an emitted terminal tap segment is coincident with an adjacent imported panel boundary, author its existing source-boundary endpoint role rather than a tap-side role. The comparison must use the panel boundary that owns the coincident segment, not just the selected source edge's inset endpoint. No compensation, reconstruction, mask, pipeline-order, UI, serialization, or `GeneratedTapId` change is recommended.
