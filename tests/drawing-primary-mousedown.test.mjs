import assert from 'node:assert/strict';
import fs from 'node:fs';

const workspace = fs.readFileSync('src/app/DrawingWorkspace.tsx', 'utf8');
const sharedCad = fs.readFileSync('src/app/cadInteraction.ts', 'utf8');
const box = fs.readFileSync('src/App.tsx', 'utf8');
const handler = workspace.match(/const handleDrawingMouseDown = \(event: MouseEvent<SVGSVGElement>\) => \{([\s\S]*?)\n  \};/)?.[1] ?? '';
const drawingSvg = workspace.match(/<svg\n\s+ref=\{svgRef\}([\s\S]*?)>/)?.[1] ?? '';

assert.match(handler, /if \(event\.button === CAD_PRIMARY_BUTTON\) event\.preventDefault\(\);/, 'primary mousedown cancels its browser default');
assert.doesNotMatch(handler, /button !==|button === [12]|stopPropagation/, 'middle and secondary mousedown remain unchanged');
assert.match(drawingSvg, /onMouseDown=\{handleDrawingMouseDown\}/, 'the real Drawing SVG owns the primary-mousedown behavior');
assert.doesNotMatch(drawingSvg, /on(?:PointerDown|PointerUp|MouseUp|Click|DoubleClick)=\{[^}]*preventDefault/, 'no other Drawing SVG event receives inline default cancellation');
assert.doesNotMatch(workspace, /stopPropagation/, 'Drawing adds no propagation suppression');
assert.match(workspace, /onDoubleClick=\{\(\) => \{ if \(activeTool === 'line'\) finishLine\(\)/, 'native Drawing double-click still finishes Line');
assert.doesNotMatch(sharedCad, /handleDrawingMouseDown/, 'the behavior is not shared CAD behavior');
assert.doesNotMatch(box, /handleDrawingMouseDown/, 'Box does not receive the Drawing-local behavior');

console.log('Drawing primary-mousedown regression tests passed');
