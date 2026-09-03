import assert from 'node:assert/strict';
import { createDrawingDocumentV2, migrateDrawingDocument } from '../.test-build/drawing-line-topology/drawingTypes.js';
import { appendEntityToActiveSketch } from '../.test-build/drawing-line-topology/drawingLineTool.js';
import { appendDimension, deleteEntityWithDependentDimensions } from '../.test-build/drawing-line-topology/drawingDimension.js';
import { solveDrawingDimensionEdit } from '../.test-build/drawing-line-topology/drawingConstraintSolver.js';
import { resolveLine, validateDrawingTopology } from '../.test-build/drawing-line-topology/drawingTopology.js';
import { EMPTY_DRAWING_HISTORY, redoDrawingDocument, transactDrawingDocument, undoDrawingDocument } from '../.test-build/drawing-line-topology/drawingHistory.js';

const pointIds = (() => { let n = 0; return () => `p${++n}`; })();
const add = (document, id, start, end, startPointId, endPointId) => appendEntityToActiveSketch(document, { id, type: 'line', start, end, startPointId, endPointId }, pointIds);
const sketchOf = document => document.sketches[document.activeSketchId];
const resolved = (document, id) => resolveLine(sketchOf(document), sketchOf(document).entities[id]);
const dimension = (id, lineId, kind = 'HORIZONTAL_DISTANCE', value = 10) => ({ id, kind, value, role: 'driving', references: [{ kind: 'point', entityId: lineId, point: 'start' }, { kind: 'point', entityId: lineId, point: 'end' }], placement: { kind: 'linear', offset: 5 } });

// Standalone endpoints remain distinct, while authoritative chaining and endpoint snaps reuse identity.
let document = createDrawingDocumentV2();
document = add(document, 'L1', { x: 0, y: 0 }, { x: 10, y: 0 }, undefined, 'P2');
assert.equal(Object.keys(sketchOf(document).points).length, 2);
document = add(document, 'L2', { x: 10, y: 0 }, { x: 20, y: 0 }, 'P2', 'P3');
document = add(document, 'L3', { x: 20, y: 0 }, { x: 30, y: 0 }, 'P3', 'P4');
assert.equal(Object.keys(sketchOf(document).points).length, 4, 'P1-P2-P3-P4 has four identities');
assert.equal(sketchOf(document).entities.L1.endPointId, sketchOf(document).entities.L2.startPointId);
assert.equal(sketchOf(document).entities.L2.endPointId, sketchOf(document).entities.L3.startPointId);
assert.deepEqual(validateDrawingTopology(document), { ok: true });

// Solving L2 moves shared P3 once. Both adjacent line views and reference dimensions derive live geometry.
document = appendDimension(document, dimension('D', 'L2'));
const beforeLineIds = sketchOf(document).entityOrder.slice();
const solved = solveDrawingDimensionEdit({ document, dimensionId: 'D', targetValue: 15 });
assert.equal(solved.ok, true);
document = solved.document;
assert.equal(sketchOf(document).points.P3.x, 25);
assert.equal(resolved(document, 'L2').end.x, 25);
assert.equal(resolved(document, 'L3').start.x, 25);
assert.equal(sketchOf(document).entities.L2.endPointId, 'P3');
assert.deepEqual(sketchOf(document).entityOrder, beforeLineIds);

// A branch needs no propagation loop: all lines resolve the one moved point.
document = add(document, 'branch', { x: 25, y: 0 }, { x: 25, y: 10 }, 'P3', 'PB');
const solvedAgain = solveDrawingDimensionEdit({ document, dimensionId: 'D', targetValue: 18 });
assert.equal(solvedAgain.ok, true); document = solvedAgain.document;
for (const [id, endpoint] of [['L2', 'end'], ['L3', 'start'], ['branch', 'start']]) assert.equal(resolved(document, id)[endpoint].x, 28);
assert.equal(Object.values(sketchOf(document).points).filter(p => p.id === 'P3').length, 1);

