import test from 'node:test';
import assert from 'node:assert/strict';
import { createDrawingDocumentV2, migrateDrawingDocument } from '../.test-build/drawing-circle/drawingTypes.js';
import { applyResolvedCircleClick, circlePreviewRadius, EMPTY_CIRCLE_INTERACTION, updateCirclePreview } from '../.test-build/drawing-circle/drawingCircleTool.js';
import { appendCircleToActiveSketch, appendEntityToActiveSketch } from '../.test-build/drawing-circle/drawingDocumentMutation.js';
import { deriveEntityDefiningPointIds, resolveCircle, removeEntityAndOrphans, validateDrawingTopology } from '../.test-build/drawing-circle/drawingTopology.js';
import { distanceToDrawingEntity } from '../.test-build/drawing-circle/drawingEntityGeometry.js';
import { drawingCircleQualifiesForRect, applyDrawingBoxSelection } from '../.test-build/drawing-circle/drawingBoxSelection.js';
import { solveDrawingComponentDrag, verifyDrawingConstraints } from '../.test-build/drawing-circle/drawingConstraintSolver.js';
import { EMPTY_DRAWING_HISTORY, redoDrawingDocument, transactDrawingDocument, undoDrawingDocument } from '../.test-build/drawing-circle/drawingHistory.js';

const ids = (...values) => { let i = 0; return () => values[i++]; };

test('two-click circle rejects degeneracy and preview is transient', () => {
  const first = applyResolvedCircleClick(EMPTY_CIRCLE_INTERACTION, { x: 2, y: 3 }, () => 'circle');
  assert.equal(first.entity, null);
  const preview = updateCirclePreview(first.interaction, { x: 5, y: 7 });
  assert.equal(circlePreviewRadius(preview), 5);
  assert.equal(applyResolvedCircleClick(first.interaction, { x: 2, y: 3 }, () => 'circle').entity, null);
  const done = applyResolvedCircleClick(preview, { x: 5, y: 7 }, () => 'circle');
  assert.deepEqual(done.entity, { id: 'circle', type: 'circle', center: { x: 2, y: 3 }, radius: 5 });
  assert.deepEqual(done.interaction, EMPTY_CIRCLE_INTERACTION);
});

test('circle stores one topological center and one radius, without P2', () => {
  const document = appendCircleToActiveSketch(createDrawingDocumentV2(), { id: 'c', type: 'circle', center: { x: 1, y: 2 }, radius: 4 }, ids('center'));
  const sketch = document.sketches[document.activeSketchId];
  assert.deepEqual(sketch.entities.c, { id: 'c', type: 'circle', centerPointId: 'center', radius: 4 });
  assert.deepEqual(Object.keys(sketch.points), ['center']);
  assert.deepEqual(resolveCircle(sketch, sketch.entities.c), { ...sketch.entities.c, center: { x: 1, y: 2 } });
  assert.deepEqual(validateDrawingTopology(document), { ok: true });
});

test('existing P1 identity is shared and survives Circle deletion when a Line uses it', () => {
  let document = appendEntityToActiveSketch(createDrawingDocumentV2(), { id: 'l', type: 'line', start: { x: 0, y: 0 }, end: { x: 10, y: 0 } }, ids('shared', 'end'));
  document = appendCircleToActiveSketch(document, { id: 'c', type: 'circle', center: { x: 0, y: 0 }, centerPointId: 'shared', radius: 3 });
  const sketch = removeEntityAndOrphans(document.sketches[document.activeSketchId], 'c');
  assert.ok(sketch.points.shared);
  assert.ok(sketch.entities.l);
});

test('P1 midpoint persists but P2 midpoint does not', () => {
  let document = appendEntityToActiveSketch(createDrawingDocumentV2(), { id: 'l', type: 'line', start: { x: 0, y: 0 }, end: { x: 10, y: 0 } }, ids('a', 'b'));
  document = appendCircleToActiveSketch(document, { id: 'c', type: 'circle', center: { x: 5, y: 0 }, radius: 2 }, ids('center'), 'l');
  const constraints = Object.values(document.sketches[document.activeSketchId].geometricConstraints);
  assert.equal(constraints.filter(({ kind }) => kind === 'MIDPOINT').length, 1);
  assert.equal(constraints[0].references[0].pointId, 'center');
});

test('P1 finite-Line placement persists the global point-linear-support relation', () => {
  let document = appendEntityToActiveSketch(createDrawingDocumentV2(), { id: 'l', type: 'line', start: { x: 0, y: 0 }, end: { x: 10, y: 0 } }, ids('a', 'b'));
  document = appendCircleToActiveSketch(document, { id: 'c', type: 'circle', center: { x: 4, y: 0 }, radius: 2 }, ids('center'), null, null, 'l');
  const sketch = document.sketches[document.activeSketchId];
  assert.deepEqual(sketch.points.center, { id: 'center', x: 4, y: 0 });
  assert.deepEqual(sketch.geometricConstraints['coincident:center:support:l'], {
    id: 'coincident:center:support:l', kind: 'COINCIDENT', variant: 'point-linear-support',
    references: [{ kind: 'sketchPoint', pointId: 'center' }, { kind: 'entity', entityId: 'l' }],
  });
});

test('Circle centers derive one shared entity-defining point presentation role', () => {
  let document = appendCircleToActiveSketch(createDrawingDocumentV2(), { id: 'a', type: 'circle', center: { x: 1, y: 2 }, centerPointId: 'shared', radius: 2 });
  document = appendCircleToActiveSketch(document, { id: 'b', type: 'circle', center: { x: 1, y: 2 }, centerPointId: 'shared', radius: 4 });
  const sketch = document.sketches[document.activeSketchId];
  assert.deepEqual([...deriveEntityDefiningPointIds(sketch)], ['shared']);
  assert.equal(Object.keys(sketch.points).length, 1);
});

