import assert from 'node:assert/strict';
import { analyzeDrawingConstraints, constraintPointKey, dimensionIncreasesConstraintRank } from '../.test-build/drawing-constraint-rank/drawingConstraintAnalysis.js';
import { appendDimension, classifyNewDimensionRole, displayedDimensionMeasurement } from '../.test-build/drawing-constraint-rank/drawingDimension.js';
import { getGeometryConstraintVisualState } from '../.test-build/drawing-constraint-rank/drawingGeometryVisualState.js';

const point = (id, x, y) => ({ id, x, y });
const ref = (pointId) => ({ kind: 'sketchPoint', pointId });
const origin = { kind: 'datum', datum: 'ORIGIN' };
const dimension = (id, kind, references, role = 'driving') => ({ id, kind, references, role, value: 1, placement: { kind: 'linear', offset: 5 } });
const sketch = (points, dimensions = {}, entities = {}) => ({ id: 's', name: 'Sketch', points, entities, entityOrder: Object.keys(entities), dimensions, dimensionOrder: Object.keys(dimensions) });
const component = (source, pointId) => analyzeDrawingConstraints(source).componentByPointId.get(pointId);

const free = sketch({ p: point('p', 50, 100) });
assert.deepEqual({ rank: component(free, 'p').constraintRank, dof: component(free, 'p').degreesOfFreedom }, { rank: 0, dof: 2 });

const horizontal = dimension('horizontal', 'HORIZONTAL_DISTANCE', [origin, ref('p')]);
const oneAxis = sketch(free.points, { horizontal });
assert.deepEqual({ variables: component(oneAxis, 'p').variableCount, rank: component(oneAxis, 'p').constraintRank, dof: component(oneAxis, 'p').degreesOfFreedom }, { variables: 2, rank: 1, dof: 1 });
assert.equal(getGeometryConstraintVisualState(oneAxis, { kind: 'point', pointId: 'p' }), 'CONSTRAINED');

const vertical = dimension('vertical', 'VERTICAL_DISTANCE', [origin, ref('p')]);
const locked = sketch(free.points, { horizontal, vertical });
assert.deepEqual({ rank: component(locked, 'p').constraintRank, dof: component(locked, 'p').degreesOfFreedom }, { rank: 2, dof: 0 });
assert.equal(getGeometryConstraintVisualState(locked, { kind: 'point', pointId: 'p' }), 'FULLY_LOCKED');
assert.equal(analyzeDrawingConstraints(locked).components.length, 1, 'Origin never creates a variable/component');
assert.equal(constraintPointKey(locked, origin), 'datum:ORIGIN');

const aligned = dimension('aligned', 'ALIGNED_DISTANCE', [origin, ref('p')]);
assert.equal(dimensionIncreasesConstraintRank(locked, aligned), false);
assert.deepEqual(classifyNewDimensionRole(locked, aligned), { role: 'reference', reason: 'redundant' });
const document = { schemaVersion: 2, unit: 'mm', sketches: { s: locked }, sketchOrder: ['s'], activeSketchId: 's' };
const appended = appendDimension(document, aligned);
assert.equal(appended.sketches.s.dimensions.aligned.role, 'reference');
assert.equal(displayedDimensionMeasurement({ ...appended.sketches.s, points: { p: point('p', 50, 100) } }, { ...appended.sketches.s.dimensions.aligned, value: 999 }), Math.hypot(50, 100));

let reordered = sketch(free.points);
for (const candidate of [aligned, horizontal, vertical]) {
  const role = classifyNewDimensionRole(reordered, candidate).role;
  reordered = { ...reordered, dimensions: { ...reordered.dimensions, [candidate.id]: { ...candidate, role } }, dimensionOrder: [...reordered.dimensionOrder, candidate.id] };
}
assert.deepEqual(reordered.dimensionOrder.map((id) => reordered.dimensions[id].role), ['driving', 'driving', 'reference']);

const trianglePoints = { a: point('a', 0, 0), b: point('b', 3, 0), c: point('c', 0, 4) };
const triangle = sketch(trianglePoints, {
  ab: dimension('ab', 'ALIGNED_DISTANCE', [ref('a'), ref('b')]),
  bc: dimension('bc', 'ALIGNED_DISTANCE', [ref('b'), ref('c')]),
  ca: dimension('ca', 'ALIGNED_DISTANCE', [ref('c'), ref('a')]),
});
assert.equal(component(triangle, 'a').constraintRank, 3);
assert.equal(component(triangle, 'a').degreesOfFreedom, 3, 'internally rigid geometry retains translation and rotation DOF');
assert.equal(getGeometryConstraintVisualState(triangle, { kind: 'point', pointId: 'a' }), 'CONSTRAINED');

const referenceOnly = sketch(free.points, { measurement: { ...horizontal, role: 'reference' } });
assert.deepEqual({ rank: component(referenceOnly, 'p').constraintRank, dof: component(referenceOnly, 'p').degreesOfFreedom }, { rank: 0, dof: 2 });
assert.equal(getGeometryConstraintVisualState(referenceOnly, { kind: 'point', pointId: 'p' }), 'FREE');

const line = { id: 'line', type: 'line', startPointId: 'a', endPointId: 'b' };
const legacyDimension = dimension('legacy', 'HORIZONTAL_DISTANCE', [{ kind: 'point', entityId: 'line', point: 'start' }, { kind: 'point', entityId: 'line', point: 'end' }]);
const legacy = sketch({ a: point('a', 0, 0), b: point('b', 10, 0) }, { legacy: legacyDimension }, { line });
assert.equal(component(legacy, 'a').constraintRank, 1, 'legacy line endpoints resolve to stable SketchPoint IDs');
assert.deepEqual(component(legacy, 'a').pointIds, new Set(['a', 'b']));

const pointToPoint = sketch({ a: point('a', 2, 3), b: point('b', 5, 7) }, { p2p: dimension('p2p', 'ALIGNED_DISTANCE', [ref('a'), ref('b')]) });
assert.equal(component(pointToPoint, 'a').constraintRank, 1);
assert.equal(component(pointToPoint, 'a').degreesOfFreedom, 3);

console.log('drawing constraint rank tests passed');
