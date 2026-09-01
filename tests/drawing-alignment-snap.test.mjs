import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = path.resolve('.test-build/drawing-alignment');
const inference = await import(pathToFileURL(path.join(root, 'drawingInference.js')));
const snapEngine = await import(pathToFileURL(path.join(root, 'drawingSnapEngine.js')));
const lineTool = await import(pathToFileURL(path.join(root, 'drawingLineTool.js')));
const identity = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
const line = { id: 'line-a', type: 'line', start: { x: 100, y: 50 }, end: { x: 180, y: 80 } };
const bounds = { x: 0, y: 0, width: 500, height: 500 };
const candidates = (client, lines = [line], viewport = bounds, transform = identity) => inference.collectDrawingInferenceCandidates(client, lines, transform, viewport);
const resolve = (rawPoint, values, previousSnap = null, ctrlOverride = false) => snapEngine.resolveDrawingSnap({ rawPoint, candidates: values, previousSnap, ctrlOverride });

let result = resolve({ x: 102, y: 400 }, candidates({ x: 102, y: 400 }));
assert.equal(result.type, 'alignment');
assert.equal(result.effectivePoint.x, 100, 'visible remote reference supplies exact X');
assert.equal(result.effectivePoint.y, 400, 'X alignment does not alter Y');
assert.equal(result.xReference.referenceId, 'line-a:start');

result = resolve({ x: 400, y: 52 }, candidates({ x: 400, y: 52 }));
assert.equal(result.effectivePoint.y, 50, 'visible remote reference supplies exact Y');
assert.equal(result.effectivePoint.x, 400, 'Y alignment does not alter X');

assert.equal(resolve({ x: 102, y: 400 }, candidates({ x: 102, y: 400 }, [line], { x: 110, y: 0, width: 400, height: 500 })).type, 'none', 'offscreen point cannot align X');
assert.equal(resolve({ x: 400, y: 52 }, candidates({ x: 400, y: 52 }, [line], { x: 110, y: 0, width: 400, height: 500 })).type, 'none', 'offscreen point cannot align Y');
assert.equal(resolve({ x: 102, y: 400 }, candidates({ x: 102, y: 400 }, [line], { x: 99, y: 49, width: 2, height: 2 })).type, 'alignment', 'panned viewport makes point eligible again');
const scaleFour = { a: 4, b: 0, c: 0, d: 4, e: 20, f: -12 };
assert.equal(resolve({ x: 101.9, y: 300 }, candidates({ x: 20 + 101.9 * 4, y: -12 + 300 * 4 }, [line], bounds, scaleFour)).type, 'alignment', 'screen tolerance is zoom invariant');
assert.equal(resolve({ x: 102.1, y: 300 }, candidates({ x: 20 + 102.1 * 4, y: -12 + 300 * 4 }, [line], bounds, scaleFour)).type, 'none', 'zoomed correction outside eight pixels does not align');

const crossing = [line, { id: 'line-b', type: 'line', start: { x: 300, y: 250 }, end: { x: 350, y: 280 } }];
result = resolve({ x: 102, y: 252 }, candidates({ x: 102, y: 252 }, crossing));
assert.deepEqual(result.effectivePoint, { x: 100, y: 250 }, 'X and Y can resolve simultaneously from different points');
assert.equal(result.xReference.entityId, 'line-a');
assert.equal(result.yReference.entityId, 'line-b');
result = resolve({ x: 102, y: 52 }, candidates({ x: 102, y: 52 }));
assert.equal(result.type, 'endpoint', 'nearby same-reference X/Y retains endpoint priority');

