import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createDrawingDocumentV2 } from '../.test-build/drawing-circle-direct-manipulation/drawingTypes.js';
import { analyzeDrawingConstraints, analyzeDrawingEntityMobility, constraintJacobianRow, geometricConstraintEquation } from '../.test-build/drawing-circle-direct-manipulation/drawingConstraintAnalysis.js';
import { solveDrawingVariableTarget, solveDrawingVariableTargets, verifyDrawingConstraints } from '../.test-build/drawing-circle-direct-manipulation/drawingConstraintSolver.js';
import { createCircleRadiusDragTarget, solveDrawingDragCandidate } from '../.test-build/drawing-circle-direct-manipulation/drawingDirectManipulation.js';
import { circleRadiusSolverVariable, drawingSolverVariableKey, pointSolverVariables, readDrawingSolverVariable, writeDrawingSolverVariable } from '../.test-build/drawing-circle-direct-manipulation/drawingSolverVariables.js';
import { EMPTY_DRAWING_HISTORY, redoDrawingDocument, transactDrawingDocument, undoDrawingDocument } from '../.test-build/drawing-circle-direct-manipulation/drawingHistory.js';
import { createCircularSizeDimension } from '../.test-build/drawing-circle-direct-manipulation/drawingDimension.js';

const make = (constrained = false) => {
  const document = createDrawingDocumentV2(), sketch = document.sketches[document.activeSketchId];
  sketch.points.center = { id: 'center', x: 2, y: 3 };
  sketch.points.q = { id: 'q', x: 12, y: 3 };
  sketch.entities.circle = { id: 'circle', type: 'circle', centerPointId: 'center', radius: 10 };
  sketch.entityOrder = ['circle'];
  if (constrained) {
    sketch.geometricConstraints.on = { id: 'on', kind: 'COINCIDENT', variant: 'point-curve', references: [{ kind: 'sketchPoint', pointId: 'q' }, { kind: 'entity', entityId: 'circle' }] };
    sketch.geometricConstraintOrder = ['on'];
  }
  return document;
};

const radius = document => document.sketches[document.activeSketchId].entities.circle.radius;
const close = (a, b, tolerance = 1e-8) => assert.ok(Math.abs(a - b) <= tolerance, `${a} != ${b}`);
const axisDimension = (id, pointId, axis, value) => ({ id, kind: axis === 'x' ? 'HORIZONTAL_DISTANCE' : 'VERTICAL_DISTANCE',
  references: [{ kind: 'datum', datum: 'ORIGIN' }, { kind: 'sketchPoint', pointId }], value, role: 'driving', placement: { kind: 'linear', offset: 5 } });

test('circle radius is a stable shared scalar with immutable validated writes', () => {
  const document = make(), sketch = document.sketches[document.activeSketchId], variable = circleRadiusSolverVariable('circle');
  assert.equal(drawingSolverVariableKey(variable), 'entity:circle:circle-radius');
  assert.equal(readDrawingSolverVariable(sketch, variable), 10);
  const changed = writeDrawingSolverVariable(sketch, variable, 14);
  assert.ok(changed); assert.notEqual(changed, sketch); assert.equal(sketch.entities.circle.radius, 10);
  assert.deepEqual(changed.entities.circle, { id: 'circle', type: 'circle', centerPointId: 'center', radius: 14 });
  for (const invalid of [NaN, Infinity, 0, -1, 1e-10]) assert.equal(writeDrawingSolverVariable(sketch, variable, invalid), null);
});

