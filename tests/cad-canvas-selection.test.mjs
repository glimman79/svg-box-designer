import assert from 'node:assert/strict';
import fs from 'node:fs';

const repro = fs.readFileSync('src/EdgeCanvasRepro.tsx', 'utf8');
const styles = fs.readFileSync('src/styles.css', 'utf8');
const main = fs.readFileSync('src/main.tsx', 'utf8');
const drawing = fs.readFileSync('src/app/DrawingWorkspace.tsx', 'utf8');
const box = fs.readFileSync('src/App.tsx', 'utf8');

assert.match(repro, /data-edge-selection-case=\{id\}/, 'the directly comparable selection cases share one component');
assert.match(repro, /<SelectionCase id="selection-current" suppressed=\{false\} \/>/, 'Case A retains normal browser selection');
assert.match(repro, /<SelectionCase id="selection-local-none" suppressed \/>/, 'Case B enables only local selection suppression');
assert.match(repro, /WebkitUserSelect: 'none', userSelect: 'none'/, 'Case B tests prefixed and standard selection suppression');
assert.match(repro, /<\/div>\s*<aside data-selection-diagnostics/, 'diagnostics are a sibling outside the selection-test region');
for (const field of ['Last target:', 'Last elementFromPoint:', 'Selection:', 'Composed path:', 'Popup observed by user:']) assert.match(repro, new RegExp(field), `${field} is recorded`);
for (const detail of ['isCollapsed', 'rangeCount', 'toString', 'anchorNode', 'focusNode']) assert.match(repro, new RegExp(detail), `selection ${detail} is inspected`);
assert.match(repro, /<option>UNVERIFIED<\/option><option>YES<\/option><option>NO<\/option>/, 'popup observation is explicitly recorded by the Edge tester');
assert.doesNotMatch(repro, /preventDefault|removeAllRanges|userAgent/, 'the selection repro adds no event cancellation, selection clearing, or browser sniffing');
assert.doesNotMatch(styles, /\.cad-viewport-interaction\s*\{[^}]*user-select:/s, 'production CAD suppression awaits the real Edge A/B result');
assert.doesNotMatch(styles, /(?:^|[},]\s*)(?:html|body|#root|\.app-shell)\b[^{}]*\{[^}]*user-select:\s*none;/ms, 'selection is not globally disabled');
assert.match(drawing, /onDoubleClick=\{\(\) => \{ if \(activeTool === 'line'\) finishLine\(\); \}\}/, 'Drawing keeps its dblclick lifecycle');
assert.match(drawing, /design-svg cad-viewport-interaction drawing-svg/, 'Drawing keeps the shared viewport contract');
assert.match(box, /design-svg cad-viewport-interaction/, 'Box keeps the shared viewport contract');
assert.match(main, /import\.meta\.env\.DEV && window\.location\.pathname === '\/edge-canvas-repro'/, 'diagnostics remain development-only');

console.log('CAD canvas selection A/B contract tests passed');
