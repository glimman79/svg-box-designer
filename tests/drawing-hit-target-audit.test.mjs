import assert from 'node:assert/strict';
import fs from 'node:fs';

const workspace = fs.readFileSync('src/app/DrawingWorkspace.tsx', 'utf8');
const diagnostics = fs.readFileSync('src/app/drawingCanvasDiagnostics.ts', 'utf8');
const css = fs.readFileSync('src/styles.css', 'utf8');
assert.match(workspace, /<pattern id="drawing-grid"[\s\S]*?<path className="drawing-grid-line drawing-grid-line-primary"/, 'primary grid is an SVG pattern containing a path');
assert.match(workspace, /<rect className="drawing-grid-plane"[^>]*fill="url\(#drawing-grid\)"/, 'full-view primary grid rect exists');
assert.match(css, /\.drawing-grid-plane,\s*\n\.drawing-coordinate-plane \{ pointer-events: none; \}/, 'grid rects and coordinate plane are pointer-transparent');
assert.match(css, /\.drawing-label-overlay \{[^}]*pointer-events: none;/, 'HTML-facing coordinate overlay is pointer-transparent');
for (const field of ['targetTagName', 'targetClass', 'targetId', 'elementFromPointTagName', 'elementFromPointClass', 'elementFromPointId', 'clientX', 'clientY', 'button', 'detail', 'defaultPrevented', 'anchorOffset', 'focusOffset']) assert.match(diagnostics, new RegExp(field), `${field} is captured`);
assert.match(workspace, /onDoubleClick=\{\(\) => \{ if \(activeTool === 'line'\) finishLine\(\)/, 'Drawing dblclick lifecycle is unchanged');
assert.doesNotMatch(workspace, /gridHitTarget|pointerEvents.*diagnostic|removeAllRanges|navigator\.userAgent/, 'no Drawing workaround or UA switch was added');
console.log('Drawing hit-target audit tests passed');
