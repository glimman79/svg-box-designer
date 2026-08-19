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
Profile Offset → Slot Clearance → Kerf
↓
Preview
↓
Export
```

## Pipeline ownership

- Import parses the SVG into the original document model and preserves root attributes used later by export.
- The workflow engine applies TB, W, S, and related operations to produce native `GeneratedGeometryItem` values.
- `buildFinalGeometry(...)` assembles imported geometry with generated items (or their snapshot) without tool-specific or legacy applied-geometry knowledge.
- Manufacturing creates a deep, order-preserving `ManufacturingGeometry` copy of Final Geometry on every run. Profile Offset walks classification policy without moving geometry; slot clearance and terminal kerf operate only on that workspace.
- Preview renders the manufacturing-compensated contours derived from Final Geometry.
- Design export can serialize immutable Final Geometry via `exportFinalGeometrySvg(...)`; current manufacturing export serializes the exact Manufacturing Geometry used by preview.

## Final Geometry contract

`FinalGeometry` is the single geometry model passed beyond the workflow stage. It contains final contours and diagnostics. Each contour records geometry provenance such as `original-panel`, `applied-panel`, or `s-slot`, but manufacturing code consumes contours as geometry and does not need to know TB, W, S, A/B roles, or workflow history.

Final Geometry owns permanent design intent and is read-only. Manufacturing Geometry owns working contours, copied diagnostics, compensation, and temporary state; it is derived rather than stored in history and never mutates Final Geometry.

## Version 2.2 migration result

`GeneratedGeometryItem` is the sole generated runtime model. Preview and export share the Final Geometry handoff, and history reconstructs it from `GeneratedGeometrySnapshot.generatedGeometry`.

Native `GeneratedGeometryItem[]` is the canonical generated-state representation. History stores `GeneratedGeometrySnapshot` records and Final Geometry consumes those native snapshots directly.

## Panel-composition authority selection

`VITE_PANEL_COMPOSITION_AUTHORITY_MODE` requests one of `legacy`, `single-tool`, or `mixed`. A missing, empty, or whitespace-only value requests `single-tool`, the production default. `legacy` remains the explicit rollback mode, while `mixed` remains an explicit opt-in and is not promoted by this release. An invalid nonempty value conservatively requests `legacy` and emits a developer diagnostic.

The requested runtime mode is distinct from the snapshot's `panelCompositionModel`. That project-level field is a selected result/strategy marker (`legacy`, `relationship-composed-single-tool-v1`, or `relationship-composed-mixed-v1`), not an exhaustive per-panel authority map. A missing marker in an old snapshot means `legacy`. Restore honors that stored meaning without authority reselection; eligible legacy projects migrate lazily only after a fresh Apply. Likewise, a composed snapshot restored under a legacy runtime remains composed until the next Apply.

Eligible single-tool composition is fail-closed: an invalid or incomplete composed candidate does not fall back to legacy and cannot replace the previous applied state. Ordinary Apply still rejects mixed TB/S replacement authoring unless the requested mode is explicitly `mixed`. Separately, the lower-level selector can report `MIXED_NOT_ENABLED` with legacy retention when directly asked to select a mixed cohort in `single-tool` mode; this distinction is intentionally unchanged in this migration step.

Raw TB/S `PANEL_PATH` items remain in generator output as legacy-equivalence oracles, diagnostics and metadata carriers, support for explicit legacy mode, and migration safety. Authority promotion changes selection only; it does not remove those inputs or change Final Geometry or manufacturing.
