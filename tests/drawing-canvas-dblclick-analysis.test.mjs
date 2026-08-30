import assert from 'node:assert/strict';
import fs from 'node:fs';

const workspace = fs.readFileSync('src/app/DrawingWorkspace.tsx', 'utf8');
const diagnostics = fs.readFileSync('src/app/drawingCanvasDiagnostics.ts', 'utf8');
const css = fs.readFileSync('src/styles.css', 'utf8');

for (const eventName of ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'click', 'dblclick', 'selectionstart', 'selectionchange']) assert.match(diagnostics, new RegExp(`'${eventName}'`), `${eventName} is recorded`);
for (const evidence of ['elementFromPoint', 'composedPath', 'isCollapsed', 'rangeCount', 'anchorNode', 'focusNode']) assert.match(diagnostics, new RegExp(evidence), `${evidence} evidence is recorded`);
assert.match(workspace, /import\.meta\.env\.DEV && new URLSearchParams\(window\.location\.search\).*edgeCanvasDiagnostics/, 'real-canvas diagnostics are development gated and opt-in');
assert.match(workspace, /onDoubleClick=\{\(\) => \{ if \(activeTool === 'line'\) finishLine\(\)/, 'accepted native canvas dblclick lifecycle remains unchanged');
assert.match(css, /\.drawing-label-overlay \{[^}]*pointer-events:\s*none/s, 'coordinate overlay remains pointer-transparent');
assert.match(css, /\.drawing-label-overlay text \{[^}]*user-select:\s*none/s, 'visual-only coordinate text remains non-selectable');
assert.doesNotMatch(css, /(?:^|[},]\s*)(?:html|body|#root|\.app-shell)\b[^{}]*\{[^}]*user-select:\s*none;/ms, 'no global selection suppression exists');
assert.doesNotMatch(workspace, /removeAllRanges|navigator\.userAgent/, 'no selection clearing or browser sniffing was added');

console.log('Drawing canvas dblclick analysis tests passed');
