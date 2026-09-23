import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createDrawingDocumentV2 } from '../.test-build/drawing-circle-direct-manipulation/drawingTypes.js';
import { analyzeDrawingConstraints, analyzeDrawingEntityMobility, constraintJacobianRow, geometricConstraintEquation } from '../.test-build/drawing-circle-direct-manipulation/drawingConstraintAnalysis.js';
import { solveDrawingVariableTarget, verifyDrawingConstraints } from '../.test-build/drawing-circle-direct-manipulation/drawingConstraintSolver.js';
import { createCircleRadiusDragTarget, solveDrawingDragCandidate } from '../.test-build/drawing-circle-direct-manipulation/drawingDirectManipulation.js';
import { circleRadiusSolverVariable, drawingSolverVariableKey, readDrawingSolverVariable, writeDrawingSolverVariable } from '../.test-build/drawing-circle-direct-manipulation/drawingSolverVariables.js';
import { EMPTY_DRAWING_HISTORY, redoDrawingDocument, transactDrawingDocument, undoDrawingDocument } from '../.test-build/drawing-circle-direct-manipulation/drawingHistory.js';

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
  const redone = redoDrawingDocument(undone.history, undone.document); assert.equal(radius(redone.document), 15);
  assert.equal(transactDrawingDocument(EMPTY_DRAWING_HISTORY, document, value => value).history.undo.length, 0);
});

test('workspace routes center before body and shares threshold/cancel/history lifecycle', () => {
  const source = fs.readFileSync('src/app/DrawingWorkspace.tsx', 'utf8');
  assert.match(source, /circleHit = !explicitPointId && !explicitLineId/);
  assert.match(source, /createCircleRadiusDragTarget\(documentRef\.current, circleId, startModel\)/);
  assert.match(source, /DRAWING_DRAG_THRESHOLD_PX/);
  assert.match(source, /candidate: candidate \?\? geometryDrag\.candidate/);
  assert.match(source, /if \(geometryDrag\) \{ cancelGeometryDrag\(\); return; \}/);
  assert.match(source, /onPointerCancel=.*cancelGeometryDrag\(event\.pointerId\)/s);
  assert.match(source, /onLostPointerCapture=.*cancelGeometryDrag\(event\.pointerId\)/s);
  assert.match(source, /session\.exceeded && session\.candidate !== session\.startDocument/);
});
