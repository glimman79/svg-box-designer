# Architecture Snapshot: Version 1.0 Core Engine

Date: 2026-06-26

This snapshot documents the stable core-engine architecture at `v1.0-core`. It is documentation-only and does not introduce behavior, geometry, or code changes.

## Folder structure

```text
.
├── Architecture.md                 Historical/high-level architecture notes
├── README.md                       User and development overview
├── docs/                           Baseline and release documentation
│   └── releases/                   Versioned release snapshots
├── screenshots/                    Existing UI reference screenshots
├── src/                            Application source
│   ├── App.tsx                     Main React app, UI state, workflow orchestration, preview/export orchestration
│   ├── main.tsx                    React entry point
│   ├── styles.css                  Application styling
│   ├── svgUtils.ts                 SVG parsing, edge extraction, labels, and labeled SVG export helpers
│   └── app/                        Core workflow, geometry, manufacturing, and export modules
├── tests/                          Node-based baseline tests
│   └── app/                        Test harness mirrors for selected app modules
└── package / TypeScript / Vite files
```

Generated or local-only folders such as `node_modules/`, `dist/`, and TypeScript build-info files are not part of the tracked release source.

## Current geometry flow

```text
Imported SVG document model
↓
Original closed panel contours and selectable edges
↓
Workflow assignments and connection definitions
↓
Applied TB/S geometry where workflows are applied
↓
Final Geometry contour list
↓
Manufacturing compensation
↓
Manufacturing Geometry
↓
Preview and export
```

Original geometry remains the source of truth. Applied workflow geometry is layered into the Final Geometry pipeline without altering the imported source model.

## Import flow

1. The user imports an SVG file through the application UI.
2. `svgUtils.ts` parses the SVG document.
3. SVG shapes and paths are transformed into an internal document model.
4. Robust transform and matrix handling normalizes imported SVG coordinates.
5. Closed panel contours and edge records become selectable UI geometry.
6. Labels and assignments reference imported edges without mutating the original SVG source model.

PDF import is not present in this baseline.

## Workflow flow

Workflow state is coordinated by `App.tsx` and specialized modules in `src/app/`.

- TB workflow: managed by `tbWorkflow.ts` with legacy E-prefixed connection implementation details.
- S workflow: managed by `sWorkflow.ts` and applied through `sGeometry.ts`.
- W workflow: managed by `wWorkflow.ts` and references existing edge/slot assignments.
- Assignment buckets: normalized by `assignmentBuckets.ts` so multiple workflow roles can coexist on an edge.
- Connection definitions and shared workflow types: defined in `connectionTypes.ts`.

Workflow history and manufacturing history are maintained in application state snapshots so users can navigate between stable states.

## Final Geometry flow

1. Original SVG panels are preserved.
2. Applied TB geometry is produced through legacy E geometry helpers.
3. Applied S geometry is produced by slot geometry helpers.
4. `finalGeometry.ts` combines original and applied geometry into the Final Geometry model.
5. `contourClassification.ts` classifies contours for stable downstream manufacturing and export behavior.
6. Final Geometry diagnostics identify contour issues without changing geometry behavior.

Final Geometry is the architectural boundary between workflow editing and manufacturing compensation.

## Manufacturing flow

1. Final Geometry is passed to manufacturing compensation.
2. Slot Clearance is applied where slot geometry requires compensation.
3. Kerf compensation is applied to classified contours.
4. Robust contour offset logic handles stepped finger-joint geometry.
5. The result is Manufacturing Geometry.
6. Manufacturing Geometry feeds both preview and export so Preview = Export.

## Slot Clearance flow

Slot Clearance is part of the manufacturing compensation stage. Slot-related geometry from the S workflow is represented in applied geometry and Final Geometry, then compensated before preview/export generation. Joint Clearance and the Manual Clearance Tool are intentionally not implemented in this baseline.

## Kerf flow

Kerf is applied after Final Geometry classification and slot-clearance handling. Kerf compensation offsets contours according to manufacturing settings while preserving stable contour classification and export consistency.

## Preview flow

The preview renders imported geometry, assignments, applied workflow geometry, and manufacturing output from application state. Manufacturing preview is generated from the same Manufacturing Geometry used by export, establishing the Version 1.0 Preview = Export contract.

## Export flow

- `exportFinalGeometrySvg.ts` serializes Final Geometry or Manufacturing Geometry to SVG output.
- Export preserves the imported document framing where possible.
- Manufacturing export uses the same compensated geometry shown in manufacturing preview.
- Labeled SVG export support remains available through `svgUtils.ts`.

## Main modules and responsibilities

- `src/App.tsx`: UI composition, state ownership, workflow orchestration, history snapshots, preview/export actions.
- `src/svgUtils.ts`: SVG import parsing, transform handling, edge extraction, label placement, labeled SVG export.
- `src/app/connectionTypes.ts`: workflow and geometry type definitions.
- `src/app/assignmentBuckets.ts`: normalized edge assignment bucket helpers.
- `src/app/tbWorkflow.ts`: TB workflow grouping and label alias behavior.
- `src/app/eGeometry.ts`: legacy E-named TB geometry implementation for tabs/finger joints.
- `src/app/sWorkflow.ts`: S workflow lifecycle and slot role helpers.
- `src/app/sGeometry.ts`: applied S geometry and slot geometry generation.
- `src/app/wWorkflow.ts`: W workflow references and display assignments.
- `src/app/sharedGeometry.ts`: general geometry primitives, contour helpers, tab segment utilities, offsets, intersections.
- `src/app/sharedPanelGeometry.ts`: closed-panel validation and panel-edge geometry helpers.
- `src/app/finalGeometry.ts`: Final Geometry model construction.
- `src/app/contourClassification.ts`: contour classification for imported, final, and manufacturing stages.
- `src/app/manufacturingCompensation.ts`: slot clearance, kerf, contour offset, and Manufacturing Geometry construction.
- `src/app/exportFinalGeometrySvg.ts`: SVG export for final and manufacturing geometry.
- `src/app/panelLookup.ts`: panel lookup for workflow references.

## Remaining technical debt

- Internal E naming remains in code and tests despite TB being the current workflow language.
- `AppliedEPanelPath` and `appliedEPanelPaths` remain as internal intermediate names.
- `eGeometry.ts` remains as the legacy internal geometry module name.
- Test harness mirrors under `tests/app/` duplicate selected source modules for Node execution.
- Feature Registry is not implemented.
- Plugin-style tool registration is not implemented.
- Joint Clearance and Manual Clearance Tool are not implemented.
- Future C/P workflow improvements and additional workflow tools are not implemented.

## Why this version is considered stable

- The release preparation made documentation-only changes.
- The application builds successfully with `npm run build`.
- The regression suite passes with `npm test`.
- Preview and export share the same manufacturing geometry path.
- Final Geometry and Manufacturing Geometry have explicit architectural boundaries.
- Known limitations and legacy naming are documented rather than hidden.
- The `v1.0-core` tag is intended to provide a permanent rollback anchor before Version 1.1 development begins.
