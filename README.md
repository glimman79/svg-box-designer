# SVG Box Designer

SVG Box Designer is a browser-based React application for drawing semantic 2D sketch geometry and turning imported SVG panels into fabrication-ready box geometry. It combines a constraint-aware Drawing workspace with SVG panel, connection, composition, compensation, preview, and export workflows.

## Application areas

- **2D Drawing** provides a constraint-aware SVG CAD canvas. Line/Profile use shared persistent `SketchPoint` topology; Circle persists `centerPointId + radius`; Arc now canonically persists `centerPointId + radius + startPointId + endPointId + orientation`. Arc authoring remains Start → End → Form Point, with the form point discarded after deriving the circumcircle and directed branch. Restore validates canonical Arc records; obsolete Arc formats and derived-center references are no longer supported after Stage 5.3A. Circle and Arc share Circular Support and circular-radius solver infrastructure; Circle dimensions present diameter Ø while Arc dimensions present radius R. Arc own-grip Direct Manipulation was restored by merged Stage 4 PR #613; Stage 4, including 4.2 Coincidence and 4.3 performance, is ACCEPTED after Mikael’s manual browser tests.
- **Box / Construction** imports or starts an SVG document, identifies panels and selectable straight edges, and applies Panel Manager, TB (Top/Bottom finger-joint), W (Wall), and S (Slot) workflows. Generated geometry is composed, reconciled, manufacturing-compensated for clearances and kerf, previewed, and exported as SVG.
- **Puzzle** is reserved in the workspace selector but is **not implemented**.

The Drawing and imported/construction document models are currently separate. See [PROJECT_MASTER.md](PROJECT_MASTER.md) for current product scope, architectural authority, invariants, and known boundaries.

