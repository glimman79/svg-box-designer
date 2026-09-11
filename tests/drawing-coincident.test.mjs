import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createDrawingDocumentV2, migrateDrawingDocument } from '../.test-build/drawing-coincident/drawingTypes.js';
import { appendEntityToActiveSketch } from '../.test-build/drawing-coincident/drawingLineTool.js';
import { addCoincidentConstraint, addPointOnLinearSupportConstraint, canonicalCoincidentPointPair, createCoincidentConstraint, createPointOnLinearSupportConstraint, deriveCoincidentMarkers, deriveSelectedCoincidentReferenceMarker, POINT_CONSTRAINT_MARKER_SIZE_PX } from '../.test-build/drawing-coincident/drawingCoincidentConstraint.js';
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

test('one square marker is screen-stably offset beside its coincident point and deletion/history preserve all geometry', () => {
  let document = addCoincidentConstraint(base(), 'a-p2', 'b-p1');
  const [m1] = deriveCoincidentMarkers(document.sketches['sketch-1'], 1), [m2] = deriveCoincidentMarkers(document.sketches['sketch-1'], 2);
  assert.equal(deriveCoincidentMarkers(document.sketches['sketch-1']).length, 1);
  const point = document.sketches['sketch-1'].points['a-p2'];
  assert.deepEqual({ x: m1.x - point.x, y: m1.y - point.y }, { x: 12, y: -12 });
  assert.deepEqual({ x: (m2.x - point.x) * 2, y: (m2.y - point.y) * 2 }, { x: 12, y: -12 });
  assert.equal(POINT_CONSTRAINT_MARKER_SIZE_PX, 8);
  assert.deepEqual(deriveSelectedCoincidentReferenceMarker(document.sketches['sketch-1'], m1.constraintId), { constraintId: m1.constraintId, x: 20, y: 5 }, 'selected point/point relation derives one temporary indication at its other Point');
  const before = document, transaction = transactDrawingDocument(EMPTY_DRAWING_HISTORY, document, (current) => deleteGeometricConstraint(current, m1.constraintId));
  document = transaction.document; assert.equal(Object.keys(document.sketches['sketch-1'].points).length, 4); assert.equal(Object.keys(document.sketches['sketch-1'].entities).length, 2);
  assert.deepEqual(document.sketches['sketch-1'].points, before.sketches['sketch-1'].points);
  const undone = undoDrawingDocument(transaction.history, document); assert.equal(Object.keys(undone.document.sketches['sketch-1'].geometricConstraints).length, 1);
  assert.equal(Object.keys(redoDrawingDocument(undone.history, undone.document).document.sketches['sketch-1'].geometricConstraints).length, 0);
});

