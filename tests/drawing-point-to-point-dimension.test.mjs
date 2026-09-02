import assert from 'node:assert/strict';
import {
  canonicalDimensionReferencePairKey, createPointToPointDimension,
  displayedDimensionMeasurement, resolveDrawingPointReference,
} from '../.test-build/drawing-point-to-point-dimension/drawingDimension.js';
import { solveDrawingDimensionEdit } from '../.test-build/drawing-point-to-point-dimension/drawingConstraintSolver.js';
import { collectAffectedDrivingDimensions, solveDrawingDragCandidate } from '../.test-build/drawing-point-to-point-dimension/drawingDirectManipulation.js';

const point = (pointId) => ({ kind: 'sketchPoint', pointId });
const origin = { kind: 'datum', datum: 'ORIGIN' };
const base = () => ({ schemaVersion: 2, unit: 'mm', activeSketchId: 's', sketchOrder: ['s'], sketches: { s: {
  id: 's', name: 'Sketch', points: { a: { id: 'a', x: 10, y: 10 }, b: { id: 'b', x: 40, y: 50 } },
  entities: { l: { id: 'l', type: 'line', startPointId: 'a', endPointId: 'b' } }, entityOrder: ['l'], dimensions: {}, dimensionOrder: [],
} } });
const install = (document, dimension) => { const s = document.sketches.s; return { ...document, sketches: { s: { ...s, dimensions: { [dimension.id]: dimension }, dimensionOrder: [dimension.id] } } }; };
assert.deepEqual(resolveDrawingPointReference(base().sketches.s, origin), { x: 0, y: 0 });
assert.equal(canonicalDimensionReferencePairKey([origin, point('b')]), canonicalDimensionReferencePairKey([point('b'), origin]));
assert.equal(canonicalDimensionReferencePairKey([point('a'), point('b')]), canonicalDimensionReferencePairKey([point('b'), point('a')]));
for (const [kind, expected] of [['ALIGNED_DISTANCE', 50], ['HORIZONTAL_DISTANCE', 30], ['VERTICAL_DISTANCE', 40]]) {
  const doc = base(), d = createPointToPointDimension([point('a'), point('b')], doc.sketches.s.points.a, doc.sketches.s.points.b, kind, { x: 20, y: 20 }, kind);
  assert.equal(d.value, expected); assert.deepEqual(d.references, [point('a'), point('b')]);
}
const originCases = [
  ['HORIZONTAL_DISTANCE', { id: 'b', x: 40, y: 30 }, 50, { x: 50, y: 30 }],
  ['HORIZONTAL_DISTANCE', { id: 'b', x: -40, y: 30 }, 50, { x: -50, y: 30 }],
  ['VERTICAL_DISTANCE', { id: 'b', x: 40, y: -30 }, 60, { x: 40, y: -60 }],
  ['ALIGNED_DISTANCE', { id: 'b', x: 30, y: 40 }, 100, { x: 60, y: 80 }],
];
for (const [kind, initial, target, expected] of originCases) {
  let doc = base(); doc.sketches.s.points.b = initial;
  const d = createPointToPointDimension([point('b'), origin], initial, { x: 0, y: 0 }, kind, { x: 20, y: 20 }, 'd');
  doc = install(doc, d); const result = solveDrawingDimensionEdit({ document: doc, dimensionId: 'd', targetValue: target });
  assert.equal(result.ok, true); assert.deepEqual(result.document.sketches.s.points.b, { id: 'b', ...expected });
  assert.deepEqual(resolveDrawingPointReference(result.document.sketches.s, origin), { x: 0, y: 0 });
}
let doc = base(); doc.sketches.s.points.b = { id: 'b', x: 50, y: 20 };
let d = createPointToPointDimension([origin, point('b')], { x: 0, y: 0 }, doc.sketches.s.points.b, 'HORIZONTAL_DISTANCE', { x: 10, y: 10 }, 'd'); doc = install(doc, d);
assert.equal(solveDrawingDragCandidate(doc, { kind: 'point', pointId: 'b' }, { x: 10, y: 0 }), null);
assert.notEqual(solveDrawingDragCandidate(doc, { kind: 'point', pointId: 'b' }, { x: 0, y: 15 }), null);
assert.equal(collectAffectedDrivingDimensions(doc, new Set(['a'])).length, 0);
const reference = { ...d, id: 'r', role: 'reference' }; doc.sketches.s.dimensions = { r: reference };
assert.equal(displayedDimensionMeasurement(doc.sketches.s, reference), 50);
assert.notEqual(solveDrawingDragCandidate(doc, { kind: 'point', pointId: 'b' }, { x: 10, y: 0 }), null);
console.log('drawing point-to-point and Origin dimension tests passed');
