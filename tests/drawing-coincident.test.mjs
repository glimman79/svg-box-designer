import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createDrawingDocumentV2, migrateDrawingDocument } from '../.test-build/drawing-coincident/drawingTypes.js';
import { appendEntityToActiveSketch, applyResolvedProfileClick, EMPTY_PROFILE_INTERACTION } from '../.test-build/drawing-coincident/drawingProfileTool.js';
import { addCoincidentConstraint, addPointOnLinearSupportConstraint, canonicalCoincidentPointPair, createCoincidentConstraint, createPointOnLinearSupportConstraint, deriveCoincidentMarkers, deriveSelectedCoincidentReferenceMarker, POINT_CONSTRAINT_MARKER_SIZE_PX } from '../.test-build/drawing-coincident/drawingCoincidentConstraint.js';
import { analyzeDrawingConstraints, constraintJacobianRow, geometricConstraintEquations } from '../.test-build/drawing-coincident/drawingConstraintAnalysis.js';
import { solveDrawingComponentDrag, solveDrawingDimensionEdit, verifyDrawingConstraints } from '../.test-build/drawing-coincident/drawingConstraintSolver.js';
import { appendDimension, createCircularSizeDimension, createPointToPointDimension, resolveDrawingPointReference } from '../.test-build/drawing-coincident/drawingDimension.js';
import { solveDrawingDragCandidate } from '../.test-build/drawing-coincident/drawingDirectManipulation.js';
import { collectDrawingAuthoringPoints, resolveArc } from '../.test-build/drawing-coincident/drawingTopology.js';
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

test('target Arc center uses ordinary point Coincidence and intrinsic component connectivity', () => {
  const source = base().sketches['sketch-1'];
  const sketch = { ...source, points: { ...source.points, center: { id: 'center', x: 5, y: 3.75 } },
    entities: { ...source.entities, arc: { id: 'arc', type: 'arc', centerPointId: 'center', startPointId: 'a-p1', endPointId: 'a-p2', radius: 6.25, orientation: 'CCW' } } };
  const point = { kind: 'sketchPoint', pointId: 'b-p1' }, center = { kind: 'sketchPoint', pointId: 'center' };
  const constraint = createCoincidentConstraint(sketch, point.pointId, center.pointId);
  assert.deepEqual(constraint.references, [point, center]);
  const constrained = { ...sketch, geometricConstraints: { [constraint.id]: constraint }, geometricConstraintOrder: [constraint.id] };
  assert.equal(createCoincidentConstraint(constrained, point.pointId, center.pointId), null);
  const equations = geometricConstraintEquations(constrained, constraint);
  assert.equal(equations.length, 2);
  const rows = equations.map((equation) => constraintJacobianRow(constrained, equation, ['b-p1', 'center']));
  assert.deepEqual(rows, [[1, 0, -1, 0], [0, 1, 0, -1]]);
  const component = analyzeDrawingConstraints(constrained).componentByPointId.get('b-p1');
  assert.ok(component.pointIds.has('a-p1') && component.pointIds.has('a-p2'));
  assert.ok(component.scalarVariables.some(({ entityId, scalar }) => entityId === 'arc' && scalar === 'circular-radius'));
  assert.deepEqual(deriveSelectedCoincidentReferenceMarker(constrained, constraint.id), { constraintId: constraint.id, x: 5, y: 3.75 });
});

