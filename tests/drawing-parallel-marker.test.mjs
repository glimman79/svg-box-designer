import assert from 'node:assert/strict';
import { deleteGeometricConstraint, deriveParallelMarkers } from '../.test-build/drawing-parallel-marker/drawingParallelMarker.js';
import { EMPTY_DRAWING_HISTORY, redoDrawingDocument, transactDrawingDocument, undoDrawingDocument } from '../.test-build/drawing-parallel-marker/drawingHistory.js';
import { removeLineAndOrphans } from '../.test-build/drawing-parallel-marker/drawingTopology.js';

const constraint = { id: 'parallel:a:b', kind: 'PARALLEL', references: [{ kind: 'entity', entityId: 'a' }, { kind: 'entity', entityId: 'b' }] };
const sketch = {
  id: 's', name: 'Sketch',
  points: { aa: { id: 'aa', x: 0, y: 0 }, ab: { id: 'ab', x: 20, y: 0 }, ba: { id: 'ba', x: 5, y: 10 }, bb: { id: 'bb', x: 25, y: 10 } },
  entities: { a: { id: 'a', type: 'line', startPointId: 'aa', endPointId: 'ab' }, b: { id: 'b', type: 'line', startPointId: 'ba', endPointId: 'bb' } },
  entityOrder: ['a', 'b'], dimensions: {}, dimensionOrder: [],
  geometricConstraints: { [constraint.id]: constraint }, geometricConstraintOrder: [constraint.id],
};
const document = { schemaVersion: 2, unit: 'mm', sketches: { s: sketch }, sketchOrder: ['s'], activeSketchId: 's' };

assert.deepEqual(deriveParallelMarkers(sketch), [
  { id: 'parallel:a:b:0', constraintId: constraint.id, lineId: 'a', x: 10, y: 12, label: '∥' },
  { id: 'parallel:a:b:1', constraintId: constraint.id, lineId: 'b', x: 15, y: 22, label: '∥' },
], 'one semantic Parallel derives one offset marker beside each finite Line');
assert.deepEqual(deriveParallelMarkers(sketch, 2).map(({ y }) => y), [6, 16], 'screen-space offset remains 12 px at 2 px/model-unit');
assert.equal(Object.keys(sketch.geometricConstraints).length, 1, 'deriving two markers does not create a second constraint');

const deletion = transactDrawingDocument(EMPTY_DRAWING_HISTORY, document, (current) => deleteGeometricConstraint(current, constraint.id));
assert.equal(deletion.changed, true);
assert.equal(Object.keys(deletion.document.sketches.s.geometricConstraints).length, 0, 'deleting either derived marker target removes its shared constraint');
assert.equal(deriveParallelMarkers(deletion.document.sketches.s).length, 0, 'both derived markers disappear together');
assert.deepEqual(deletion.document.sketches.s.entityOrder, ['a', 'b'], 'constraint deletion preserves both Lines');
assert.equal(deletion.history.undo.length, 1, 'constraint deletion is one History transaction');
const undone = undoDrawingDocument(deletion.history, deletion.document);
assert.equal(Object.keys(undone.document.sketches.s.geometricConstraints).length, 1, 'Undo restores one semantic constraint');
assert.equal(deriveParallelMarkers(undone.document.sketches.s).length, 2, 'Undo restores both derived markers');
const redone = redoDrawingDocument(undone.history, undone.document);
assert.equal(deriveParallelMarkers(redone.document.sketches.s).length, 0, 'Redo removes both markers again');

const lineDeleted = removeLineAndOrphans(sketch, 'a');
assert.equal(Object.keys(lineDeleted.geometricConstraints).length, 0, 'deleting a participating Line removes the dependent constraint');
assert.equal(deriveParallelMarkers(lineDeleted).length, 0, 'line dependency cleanup removes both marker representations');

console.log('drawing parallel marker tests passed');