test('circle scalar belongs to rank component and point-on-circle Jacobian', () => {
  const document = make(true), sketch = document.sketches[document.activeSketchId], variable = circleRadiusSolverVariable('circle');
  const equation = geometricConstraintEquation(sketch, sketch.geometricConstraints.on); assert.ok(equation);
  assert.deepEqual(equation.scalarVariables, [variable]);
  const component = analyzeDrawingConstraints(sketch).componentByVariableKey.get(drawingSolverVariableKey(variable));
  assert.ok(component); assert.deepEqual([...component.pointIds].sort(), ['center', 'q']); assert.equal(component.variableCount, 5); assert.equal(component.constraintRank, 1);
  const row = constraintJacobianRow(sketch, equation, ['q', 'center'], [variable]);
  assert.deepEqual(row, [1, 0, -1, 0, -1]);
  const free = analyzeDrawingEntityMobility(make().sketches[document.activeSketchId], 'circle');
  assert.deepEqual(free, { unconstrainedDegreesOfFreedom: 3, degreesOfFreedom: 3 });
});

test('direct scalar target projects connected point while preserving hard equation', () => {
  const document = make(true), sketch = document.sketches[document.activeSketchId];
  const solved = solveDrawingVariableTarget(sketch, { variable: circleRadiusSolverVariable('circle'), value: 15 });
  assert.ok(solved); assert.equal(solved.entities.circle.radius, 15);
  assert.ok(verifyDrawingConstraints(solved, [], ['on'])); assert.ok(Math.abs(Math.hypot(solved.points.q.x - solved.points.center.x, solved.points.q.y - solved.points.center.y) - 15) < 1e-7);
});

test('point targets and Circle radius participate in one candidate-document solve', () => {
  const document = make(true), sketch = document.sketches[document.activeSketchId];
  const solved = solveDrawingVariableTargets(sketch, [
    { variable: pointSolverVariables('q')[0], value: 17 },
    { variable: pointSolverVariables('q')[1], value: 4 },
  ]);
  assert.ok(solved); assert.equal(solved.points.q.x, 17); assert.equal(solved.points.q.y, 4);
  assert.notEqual(solved.entities.circle.radius, 10);
  assert.ok(verifyDrawingConstraints(solved, [], ['on']));
  const impossible = solveDrawingVariableTargets(sketch, [
    { variable: pointSolverVariables('q')[0], value: 2 },
    { variable: pointSolverVariables('q')[1], value: 3 },
    { variable: pointSolverVariables('center')[0], value: 2 },
    { variable: pointSolverVariables('center')[1], value: 3 },
  ]);
  assert.equal(impossible, null, 'invalid zero-radius or hard-residual candidates must not be accepted');
});

test('circumference mapping has no jump and always derives from start document', () => {
  const document = make();
  for (const downX of [11, 13]) {
    const start = { x: downX, y: 3 }, target = createCircleRadiusDragTarget(document, 'circle', start); assert.ok(target);
    assert.equal(radius(solveDrawingDragCandidate(document, target, { x: 0, y: 0 }, start)), 10);
    assert.equal(radius(solveDrawingDragCandidate(document, target, { x: 4, y: 0 }, start)), 14);
    assert.equal(radius(solveDrawingDragCandidate(document, target, { x: -4, y: 0 }, start)), 6);
    const far = solveDrawingDragCandidate(document, target, { x: 4, y: 0 }, start);
    const nearer = solveDrawingDragCandidate(document, target, { x: 2, y: 0 }, start);
    assert.equal(radius(far), 14); assert.equal(radius(nearer), 12);
    assert.deepEqual(nearer.sketches[nearer.activeSketchId].points.center, { id: 'center', x: 2, y: 3 });
    assert.equal(nearer.sketches[nearer.activeSketchId].entities.circle.centerPointId, 'center');
  }
});

test('invalid drag candidate can be retained and one completed change round-trips History', () => {
  const document = make(), start = { x: 12, y: 3 }, target = createCircleRadiusDragTarget(document, 'circle', start);
  assert.equal(solveDrawingDragCandidate(document, target, { x: -10, y: 0 }, start), null);
  const candidate = solveDrawingDragCandidate(document, target, { x: 5, y: 0 }, start); assert.ok(candidate);
  const tx = transactDrawingDocument(EMPTY_DRAWING_HISTORY, document, () => candidate); assert.equal(tx.history.undo.length, 1);
  const undone = undoDrawingDocument(tx.history, tx.document); assert.equal(radius(undone.document), 10);
  const redone = redoDrawingDocument(undone.history, undone.document); assert.ok(Math.abs(radius(redone.document) - 15) < 1e-9);
  assert.equal(transactDrawingDocument(EMPTY_DRAWING_HISTORY, document, value => value).history.undo.length, 0);
});