test('point/linear-support Coincident is one scalar equation, remains outside the segment, and slides', () => {
  let document = add(add(createDrawingDocumentV2(), line('support', { x: 0, y: 0 }, { x: 100, y: 0 })), line('carrier', { x: 150, y: 20 }, { x: 160, y: 30 }));
  let sketch = document.sketches['sketch-1'];
  const relation = createPointOnLinearSupportConstraint(sketch, 'carrier-p1', 'support');
  assert.equal(relation.variant, 'point-linear-support');
  document = addPointOnLinearSupportConstraint(document, 'carrier-p1', 'support'); sketch = document.sketches['sketch-1'];
  const constraint = sketch.geometricConstraints[relation.id], equations = geometricConstraintEquations(sketch, constraint);
  assert.equal(equations.length, 1);
  assert.equal(analyzeDrawingConstraints(sketch).componentByPointId.get('carrier-p1').constraintRank, 1);
  let solved = solveDrawingComponentDrag(sketch, { 'carrier-p1': { x: 150, y: 0 } }, { directPointIds: ['carrier-p1'] });
  assert.ok(solved); assert.ok(Math.abs(solved.points['carrier-p1'].y) < 1e-7); assert.ok(solved.points['carrier-p1'].x > 100);
  solved = solveDrawingComponentDrag(solved, { 'carrier-p1': { x: -40, y: 0 } }, { directPointIds: ['carrier-p1'] });
  assert.ok(solved); assert.ok(solved.points['carrier-p1'].x < 0); assert.ok(Math.abs(solved.points['carrier-p1'].y) < 1e-7);
  const [marker] = deriveCoincidentMarkers(solved, 2), point = solved.points['carrier-p1'];
  assert.deepEqual({ x: marker.x - point.x, y: marker.y - point.y }, { x: 6, y: -6 });
  assert.equal(Object.keys(solved.points).length, 4, 'no hidden point was introduced');
  assert.deepEqual(deriveSelectedCoincidentReferenceMarker(solved, relation.id), { constraintId: relation.id, x: 50, y: 12 }, 'selected reference identifies the finite target Line at its shared midpoint marker slot');
  const horizontal = { id: 'horizontal:support', kind: 'HORIZONTAL', references: [{ kind: 'entity', entityId: 'support' }] };
  const withHorizontal = { ...solved, geometricConstraints: { ...solved.geometricConstraints, [horizontal.id]: horizontal }, geometricConstraintOrder: [...solved.geometricConstraintOrder, horizontal.id] };
  assert.deepEqual(deriveSelectedCoincidentReferenceMarker(withHorizontal, relation.id), { constraintId: relation.id, x: 72, y: 12 }, 'selected reference takes the next deterministic shared Line-marker slot beside H');
  assert.deepEqual(deriveSelectedCoincidentReferenceMarker(withHorizontal, relation.id, 2), { constraintId: relation.id, x: 61, y: 6 }, 'selected Line reference offset and collision spacing remain screen-stable');
  assert.equal(deriveSelectedCoincidentReferenceMarker(solved, null), null, 'deselection removes derived presentation');
});

test('selected point/vertical-support Coincident avoids the V midpoint marker', () => {
  let document = add(add(createDrawingDocumentV2(), line('support', { x: 10, y: 0 }, { x: 10, y: 100 })), line('carrier', { x: 30, y: 30 }, { x: 40, y: 40 }));
  document = addPointOnLinearSupportConstraint(document, 'carrier-p1', 'support');
  const sketch = document.sketches['sketch-1'];
  const relation = Object.values(sketch.geometricConstraints).find(({ kind }) => kind === 'COINCIDENT');
  const vertical = { id: 'vertical:support', kind: 'VERTICAL', references: [{ kind: 'entity', entityId: 'support' }] };
  const withVertical = { ...sketch, geometricConstraints: { ...sketch.geometricConstraints, [vertical.id]: vertical }, geometricConstraintOrder: [...sketch.geometricConstraintOrder, vertical.id] };
  assert.deepEqual(deriveSelectedCoincidentReferenceMarker(withVertical, relation.id), { constraintId: relation.id, x: -2, y: 72 }, 'selected reference takes the next deterministic shared Line-marker slot beside V');
});

test('any selected semantic edge can define support without an edge-count assumption', () => {
  let document = createDrawingDocumentV2();
  for (let index = 1; index <= 6; index += 1) document = add(document, line(`edge-${index}`, { x: index * 20, y: index }, { x: index * 20 + 10, y: index + 5 }));
  const sketch = document.sketches['sketch-1'];
  assert.equal(createPointOnLinearSupportConstraint(sketch, 'edge-1-p1', 'edge-5').references[1].entityId, 'edge-5');
});

test('degenerate linear support fails without a relation or marker', () => {
  const document = add(createDrawingDocumentV2(), line('zero', { x: 4, y: 4 }, { x: 4, y: 4 }));
  const sketch = document.sketches['sketch-1'];
  assert.equal(createPointOnLinearSupportConstraint(sketch, 'zero-p1', 'zero'), null);
  assert.equal(addPointOnLinearSupportConstraint(document, 'zero-p1', 'zero'), document);
  assert.deepEqual(deriveCoincidentMarkers(sketch), []);
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
  assert.match(workspace, /<rect className="drawing-coincident-marker-shape"/);
  assert.match(workspace, /drawing-coincident-reference-marker drawing-coincident-marker-shape/);
  assert.match(css, /\.drawing-coincident-marker-shape \{[^}]*stroke: var\(--drawing-geometric-constraint\)/);
});
