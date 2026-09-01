import assert from 'node:assert/strict';
import {
  DRAWING_CONSTRAINT_TOLERANCE_MM,
  drawingDimensionSolveFailureMessage,
  solveDrawingDimensionEdit,
} from '../.test-build/drawing-dimension-solver/drawingConstraintSolver.js';
import { displayedDimensionMeasurement, formatDimensionValue } from '../.test-build/drawing-dimension-solver/drawingDimension.js';
import { createDrawingDocumentV2 } from '../.test-build/drawing-dimension-solver/drawingTypes.js';
import { resolveLine } from '../.test-build/drawing-dimension-solver/drawingTopology.js';

const kinds = {
  a: 'ALIGNED_DISTANCE',
  h: 'HORIZONTAL_DISTANCE',
  v: 'VERTICAL_DISTANCE',
};
const makeDimension = (id, kind, value, role = 'driving', lineId = 'line') => ({
  id, kind, value, role,
  references: [
    { kind: 'point', entityId: lineId, point: 'start' },
    { kind: 'point', entityId: lineId, point: 'end' },
  ],
  placement: { kind: 'linear', offset: 10 },
});
const makeDocument = ({ end = { x: 60, y: 80 }, dimensions = [makeDimension('edited', kinds.a, 100)] } = {}) => {
  const base = createDrawingDocumentV2();
  const line = { id: 'line', type: 'line', startPointId: 'line:start', endPointId: 'line:end' };
  const other = { id: 'other', type: 'line', startPointId: 'other:start', endPointId: 'other:end' };
  const sketch = base.sketches[base.activeSketchId];
  return {
    ...base,
    sketches: { ...base.sketches, [sketch.id]: {
      ...sketch,
      points: {
        'line:start': { id: 'line:start', x: 10, y: 20 }, 'line:end': { id: 'line:end', ...end },
        'other:start': { id: 'other:start', x: 10, y: 20 }, 'other:end': { id: 'other:end', x: 60, y: 80 },
      },
      entities: { line, other }, entityOrder: ['line', 'other'],
      dimensions: Object.fromEntries(dimensions.map(dimension => [dimension.id, dimension])),
      dimensionOrder: dimensions.map(dimension => dimension.id),
    } },
  };
};
const solve = (document, value, id = 'edited') => solveDrawingDimensionEdit({ document, dimensionId: id, targetValue: value });
const lineOf = result => { const sketch = result.document.sketches['sketch-1']; return resolveLine(sketch, sketch.entities.line); };
const dimensionOf = (result, id) => result.document.sketches['sketch-1'].dimensions[id];
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) <= DRAWING_CONSTRAINT_TOLERANCE_MM, `${actual} != ${expected}`);

// Single aligned: A and direction are fixed, B and the exact target change.
{
  const before = makeDocument();
  const result = solve(before, 120.1234);
  assert.equal(result.ok, true);
  assert.deepEqual(lineOf(result).start, { x: 10, y: 20 });
  close(lineOf(result).end.x, 10 + 50 / Math.hypot(50, 60) * 120.1234);
  close(lineOf(result).end.y, 20 + 60 / Math.hypot(50, 60) * 120.1234);
  close(Math.hypot(lineOf(result).end.x - 10, lineOf(result).end.y - 20), 120.1234);
  close((lineOf(result).end.y - 20) / (lineOf(result).end.x - 10), 6 / 5);
  assert.equal(lineOf(result).id, 'line');
  assert.strictEqual(result.document.sketches['sketch-1'].entities.other, before.sketches['sketch-1'].entities.other);
  assert.deepEqual(dimensionOf(result, 'edited').references, before.sketches['sketch-1'].dimensions.edited.references);
  assert.equal(dimensionOf(result, 'edited').value, 120.1234, 'storage is not display-rounded');
}

for (const [kind, target, expectedEnd] of [
  [kinds.h, 75, { x: 85, y: 80 }],
  [kinds.v, 90, { x: 60, y: 110 }],
]) {
  const before = makeDocument({ dimensions: [makeDimension('edited', kind, kind === kinds.h ? 50 : 60)] });
  const result = solve(before, target);
  assert.equal(result.ok, true);
  assert.deepEqual(lineOf(result).end, expectedEnd);
  assert.equal(Math.sign(lineOf(result).end[kind === kinds.h ? 'x' : 'y'] - lineOf(result).start[kind === kinds.h ? 'x' : 'y']), 1);
}
// Negative signs are stable.
for (const [kind, end, target, expected] of [
  [kinds.h, { x: -40, y: 80 }, 75, { x: -65, y: 80 }],
  [kinds.v, { x: 60, y: -40 }, 90, { x: 60, y: -70 }],
]) {
  const result = solve(makeDocument({ end, dimensions: [makeDimension('edited', kind, 50)] }), target);
  assert.equal(result.ok, true); assert.deepEqual(lineOf(result).end, expected);
}

