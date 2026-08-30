import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = path.resolve('.test-build/drawing-d2-3');
const snap = await import(pathToFileURL(path.join(root, 'drawingSnapEngine.js')));
const inference = await import(pathToFileURL(path.join(root, 'drawingInference.js')));
const lineTool = await import(pathToFileURL(path.join(root, 'drawingLineTool.js')));
const lifecycle = await import(pathToFileURL(path.join(root, 'drawingToolLifecycle.js')));
const identity = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
const target = { id: 'target', type: 'line', start: { x: 10, y: 10 }, end: { x: 110, y: 10 } };
const candidatesAt = (point) => inference.collectDrawingInferenceCandidates(point, [target], identity);
const resolve = (rawPoint, candidates, previousSnap = null, ctrlOverride = false) => snap.resolveDrawingSnap({ rawPoint, candidates, previousSnap, ctrlOverride });

assert.equal(snap.DRAWING_ENDPOINT_SNAP_ACQUIRE_PX, 9);
assert.equal(snap.DRAWING_ENDPOINT_SNAP_RELEASE_PX, 12);
assert.equal(snap.DRAWING_LINE_SNAP_ACQUIRE_PX, 8);
assert.equal(snap.DRAWING_LINE_SNAP_RELEASE_PX, 11);
let endpoint = resolve({ x: 18.9, y: 10 }, candidatesAt({ x: 18.9, y: 10 }));
assert.equal(endpoint.type, 'endpoint');
assert.equal(endpoint.effectivePoint, target.start, 'endpoint snap uses exact stored model point');
endpoint = resolve({ x: 21, y: 10 }, candidatesAt({ x: 21, y: 10 }), endpoint);
assert.equal(endpoint.type, 'endpoint', 'endpoint holds inside release tolerance');
endpoint = resolve({ x: 10, y: 22.1 }, candidatesAt({ x: 10, y: 22.1 }), endpoint);
assert.equal(endpoint.type, 'none', 'endpoint releases beyond release tolerance');

let line = resolve({ x: 60, y: 17.9 }, candidatesAt({ x: 60, y: 17.9 }));
assert.equal(line.type, 'line');
assert.deepEqual(line.effectivePoint, { x: 60, y: 10 }, 'line snap uses exact finite-segment projection');
line = resolve({ x: 60, y: 20.5 }, candidatesAt({ x: 60, y: 20.5 }), line);
assert.equal(line.type, 'line', 'line holds inside release tolerance');
line = resolve({ x: 60, y: 21.1 }, candidatesAt({ x: 60, y: 21.1 }), line);
assert.equal(line.type, 'none', 'line releases beyond release tolerance');

assert.equal(resolve({ x: 17, y: 10 }, candidatesAt({ x: 17, y: 10 })).type, 'endpoint', 'endpoint has priority over line');
const spatial = resolve({ x: 18, y: 10 }, candidatesAt({ x: 18, y: 10 }));
assert.equal(resolve({ x: 18, y: 10 }, candidatesAt({ x: 18, y: 10 }), spatial, true).type, 'none', 'Ctrl disables global snap');
assert.equal(resolve({ x: 18, y: 10 }, candidatesAt({ x: 18, y: 10 }), null, false).type, 'endpoint', 'release immediately reacquires without tool activation');
const ctrlFree = resolve({ x: 19, y: 18 }, candidatesAt({ x: 19, y: 18 }), null, true);
const angular = lineTool.resolveLinePreviewPoint({ x: 0, y: 0 }, ctrlFree.effectivePoint);
assert.equal(angular.snapActive, true, 'Ctrl leaves Line-specific 22.5 degree inference available');

assert.equal(lifecycle.nextDrawingTool('select', 'activate', 'line'), 'line');
assert.equal(lifecycle.nextDrawingTool('line', 'finish-construction'), 'line');
assert.equal(lifecycle.nextDrawingTool('line', 'deactivate'), 'select');
const interaction = lineTool.applyResolvedLineClick(lineTool.EMPTY_LINE_INTERACTION, target.start, () => 'one').interaction;
const committed = lineTool.applyResolvedLineClick(interaction, { x: 60, y: 10 }, () => 'one');
assert.deepEqual(committed.entity.end, { x: 60, y: 10 }, 'resolved spatial point commits without angular re-resolution');

const workspace = fs.readFileSync('src/app/DrawingWorkspace.tsx', 'utf8');
const css = fs.readFileSync('src/styles.css', 'utf8');
const engine = fs.readFileSync('src/app/drawingSnapEngine.ts', 'utf8');
assert.match(workspace, /aria-pressed=\{activeTool === 'line'\}/, 'active styling derives from activeTool');
assert.match(workspace, /useCadEscapeToolExit\(exitActiveTool\)/, 'one Escape uses the shared exit contract');
assert.match(workspace, /onDoubleClick=\{\(\) => \{ if \(activeTool === 'line'\) finishLine\(\)/, 'canvas double-click finishes the current construction');
assert.match(workspace, /resolveCadToolPointerActivation[\s\S]*?selectTool\(tool, resolution\.activationMode\)/, 'application-controlled pointer activation can explicitly request persistent mode');
assert.doesNotMatch(workspace, /event\.target !== event\.currentTarget/, 'pan can start over child grid and geometry elements');
const cadInteraction = fs.readFileSync('src/app/cadInteraction.ts', 'utf8');
assert.match(cadInteraction, /releasePointerCapture/);
assert.match(cadInteraction, /setPointerCapture/, 'shared pan capture has a symmetric release');
assert.match(css, /\.drawing-label-overlay[^}]*pointer-events:\s*none/s, 'screen-space cursor overlay cannot intercept pan');
assert.doesNotMatch(engine, /22\.5|angular|grid|midpoint|intersection|origin|constraint/i, 'global engine contains only endpoint/line spatial policy');

console.log('D2.3 CAD interaction foundation tests passed');
