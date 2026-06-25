# Architecture

This document describes the Version 1.0 final geometry pipeline. The cleanup is internal only: UI behavior, TB, W, S, manufacturing compensation, preview rendering, and export output are intended to remain unchanged.

## Final pipeline

```text
Import
↓
Original Geometry
↓
Workflow Engine
(TB / W / S / future tools)
↓
Final Geometry
↓
Manufacturing
(Clearance → Kerf)
↓
Preview
↓
Export
```

## Pipeline ownership

- Import parses the SVG into the original document model and preserves root attributes used later by export.
- The workflow engine applies TB, W, S, and related operations to produce the internal applied tool geometry used to construct final geometry.
- `buildFinalGeometry(...)` is the single handoff from workflow output to downstream consumers.
- Manufacturing consumes final contours from `FinalGeometry.contours` and applies compensation for preview.
- Preview renders the manufacturing-compensated contours derived from Final Geometry.
- Export serializes the same Final Geometry model via `exportFinalGeometrySvg(...)`.

## Final Geometry contract

`FinalGeometry` is the single geometry model passed beyond the workflow stage. It contains final contours and diagnostics. Each contour records geometry provenance such as `original-panel`, `applied-panel`, or `s-slot`, but manufacturing code consumes contours as geometry and does not need to know TB, W, S, A/B roles, or workflow history.

## Version 1.0 cleanup result

Legacy downstream export compatibility code has been removed from the active runtime. Preview and export now share the Final Geometry handoff instead of converting tool-specific applied geometry independently.

`buildFinalContourList(...)` remains available as a named final-contour helper in `src/app/contourClassification.ts` because it is part of the Version 1.0 architecture surface, but tests and runtime code validate the Final Geometry pipeline directly.
