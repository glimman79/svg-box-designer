import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const workspace = fs.readFileSync('src/app/DrawingWorkspace.tsx', 'utf8');
const css = fs.readFileSync('src/styles.css', 'utf8');
const app = fs.readFileSync('src/App.tsx', 'utf8');
const rail = workspace.match(/<aside[^>]*className="drawing-tool-sidebar"[\s\S]*?<\/aside>/)?.[0] ?? '';
const activation = await import(pathToFileURL(path.resolve('.test-build/cad-tool-ui-c4/cadToolActivation.js')));
const lifecycle = await import(pathToFileURL(path.resolve('.test-build/cad-tool-ui-c4/drawingToolLifecycle.js')));

assert.match(rail, /onPointerDownCapture=\{preventToolChromePointerSelection\}/, 'primary pointer start is owned by Drawing tool chrome');
assert.match(rail, /onMouseDownCapture=\{preventToolChromeMouseSelection\}/, 'compatibility mouse start remains neutralized');
assert.doesNotMatch(rail, /on(?:Pointer|Mouse)UpCapture=/, 'redundant gesture-completion suppression is removed');
assert.doesNotMatch(rail, /onDoubleClick=/, 'native dblclick has no tool activation authority');

const first = activation.resolveCadToolPointerActivation('line', 1000, { x: 20, y: 20 }, null);
const second = activation.resolveCadToolPointerActivation('line', 1350, { x: 26, y: 20 }, first.record);
assert.equal(first.activationMode, 'normal', 'first activation is immediate and normal');
assert.equal(second.activationMode, 'persistent', 'qualifying second activation is persistent');
assert.equal(activation.CAD_DOUBLE_ACTIVATION_THRESHOLD_MS, 350);
assert.equal(activation.CAD_DOUBLE_ACTIVATION_DISTANCE_PX, 6);
assert.deepEqual(lifecycle.finishDrawingConstruction(lifecycle.activateDrawingTool('line', second.activationMode)), { activeTool: 'line', activationMode: 'persistent' });

assert.doesNotMatch(css, /\.cad-tool-button \*/, 'redundant descendant selection rule is removed');
assert.doesNotMatch(css, /(?:^|[},]\s*)(?:html|body|#root|\.app-shell)\b[^{}]*\{[^}]*user-select:\s*none;/ms, 'no global selection suppression exists');
assert.doesNotMatch(workspace, /removeAllRanges/, 'selection ranges are not cleared without evidence of a real selection');
assert.doesNotMatch(workspace, /cadToolEventDiagnostics|recordActivation/, 'temporary event diagnostics are absent from Drawing');
assert.match(workspace, /activateToolFromKeyboard[\s\S]*?event\.detail !== 0[\s\S]*?selectTool\(tool\)/, 'keyboard button activation remains available');
assert.match(workspace, /onDoubleClick=\{\(\) => \{ if \(activeTool === 'line'\) finishLine\(\)/, 'canvas dblclick finish remains present');
assert.match(app, /className=\{`tool-button cad-tool-button\$\{activeTool === tool \? ' active' : ''\}`\}/, 'Box tool markup remains unchanged');

console.log('CAD tool UI polish C4 tests passed');
