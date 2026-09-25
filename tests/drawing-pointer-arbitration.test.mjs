import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createDrawingDocumentV2 } from '../.test-build/drawing-pointer-arbitration/drawingTypes.js';
import { resolveDrawingCurveProximity, resolveDrawingPointerOwner } from '../.test-build/drawing-pointer-arbitration/drawingPointerArbitration.js';

const make = () => {
  const document = createDrawingDocumentV2(), sketch = document.sketches[document.activeSketchId];
  Object.assign(sketch.points, {
    a: { id: 'a', x: 0, y: 0 }, b: { id: 'b', x: 10, y: 0 },
    center: { id: 'center', x: 30, y: 0 }, s: { id: 's', x: 50, y: 0 }, e: { id: 'e', x: 60, y: 0 },
  });
  Object.assign(sketch.entities, {
    line: { id: 'line', type: 'line', startPointId: 'a', endPointId: 'b' },
    circle: { id: 'circle', type: 'circle', centerPointId: 'center', radius: 10 },
    arc: { id: 'arc', type: 'arc', startPointId: 's', endPointId: 'e', bulge: 0.5 },
  });
  sketch.entityOrder = ['line', 'circle', 'arc'];
  return document;
};
const point = (pointId, reference = { kind: 'sketchPoint', pointId }) => ({ kind: 'point', reference, pointId, lineId: '', point: 'start', clientPoint: { x: 0, y: 0 }, distancePx: 0 });
const curve = entityId => ({ kind: 'curve', entityId, distancePx: 6 });
const line = { kind: 'line', lineId: 'line', distancePx: 0 };
const overlay = { dimensionId: 'dimension', dimensionSurface: 'line' };

for (const [name, candidate, pointer, expectedKind] of [
  ['Circle center beneath diameter', point('center'), { x: 30, y: 0 }, 'point'],
  ['Line endpoint beneath dimension', point('a'), { x: 0, y: 0 }, 'point'],
  ['Circle body beneath diameter', curve('circle'), { x: 40, y: 0 }, 'entity-scalar'],
  ['Circle proximity candidate', curve('circle'), { x: 42, y: 0 }, 'entity-scalar'],
  ['Arc P1 beneath dimension', point('s'), { x: 50, y: 0 }, 'arc-endpoint'],
  ['Arc P2 beneath dimension', point('e'), { x: 60, y: 0 }, 'arc-endpoint'],
  ['Arc body beneath radius leader', curve('arc'), { x: 55, y: -2.5 }, 'arc-radius'],
  ['Arc proximity candidate', curve('arc'), { x: 55, y: -4 }, 'arc-radius'],
  ['Line body beneath dimension', line, { x: 5, y: 0 }, 'line'],
]) test(name, () => {
  const owner = resolveDrawingPointerOwner(make(), pointer, candidate, overlay);
  assert.equal(owner.kind, 'geometry'); assert.equal(owner.target.kind, expectedKind);
});

test('derived Arc center routes to existing center target without persistent topology', () => {
  const document = make(), before = Object.keys(document.sketches[document.activeSketchId].points);
  const candidate = point(undefined, { kind: 'derivedPoint', entityId: 'arc', role: 'center' });
  const owner = resolveDrawingPointerOwner(document, { x: 55, y: 3.75 }, candidate, overlay);
  assert.equal(owner.kind, 'geometry'); assert.equal(owner.target.kind, 'arc-center');
  assert.deepEqual(Object.keys(document.sketches[document.activeSketchId].points), before);
});

test('persistent semantic point identity survives an empty line id', () => {
  const owner = resolveDrawingPointerOwner(make(), { x: 30, y: 0 }, point('center'), overlay);
  assert.equal(owner.kind, 'geometry'); assert.deepEqual(owner.target, { kind: 'point', pointId: 'center' });
});

test('dimension line owns empty space and value remains an explicit UI surface', () => {
  assert.deepEqual(resolveDrawingPointerOwner(make(), { x: 100, y: 100 }, null, overlay), { kind: 'dimension', dimensionId: 'dimension', surface: 'line' });
  assert.deepEqual(resolveDrawingPointerOwner(make(), { x: 40, y: 0 }, curve('circle'), { ...overlay, dimensionSurface: 'value' }), { kind: 'dimension', dimensionId: 'dimension', surface: 'value' });
});

test('empty canvas remains available after all semantic tiers', () => {
  assert.deepEqual(resolveDrawingPointerOwner(make(), { x: 100, y: 100 }, null, {}), { kind: 'empty' });
});

test('Circle and Arc proximity keep the established screen-space corridor', () => {
  for (const entityId of ['circle', 'arc']) {
    for (const distancePx of [0, 3, 6, 8]) assert.deepEqual(resolveDrawingCurveProximity([{ entityId, distancePx }]), { kind: 'curve', entityId, distancePx });
    assert.equal(resolveDrawingCurveProximity([{ entityId, distancePx: 8.01 }]), null);
  }
});

test('production root owns dimension pointerdown and retains selection after no-op drag', () => {
  const source = fs.readFileSync(new URL('../src/app/DrawingWorkspace.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /className="drawing-dimension-(?:hit|value-hit)[^>]*onPointerDown=/);
  assert.match(source, /resolveDrawingPointerOwner[\s\S]*owner\.kind === 'dimension'[\s\S]*beginDimensionAnnotationDrag/);
  assert.doesNotMatch(source, /if \(session\.exceeded\) setSelectedGeometry\(\[\]\)/);
});
