import assert from 'node:assert/strict';
import fs from 'node:fs';

const repro = fs.readFileSync('src/EdgeCanvasRepro.tsx', 'utf8');
const main = fs.readFileSync('src/main.tsx', 'utf8');

const imports = repro.split('\n').filter((line) => line.startsWith('import ')).join('\n');
assert.doesNotMatch(imports, /DrawingWorkspace|drawingLineTool|drawingSnapEngine|Box|geometry/i, 'repro has no Drawing, Box, snap, or geometry-engine imports');
for (let caseNumber = 1; caseNumber <= 6; caseNumber += 1) assert.match(repro, new RegExp(`data-edge-canvas-case="${caseNumber}"`), `Case ${caseNumber} exists`);
assert.match(repro, /Case 1 — Empty SVG[\s\S]*?<svg width="800" height="500"[^>]*\/>/, 'Case 1 is an empty SVG');
assert.match(repro, /Case 2 — SVG with dblclick handler[\s\S]*?onDoubleClick=\{\(\) => setCase2Count/, 'Case 2 handler only increments its counter');
assert.match(repro, /Case 3 — SVG with simple line[\s\S]*?<line[^>]*\/>/, 'Case 3 contains simple geometry');
const case3Svg = repro.match(/aria-label="Case 3 SVG geometry">([\s\S]*?)<\/svg>/)?.[1] ?? '';
assert.doesNotMatch(case3Svg, /<text|overlay/i, 'Case 3 has no text or overlay');
assert.match(repro, /Case 4 — SVG with SVG text[\s\S]*?<text[^>]*>100<\/text>/, 'Case 4 contains SVG text');
assert.match(repro, /data-repro-html-overlay[\s\S]*>Active Tool: Line<\/div>/, 'Case 5 contains hit-testable HTML overlay text');
assert.match(repro, /data-repro-viewport[\s\S]*data-repro-label-overlay/, 'Case 6 recreates viewport, canvas, and label-overlay structure');
assert.match(main, /import\.meta\.env\.DEV && window\.location\.pathname === '\/edge-canvas-repro'/, 'route is development-only');

console.log('Edge canvas repro isolation tests passed');
