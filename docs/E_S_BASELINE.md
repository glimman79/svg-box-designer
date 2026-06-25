# E + S Historical Baseline

> Historical reference: this document captures the E/S geometry and export contract at the time the E + S baseline was locked. It is not a statement of the current implementation unless current code or tests explicitly reference it.

E and S were locked baselines when this reference was written. Future C and P work should use this as regression context, not as live product documentation.

This document records the historical geometry and export contract after E and S verification. It should be updated only to annotate baseline migrations or clarify historical context; current behavior should be verified against the source code and regression tests.

## E architecture

- E connections are edge-to-edge finger/tab connections identified by an `E` connection ID.
- Edge assignments own the E role (`A` or `B`) for each panel edge.
- `buildAppliedEPanelPaths()` collects valid closed panels with E operations, constructs inset panel contours, synchronizes tab segment plans by E connection ID, and returns one replacement path per modified panel.
- `applyTabsToContour()` applies A/B tab roles to the inset contour while preserving the source panel outside bounds.
- E-A and E-B use complementary tab segments from the same connection plan, so matching connection IDs share one spacing rhythm.
- B-B outside corners are explicitly reconnected through the original corner to prevent missing-corner artifacts or interior backtracks.

## S architecture

- S connections are slot-and-wall connections identified by an `S` connection ID.
- Each complete S connection has exactly one S-A edge and one S-B edge.
- S-A edges produce wall tabs on their owning panel; S-B edges produce slot paths on the receiving panel.
- Multiple S-A operations may exist on the same panel. They are grouped by panel before contour reconstruction.
- `buildSInsetPanelContour()` globally solves the inset contour for all S-A edges on a panel instead of rebuilding each edge independently.
- `applySTabsToContour()` then adds S-A tabs to the globally solved inset contour.
- `buildAppliedSGeometry()` returns per-connection slot paths plus a single owner replacement panel path for each modified S-A panel.

## Panel ownership model

- Original SVG panels remain the authoritative source panels.
- E owns replacement geometry for panels with E edge operations.
- S owns replacement geometry for panels with S-A edge operations and owns slot paths for S-B receiving edges.
- A panel cannot mix S-A replacement geometry with E-applied geometry.
- For multiple S-A operations on one panel, the lexicographically first S connection ID owns the single replacement panel path; all S connections still own their generated S-B slot paths.
- Unmodified panels are still exported from their original contours.

## Export model

- `exportFinalGeometrySvg()` emits a new SVG using the source root `viewBox`, `width`, and `height` attributes.
- Export emits one outline path for every source panel: applied E/S replacement geometry when present, otherwise the original closed panel contour.
- S slot paths are emitted in addition to panel outline paths.
- Export output is geometry-only: no labels, connection text, handles, overlays, or UI artifacts.
- Export dimensions equal the source SVG dimensions and are not expanded to applied tab or slot extents.

## Geometry ownership rules

- E geometry is owned by `buildAppliedEPanelPaths()` and `applyTabsToContour()`.
- S inset reconstruction is owned by `buildSInsetPanelContour()`.
- S tab application is owned by `applySTabsToContour()`.
- S connection aggregation and slot generation are owned by `buildAppliedSGeometry()`.
- Export serialization is owned by `exportFinalGeometrySvg()` using Final Geometry.
- Future C and P systems must integrate around these contracts and must not alter E or S tab spacing, slot spacing, corner handling, contour reconstruction, panel ownership, or export dimensions.

## Assumptions

- Panel contours are closed, ordered, and have edge IDs matching contour side order.
- E and S operations are generated from straight panel contour sides.
- Matching E connection IDs synchronize tab plans from the shortest participating side.
- S-B slot validation is based on S-A tab distances fitting on the receiving edge.
- Shared S slot offset moves slots perpendicular to the S-B edge and does not change slot start/end distances.
- Source SVG dimensions are the export authority.

## Known limitations

- E and S baseline tests cover rectangular orthogonal panels used by the verified workflows.
- Mixed E and S replacement geometry on the same panel is intentionally rejected.
- Exported SVG is a clean geometry export and does not preserve arbitrary source styling or labels.
- C and P systems are not implemented in this baseline and must not require E or S behavior changes.
