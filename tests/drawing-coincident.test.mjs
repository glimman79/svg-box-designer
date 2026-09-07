import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createDrawingDocumentV2, migrateDrawingDocument } from '../.test-build/drawing-coincident/drawingTypes.js';
import { appendEntityToActiveSketch } from '../.test-build/drawing-coincident/drawingLineTool.js';
import { addCoincidentConstraint, canonicalCoincidentPointPair, createCoincidentConstraint, deriveCoincidentMarkers, POINT_CONSTRAINT_MARKER_OFFSET_PX, POINT_CONSTRAINT_MARKER_SIZE_PX } from '../.test-build/drawing-coincident/drawingCoincidentConstraint.js';
import { analyzeDrawingConstraints, constraintJacobianRow, geometricConstraintEquations } from '../.test-build/drawing-coincident/drawingConstraintAnalysis.js';
import { solveDrawingComponentDrag, verifyDrawingConstraints } from '../.test-build/drawing-coincident/drawingConstraintSolver.js';
import { deleteGeometricConstraint } from '../.test-build/drawing-coincident/drawingParallelMarker.js';
import { removeLineAndOrphans } from '../.test-build/drawing-coincident/drawingTopology.js';
import { EMPTY_DRAWING_HISTORY, redoDrawingDocument, transactDrawingDocument, undoDrawingDocument } from '../.test-build/drawing-coincident/drawingHistory.js';

const line = (id, start, end, startPointId, endPointId) => ({ id, type: 'line', start, end, startPointId, endPointId });
const add = (document, entity, snaps = null) => appendEntityToActiveSketch(document, entity, (() => { let n = 0; return () => `${entity.id}-p${++n}`; })(), null, null, snaps);
const base = () => add(add(createDrawingDocumentV2(), line('a', { x: 0, y: 0 }, { x: 10, y: 0 })), line('b', { x: 20, y: 5 }, { x: 30, y: 5 }));

test('Coincident is canonical, distinct, validated, and duplicate-safe', () => {
  const document = base(), sketch = document.sketches['sketch-1'];
  assert.deepEqual(canonicalCoincidentPointPair('b-p1', 'a-p2'), ['a-p2', 'b-p1']);
  assert.deepEqual(createCoincidentConstraint(sketch, 'b-p1', 'a-p2').references.map(({ pointId }) => pointId), ['a-p2', 'b-p1']);
  assert.equal(createCoincidentConstraint(sketch, 'a-p2', 'a-p2'), null);
  assert.equal(createCoincidentConstraint(sketch, 'missing', 'a-p2'), null);
  const once = addCoincidentConstraint(document, 'b-p1', 'a-p2');
  assert.equal(addCoincidentConstraint(once, 'a-p2', 'b-p1'), once);
});

test('Coincident supplies exact x/y Jacobians, rank two, and two translational DOF', () => {
  const document = addCoincidentConstraint(base(), 'a-p2', 'b-p1'), sketch = document.sketches['sketch-1'];
  const constraint = Object.values(sketch.geometricConstraints)[0], equations = geometricConstraintEquations(sketch, constraint);
  assert.equal(equations.length, 2);
  assert.deepEqual(equations.map((equation) => constraintJacobianRow(sketch, equation, ['a-p2', 'b-p1'])), [[1, 0, -1, 0], [0, 1, 0, -1]]);
  const component = analyzeDrawingConstraints(sketch).componentByPointId.get('a-p2');
  assert.equal(component.constraintRank, 2); assert.equal(component.degreesOfFreedom, 2);
});

test('component solver preserves Coincident while either point and the pair translate', () => {
  let document = addCoincidentConstraint(base(), 'a-p2', 'b-p1');
  let sketch = document.sketches['sketch-1'];
  // Bring the initially separate pair together through the solver.
  let solved = solveDrawingComponentDrag(sketch, { 'a-p2': { x: 15, y: 8 } }, { directPointIds: ['a-p2'] });
  assert.ok(solved); assert.deepEqual(solved.points['a-p2'], { id: 'a-p2', x: solved.points['b-p1'].x, y: solved.points['b-p1'].y });
  solved = solveDrawingComponentDrag(solved, { 'a-p2': { x: 22, y: 14 }, 'b-p1': { x: 22, y: 14 } }, { directPointIds: ['a-p2', 'b-p1'] });
  assert.ok(solved); assert.deepEqual({ x: solved.points['a-p2'].x, y: solved.points['a-p2'].y }, { x: solved.points['b-p1'].x, y: solved.points['b-p1'].y });
  assert.ok(verifyDrawingConstraints(solved, [], sketch.geometricConstraintOrder));
});