test('diameter-constrained circumference grab uses remaining center freedom', () => {
  const document = make(), s = document.sketches[document.activeSketchId];
  s.dimensions.diameter = createCircularSizeDimension(s, 'circle', { x: 12, y: 8 }, 'diameter'); s.dimensionOrder = ['diameter'];
  const pointer = { x: 12, y: 3 }, target = createCircleRadiusDragTarget(document, 'circle', pointer);
  const candidate = solveDrawingDragCandidate(document, target, { x: 4, y: 5 }, pointer); assert.ok(candidate);
  assert.ok(verifyDrawingConstraints(candidate.sketches[candidate.activeSketchId], ['diameter'], []));
  assert.ok(Math.abs(radius(candidate) - 10) < 1e-7);
  assert.ok(Math.hypot(candidate.sketches[candidate.activeSketchId].points.center.x - 6,
    candidate.sketches[candidate.activeSketchId].points.center.y - 8) < 1e-3);
});

test('circle body projects onto the one remaining axis and becomes a no-op at zero mobility', () => {
  const document = make(), s = document.sketches[document.activeSketchId];
  s.dimensions.diameter = createCircularSizeDimension(s, 'circle', { x: 12, y: 8 }, 'diameter');
  s.dimensions.centerX = axisDimension('centerX', 'center', 'x', 2); s.dimensionOrder = ['diameter', 'centerX'];
  const pointer = { x: 12, y: 3 }, target = createCircleRadiusDragTarget(document, 'circle', pointer);
  const yOnly = solveDrawingDragCandidate(document, target, { x: 4, y: 5 }, pointer); assert.ok(yOnly);
  assert.ok(verifyDrawingConstraints(yOnly.sketches[yOnly.activeSketchId], ['diameter', 'centerX'], []));
  close(yOnly.sketches[yOnly.activeSketchId].points.center.x, 2); assert.ok(yOnly.sketches[yOnly.activeSketchId].points.center.y > 7.9);
  s.dimensions.centerY = axisDimension('centerY', 'center', 'y', 3); s.dimensionOrder.push('centerY');
  const fixed = solveDrawingDragCandidate(document, target, { x: 4, y: 5 }, pointer); assert.ok(fixed);
  assert.equal(fixed, document, 'zero interaction mobility retains the drag-start document for History no-op semantics');
  assert.ok(Math.hypot(fixed.sketches[fixed.activeSketchId].points.center.x - 2, fixed.sketches[fixed.activeSketchId].points.center.y - 3) < 1e-7);
  assert.ok(Math.abs(radius(fixed) - 10) < 1e-7);
});

test('workspace routes center before body and shares threshold/cancel/history lifecycle', () => {
  const source = fs.readFileSync('src/app/DrawingWorkspace.tsx', 'utf8');
  const arbitration = fs.readFileSync('src/app/drawingPointerArbitration.ts', 'utf8');
  assert.match(source, /resolveDrawingPointerOwner/);
  assert.match(arbitration, /createCircleRadiusDragTarget\(document, entity\.id, pointer\)/);
  assert.match(source, /DRAWING_DRAG_THRESHOLD_PX/);
  assert.match(source, /candidate: candidate \?\? geometryDrag\.candidate/);
  assert.match(source, /if \(geometryDrag\) \{ cancelGeometryDrag\(\); return; \}/);
  assert.match(source, /onPointerCancel=.*cancelGeometryDrag\(event\.pointerId\)/s);
  assert.match(source, /onLostPointerCapture=.*cancelGeometryDrag\(event\.pointerId\)/s);
  assert.match(source, /session\.exceeded && session\.candidate !== session\.startDocument/);
});
