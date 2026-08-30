import assert from 'node:assert/strict';
import fs from 'node:fs';

const workspace = fs.readFileSync('src/app/DrawingWorkspace.tsx', 'utf8');
const css = fs.readFileSync('src/styles.css', 'utf8');
const rail = workspace.match(/<aside[^>]*className="drawing-tool-sidebar"[\s\S]*?<\/aside>/)?.[0] ?? '';

assert.ok(!fs.existsSync('src/app/cadToolEventDiagnostics.ts'), 'production diagnostic recorder is removed');
assert.doesNotMatch(workspace, /cadToolEventDiagnostics|recordActivation|onPointerUpCapture|onMouseUpCapture/, 'diagnostic and redundant completion wiring is gone');
assert.doesNotMatch(rail, /onDoubleClick=/, 'native tool dblclick is not an activation authority');
assert.ok(rail.indexOf('>Select</button>') >= 0 && rail.indexOf('>Select</button>') < rail.indexOf('>Line</button>'), 'native Select/Line order is preserved');
assert.match(workspace, /resolveCadToolPointerActivation/, 'persistent activation helper remains authoritative');
assert.match(workspace, /onDoubleClick=\{\(\) => \{ if \(activeTool === 'line'\) finishLine\(\)/, 'canvas double-click finish remains');
assert.doesNotMatch(css, /(?:^|[},]\s*)(?:html|body|#root|\.app-shell)\b[^{}]*\{[^}]*user-select:\s*none;/ms, 'no global selection suppression exists');
assert.doesNotMatch(css, /\.cad-tool-button \*/, 'redundant descendant selection rule is gone');

console.log('CAD tool cleanup tests passed');
