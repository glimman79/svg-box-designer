import assert from 'node:assert/strict';
import test from 'node:test';
import { createDrawingDocumentV2, migrateDrawingDocument } from '../.test-build/drawing-perpendicular/drawingTypes.js';
import { appendEntityToActiveSketch } from '../.test-build/drawing-perpendicular/drawingLineTool.js';
import { perpendicularAndGradient } from '../.test-build/drawing-perpendicular/drawingConstraintAnalysis.js';
import { solveDrawingComponentDrag, verifyDrawingConstraints } from '../.test-build/drawing-perpendicular/drawingConstraintSolver.js';
import { deriveGeometricConstraintMarkers, GEOMETRIC_CONSTRAINT_MARKER_OFFSET_PX, GEOMETRIC_CONSTRAINT_MARKER_SIZE_PX, GEOMETRIC_CONSTRAINT_MARKER_SPACING_PX } from '../.test-build/drawing-perpendicular/drawingParallelMarker.js';
import { collectDrawingInferenceCandidates } from '../.test-build/drawing-perpendicular/drawingInference.js';
import { resolveDrawingSnap } from '../.test-build/drawing-perpendicular/drawingSnapEngine.js';

const transform = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
const line = (id, start, end) => ({ id, type: 'line', start, end });
const add = (document, entity, perpendicular = null, axis = null) => appendEntityToActiveSketch(document, entity, (() => { let n = 0; return () => `${entity.id}-p${++n}`; })(), axis, perpendicular);

test('accepted perpendicular inference creates one canonical first-class constraint in the Line append transaction', () => {
  let document = add(createDrawingDocumentV2(), line('b', { x: 20, y: 20 }, { x: 60, y: 40 }));
  const existing = { ...document.sketches['sketch-1'].entities.b, start: { x: 20, y: 20 }, end: { x: 60, y: 40 } };
  const candidates = collectDrawingInferenceCandidates({ x: 39, y: 62 }, [existing], transform, undefined, { x: 50, y: 40 });
  const snap = resolveDrawingSnap({ rawPoint: { x: 39, y: 62 }, candidates, previousSnap: null, ctrlOverride: false });
  assert.equal(snap.type, 'perpendicular');
  document = add(document, line('a', { x: 50, y: 40 }, snap.effectivePoint), snap.entityId);
  const [constraint] = Object.values(document.sketches['sketch-1'].geometricConstraints);
  assert.equal(constraint.kind, 'PERPENDICULAR');
  assert.deepEqual(constraint.references.map(({ entityId }) => entityId), ['a', 'b']);
  assert.equal(document.sketches['sketch-1'].geometricConstraintOrder.length, 1);
  assert.ok(perpendicularAndGradient(existing.start, existing.end, { x: 50, y: 40 }, snap.effectivePoint).residual < 1e-12);
});

test('Ctrl bypass and numerical 90 degrees alone never create perpendicular intent', () => {
  let document = add(createDrawingDocumentV2(), line('a', { x: 0, y: 0 }, { x: 10, y: 0 }));
  const existing = { ...document.sketches['sketch-1'].entities.a, start: { x: 0, y: 0 }, end: { x: 10, y: 0 } };
  const candidates = collectDrawingInferenceCandidates({ x: 20, y: 10 }, [existing], transform, undefined, { x: 20, y: 0 });
  assert.equal(resolveDrawingSnap({ rawPoint: { x: 20, y: 10 }, candidates, previousSnap: null, ctrlOverride: true }).type, 'none');
  document = add(document, line('b', { x: 20, y: 0 }, { x: 20, y: 10 }));
  assert.equal(Object.keys(document.sketches['sketch-1'].geometricConstraints).length, 0);
});

test('solver preserves direction-only perpendicular relation while translation, separation, and lengths remain free', () => {
  let document = add(createDrawingDocumentV2(), line('a', { x: 0, y: 0 }, { x: 10, y: 0 }));
  document = add(document, line('b', { x: 30, y: 20 }, { x: 30, y: 25 }), 'a');
  const sketch = document.sketches['sketch-1'];
  const beforeDistance = Math.hypot(sketch.points['b-p1'].x - sketch.points['a-p1'].x, sketch.points['b-p1'].y - sketch.points['a-p1'].y);
  const solved = solveDrawingComponentDrag(sketch, { 'b-p2': { x: 35, y: 32 } }, { directPointIds: ['b-p2'] });
  assert.ok(solved);
  assert.ok(verifyDrawingConstraints(solved, [], sketch.geometricConstraintOrder));
  assert.notEqual(Math.hypot(solved.points['b-p2'].x - solved.points['b-p1'].x, solved.points['b-p2'].y - solved.points['b-p1'].y), 5);
  assert.notEqual(Math.hypot(solved.points['b-p1'].x - solved.points['a-p1'].x, solved.points['b-p1'].y - solved.points['a-p1'].y), beforeDistance);
});

test('one semantic relationship derives two globally slotted markers', () => {
  let document = add(createDrawingDocumentV2(), line('a', { x: 0, y: 0 }, { x: 20, y: 0 }), null, 'HORIZONTAL');
  document = add(document, line('b', { x: 30, y: 0 }, { x: 30, y: 20 }), 'a');
  const markers = deriveGeometricConstraintMarkers(document.sketches['sketch-1']);
  assert.equal(markers.filter(({ label }) => label === '⟂').length, 2);
  assert.equal(new Set(markers.map(({ id }) => id)).size, 3);
  assert.equal(new Set(markers.map(({ x, y }) => `${x}:${y}`)).size, 3);
  assert.deepEqual([GEOMETRIC_CONSTRAINT_MARKER_SIZE_PX, GEOMETRIC_CONSTRAINT_MARKER_OFFSET_PX, GEOMETRIC_CONSTRAINT_MARKER_SPACING_PX], [12, 12, 22]);
});

test('restore rejects self/duplicates and canonicalizes reversed line pairs', () => {
  let document = add(createDrawingDocumentV2(), line('a', { x: 0, y: 0 }, { x: 10, y: 0 }));
  document = add(document, line('b', { x: 0, y: 5 }, { x: 0, y: 10 }));
  const sketch = document.sketches['sketch-1'];
  const refs = (a, b) => [{ kind: 'entity', entityId: a }, { kind: 'entity', entityId: b }];
  const restored = migrateDrawingDocument({ ...document, sketches: { 'sketch-1': { ...sketch,
    geometricConstraints: { reversed: { id: 'reversed', kind: 'PERPENDICULAR', references: refs('b', 'a') }, duplicate: { id: 'duplicate', kind: 'PERPENDICULAR', references: refs('a', 'b') }, self: { id: 'self', kind: 'PERPENDICULAR', references: refs('a', 'a') } },
    geometricConstraintOrder: ['reversed', 'duplicate', 'self'] } } });
  assert.deepEqual(restored.sketches['sketch-1'].geometricConstraintOrder, ['reversed']);
  assert.deepEqual(restored.sketches['sketch-1'].geometricConstraints.reversed.references.map(({ entityId }) => entityId), ['a', 'b']);
});
