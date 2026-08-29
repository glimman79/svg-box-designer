import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const buildRoot = path.resolve('.test-build/drawing-transform');
const { modelToOverlayPoint } = await import(pathToFileURL(path.join(buildRoot, 'drawingTransform.js')));
const identity = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
const closePoint = (actual, expected, message) => {
  assert.ok(actual, `${message}: transform unexpectedly unavailable`);
  assert.ok(Math.abs(actual.x - expected.x) < 1e-9 && Math.abs(actual.y - expected.y) < 1e-9,
    `${message}: expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`);
};

closePoint(modelToOverlayPoint({ x: 0, y: 0 }, identity, identity), { x: 0, y: 0 }, 'model origin');
closePoint(modelToOverlayPoint({ x: 100, y: 0 }, { ...identity, a: 2, d: 2 }, identity), { x: 200, y: 0 }, 'non-zero model point');

const pannedDrawing = { a: 2, b: 0, c: 0, d: 2, e: 37, f: -19 };
closePoint(modelToOverlayPoint({ x: 0, y: 0 }, pannedDrawing, identity), { x: 37, y: -19 }, 'pan moves origin by client delta');
closePoint(modelToOverlayPoint({ x: 100, y: 0 }, pannedDrawing, identity), { x: 237, y: -19 }, 'pan moves axis label by same client delta');

const zoomedDrawing = { a: 3.5, b: 0, c: 0, d: 3.5, e: 37, f: -19 };
closePoint(modelToOverlayPoint({ x: 100, y: 0 }, zoomedDrawing, identity), { x: 387, y: -19 }, 'zoom uses drawing scale');

const offsetDrawing = { a: 2, b: 0, c: 0, d: 2, e: 140, f: 85 };
closePoint(modelToOverlayPoint({ x: 10, y: 20 }, offsetDrawing, identity), { x: 160, y: 125 }, 'drawing client offset');

const overlayToClient = { a: 0.5, b: 0, c: 0, d: 2, e: 100, f: 25 };
closePoint(modelToOverlayPoint({ x: 10, y: 20 }, offsetDrawing, overlayToClient), { x: 120, y: 50 }, 'different overlay coordinate system');
assert.equal(modelToOverlayPoint({ x: 0, y: 0 }, identity, { ...identity, a: 0 }), null, 'singular overlay CTM is rejected');

const workspaceSource = fs.readFileSync('src/app/DrawingWorkspace.tsx', 'utf8');
assert.match(workspaceSource, /getScreenCTM\(\)/, 'browser SVG CTMs are the transform authority');
assert.match(workspaceSource, /modelToOverlayPoint/, 'all model anchors use the shared conversion boundary');
assert.match(workspaceSource, /useLayoutEffect/, 'overlay updates after DOM layout and before paint');
assert.doesNotMatch(workspaceSource, /DRAWING_ORIGIN\.[xy]\s*-\s*viewBox\.[xy]/, 'manual origin/viewBox transform is removed');
assert.doesNotMatch(workspaceSource, /screenPosition/, 'visible-value selection does not masquerade as screen positioning');

const gridSource = fs.readFileSync('src/app/drawingGrid.ts', 'utf8');
assert.doesNotMatch(gridSource, /screenExtent|screenPosition/, 'grid helper selects values without a competing screen transform');

console.log('D2.1e authoritative Drawing-to-overlay transform tests passed');