test('Line topology can share the Arc persistent center directly', () => {
  const source = base(), sourceSketch = source.sketches['sketch-1'];
  const document = { ...source, sketches: { ...source.sketches, 'sketch-1': { ...sourceSketch,
    points: { ...sourceSketch.points, center: { id: 'center', x: 5, y: 0 } },
    entities: { ...sourceSketch.entities, arc: { id: 'arc', type: 'arc', centerPointId: 'center', startPointId: 'a-p1', endPointId: 'a-p2', radius: 5, orientation: 'CCW' } },
    entityOrder: [...sourceSketch.entityOrder, 'arc'] } } };
  const appended = add(document, line('attached', { x: 5, y: 0 }, { x: 5, y: 10 }, 'center', 'attached-end'));
  const sketch = appended.sketches['sketch-1'], attached = sketch.entities.attached;
  assert.equal(attached.startPointId, 'center');
  assert.ok(sketch.points[attached.startPointId]);
  assert.equal(Object.values(sketch.geometricConstraints).length, 0, 'shared persistent identity needs no Coincidence record');
  assert.equal(Object.values(sketch.entities).filter(({ type }) => type === 'circle').length, 0);
  const deletedArc = removeLineAndOrphans(sketch, 'arc');
  assert.ok(deletedArc.points[attached.startPointId], 'entity-owned attached point survives Arc deletion');
  assert.equal(deletedArc.entities.attached.startPointId, 'center');
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

test('accepted finite Line-body acquisition appends solver-backed Coincident with direction intent in one transaction', () => {
  let document = add(createDrawingDocumentV2(), line('target', { x: 0, y: 0 }, { x: 40, y: 20 }));
  const before = document;
  const transaction = transactDrawingDocument(EMPTY_DRAWING_HISTORY, document, (current) => appendEntityToActiveSketch(current,
    line('authored', { x: 10, y: 30 }, { x: 20, y: 10 }, undefined, 'authored-end'),
    () => 'authored-start', null, 'target', null, null, { endLineId: 'target' }));
  document = transaction.document;
  const sketch = document.sketches['sketch-1'];
  assert.deepEqual(sketch.geometricConstraintOrder.map((id) => [sketch.geometricConstraints[id].kind, sketch.geometricConstraints[id].variant]),
    [['PERPENDICULAR', undefined], ['COINCIDENT', 'point-linear-support']]);
  const coincidence = sketch.geometricConstraints[sketch.geometricConstraintOrder[1]];
  assert.deepEqual(coincidence.references, [{ kind: 'sketchPoint', pointId: 'authored-end' }, { kind: 'entity', entityId: 'target' }]);
  assert.equal(geometricConstraintEquations(sketch, coincidence).length, 1);
  assert.deepEqual(undoDrawingDocument(transaction.history, document).document, before, 'one undo restores Line and both automatic relations');
});

test('a Line-body first click retains its semantic target until the Line transaction commits', () => {
  let document = add(createDrawingDocumentV2(), line('target', { x: 0, y: 0 }, { x: 40, y: 0 }));
  const first = applyResolvedProfileClick(EMPTY_PROFILE_INTERACTION, { x: 10, y: 0 }, () => 'unused', 'authored-start', 'target');
  assert.equal(first.interaction.startLineId, 'target');
  const second = applyResolvedProfileClick(first.interaction, { x: 10, y: 20 }, () => 'authored', 'authored-end', null);
  document = appendEntityToActiveSketch(document, second.entity, () => 'unused', null, null, null, null,
    { startLineId: first.interaction.startLineId });
  const sketch = document.sketches['sketch-1'];
  const coincidence = Object.values(sketch.geometricConstraints).find(({ kind }) => kind === 'COINCIDENT');
  assert.deepEqual(coincidence.references, [{ kind: 'sketchPoint', pointId: 'authored-start' }, { kind: 'entity', entityId: 'target' }]);
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

const matrixClose = (actual, expected, tolerance = 1e-6) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
const matrixCenterReference = { kind: 'sketchPoint', pointId: 'c' };
const matrixOriginReference = { kind: 'datum', datum: 'ORIGIN' };
const matrixArc = (document) => {
  const s = document.sketches[document.activeSketchId];
  return resolveArc(s, s.entities.arc);
};
const matrixAxisDimension = (id, axis, value, reference = matrixCenterReference) => ({
  id,
  kind: axis === 'x' ? 'HORIZONTAL_DISTANCE' : 'VERTICAL_DISTANCE',
  references: [matrixOriginReference, reference],
  value,
  role: 'driving',
  placement: { kind: 'linear', offset: 5 },
});
const matrixDocument = ({ radius = false, x = false, y = false, coincidence = true } = {}) => {
  const document = createDrawingDocumentV2(), s = document.sketches[document.activeSketchId];
  s.points.s = { id: 's', x: 0, y: 0 };
  s.points.e = { id: 'e', x: 10, y: 0 };
  s.points.c = { id: 'c', x: 5, y: 3.75 };
  s.entities.arc = { id: 'arc', type: 'arc', centerPointId: 'c', startPointId: 's', endPointId: 'e', radius: 6.25, orientation: 'CCW' };
  s.entityOrder = ['arc'];
  const center = matrixArc(document).center;
  if (radius) s.dimensions.radius = createCircularSizeDimension(s, 'arc', { x: 5, y: -20 }, 'radius');
  if (x) s.dimensions.cx = matrixAxisDimension('cx', 'x', center.x);
  if (y) s.dimensions.cy = matrixAxisDimension('cy', 'y', center.y);
  s.dimensionOrder = [radius && 'radius', x && 'cx', y && 'cy'].filter(Boolean);
  if (coincidence) {
    s.points.p = { id: 'p', x: center.x, y: center.y };
    s.entities.carrier = { id: 'carrier', type: 'line', startPointId: 'p', endPointId: 'q' };
    s.points.q = { id: 'q', x: center.x + 3, y: center.y + 4 };
    s.entityOrder.push('carrier');
    const relation = createCoincidentConstraint(s, 'p', 'c');
    assert.ok(relation);
    s.geometricConstraints[relation.id] = relation;
    s.geometricConstraintOrder = [relation.id];
  }
  return document;
};
const matrixAssertExact = (document) => {
  const s = document.sketches[document.activeSketchId], center = matrixArc(document).center;
  if (s.points.p) {
    matrixClose(s.points.p.x, center.x);
    matrixClose(s.points.p.y, center.y);
  }
  assert.ok(verifyDrawingConstraints(s, s.dimensionOrder, s.geometricConstraintOrder));
  assert.deepEqual(s.entities.arc, { id: 'arc', type: 'arc', centerPointId: 'c', startPointId: 's', endPointId: 'e', radius: s.entities.arc.radius, orientation: 'CCW' });
  assert.equal(Object.values(s.entities).some(({ type }) => type === 'circle'), false);
};

test('generic point intent reaches free poses, projects axis locks, and preserves point Coincidence', () => {
  const pointDocument = ({ x = false, y = false } = {}) => {
    const document = createDrawingDocumentV2(), s = document.sketches[document.activeSketchId];
    s.points.p = { id: 'p', x: 12, y: 8 };
    if (x) s.dimensions.px = matrixAxisDimension('px', 'x', 12, { kind: 'sketchPoint', pointId: 'p' });
    if (y) s.dimensions.py = matrixAxisDimension('py', 'y', 8, { kind: 'sketchPoint', pointId: 'p' });
    s.dimensionOrder = [x && 'px', y && 'py'].filter(Boolean);
    return document;
  };
  for (const [label, options, expected] of [
    ['free', {}, { x: 19, y: 14 }],
    ['X locked', { x: true }, { x: 12, y: 14 }],
    ['Y locked', { y: true }, { x: 19, y: 8 }],
    ['X and Y locked', { x: true, y: true }, { x: 12, y: 8 }],
  ]) {
    const document = pointDocument(options);
    const candidate = solveDrawingDragCandidate(document, { kind: 'point', pointId: 'p' }, { x: 7, y: 6 });
    assert.ok(candidate, `${label}: drag returns a candidate`);
    const point = candidate.sketches[candidate.activeSketchId].points.p;
    matrixClose(point.x, expected.x); matrixClose(point.y, expected.y);
    assert.ok(verifyDrawingConstraints(candidate.sketches[candidate.activeSketchId],
      candidate.sketches[candidate.activeSketchId].dimensionOrder, []));
  }

  const coincident = pointDocument({ x: true }), s = coincident.sketches[coincident.activeSketchId];
  s.points.q = { id: 'q', x: 12, y: 8 };
  const relation = createCoincidentConstraint(s, 'p', 'q'); assert.ok(relation);
  s.geometricConstraints[relation.id] = relation; s.geometricConstraintOrder = [relation.id];
  const candidate = solveDrawingDragCandidate(coincident, { kind: 'point', pointId: 'q' }, { x: 7, y: 6 });
  assert.ok(candidate, 'partially locked point pair returns a candidate');
  const after = candidate.sketches[candidate.activeSketchId];
  matrixClose(after.points.p.x, 12); matrixClose(after.points.q.x, 12);
  matrixClose(after.points.p.y, 14); matrixClose(after.points.q.y, 14);
  assert.ok(verifyDrawingConstraints(after, after.dimensionOrder, after.geometricConstraintOrder));
});

test('Arc center dimension/Coincidence matrix has rank-based DOF and remains referenceable', () => {
  const cases = [
    ['free', {}, 4, 5],
    ['R', { radius: true }, 5, 4],
    ['center X', { x: true }, 5, 4],
    ['center X + Y', { x: true, y: true }, 6, 3],
    ['R + center X', { radius: true, x: true }, 6, 3],
    ['R + center X + Y', { radius: true, x: true, y: true }, 7, 2],
  ];
  for (const [label, options, rank, degreesOfFreedom] of cases) {
    const document = matrixDocument(options), s = document.sketches[document.activeSketchId];
    const component = analyzeDrawingConstraints(s).componentByPointId.get('p');
    assert.equal(component.constraintRank, rank, `${label}: independent Jacobian rank`);
    assert.equal(component.degreesOfFreedom, degreesOfFreedom, `${label}: canonical component DOF`);
    const semantic = collectDrawingAuthoringPoints(s).find(({ id }) => id === 'c');
    assert.deepEqual(semantic.reference, matrixCenterReference, `${label}: semantic identity is independent of mobility`);
    assert.deepEqual(s.geometricConstraints[s.geometricConstraintOrder[0]].references,
      [matrixCenterReference, { kind: 'sketchPoint', pointId: 'p' }]);
    matrixAssertExact(document);
    assert.deepEqual(Object.keys(s.points).sort(), ['c', 'e', 'p', 'q', 's'], `${label}: center is persistent topology`);
  }
});

test('radius edits retain the fixed persistent center and Coincidence', () => {
  let document = matrixDocument({ radius: true, x: true, y: true }), before = matrixArc(document);
  let result = solveDrawingDimensionEdit({ document, dimensionId: 'radius', targetValue: 60 });
  assert.equal(result.ok, true); document = result.document;
  matrixClose(matrixArc(document).radius, 60);
  matrixClose(matrixArc(document).center.x, before.center.x); matrixClose(matrixArc(document).center.y, before.center.y);
  matrixAssertExact(document);
});

test('redundant endpoint dimension becomes reference and conflicting hard edit fails closed', () => {
  let document = matrixDocument({ x: true }), s = document.sketches[document.activeSketchId];
  const beforeRank = analyzeDrawingConstraints(s).componentByPointId.get('p').constraintRank;
  const point = { kind: 'sketchPoint', pointId: 'p' }, p = resolveDrawingPointReference(s, point), origin = resolveDrawingPointReference(s, matrixOriginReference);
  document = appendDimension(document, createPointToPointDimension([matrixOriginReference, point], origin, p,
    'HORIZONTAL_DISTANCE', { x: p.x, y: p.y + 5 }, 'px'));
  s = document.sketches[document.activeSketchId];
  assert.equal(s.dimensions.px.role, 'reference');
  assert.equal(analyzeDrawingConstraints(s).componentByPointId.get('p').constraintRank, beforeRank);
  assert.ok(verifyDrawingConstraints(s, ['cx'], s.geometricConstraintOrder));

  const valid = matrixDocument({ x: true }); s = valid.sketches[valid.activeSketchId];
  s.dimensions.px = { ...matrixAxisDimension('px', 'x', s.points.p.x, { kind: 'sketchPoint', pointId: 'p' }), role: 'driving' };
  s.dimensionOrder.push('px');
  assert.ok(verifyDrawingConstraints(s, s.dimensionOrder, s.geometricConstraintOrder));
  const result = solveDrawingDimensionEdit({ document: valid, dimensionId: 'px', targetValue: s.points.p.x + 10 });
  assert.equal(result.ok, false);
  assert.deepEqual(valid.sketches[valid.activeSketchId].geometricConstraintOrder, s.geometricConstraintOrder);
  assert.equal(valid.sketches[valid.activeSketchId].dimensions.cx.role, 'driving');
  matrixAssertExact(valid);
});