**Approved future direction — not implemented:** an optional connected workflow of
**3D Modeling → 2D Drawing → BOX or Puzzle**, with BOX/Puzzle as parallel destinations
and Drawing also usable independently. Simple 3D Modeling will focus on profile
extrusion; global Undo/Redo of 30 committed edits and a **separate permanent parametric
construction history** remain future work. Construction operations retain editable current
parameters/relationships, survive Undo eviction and persist with native projects; repeated
Line dimension edits update the same operation. Native Save/Open and traceable downstream
updates are also future work. Current SVG import/export serves BOX,
and native Save/Open is not available. Revised requirements exclude module navigation
from Undo history, preserve Redo during navigation, and open the affected edit's module
on Undo/Redo. Clear offers Save and Clear / Clear Without Saving / Cancel; proceeding
permanently resets the project, construction history and Undo/Redo. Successful Open
preserves saved operations/relationships while starting empty executable Undo/Redo.
Approved Option A keeps valid source edits and compatible updates while preserving failed
downstream operations for repair. Stale/unvalidated output cannot silently be valid laser
export. Detailed architecture and the proposed C.2 foundation remain under review. See the
[Product Architecture Vision](docs/PRODUCT_ARCHITECTURE_VISION.md) and
[proposed development stages](ROADMAP.md#4-connected-product-development).

The locked Arc contract—including three-point creation, endpoint-pivot semantics, and
the shared Circle/Arc foundation—is authoritative in
[PROJECT_MASTER.md](PROJECT_MASTER.md#locked-target-circlearc-architecture); the canonical Arc representation is implemented, while Concentricity and finite-Arc Tangency remain pending. The authoritative Stage 0–6 migration status and process policy are in
[ROADMAP.md](ROADMAP.md#circlearc-implementation-stages-and-status); all migration stages
after the characterization safety-net stage remain separately tracked. Stages 0–3 are **ACCEPTED**; Stage 3 was user approved 2026-10-09. Stage 4 is
**ACCEPTED**. Stage 5 is **ACCEPTED / COMPLETE**: 5.1, 5.2, 5.3A, audit-only 5.3B,
and 5.4 are **ACCEPTED**. Stage 6 is **ACCEPTED** following regression maintenance and
user-confirmed Circle/Arc browser testing, including Constraints, Dimensions, Direct
Manipulation and Undo/Redo. This closes the Circular Support migration, not the entire
application's feature set. Stage 4 restores
body radius drag about a fixed center, whole-Arc center translation, and exact endpoint
pivots, with browser acceptance of constraints, cancellation, History, and Circle/Line
regressions. Open risks R1–R3 and the historical endpoint-drag evidence discrepancy and its resolution remain recorded
in the Roadmap. Test-only maintenance in #623–#625 reached a recorded **136/136** full
regression inventory PASS, **56/56** Drawing/CAD PASS, **12/12** d2 PASS and production
build PASS; these prior results were not rerun for this documentation closure. Browser
acceptance was performed and reported by the user, not independently executed by Codex.
Arc empty/blind Undo remains **DEFERRED — accepted known limitation**. Actual Drawing
Save/Reload (R5) remains unimplemented; its verification and implementation are
**OUT OF SCOPE — not required for Stage 6 acceptance**, and it has not been tested or
accepted by this closure. Document restore/normalization coverage does not establish
that user-facing capability. See the Roadmap for evidence and deferred/open risks.

Repository collaboration follows the permanent rule in
[REGLER_FOR_CHATT_MED_CHATGPT.md](REGLER_FOR_CHATT_MED_CHATGPT.md#permanent-regel-för-repositoryåtkomst):
**ChatGPT Chat is read-only; Codex is the sole authorized change executor, subject to
Mikael Glimvert's explicit task/scope approval and separate approval before merge.**
ChatGPT is the read-only architecture reviewer; authorized Codex work may create a PR,
and only the user decides merge. HIGH reasoning effort is recommended for solver,
topology, Constraints, and Direct Manipulation. IMPLEMENTED is not the same as ACCEPTED.

## Technology

- React and React DOM
- TypeScript
- Vite
- Native SVG for the drawing and construction canvases
- Node's test runner with focused TypeScript build fixtures

## Getting started

Requirements: a current Node.js release and npm.

```bash
npm install
npm run dev
```

Vite prints the local development URL. The application starts in **Box / Construction**; use the workspace selector for **2D Drawing**.

## Development commands

```bash
npm run dev       # development server
npm run build     # TypeScript production check and Vite build
npm run preview   # serve the production build locally
```

The repository also has focused `test:*` and `diagnose:*` scripts. Run the relevant script from `package.json` when changing a subsystem; there is intentionally no single aggregate `npm test` command.

## Construction workflow at a glance

1. Start with the empty box document or import a supported SVG.
2. Apply Panel Manager so detected panels have construction thickness authority.
3. Author TB, W, or S relationships by assigning source edges and roles.
4. Apply the project to produce composed Final Geometry.
5. Inspect the final/manufacturing preview and export the resulting SVG.

Imported SVG parsing supports common straight-edged SVG primitives and straight path commands. The construction pipeline, rather than connection labels alone, owns generated finger-joint/Wall/Slot output.

## Repository map

```text
svg-box-designer/
├── src/
│   ├── App.tsx                    # workspace shell and Box / Construction orchestration
│   ├── main.tsx                   # browser entry point
│   ├── svgUtils.ts                # SVG parsing/model utilities
│   └── app/
│       ├── DrawingWorkspace.tsx   # Drawing interaction and presentation boundary
│       ├── drawing*.ts            # topology, tools, inference, solver, constraints, history
│       ├── *Workflow.ts           # TB, Wall, and Slot authoring workflows
│       ├── *Geometry*.ts          # generated/final/manufacturing geometry stages
│       └── panel*.ts              # panel model, contributors, and composition
├── tests/                         # focused behavior and diagnostic regressions
├── docs/                          # specifications, analyses, diagnostics, and release snapshots
├── PROJECT_MASTER.md              # current product, architecture, and Drawing presentation authority
├── PROJECT_HISTORY.md             # architectural evolution
├── ROADMAP.md                     # planned product development and open design work
├── REGLER_FOR_CHATT_MED_CHATGPT.md # collaboration and development workflow rules
├── Architecture.md                # concise construction-pipeline map
└── CHANGELOG.md                   # concise completed-change record
```

## Documentation

- [PROJECT_MASTER.md](PROJECT_MASTER.md): how the application is designed now.
- [PROJECT_HISTORY.md](PROJECT_HISTORY.md): why significant architectural changes occurred.
- [ROADMAP.md](ROADMAP.md): what is planned next and which decisions remain open.
- [Architecture.md](Architecture.md): current/target boundaries and the Box / Construction geometry pipeline.
- [Product Architecture Vision](docs/PRODUCT_ARCHITECTURE_VISION.md): detailed approved future multi-module requirements, current-state inventory and open design questions.
- [docs/README.md](docs/README.md): status and classification of detailed documents.
- [CHANGELOG.md](CHANGELOG.md): release and unreleased change summary.
- [REGLER_FOR_CHATT_MED_CHATGPT.md](REGLER_FOR_CHATT_MED_CHATGPT.md): collaboration and development workflow rules.
