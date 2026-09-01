import assert from 'node:assert/strict';
import {
  appendDimension, canonicalDimensionReferencePairKey, classifyNewDimensionRole, createLineDimension,
  deleteDimension, deleteEntityWithDependentDimensions, dimensionConstraintEquationCount,
  displayedDimensionMeasurement, formatDimensionValue,
} from '../.test-build/drawing-dimension-role/drawingDimension.js';
import { createDrawingDocumentV2, migrateDrawingDocument } from '../.test-build/drawing-dimension-role/drawingTypes.js';

const line = { id: 'line-role', type: 'line', start: { x: 0, y: 0 }, end: { x: 42.602, y: 102.85 } };
const makeDocument = () => {
  const document = createDrawingDocumentV2();
  return { ...document, sketches: { ...document.sketches, 'sketch-1': { ...document.sketches['sketch-1'], entities: { [line.id]: line }, entityOrder: [line.id] } } };
};
const make = (kind, id, source = line) => createLineDimension(source, kind, { x: 70, y: 130 }, id);
const placeOrder = (kinds) => kinds.reduce((document, kind, index) => appendDimension(document, make(kind, `d${index}`)), makeDocument());
for (const order of [
  ['HORIZONTAL_DISTANCE', 'VERTICAL_DISTANCE', 'ALIGNED_DISTANCE'],
  ['ALIGNED_DISTANCE', 'HORIZONTAL_DISTANCE', 'VERTICAL_DISTANCE'],
  ['ALIGNED_DISTANCE', 'VERTICAL_DISTANCE', 'HORIZONTAL_DISTANCE'],
]) {
  const document = placeOrder(order);
  assert.deepEqual(document.sketches['sketch-1'].dimensionOrder.map(id => document.sketches['sketch-1'].dimensions[id].role), ['driving', 'driving', 'reference']);
}
let document = makeDocument();
const first = make('HORIZONTAL_DISTANCE', 'horizontal');
assert.deepEqual(classifyNewDimensionRole(document.sketches['sketch-1'], first), { role: 'driving', reason: 'independent' });
document = appendDimension(document, first);
document = appendDimension(document, make('VERTICAL_DISTANCE', 'vertical'));
assert.equal(document.sketches['sketch-1'].dimensions.vertical.role, 'driving');
document = appendDimension(document, make('ALIGNED_DISTANCE', 'aligned'));
assert.equal(document.sketches['sketch-1'].dimensions.aligned.role, 'reference');
assert.equal(dimensionConstraintEquationCount(document.sketches['sketch-1'].dimensions.horizontal), 1);
assert.equal(dimensionConstraintEquationCount(document.sketches['sketch-1'].dimensions.aligned), 0);
const reversed = [...first.references].reverse();
assert.equal(canonicalDimensionReferencePairKey(first.references), canonicalDimensionReferencePairKey(reversed));
assert.equal(classifyNewDimensionRole(document.sketches['sketch-1'], { ...make('HORIZONTAL_DISTANCE', 'duplicate'), references: reversed }).reason, 'duplicate');
assert.strictEqual(appendDimension(document, make('HORIZONTAL_DISTANCE', 'duplicate')), document, 'exact duplicate is prevented');
const coordinateCopy = make('ALIGNED_DISTANCE', 'other', { ...line, id: 'other-line' });
assert.notEqual(canonicalDimensionReferencePairKey(first.references), canonicalDimensionReferencePairKey(coordinateCopy.references), 'coordinates do not define identity');
const reference = { ...document.sketches['sketch-1'].dimensions.aligned, value: 9999 };
assert.equal(displayedDimensionMeasurement(document.sketches['sketch-1'], reference), Math.hypot(42.602, 102.85));
const changedLine = { ...line, end: { x: 120, y: 5 } };
const changedSketch = { ...document.sketches['sketch-1'], entities: { [line.id]: changedLine } };
assert.equal(displayedDimensionMeasurement(changedSketch, reference), Math.hypot(120, 5), 'reference recomputes after geometry changes');
for (const [kind, expected] of [['HORIZONTAL_DISTANCE', 120], ['VERTICAL_DISTANCE', 5], ['ALIGNED_DISTANCE', Math.hypot(120, 5)]])
  assert.equal(displayedDimensionMeasurement(changedSketch, { ...reference, kind }), expected);
for (const [value, expected] of [[120, '(120 mm)'], [120.5, '(120.5 mm)'], [117.3341, '(117.334 mm)']]) assert.equal(formatDimensionValue(value, 'reference'), expected);
assert.equal(formatDimensionValue(120.5, 'driving'), '120.5 mm');
const afterDrivingDelete = deleteDimension(document, 'vertical');
assert.equal(afterDrivingDelete.sketches['sketch-1'].dimensions.aligned.role, 'reference', 'deletion never promotes');
assert.equal(deleteDimension(document, 'aligned').sketches['sketch-1'].dimensions.horizontal.role, 'driving');
assert.deepEqual(deleteEntityWithDependentDimensions(document, line.id).sketches['sketch-1'].dimensionOrder, []);
const restored = migrateDrawingDocument(JSON.parse(JSON.stringify(document)));
assert.equal(restored.sketches['sketch-1'].dimensions.aligned.role, 'reference');
const legacy = JSON.parse(JSON.stringify(document));
delete legacy.sketches['sketch-1'].dimensions.horizontal.role;
assert.equal(migrateDrawingDocument(legacy).sketches['sketch-1'].dimensions.horizontal.role, 'driving');
const snapshot = JSON.parse(JSON.stringify(document));
assert.equal(snapshot.sketches['sketch-1'].dimensions.aligned.role, 'reference', 'history-shaped snapshots preserve role');
console.log('drawing dimension role tests passed');
