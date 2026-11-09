# Documentation index and status

This directory contains specifications, architecture analyses, diagnostic evidence, and release snapshots created at different stages. **`PROJECT_MASTER.md` at the repository root is the current architecture authority.** The forward-looking product plan is maintained separately in **[`ROADMAP.md`](../ROADMAP.md)**. A report's observations can remain useful even when its proposed next step or “current state” is historical.

Root-level [`REGLER_FOR_CHATT_MED_CHATGPT.md`](../REGLER_FOR_CHATT_MED_CHATGPT.md) is the authority for collaboration and development workflow rules.

## Approved future product requirements

- [PRODUCT_ARCHITECTURE_VISION.md](PRODUCT_ARCHITECTURE_VISION.md) — explicitly designated
  detailed authority for connected product requirements approved on 2026-11-03 and
  history/navigation/Clear/Open decisions revised on 2026-11-09:
  optional 3D Modeling → Drawing → BOX or Puzzle, separate global Undo/Redo and permanent
  parametric construction history, interactive navigation, native persistence and Option A
  source dependencies. These are **future,
  unimplemented requirements**, not historical proposals or current functionality.
  [ROADMAP.md](../ROADMAP.md#4-connected-product-development) owns planning/status, and
  [PROJECT_MASTER.md](../PROJECT_MASTER.md) remains current-architecture authority.

## Current documentation or specification

These narrow contracts remain useful alongside the code. They do not replace the Project Master.

- `D2_5E2_LINE_TO_LINE_DISTANCE.md` — implemented Line-to-Line distance relation and solver contract.
- `DRAWING_GEOMETRY_VISUAL_STATE.md` — current Drawing geometry visual-state contract.
- `WALL_V2_STEP_B1_TB_ROLE_INHERITANCE_CONTRACT.md` — accepted Wall/TB role-inheritance contract.
- `WALL_V2_STEP_B2_1_AUTHORING_CONTRACT.md` — accepted Wall authoring/meeting normalization contract.
- `WALL_V2_STEP_B3_15_POST_COMPOSITION_RECONCILIATION_ARCHITECTURE.md` — detailed basis of the implemented reconciliation seam; read current-state claims against the Project Master.

## Architecture analysis (design evidence, not global authority)

These documents analyze a bounded subsystem. Some contain implementation-era baselines or recommendations that later work refined.

- [GLOBAL_PROJECT_HISTORY_ARCHITECTURE_ANALYSIS.md](GLOBAL_PROJECT_HISTORY_ARCHITECTURE_ANALYSIS.md)
  — Stage B source-grounded project/history design proposal revised for approved product
  decisions: 30 committed Undo edits, a distinct persistent editable operation model,
  Option A partial regeneration/repair, exact snapshot consistency and manufacturing
  validation gates. Supersedes the bounded-journal proposal as construction history;
  proposes a distinct C.2 foundation before D/full E. Navigation, permanent Clear and
  fresh Undo on Open remain. Detailed architecture remains under review; no implementation
  or roadmap-status change.
- [DRAWING_DIMENSION_ARCHITECTURE_ANALYSIS.md](DRAWING_DIMENSION_ARCHITECTURE_ANALYSIS.md)
  — historical Drawing design evidence. Its §16 recommendation for Drawing-owned
  snapshot history is superseded as long-term direction by the approved global history
  requirement; its original baseline observations and recommendations remain preserved.
- `GENERATED_PROFILE_ARCHITECTURE_REPORT.md`
- `GENERATED_PROFILE_SEMANTIC_COMPLETENESS_ANALYSIS.md`
- `TAP_CLEARANCE_ARCHITECTURE_ANALYSIS.md`
- `WALL_V2_STEP_A_ARCHITECTURE_AUDIT.md`
- `WALL_V2_STEP_B2_3A_SIMPLIFICATION_ANALYSIS.md`
- `WALL_V2_STEP_B2_3_ANALYSIS.md`
- `WALL_V2_STEP_B2_5_ANALYSIS.md`
- `analysis/D2.5e2c-per-geometry-dof-constrained-drag.md`
- `d2.5d-point-to-line-regression-analysis.md`

## Diagnostic evidence and investigation records

These capture a failure, experiment, validation, or runtime trace. They are intentionally preserved rather than rewritten as current architecture.

- `DRAWING_COINCIDENCE_DRAG_4_2.md` — Stage 4.2 Coincidence evidence; accepted after manual browser tests, with original report preserved.
- `DRAWING_NONLINEAR_SOLVER_4_3B.md` — Stage 4.3 performance evidence and limitations; accepted after manual browser tests, with original measurements preserved.
- `DRAWING_INFERENCE_STEP_1_REGRESSION_REPORT.md`
- `EDGE_CAD_POPUP_DEEP_RESEARCH_REPORT.md`
- `LINE_CHAIN_RUNTIME_CAPTURE.md`
- `PROFILE_OFFSET_RECONSTRUCTION_INVESTIGATION.md`
- `PROFILE_OFFSET_SHADOW_VALIDATION.md`
- `TAP_ROLE_DIAGNOSTIC.md`
- `WALL_V2_STEP_B3_3_DOWNSTREAM_FAILURE_ANALYSIS.md`
- `WALL_V2_STEP_B3_5_BROWSER_VS_TEST_ANALYSIS.md`
- `WALL_V2_STEP_B3_6_IMPORTED_MODEL_DIFFERENTIAL_ANALYSIS.md`
- `tap-clearance-projection-mismatch-diagnostic.md`

## Historical or superseded contracts

These explain evolution but must not be used as present-tense product authority.

- `WALL_V2_STEP_A2_CORNER_AUTHORING_CONTRACT.md` — explicitly retired orientation model.
- Release-era documents under `releases/`:
  - `releases/ARCHITECTURE_v1.0_CORE_ENGINE.md` — v1.0 architecture snapshot.
  - `releases/RELEASE_v1.0_CORE_ENGINE.md` — v1.0 release record.
  - `releases/DEVELOPMENT_ROADMAP_AFTER_v1.0_CORE.md` — historical roadmap; completion must be checked against current code.

No audited document was deleted. “Historical” or “diagnostic” means its evidence is retained while its old status statements and next steps do not override current code or `PROJECT_MASTER.md`.
