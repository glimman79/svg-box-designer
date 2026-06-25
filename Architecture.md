# Architecture

This document describes the Version 1.0 geometry pipeline cleanup. The cleanup is an internal refactor only: UI behavior, TB, W, S, manufacturing compensation, preview rendering, and export output are intended to remain unchanged.

## Before

Before this cleanup, applied geometry existed in tool-specific structures and downstream code converted those structures independently:

```text
Import
↓
Original SVG model
↓
Tool-specific Apply outputs
  ├─ AppliedEPanelPath[]
  └─ AppliedSGeometry[]
↓
Separate downstream conversions
  ├─ Preview: buildFinalContourList(...) → manufacturing kerf preview
  └─ Export: exportAppliedSvg(...) rebuilt panel/slot paths from applied E/S data
```

The duplicate conversions meant preview and export both understood the legacy applied E/S structures.

## After

The application now uses one Final Geometry model after Apply:

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
Manufacturing Engine
(Clearance → Kerf)
↓
Preview
↓
Export
```

## Final Geometry contract

`FinalGeometry` is the single geometry model passed beyond the workflow stage. It contains only final contours and diagnostics. Each contour records geometry provenance such as `original-panel`, `applied-panel`, or `s-slot`, but manufacturing code consumes contours as geometry and does not need to know TB, W, S, A/B roles, or workflow history.

## Downstream ownership

- Preview reads `FinalGeometry.contours`, then manufacturing classifies and kerf-compensates those final contours.
- Export reads the same `FinalGeometry` instance as preview and serializes it with the source SVG root dimensions.
- Manufacturing receives only the final contour list and project manufacturing settings.

## Deprecated adapters

The following legacy adapters remain for compatibility with existing tests and any older callers:

- `buildFinalContourList(...)` in `src/app/contourClassification.ts` is deprecated. Use `buildFinalGeometry(...)` from `src/app/finalGeometry.ts`.
- `exportAppliedSvg(...)` in `src/app/exportAppliedSvg.ts` is deprecated. Use `exportFinalGeometrySvg(...)` from `src/app/exportFinalGeometrySvg.ts`.

These adapters delegate to the Final Geometry pipeline instead of preserving separate downstream pipelines.