test('equal coordinates and ordinary drag never manufacture Coincident', () => {
  let document = base(), sketch = document.sketches['sketch-1'];
  const target = sketch.points['b-p1'];
  const solved = solveDrawingComponentDrag(sketch, { 'a-p2': { x: target.x, y: target.y } }, { directPointIds: ['a-p2'] });
  assert.ok(solved); assert.equal(Object.keys(solved.geometricConstraints).length, 0);
  document = add(createDrawingDocumentV2(), line('equal', { x: 0, y: 0 }, { x: 0, y: 0.0001 }));
  assert.equal(Object.keys(document.sketches['sketch-1'].geometricConstraints).length, 0);
});

test('accepted endpoint snap creates Coincident only for a retained distinct point ID', () => {
  let document = add(createDrawingDocumentV2(), line('a', { x: 0, y: 0 }, { x: 10, y: 0 }, 'shared-a', 'target'));
  document = add(document, line('b', { x: 10, y: 0 }, { x: 20, y: 0 }, 'distinct', 'b-end'), { startPointId: 'target' });
  assert.equal(Object.values(document.sketches['sketch-1'].geometricConstraints).filter(({ kind }) => kind === 'COINCIDENT').length, 1);
  const shared = add(document, line('c', { x: 10, y: 0 }, { x: 10, y: 10 }, 'target', 'c-end'), { startPointId: 'target' });
  assert.equal(Object.values(shared.sketches['sketch-1'].geometricConstraints).filter(({ kind }) => kind === 'COINCIDENT').length, 1);
});

test('one point marker is screen-stable and deletion/history preserve all geometry', () => {
  let document = addCoincidentConstraint(base(), 'a-p2', 'b-p1');
  const [m1] = deriveCoincidentMarkers(document.sketches['sketch-1'], 1), [m2] = deriveCoincidentMarkers(document.sketches['sketch-1'], 2);
  assert.equal(deriveCoincidentMarkers(document.sketches['sketch-1']).length, 1);
  assert.equal((m1.x - 15) * 1, POINT_CONSTRAINT_MARKER_OFFSET_PX); assert.equal((m2.x - 15) * 2, POINT_CONSTRAINT_MARKER_OFFSET_PX);
  assert.equal(POINT_CONSTRAINT_MARKER_SIZE_PX, 8);
  const before = document, transaction = transactDrawingDocument(EMPTY_DRAWING_HISTORY, document, (current) => deleteGeometricConstraint(current, m1.constraintId));
  document = transaction.document; assert.equal(Object.keys(document.sketches['sketch-1'].points).length, 4); assert.equal(Object.keys(document.sketches['sketch-1'].entities).length, 2);
  assert.deepEqual(document.sketches['sketch-1'].points, before.sketches['sketch-1'].points);
  const undone = undoDrawingDocument(transaction.history, document); assert.equal(Object.keys(undone.document.sketches['sketch-1'].geometricConstraints).length, 1);
  assert.equal(Object.keys(redoDrawingDocument(undone.history, undone.document).document.sketches['sketch-1'].geometricConstraints).length, 0);
});

test('restore canonicalizes valid pairs, rejects self/missing/duplicates, and topology deletion cleans dependencies', () => {
  const document = base(), sketch = document.sketches['sketch-1'], ref = (a, b) => [{ kind: 'sketchPoint', pointId: a }, { kind: 'sketchPoint', pointId: b }];
  const restored = migrateDrawingDocument({ ...document, sketches: { 'sketch-1': { ...sketch, geometricConstraints: {
    good: { id: 'good', kind: 'COINCIDENT', references: ref('b-p1', 'a-p2') }, duplicate: { id: 'duplicate', kind: 'COINCIDENT', references: ref('a-p2', 'b-p1') }, self: { id: 'self', kind: 'COINCIDENT', references: ref('a-p2', 'a-p2') }, missing: { id: 'missing', kind: 'COINCIDENT', references: ref('a-p2', 'nope') } }, geometricConstraintOrder: ['good', 'duplicate', 'self', 'missing'] } } });
  assert.deepEqual(restored.sketches['sketch-1'].geometricConstraintOrder, ['good']);
  assert.deepEqual(restored.sketches['sketch-1'].geometricConstraints.good.references.map(({ pointId }) => pointId), ['a-p2', 'b-p1']);
  const cleaned = removeLineAndOrphans(restored.sketches['sketch-1'], 'a'); assert.equal(Object.keys(cleaned.geometricConstraints).length, 0); assert.deepEqual(cleaned.geometricConstraintOrder, []);
});

test('workspace exposes selectable CAD-blue Coincident shapes and keyboard constraint deletion', () => {
  const workspace = readFileSync(new URL('../src/app/DrawingWorkspace.tsx', import.meta.url), 'utf8'), css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
  assert.match(workspace, /drawing-coincident-marker/); assert.match(workspace, /Delete.*Backspace/s); assert.match(workspace, /setSelectedGeometricConstraintId\(marker.constraintId\)/);
  assert.match(css, /\.drawing-coincident-marker-shape \{[^}]*stroke: var\(--drawing-geometric-constraint\)/);
});
