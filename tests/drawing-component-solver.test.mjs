import assert from 'node:assert/strict';
import { solveDrawingDimensionEdit, verifyDrawingDrivingDimensions } from '../.test-build/drawing-component-solver/drawingConstraintSolver.js';
import { displayedDimensionMeasurement } from '../.test-build/drawing-component-solver/drawingDimension.js';
import { EMPTY_DRAWING_HISTORY, redoDrawingDocument, transactDrawingDocument, undoDrawingDocument } from '../.test-build/drawing-component-solver/drawingHistory.js';
import { resolveLine } from '../.test-build/drawing-component-solver/drawingTopology.js';

const point = (id, x, y) => ({ id, x, y });
const ref = pointId => ({ kind: 'sketchPoint', pointId });
const origin = { kind: 'datum', datum: 'ORIGIN' };
const dimension = (id, kind, a, b, value, role = 'driving') => ({ id, kind, references: [a, b], value, role, placement: { kind: 'linear', offset: 5 } });
const documentWith = (points, dimensions, entities = {}) => ({
  schemaVersion: 2, unit: 'mm', activeSketchId: 's', sketchOrder: ['s'], sketches: { s: {
    id: 's', name: 'Sketch', points, entities, entityOrder: Object.keys(entities),
    dimensions: Object.fromEntries(dimensions.map(item => [item.id, item])), dimensionOrder: dimensions.map(item => item.id),
  } },
});

// A connected line chain is solved as one component. Its shared middle point is
// stored once, both incident lines follow it, the Reference reads live geometry,
// and unrelated geometry is byte-for-byte untouched.
{
  const dimensions = [
    dimension('edited', 'HORIZONTAL_DISTANCE', ref('p1'), ref('p2'), 10),
    dimension('remaining', 'HORIZONTAL_DISTANCE', ref('p2'), ref('p3'), 10),
    dimension('measurement', 'ALIGNED_DISTANCE', ref('p1'), ref('p3'), 999, 'reference'),
  ];
  const entities = {
    left: { id: 'left', type: 'line', startPointId: 'p1', endPointId: 'p2' },
    right: { id: 'right', type: 'line', startPointId: 'p2', endPointId: 'p3' },
    unrelated: { id: 'unrelated', type: 'line', startPointId: 'u1', endPointId: 'u2' },
  };
  const before = documentWith({ p1: point('p1', 0, 0), p2: point('p2', 10, 0), p3: point('p3', 20, 0), u1: point('u1', 100, 50), u2: point('u2', 120, 70) }, dimensions, entities);
  const result = solveDrawingDimensionEdit({ document: before, dimensionId: 'edited', targetValue: 15 });
  assert.equal(result.ok, true);
  const sketch = result.document.sketches.s;
  assert.deepEqual(sketch.points.u1, before.sketches.s.points.u1);
  assert.deepEqual(sketch.points.u2, before.sketches.s.points.u2);
  assert.equal(resolveLine(sketch, sketch.entities.left).end.x, resolveLine(sketch, sketch.entities.right).start.x);
  assert.ok(verifyDrawingDrivingDimensions(sketch, ['edited', 'remaining']));
  assert.ok(Math.abs(displayedDimensionMeasurement(sketch, sketch.dimensions.measurement) - 25) < 1e-7);
  assert.deepEqual(result.diagnostics.pointIds, ['p1', 'p2', 'p3']);

  const transaction = transactDrawingDocument(EMPTY_DRAWING_HISTORY, before, () => result.document);
  assert.equal(transaction.history.undo.length, 1, 'multi-point solve is one History action');
  const undone = undoDrawingDocument(transaction.history, transaction.document);
  assert.deepEqual(undone.document, before, 'Undo restores target and every coordinate');
  const redone = redoDrawingDocument(undone.history, undone.document);
  assert.deepEqual(redone.document, result.document, 'Redo restores the complete solved state');
}

// Origin remains a constant while a compatible edit propagates through the component.
{
  const before = documentWith({ p: point('p', 3, 4), q: point('q', 8, 4) }, [
    dimension('edited', 'HORIZONTAL_DISTANCE', origin, ref('p'), 3),
    dimension('chain', 'HORIZONTAL_DISTANCE', ref('p'), ref('q'), 5),
    dimension('vertical', 'VERTICAL_DISTANCE', origin, ref('p'), 4),
  ]);
  const result = solveDrawingDimensionEdit({ document: before, dimensionId: 'edited', targetValue: 6 });
  assert.equal(result.ok, true);
  assert.deepEqual(result.document.sketches.s.points.p, { id: 'p', x: 6, y: 4 });
  assert.deepEqual(result.document.sketches.s.points.q, { id: 'q', x: 11, y: 4 });
  assert.ok(verifyDrawingDrivingDimensions(result.document.sketches.s, ['edited', 'chain', 'vertical']));
  assert.equal(Object.hasOwn(result.document.sketches.s.points, 'datum:ORIGIN'), false);
}

// A triangle-inequality conflict rejects atomically. Applying the failed result to
// History is impossible because it carries no candidate document.
{
  const dimensions = [
    dimension('oa', 'ALIGNED_DISTANCE', origin, ref('a'), 5),
    dimension('ob', 'ALIGNED_DISTANCE', origin, ref('b'), 5),
    dimension('edited', 'ALIGNED_DISTANCE', ref('a'), ref('b'), 8),
  ];
  const before = documentWith({ a: point('a', -4, 3), b: point('b', 4, 3) }, dimensions);
  const snapshot = JSON.stringify(before);
  const result = solveDrawingDimensionEdit({ document: before, dimensionId: 'edited', targetValue: 11 });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'UNSATISFIABLE_DIMENSION_SET');
  assert.equal(JSON.stringify(before), snapshot, 'failed solve mutates neither geometry nor target');
  assert.equal(EMPTY_DRAWING_HISTORY.undo.length, 0, 'rejection creates zero History actions');
}

console.log('drawing component solver tests passed');
