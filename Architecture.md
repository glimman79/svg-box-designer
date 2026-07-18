# Architecture

This document describes the Version 2.3 manufacturing geometry pipeline. The migration is internal only: UI behavior, TB, W, S, manufacturing compensation, preview rendering, and export output remain unchanged.

## Final pipeline

```text
Import
↓
Original Geometry
↓
Workflow Engine → GeneratedGeometryItem[]
(TB / W / S / future tools)
↓
Final Geometry
↓
Manufacturing Geometry (temporary working copy)
↓
Clearance → Slot Clearance → Kerf
↓
Preview
↓
Export
```

## Pipeline ownership

- Import parses the SVG into the original document model and preserves root attributes used later by export.
- The workflow engine applies TB, W, S, and related operations to produce native `GeneratedGeometryItem` values.
- `buildFinalGeometry(...)` assembles imported geometry with generated items (or their snapshot) without tool-specific or legacy applied-geometry knowledge.
- Manufacturing creates a deep, order-preserving `ManufacturingGeometry` copy of Final Geometry on every run. Clearance walks classification policy without moving geometry; slot clearance and terminal kerf operate only on that workspace.
- Preview renders the manufacturing-compensated contours derived from Final Geometry.
- Design export can serialize immutable Final Geometry via `exportFinalGeometrySvg(...)`; current manufacturing export serializes the exact Manufacturing Geometry used by preview.

## Final Geometry contract

`FinalGeometry` is the single geometry model passed beyond the workflow stage. It contains final contours and diagnostics. Each contour records geometry provenance such as `original-panel`, `applied-panel`, or `s-slot`, but manufacturing code consumes contours as geometry and does not need to know TB, W, S, A/B roles, or workflow history.

Final Geometry owns permanent design intent and is read-only. Manufacturing Geometry owns working contours, copied diagnostics, compensation, and temporary state; it is derived rather than stored in history and never mutates Final Geometry.

## Version 2.2 migration result

`GeneratedGeometryItem` is the sole generated runtime model. Preview and export share the Final Geometry handoff, and history reconstructs it from `GeneratedGeometrySnapshot.generatedGeometry`.

Legacy `AppliedEPanelPath` and `AppliedSGeometry` conversions remain only in compatibility adapters for the old public API, tests, and migration of older history records. They are created lazily when those adapters are explicitly requested and are not part of Final Geometry assembly.

`buildFinalContourList(...)` remains available as a named final-contour helper in `src/app/contourClassification.ts` because it is part of the Version 1.0 architecture surface, but tests and runtime code validate the Final Geometry pipeline directly.