test('existing P2 creates global point-curve coincidence and solver preserves free angle', () => {
  let document = appendEntityToActiveSketch(createDrawingDocumentV2(), { id: 'l', type: 'line', start: { x: 5, y: 0 }, end: { x: 8, y: 0 } }, ids('p2', 'other'));
  document = appendCircleToActiveSketch(document, { id: 'c', type: 'circle', center: { x: 0, y: 0 }, radius: 5 }, ids('center'), null, 'p2');
  const sketch = document.sketches[document.activeSketchId];
  const constraint = Object.values(sketch.geometricConstraints).find(({ variant }) => variant === 'point-curve');
  assert.ok(constraint);
  const solved = solveDrawingComponentDrag(sketch, { p2: { x: 0, y: 6 } }, { directPointIds: ['p2'] });
  assert.ok(solved);
  assert.ok(Math.abs(Math.hypot(solved.points.p2.x, solved.points.p2.y) - 5) < 1e-7);
  assert.ok(solved.points.p2.y > 4.9);
  assert.ok(verifyDrawingConstraints(solved, [], [constraint.id]));
});

test('circle hit distance measures curve, not filled interior', () => {
  const circle = { id: 'c', type: 'circle', centerPointId: 'p', center: { x: 0, y: 0 }, radius: 10 };
  assert.equal(distanceToDrawingEntity(circle, { x: 10, y: 0 }), 0);
  assert.equal(distanceToDrawingEntity(circle, { x: 0, y: 0 }), 10);
});

test('directional box selection uses exact Circle curve semantics', () => {
  const c = { id: 'c', type: 'circle', centerPointId: 'p', center: { x: 0, y: 0 }, radius: 5 };
  assert.equal(drawingCircleQualifiesForRect(c, { minX: -6, maxX: 6, minY: -6, maxY: 6 }, 'window'), true);
  assert.equal(drawingCircleQualifiesForRect(c, { minX: -5, maxX: 6, minY: -6, maxY: 6 }, 'window'), false);
  assert.equal(drawingCircleQualifiesForRect(c, { minX: 4, maxX: 7, minY: -1, maxY: 1 }, 'crossing'), true);
  assert.equal(drawingCircleQualifiesForRect(c, { minX: 5, maxX: 7, minY: 0, maxY: 2 }, 'crossing'), true);
  assert.equal(drawingCircleQualifiesForRect(c, { minX: -6, maxX: 6, minY: -6, maxY: 6 }, 'crossing'), true);
  assert.equal(drawingCircleQualifiesForRect(c, { minX: -1, maxX: 1, minY: -1, maxY: 1 }, 'crossing'), false);
  assert.deepEqual(applyDrawingBoxSelection([{ kind: 'circle', circleId: 'c' }], [{ kind: 'circle', circleId: 'c' }], true), []);
});

test('deleting Circle removes point-curve relation but preserves P2 used by Line', () => {
  let document = appendEntityToActiveSketch(createDrawingDocumentV2(), { id: 'l', type: 'line', start: { x: 5, y: 0 }, end: { x: 7, y: 0 } }, ids('p2', 'other'));
  document = appendCircleToActiveSketch(document, { id: 'c', type: 'circle', center: { x: 0, y: 0 }, radius: 5 }, ids('center'), null, 'p2');
  const sketch = removeEntityAndOrphans(document.sketches[document.activeSketchId], 'c');
  assert.ok(sketch.points.p2);
  assert.equal(Object.values(sketch.geometricConstraints).some(({ variant }) => variant === 'point-curve'), false);
});

test('schema-v2 restoration retains valid Circle and drops malformed Circle data', () => {
  const valid = appendCircleToActiveSketch(createDrawingDocumentV2(), { id: 'c', type: 'circle', center: { x: 0, y: 0 }, radius: 2 }, ids('center'));
  assert.deepEqual(migrateDrawingDocument(valid).sketches['sketch-1'].entities.c, valid.sketches['sketch-1'].entities.c);
  const malformed = structuredClone(valid); malformed.sketches['sketch-1'].entities.c.radius = 0;
  const restored = migrateDrawingDocument(malformed);
  assert.equal(restored.sketches['sketch-1'].entities.c, undefined);
  assert.deepEqual(restored.sketches['sketch-1'].entityOrder, []);
});

test('Circle creation and all automatic semantics are one undo/redo transaction', () => {
  let document = appendEntityToActiveSketch(createDrawingDocumentV2(), { id: 'l', type: 'line', start: { x: 5, y: 0 }, end: { x: 8, y: 0 } }, ids('p2', 'other'));
  const transaction = transactDrawingDocument(EMPTY_DRAWING_HISTORY, document, (current) => appendCircleToActiveSketch(current,
    { id: 'c', type: 'circle', center: { x: 0, y: 0 }, radius: 5 }, ids('center'), null, 'p2'));
  assert.equal(transaction.history.undo.length, 1);
  assert.ok(transaction.document.sketches['sketch-1'].entities.c);
  assert.equal(Object.keys(transaction.document.sketches['sketch-1'].geometricConstraints).length, 1);
  const undone = undoDrawingDocument(transaction.history, transaction.document);
  assert.equal(undone.document.sketches['sketch-1'].entities.c, undefined);
  const redone = redoDrawingDocument(undone.history, undone.document);
  assert.ok(redone.document.sketches['sketch-1'].entities.c);
  assert.equal(Object.keys(redone.document.sketches['sketch-1'].geometricConstraints).length, 1);
});
