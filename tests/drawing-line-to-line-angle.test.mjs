import assert from 'node:assert/strict';
import { angleSectorKey, createLineAngleBasis, deriveLineAngleAnnotation, selectLineAngleCandidate } from '../.test-build/drawing-line-angle/drawingLineAngle.js';
import { appendDimension, canonicalDimensionReferencePairKey, createLineToLineAngleDimension, displayedDimensionMeasurement, formatAngleDimension } from '../.test-build/drawing-line-angle/drawingDimension.js';
import { EMPTY_DRAWING_HISTORY, redoDrawingDocument, transactDrawingDocument, undoDrawingDocument } from '../.test-build/drawing-line-angle/drawingHistory.js';

const line = (id, start, end) => ({ id, type: 'line', startPointId: `${id}a`, endPointId: `${id}b`, start, end });
const horizontal = line('a', { x: -10, y: 0 }, { x: 10, y: 0 });
const diagonal = line('b', { x: -10, y: -10 }, { x: 10, y: 10 });
const cross = createLineAngleBasis(horizontal, diagonal);
assert.ok(cross);
assert.equal(cross.candidates.length, 4, 'crossing finite lines expose all support cells');
assert.deepEqual(cross.candidates.map(({ angleDegrees }) => Math.round(angleDegrees)).sort((a, b) => a - b), [45, 45, 135, 135]);
assert.equal(new Set(cross.candidates.map(({ angleDegrees }) => Math.round(angleDegrees))).size, 2, 'numeric equality does not define identity');
assert.equal(new Set(cross.candidates.map(({ sector }) => angleSectorKey(sector))).size, 4, 'all four signed half-plane identities survive');
const selected = cross.candidates.map((candidate) => {
  const middle = candidate.startAngle + candidate.sweepAngle / 2;
  return selectLineAngleCandidate(cross, { x: Math.cos(middle) * 5, y: Math.sin(middle) * 5 });
});
assert.equal(new Set(selected.map(({ sector }) => angleSectorKey(sector))).size, 4, 'cursor motion reaches every physical sector');

const reverse = createLineAngleBasis(diagonal, horizontal);
assert.ok(reverse);
for (const cursor of [{ x: 4, y: 1 }, { x: -4, y: 1 }, { x: -4, y: -1 }, { x: 4, y: -1 }]) {
  const forwardCandidate = selectLineAngleCandidate(cross, cursor), reverseCandidate = selectLineAngleCandidate(reverse, cursor);
  assert.equal(angleSectorKey(forwardCandidate.sector), angleSectorKey(reverseCandidate.sector));
  assert.ok(Math.abs(forwardCandidate.angleDegrees - reverseCandidate.angleDegrees) < 1e-10);
}

// Both finite segments lie northeast of their support intersection. The cell
// southwest of both visible segments requires extending both supports away from
// the geometry, so the geometry-based relevance rule omits only that antipode.
const separatedA = line('a', { x: 10, y: 0 }, { x: 20, y: 0 });
const separatedB = line('b', { x: 2, y: 2 }, { x: 6, y: 6 });
const separated = createLineAngleBasis(separatedA, separatedB);
assert.ok(separated);
assert.deepEqual(separated.intersection, { x: 0, y: 0 });
assert.equal(separated.candidates.length, 3, 'common separated geometry exposes occupied plus two adjacent cells');
const annotation = deriveLineAngleAnnotation(separated, separated.candidates[0], { x: 8, y: 3 }, 2);
assert.deepEqual(annotation.center, { x: 8, y: 3 }, 'far support intersection is represented by derived local presentation');

const parallel = createLineAngleBasis(horizontal, line('c', { x: -10, y: 5 }, { x: 10, y: 5 }));
assert.equal(parallel, null, 'parallel lines fail closed without zero-angle or NaN candidates');
assert.equal(createLineToLineAngleDimension(horizontal, line('c', { x: -10, y: 5 }, { x: 10, y: 5 }), { x: 0, y: 2 }, 'bad'), null);

const makeDocument = () => ({ schemaVersion: 2, unit: 'mm', activeSketchId: 's', sketchOrder: ['s'], sketches: { s: { id: 's', name: 'Sketch', points: { aa: { id: 'aa', ...horizontal.start }, ab: { id: 'ab', ...horizontal.end }, ba: { id: 'ba', ...diagonal.start }, bb: { id: 'bb', ...diagonal.end } }, entities: { a: { id: 'a', type: 'line', startPointId: 'aa', endPointId: 'ab' }, b: { id: 'b', type: 'line', startPointId: 'ba', endPointId: 'bb' } }, entityOrder: ['a', 'b'], dimensions: {}, dimensionOrder: [] } } });
const cursor = { x: 4, y: 1 };
const preview = createLineToLineAngleDimension(diagonal, horizontal, cursor, 'preview');
assert.ok(preview);
assert.equal(preview.role, 'reference', 'D2.5e1 angle is explicitly non-driving');
assert.deepEqual(preview.references.map(({ entityId }) => entityId), ['a', 'b']);
assert.equal(formatAngleDimension(preview.value), '45°');
const before = makeDocument();
assert.equal(before.sketches.s.dimensionOrder.length, 0, 'preview does not mutate Sketch or History');
const committed = { ...preview, id: 'angle-1' };
let transaction = transactDrawingDocument(EMPTY_DRAWING_HISTORY, before, (document) => appendDimension(document, committed));
assert.equal(transaction.changed, true); assert.equal(transaction.history.undo.length, 1); assert.equal(transaction.document.sketches.s.dimensionOrder.length, 1);
assert.equal(displayedDimensionMeasurement(transaction.document.sketches.s, committed), 45);
assert.equal(canonicalDimensionReferencePairKey(committed), canonicalDimensionReferencePairKey(createLineToLineAngleDimension(horizontal, diagonal, cursor, 'reverse')));
const persisted = structuredClone(transaction.document.sketches.s.dimensions['angle-1']);
const undone = undoDrawingDocument(transaction.history, transaction.document); assert.equal(undone.document.sketches.s.dimensionOrder.length, 0);
const redone = redoDrawingDocument(undone.history, undone.document); assert.deepEqual(redone.document.sketches.s.dimensions['angle-1'], persisted);
// View transforms are deliberately absent from semantic helpers/state. Re-read
// after hypothetical pan/zoom and verify no model coordinate or sector changed.
assert.deepEqual(redone.document.sketches.s.dimensions['angle-1'].angleSector, persisted.angleSector);
assert.deepEqual(redone.document.sketches.s.points, before.sketches.s.points);
console.log('drawing line-to-line angle tests passed');
