# SVG Box Designer

SVG Box Designer is a browser-based React application for drawing semantic 2D sketch geometry and turning imported SVG panels into fabrication-ready box geometry. It combines a constraint-aware Drawing workspace with SVG panel, connection, composition, compensation, preview, and export workflows.

## Application areas

- **2D Drawing** provides an SVG CAD-style canvas with Dimension and constraint workflows, shared `SketchPoint` topology, click and directional Window/Crossing multi-selection for Lines, snapping and geometric inference, Direct Manipulation, and Drawing Undo/Redo. `Line` authors one independent straight segment from P1 to P2 and completes; `Profile` authors continuing/chained connected straight segments. Both workflows store each segment as the same ordinary Line entity. Circle Stage 1 is merged, with a visible working authoring preview, but browser acceptance remains pending because normal committed Circle presentation is currently invisible until selected. Authoring can infer endpoints, midpoints, axes, alignments, angular directions, Parallel, Perpendicular, and Point References; Ctrl temporarily bypasses automatic inference.
- **Box / Construction** imports or starts an SVG document, identifies panels and selectable straight edges, and applies Panel Manager, TB (Top/Bottom finger-joint), W (Wall), and S (Slot) workflows. Generated geometry is composed, reconciled, manufacturing-compensated for clearances and kerf, previewed, and exported as SVG.
- **Puzzle** is reserved in the workspace selector but is **not implemented**.

The Drawing and imported/construction document models are currently separate. See [PROJECT_MASTER.md](PROJECT_MASTER.md) for current product scope, architectural authority, invariants, and known boundaries.

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