const closeAxes = [
  { id: 'z-x', type: 'line', start: { x: 103, y: 20 }, end: { x: 350, y: 30 } },
  { id: 'a-x', type: 'line', start: { x: 101, y: 40 }, end: { x: 360, y: 50 } },
  { id: 'z-y', type: 'line', start: { x: 20, y: 203 }, end: { x: 30, y: 350 } },
  { id: 'a-y', type: 'line', start: { x: 40, y: 201 }, end: { x: 50, y: 360 } },
];
result = resolve({ x: 100, y: 200 }, candidates({ x: 100, y: 200 }, closeAxes));
assert.equal(result.xReference.entityId, 'a-x', 'smallest perpendicular X correction wins');
assert.equal(result.yReference.entityId, 'a-y', 'smallest perpendicular Y correction wins');
const tie = [
  { id: 'z-x', type: 'line', start: { x: 102, y: 20 }, end: { x: 300, y: 30 } },
  { id: 'a-x', type: 'line', start: { x: 98, y: 40 }, end: { x: 310, y: 50 } },
  { id: 'z-y', type: 'line', start: { x: 20, y: 202 }, end: { x: 30, y: 300 } },
  { id: 'a-y', type: 'line', start: { x: 40, y: 198 }, end: { x: 50, y: 310 } },
];
result = resolve({ x: 100, y: 200 }, candidates({ x: 100, y: 200 }, tie));
assert.equal(result.xReference.entityId, 'a-x', 'equal X correction uses stable reference identity');
assert.equal(result.yReference.entityId, 'a-y', 'equal Y correction uses stable reference identity');

result = resolve({ x: 140, y: 65 }, candidates({ x: 140, y: 65 }));
assert.equal(result.type, 'line', 'finite line-body snap retains priority');
const aligned = resolve({ x: 102, y: 400 }, candidates({ x: 102, y: 400 }));
assert.equal(resolve({ x: 110.5, y: 400 }, candidates({ x: 110.5, y: 400 }), aligned).type, 'alignment', 'alignment retains through release tolerance');
assert.equal(resolve({ x: 102, y: 400 }, candidates({ x: 102, y: 400 }), aligned, true).type, 'none', 'Ctrl releases alignment');
const angular = lineTool.resolveLinePreviewPoint({ x: 0, y: 0 }, { x: 100, y: 39 });
assert.equal(angular.snapActive, true, 'Line angular fallback remains available');

const refs = inference.collectDrawingReferencePoints([line, { id: 'shared', type: 'line', start: line.end, end: { x: 220, y: 100 } }]);
assert.equal(refs.length, 3, 'shared vertices are deduplicated');
assert.equal(inference.isPointInDrawingBounds({ x: 0, y: 0 }, bounds), true, 'viewport edges are inclusive');

const workspace = fs.readFileSync('src/app/DrawingWorkspace.tsx', 'utf8');
const styles = fs.readFileSync('src/styles.css', 'utf8');
assert.match(workspace, /snap\.type === 'alignment'[\s\S]*drawing-line-cursor-alignment/);
assert.match(workspace, /<rect className="drawing-line-cursor-alignment"/, 'alignment marker is a square');
assert.match(workspace, /drawing-alignment-guide[\s\S]*data-axis="x"[\s\S]*drawing-alignment-guide[\s\S]*data-axis="y"/, 'both transient guide axes render');
assert.match(styles, /\.drawing-alignment-guide[\s\S]*stroke-dasharray:/, 'guides are dashed');
assert.match(workspace, /snap\.type === 'endpoint' && <circle/, 'endpoint marker remains a ring');
assert.match(workspace, /snap\.type === 'line' && <path/, 'line marker remains a triangle');
assert.match(workspace, /if \(panHandlers\.onPointerMove\(event\)\) return;[\s\S]*resolvePlacement/, 'right-pan exits before inference');
assert.match(workspace, /const effectivePoint = placement\.effectivePoint;[\s\S]*commitLinePoint\(effectivePoint, endpointPointId\)/, 'commit closes over displayed effectivePoint');
assert.match(workspace, /if \(event\.button === CAD_PRIMARY_BUTTON\) event\.preventDefault\(\);/, 'accepted Drawing-local primary mousedown fix remains');
assert.doesNotMatch(workspace, /setDocument[\s\S]{0,120}drawing-alignment-guide/, 'guides never enter DrawingDocument');

console.log('D2.4 global Drawing X/Y alignment snap tests passed');
