import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = path.resolve('.test-build/cad-contract');
const lifecycle = await import(pathToFileURL(path.join(root, 'drawingToolLifecycle.js')));
const shared = fs.readFileSync('src/app/cadInteraction.ts', 'utf8');
const drawing = fs.readFileSync('src/app/DrawingWorkspace.tsx', 'utf8');
const box = fs.readFileSync('src/App.tsx', 'utf8');

assert.match(shared, /CAD_PRIMARY_BUTTON = 0/);
assert.match(shared, /CAD_PAN_BUTTON = 2/);
assert.match(shared, /useCadPanGesture/);
assert.match(shared, /useCadCtrlSnapOverride/);
assert.match(shared, /useCadEscapeToolExit/);
assert.match(shared, /onContextMenu:[\s\S]*preventDefault/);
assert.doesNotMatch(shared, /Drawing|Box|Puzzle/, 'shared primitive is workspace-neutral');
assert.match(drawing, /if \(panHandlers\.onPointerDown\(event\)\) return;[\s\S]*event\.button !== CAD_PRIMARY_BUTTON/, 'navigation has precedence over Drawing tools');
assert.match(drawing, /const handlePointerMove[\s\S]*if \(panHandlers\.onPointerMove\(event\)\) return;[\s\S]*resolvePlacement/, 'active pan takes the fast path before placement work');
assert.match(box, /useCadPanGesture\([\s\S]*setCanvasViewBox/, 'Box retains its viewport math behind the shared gesture');
assert.match(box, /onContextMenu=\{canvasPanHandlers\.onContextMenu\}/);
assert.match(drawing, /useCadWheelCapture/);
assert.match(box, /useCadWheelCapture/);

assert.deepEqual(lifecycle.activateDrawingTool('line'), { activeTool: 'line', activationMode: 'normal' });
const persistent = lifecycle.activateDrawingTool('line', 'persistent');
assert.deepEqual(lifecycle.finishDrawingConstruction(persistent), persistent);
assert.deepEqual(lifecycle.finishDrawingConstruction(lifecycle.activateDrawingTool('line')), { activeTool: 'select', activationMode: 'normal' });
assert.deepEqual(lifecycle.activateDrawingTool('select', 'persistent'), { activeTool: 'select', activationMode: 'normal' });

console.log('Shared CAD interaction contract tests passed');
