import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const workspace = fs.readFileSync('src/app/DrawingWorkspace.tsx', 'utf8');
const css = fs.readFileSync('src/styles.css', 'utf8');
const rail = workspace.match(/<aside[^>]*className="drawing-tool-sidebar"[\s\S]*?<\/aside>/)?.[0] ?? '';
const activation = await import(pathToFileURL(path.resolve('.test-build/cad-tool-ui-c3/cadToolActivation.js')));
const lifecycle = await import(pathToFileURL(path.resolve('.test-build/cad-tool-ui-c3/drawingToolLifecycle.js')));

assert.ok(rail.indexOf('>Select</button>') < rail.indexOf('>Line</button>'), 'Select is the first Drawing tool and Line is second');
assert.doesNotMatch(rail, />\s*Tools\s*</, 'Drawing rail has no visible Tools heading');
const sidebarRules = [...css.matchAll(/\.drawing-tool-sidebar\s*\{([^}]*)\}/g)].map((match) => match[1]);
assert.ok(sidebarRules.length > 0, 'Drawing sidebar layout rules exist');
assert.ok(sidebarRules.every((rule) => !/justify-content:\s*center/.test(rule)), 'no Drawing sidebar rule vertically centers its column');
assert.ok(sidebarRules.some((rule) => /flex-direction:\s*column/.test(rule) && /justify-content:\s*flex-start/.test(rule)), 'Drawing tool column is structurally anchored at its top');

const first = activation.resolveCadToolPointerActivation('line', 1000, { x: 20, y: 20 }, null);
assert.equal(first.activationMode, 'normal', 'first activation is normal immediately');
const closeSecond = activation.resolveCadToolPointerActivation('line', 1300, { x: 24, y: 23 }, first.record);
assert.equal(closeSecond.activationMode, 'persistent', 'nearby second activation inside 350ms is persistent');
assert.equal(activation.CAD_DOUBLE_ACTIVATION_THRESHOLD_MS, 350);
assert.equal(activation.CAD_DOUBLE_ACTIVATION_DISTANCE_PX, 6);
assert.equal(activation.resolveCadToolPointerActivation('line', 1351, { x: 20, y: 20 }, first.record).activationMode, 'normal', 'activation outside timing threshold stays normal');
assert.equal(activation.resolveCadToolPointerActivation('line', 1200, { x: 27, y: 20 }, first.record).activationMode, 'normal', 'activation outside distance tolerance stays normal');
assert.equal(activation.resolveCadToolPointerActivation('select', 1200, { x: 20, y: 20 }, first.record).activationMode, 'normal', 'different tools do not combine into double activation');

assert.match(workspace, /activateToolFromKeyboard[\s\S]*?event\.detail !== 0[\s\S]*?selectTool\(tool\);/, 'keyboard clicks remain normal activations');
assert.match(workspace, /selectTool\(tool, resolution\.activationMode\)/, 'pointer resolution immediately drives tool lifecycle');
assert.doesNotMatch(rail, /onDoubleClick=/, 'native tool dblclick is not an activation authority');
assert.deepEqual(lifecycle.activateDrawingTool('line', first.activationMode), { activeTool: 'line', activationMode: 'normal' });
assert.deepEqual(lifecycle.finishDrawingConstruction(lifecycle.activateDrawingTool('line', closeSecond.activationMode)), { activeTool: 'line', activationMode: 'persistent' }, 'persistent Line stays active after a chain finishes');
assert.match(rail, /<button type="button"[^>]*aria-pressed=\{activeTool === 'select'\}/, 'Select remains a native pressed-state button');
assert.match(rail, /<button type="button"[^>]*aria-pressed=\{activeTool === 'line'\}/, 'Line remains a native pressed-state button');
assert.match(css, /\.cad-tool-button\s*\{[^}]*-webkit-user-select:\s*none;[^}]*user-select:\s*none;/s, 'CAD controls remain non-selectable');
assert.match(workspace, /onMouseDownCapture=\{preventToolChromeMouseSelection\}/, 'early mouse selection suppression remains scoped to tool rail');
assert.match(workspace, /onPointerDownCapture=\{preventToolChromePointerSelection\}/, 'pointer defaults are cancelled before Edge can synthesize native mouse and dblclick selection behavior');
assert.match(workspace, /addEventListener\('selectionstart', preventToolChromeSelection\)/, 'selectionstart suppression remains scoped to tool rail');
assert.doesNotMatch(css, /(?:^|[},]\s*)(?:html|body|#root|\.app-shell)\b[^{}]*\{[^}]*user-select:\s*none;/ms, 'global text selection remains enabled');

console.log('CAD tool UI polish C3 tests passed');
