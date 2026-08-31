import assert from 'node:assert/strict';
import fs from 'node:fs';

const repro = fs.readFileSync('src/EdgeCanvasRepro.tsx', 'utf8');
const main = fs.readFileSync('src/main.tsx', 'utf8');

const imports = repro.split('\n').filter((line) => line.startsWith('import ')).join('\n');
assert.doesNotMatch(imports, /DrawingWorkspace|drawingLineTool|drawingSnapEngine|Box|geometry/i, 'repro has no Drawing, Box, snap, or geometry-engine imports');
for (const caseId of ['A', 'B', 'C1-C2', 'C3', 'D1', 'D2', 'D3', 'E1', 'E2', 'F1', 'F2']) assert.match(repro, new RegExp(`id="${caseId}"`), `Case ${caseId} exists`);
assert.match(repro, /Case A — Empty root SVG[\s\S]*?<SimpleSvg label="Case A empty root SVG"\s*\/>/, 'Case A is an empty SVG');
assert.match(repro, /Case B — Root SVG \+ dblclick[\s\S]*?onDoubleClick=\{\(\) => setCaseBCount/, 'Case B handler only increments its counter');
assert.match(repro, /Cases C1\/C2 — SVG line/, 'direct line and empty-area comparison exists');
assert.match(repro, /Case E1 — SVG text pointer-active[\s\S]*?<text[^>]*>100<\/text>/, 'SVG text case exists');
assert.match(repro, /data-repro-html-overlay="active"[\s\S]*>Active Tool: Line<\/div>/, 'hit-testable HTML overlay exists');
assert.match(main, /import\.meta\.env\.DEV && window\.location\.pathname === '\/edge-canvas-repro'/, 'route is development-only');

console.log('Edge canvas repro isolation tests passed');