// H + V keeps the other target and lets an aligned reference derive live geometry.
{
  const dimensions = [makeDimension('edited', kinds.h, 50), makeDimension('vertical', kinds.v, 60), makeDimension('reference', kinds.a, 999, 'reference')];
  const result = solve(makeDocument({ dimensions }), 120);
  assert.equal(result.ok, true); assert.deepEqual(lineOf(result).end, { x: 130, y: 80 });
  assert.equal(dimensionOf(result, 'vertical').value, 60);
  const sketch = result.document.sketches['sketch-1'];
  close(displayedDimensionMeasurement(sketch, sketch.dimensions.reference), Math.hypot(120, 60));
  assert.equal(formatDimensionValue(displayedDimensionMeasurement(sketch, sketch.dimensions.reference), 'reference').startsWith('('), true);
  assert.equal(dimensionOf(result, 'reference').role, 'reference');
  assert.equal(result.diagnostics.constraintCount, 2, 'reference contributed zero equations');
}

// A + H and A + V derive the remaining component without mirroring it.
for (const [editedKind, otherKind, target, expectedDelta] of [
  [kinds.a, kinds.h, 130, { x: 50, y: 120 }],
  [kinds.h, kinds.a, 80, { x: 80, y: 60 }],
  [kinds.a, kinds.v, 130, { x: Math.sqrt(130 ** 2 - 60 ** 2), y: 60 }],
  [kinds.v, kinds.a, 80, { x: 60, y: 80 }],
]) {
  const editedValue = editedKind === kinds.a ? 100 : (editedKind === kinds.h ? 50 : 60);
  const otherValue = otherKind === kinds.a ? 100 : (otherKind === kinds.h ? 50 : 60);
  const dimensions = [makeDimension('edited', editedKind, editedValue), makeDimension('other-driving', otherKind, otherValue)];
  const result = solve(makeDocument({ dimensions }), target);
  assert.equal(result.ok, true);
  close(lineOf(result).end.x - 10, expectedDelta.x); close(lineOf(result).end.y - 20, expectedDelta.y);
}

// Incompatible candidate returns a structured failure and the immutable input is untouched.
{
  const document = makeDocument({ dimensions: [makeDimension('aligned', kinds.a, 100), makeDimension('edited', kinds.h, 50)] });
  const snapshot = JSON.stringify(document);
  const result = solve(document, 120);
  assert.deepEqual(result, { ok: false, reason: 'UNSATISFIABLE_DIMENSION_SET', message: 'This value conflicts with another driving dimension.' });
  assert.equal(JSON.stringify(document), snapshot);
  assert.equal(drawingDimensionSolveFailureMessage(result.reason), result.message);
}

// Zero policy: component zero is valid; a zero-length aligned result is not.
{
  const horizontalZero = solve(makeDocument({ dimensions: [makeDimension('edited', kinds.h, 50)] }), 0);
  assert.equal(horizontalZero.ok, true); assert.deepEqual(lineOf(horizontalZero).end, { x: 10, y: 80 });
  const alignedZero = solve(makeDocument(), 0);
  assert.equal(alignedZero.ok, false); assert.equal(alignedZero.reason, 'UNSUPPORTED_DEGENERATE_GEOMETRY');
  const zeroSource = solve(makeDocument({ end: { x: 10, y: 20 } }), 20);
  assert.equal(zeroSource.ok, false); assert.equal(zeroSource.reason, 'UNSUPPORTED_DEGENERATE_GEOMETRY');
  const zeroDx = solve(makeDocument({ end: { x: 10, y: 80 }, dimensions: [makeDimension('edited', kinds.h, 0)] }), 20);
  assert.equal(zeroDx.ok, false); assert.equal(zeroDx.reason, 'UNDERDETERMINED_ORIENTATION');
  const zeroDy = solve(makeDocument({ end: { x: 60, y: 20 }, dimensions: [makeDimension('edited', kinds.v, 0)] }), 20);
  assert.equal(zeroDy.ok, false); assert.equal(zeroDy.reason, 'UNDERDETERMINED_ORIENTATION');
}

assert.equal(solve(makeDocument(), -1).reason, 'INVALID_TARGET');
assert.equal(solve(makeDocument(), Number.NaN).reason, 'INVALID_TARGET');
console.log('drawing dimension solver tests passed');