// One transaction atomically owns target and topology, and one undo/redo restores both.
let history = EMPTY_DRAWING_HISTORY;
const beforeEdit = document;
const tx = transactDrawingDocument(history, document, current => solveDrawingDimensionEdit({ document: current, dimensionId: 'D', targetValue: 20 }).document);
history = tx.history; document = tx.document;
assert.equal(history.undo.length, 1); assert.equal(sketchOf(document).dimensions.D.value, 20); assert.equal(sketchOf(document).points.P3.x, 30);
let step = undoDrawingDocument(history, document); history = step.history; document = step.document;
assert.equal(document, beforeEdit); assert.equal(sketchOf(document).dimensions.D.value, 18); assert.equal(sketchOf(document).points.P3.x, 28);
step = redoDrawingDocument(history, document); history = step.history; document = step.document;
assert.equal(sketchOf(document).dimensions.D.value, 20); assert.equal(sketchOf(document).points.P3.x, 30);

// Delete retains shared points, then deterministically collects the final orphan.
let deletion = deleteEntityWithDependentDimensions(document, 'branch');
assert.ok(sketchOf(deletion).points.P3); assert.equal(sketchOf(deletion).points.PB, undefined);
deletion = deleteEntityWithDependentDimensions(deletion, 'L3');
assert.ok(sketchOf(deletion).points.P3, 'L2 still references P3');

// Select/Delete uses this existing cascade as one history transaction. A
// referenced Line and its Dimension disappear atomically and undo/redo restore
// or remove the same dependency-safe document state.
const beforeDelete = document;
const deleteTx = transactDrawingDocument(EMPTY_DRAWING_HISTORY, beforeDelete, current => deleteEntityWithDependentDimensions(current, 'L2'));
assert.equal(deleteTx.history.undo.length, 1);
assert.equal(sketchOf(deleteTx.document).entities.L2, undefined);
assert.equal(sketchOf(deleteTx.document).dimensions.D, undefined, 'dependent Dimension cannot retain a dangling Line reference');
const undoDelete = undoDrawingDocument(deleteTx.history, deleteTx.document);
assert.ok(sketchOf(undoDelete.document).entities.L2);
assert.ok(sketchOf(undoDelete.document).dimensions.D);
const redoDelete = redoDrawingDocument(undoDelete.history, undoDelete.document);
assert.equal(sketchOf(redoDelete.document).entities.L2, undefined);
assert.equal(sketchOf(redoDelete.document).dimensions.D, undefined);

// Legacy migration is deterministic and deliberately does not merge equal coordinates.
const legacy = { schemaVersion: 1, unit: 'mm', sketchOrder: ['s'], activeSketchId: 's', sketches: { s: { id: 's', name: 'S', entityOrder: ['a', 'b'], entities: {
  a: { id: 'a', type: 'line', start: { x: 0, y: 0 }, end: { x: 1, y: 0 } },
  b: { id: 'b', type: 'line', start: { x: 1, y: 0 }, end: { x: 2, y: 0 } },
} } } };
const migrated = migrateDrawingDocument(legacy);
assert.equal(Object.keys(sketchOf(migrated).points).length, 4);
assert.notEqual(sketchOf(migrated).entities.a.endPointId, sketchOf(migrated).entities.b.startPointId);
assert.deepEqual(migrateDrawingDocument(migrated), migrated, 'normalization preserves stable ids');
const malformed = structuredClone(migrated); malformed.sketches.s.entities.a.endPointId = 'missing';
assert.equal(validateDrawingTopology(malformed).ok, false);

// Failed solve is referentially atomic.
const failureBefore = JSON.stringify(document);
const failure = solveDrawingDimensionEdit({ document, dimensionId: 'D', targetValue: -1 });
assert.equal(failure.ok, false); assert.equal(JSON.stringify(document), failureBefore);
console.log('drawing line topology tests passed');
