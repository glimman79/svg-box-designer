# SVG Box Designer

SVG Box Designer is a browser-based React application for drawing semantic 2D sketch geometry and turning imported SVG panels into fabrication-ready box geometry. It combines a constraint-aware Drawing workspace with SVG panel, connection, composition, compensation, preview, and export workflows.

## Application areas

- **2D Drawing** provides a constraint-aware SVG CAD canvas. Line/Profile use shared persistent `SketchPoint` topology; Circle persists `centerPointId + radius`; Arc now canonically persists `centerPointId + radius + startPointId + endPointId + orientation`. Arc authoring remains Start → End → Form Point, with the form point discarded after deriving the circumcircle and directed branch. Legacy endpoint-plus-bulge documents migrate at restore into the single target runtime representation. Circle and Arc share Circular Support and circular-radius solver infrastructure; Circle dimensions present diameter Ø while Arc dimensions present radius R. Arc own-grip Direct Manipulation is temporarily disabled until Stage 4 rather than retaining the obsolete bulge runtime.
- **Box / Construction** imports or starts an SVG document, identifies panels and selectable straight edges, and applies Panel Manager, TB (Top/Bottom finger-joint), W (Wall), and S (Slot) workflows. Generated geometry is composed, reconciled, manufacturing-compensated for clearances and kerf, previewed, and exported as SVG.
- **Puzzle** is reserved in the workspace selector but is **not implemented**.

The Drawing and imported/construction document models are currently separate. See [PROJECT_MASTER.md](PROJECT_MASTER.md) for current product scope, architectural authority, invariants, and known boundaries.

The locked Arc contract—including three-point creation, endpoint-pivot semantics, and
the shared Circle/Arc foundation—is authoritative in
[PROJECT_MASTER.md](PROJECT_MASTER.md#locked-target-circlearc-architecture); the target Arc representation and migration are implemented in Stage 3, while Concentricity, finite-Arc Tangency, and target-Arc own-grip Direct Manipulation remain pending. The authoritative Stage 0–6 migration status and process policy are in
[ROADMAP.md](ROADMAP.md#circlearc-implementation-stages-and-status); all migration stages
after the characterization safety-net stage remain separately tracked. Stages 0–3 are **ACCEPTED**; Stage 3 was user approved 2026-10-09. Stage 4 is
**NOT STARTED / READY TO IMPLEMENT**; Stages 5–6 are **NOT STARTED**. Stage 4 restores
body radius drag about a fixed center, whole-Arc center translation, and exact endpoint
pivots, with browser acceptance of constraints, cancellation, History, and Circle/Line
regressions. Open risks R1–R3 and the endpoint-drag evidence discrepancy remain recorded
in the Roadmap. Actual Drawing Save/Reload (R5) is not implemented and is outside Stage 3.

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
- [Architecture.md](Architecture.md): quick map of the Box / Construction geometry pipeline.
- [docs/README.md](docs/README.md): status and classification of detailed documents.
- [CHANGELOG.md](CHANGELOG.md): release and unreleased change summary.
- [REGLER_FOR_CHATT_MED_CHATGPT.md](REGLER_FOR_CHATT_MED_CHATGPT.md): collaboration and development workflow rules.
