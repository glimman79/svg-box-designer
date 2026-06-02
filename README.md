# SVG Box Designer

SVG Box Designer is a React + TypeScript + Vite application for importing your own custom SVG drawings, selecting straight edges, assigning reusable connection labels, editing connection parameters, and exporting the labeled SVG.

The app is not intended to generate a standard parametric box like boxes.py. Instead, it helps add finger joints, slots, corner connections, and bend patterns to a design the user already created in SVG. This version intentionally updates the connection parameter UI and state model only; finger joint geometry is not generated yet.

## Version 1 features

- Import SVG files from your computer.
- Display the imported SVG on screen.
- Detect and manually select straight edges from common SVG primitives:
  - `line`
  - `rect`
  - `polyline`
  - `polygon`
  - straight `path` commands (`M`, `L`, `H`, `V`, `Z`)
- Assign labels directly to selected straight edges:
  - `E1`, `E2`, `E3`...
  - `S1`, `S2`, `S3`...
  - `C1`, `C2`, `C3`...
  - `P1`, `P2`, `P3`...
- Show labels directly on the drawing.
- Save labels and connection parameters in React application state.
- Configure `E` edge connection parameters with Basic values for material thickness, finger width, and kerf, plus Advanced values for play, start offset, end offset, and extra length.
- Automatically default `E` finger width to material thickness × 3 until the user manually edits finger width.
- Export a labeled SVG file.

## Not included in v1

- Finger joint geometry is not implemented yet.
- Slots are not implemented yet.
- Patterns are not implemented yet.

The `S`, `C`, and `P` labels are available as future-facing placeholders only.

## Getting started

Install dependencies:

```bash
npm install
```

Run the development server:

```bash
npm run dev
```

Build for production:

```bash
npm run build
```

## Usage

1. Start the app with `npm run dev`.
2. Click **Import SVG** and choose an SVG file.
3. Click a highlighted straight edge in the drawing.
4. Choose a label button such as `E1`, `S1`, `C1`, or `P1`.
5. Repeat for other edges.
6. Click **Export SVG** to download an SVG with the labels embedded as text elements.

## Project structure

```text
svg-box-designer/
├── index.html
├── package.json
├── src/
│   ├── App.tsx
│   ├── main.tsx
│   ├── styles.css
│   └── svgUtils.ts
├── tsconfig.app.json
├── tsconfig.json
├── tsconfig.node.json
└── vite.config.ts
```
