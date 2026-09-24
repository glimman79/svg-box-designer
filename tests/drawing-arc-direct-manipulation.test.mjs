import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createDrawingDocumentV2 } from '../.test-build/drawing-arc-direct-manipulation/drawingTypes.js';
import { finiteArcConstraintResidual, resolveArcFromBulge } from '../.test-build/drawing-arc-direct-manipulation/drawingArcGeometry.js';
import { createArcBulgeDragTarget, createArcCenterDragTarget, createArcEndpointDragTarget, resolveArcEndpointOwner, solveDrawingDragCandidate } from '../.test-build/drawing-arc-direct-manipulation/drawingDirectManipulation.js';
import { verifyDrawingConstraints } from '../.test-build/drawing-arc-direct-manipulation/drawingConstraintSolver.js';
import { EMPTY_DRAWING_HISTORY, redoDrawingDocument, transactDrawingDocument, undoDrawingDocument } from '../.test-build/drawing-arc-direct-manipulation/drawingHistory.js';

const make = (bulge = 0.5) => {
  const document = createDrawingDocumentV2(), sketch = document.sketches[document.activeSketchId];
  sketch.points.s = { id: 's', x: 0, y: 0 };
  sketch.points.e = { id: 'e', x: 10, y: 0 };
  sketch.entities.arc = { id: 'arc', type: 'arc', startPointId: 's', endPointId: 'e', bulge };
  sketch.entityOrder = ['arc'];
  return document;
};
const sketch = d => d.sketches[d.activeSketchId];
const entity = d => sketch(d).entities.arc;
const resolved = d => resolveArcFromBulge(entity(d), sketch(d).points.s, sketch(d).points.e);
const midpoint = arc => ({ x: arc.center.x + arc.radius * Math.cos(arc.startAngle + arc.signedSweep / 2), y: arc.center.y + arc.radius * Math.sin(arc.startAngle + arc.signedSweep / 2) });
const close = (a, b, tolerance = 1e-8) => assert.ok(Math.abs(a - b) <= tolerance, `${a} != ${b}`);

test('derived Arc center resolves to rigid authoritative endpoints without creating topology', () => {
  const document = make(), before = resolved(document), target = createArcCenterDragTarget(document, 'arc');
  assert.deepEqual(target, { kind: 'rigid-translation', entityId: 'arc', pointIds: ['s', 'e'], preservedScalar: 'arc-bulge' });
  assert.deepEqual(Object.keys(sketch(document).points).sort(), ['e', 's']);
  const candidate = solveDrawingDragCandidate(document, target, { x: 3, y: -4 });
  assert.deepEqual(sketch(candidate).points.s, { id: 's', x: 3, y: -4 });
  assert.deepEqual(sketch(candidate).points.e, { id: 'e', x: 13, y: -4 });
  assert.equal(entity(candidate).bulge, entity(document).bulge);
  assert.deepEqual(entity(candidate), { id: 'arc', type: 'arc', startPointId: 's', endPointId: 'e', bulge: 0.5 });
  close(resolved(candidate).center.x, before.center.x + 3); close(resolved(candidate).center.y, before.center.y - 4);
  close(resolved(candidate).radius, before.radius); close(resolved(candidate).signedSweep, before.signedSweep);
});

test('either free endpoint follows the pointer while its pivot stays and form changes', () => {
  for (const [draggedId, pivotId, delta] of [['s', 'e', { x: -2, y: 3 }], ['e', 's', { x: 2, y: 3 }]]) {
    const document = make(), before = resolved(document);
    const target = createArcEndpointDragTarget(document, 'arc', draggedId);
    assert.ok(target); assert.equal(target.pivotPointId, pivotId);
    const candidate = solveDrawingDragCandidate(document, target, delta);
    assert.ok(candidate);
    close(sketch(candidate).points[draggedId].x, sketch(document).points[draggedId].x + delta.x);
    close(sketch(candidate).points[draggedId].y, sketch(document).points[draggedId].y + delta.y);
    assert.deepEqual(sketch(candidate).points[pivotId], sketch(document).points[pivotId]);
    assert.notEqual(entity(candidate).bulge, entity(document).bulge);
    const after = resolved(candidate); assert.ok(after);
    assert.notEqual(after.center.x, before.center.x); assert.notEqual(after.center.y, before.center.y);
    assert.notEqual(after.radius, before.radius); assert.notEqual(after.signedSweep, before.signedSweep);
    assert.deepEqual(entity(candidate), { id: 'arc', type: 'arc', startPointId: 's', endPointId: 'e', bulge: entity(candidate).bulge });
    assert.deepEqual(Object.keys(sketch(candidate).points).sort(), ['e', 's']);
  }
});

test('endpoint form anchor is transient, gives identity at pointer-down, and supports both branches', () => {
  for (const bulge of [.5, -.5, 2, -2, 1, -1]) {
    const document = make(bulge), target = createArcEndpointDragTarget(document, 'arc', 'e');
    assert.ok(target); assert.deepEqual(solveDrawingDragCandidate(document, target, { x: 0, y: 0 }), document);
    const candidate = solveDrawingDragCandidate(document, target, { x: 0.25, y: Math.sign(bulge) * .15 });
    assert.ok(candidate); assert.equal(Math.sign(entity(candidate).bulge), Math.sign(bulge));
    assert.equal('formAnchor' in entity(candidate), false);
    assert.equal(Object.values(sketch(candidate).geometricConstraints).length, 0);
  }
});

test('endpoint rejects zero chord and straight-branch crossing so caller can retain last valid', () => {
  const document = make(), target = createArcEndpointDragTarget(document, 'arc', 's');
  const valid = solveDrawingDragCandidate(document, target, { x: 1, y: 1 }); assert.ok(valid);
  assert.equal(solveDrawingDragCandidate(document, target, { x: 10, y: 0 }), null);
  assert.equal(solveDrawingDragCandidate(document, target, { x: -10, y: -30 }), null);
  assert.ok(entity(valid).bulge > 0);
});

test('endpoint ownership is unique, selected-context disambiguated, and never iteration-ordered', () => {
  const document = make(), s = sketch(document);
  assert.equal(resolveArcEndpointOwner(document, 's', []), 'arc');
  s.entities.arc2 = { id: 'arc2', type: 'arc', startPointId: 's', endPointId: 'e', bulge: -0.5 };
  s.entityOrder.push('arc2');
  assert.equal(resolveArcEndpointOwner(document, 's', []), null);
  assert.equal(resolveArcEndpointOwner(document, 's', ['arc2']), 'arc2');
  assert.equal(resolveArcEndpointOwner(document, 's', ['arc', 'arc2']), null);
});

test('endpoint keeps shared point identity and hard horizontal constraint authoritative', () => {
  const document = make(), s = sketch(document);
  s.points.other = { id: 'other', x: -5, y: 0 };
  s.entities.line = { id: 'line', type: 'line', startPointId: 'other', endPointId: 's' };
  s.entityOrder.unshift('line');
  s.geometricConstraints.horizontal = { id: 'horizontal', kind: 'HORIZONTAL', references: [{ kind: 'entity', entityId: 'line' }] };
  s.geometricConstraintOrder = ['horizontal'];
  const target = createArcEndpointDragTarget(document, 'arc', 's');
  const candidate = solveDrawingDragCandidate(document, target, { x: -2, y: 3 });
  assert.ok(candidate); assert.equal(sketch(candidate).entities.line.endPointId, 's');
  close(sketch(candidate).points.s.y, sketch(candidate).points.other.y);
  assert.ok(verifyDrawingConstraints(sketch(candidate), [], ['horizontal']));
});

test('endpoint bulge participates in a connected Point-on-Arc solve', () => {
  const document = make(), s = sketch(document), q = midpoint(resolved(document));
  s.points.p = { id: 'p', ...q };
  s.geometricConstraints.on = { id: 'on', kind: 'COINCIDENT', variant: 'point-curve', references: [{ kind: 'sketchPoint', pointId: 'p' }, { kind: 'entity', entityId: 'arc' }] };
  s.geometricConstraintOrder = ['on'];
  const target = createArcEndpointDragTarget(document, 'arc', 'e');
  const candidate = solveDrawingDragCandidate(document, target, { x: 4, y: -2 });
  assert.ok(candidate); assert.notEqual(entity(candidate).bulge, .5);
  assert.ok(verifyDrawingConstraints(sketch(candidate), [], ['on']));
});

test('center candidate always derives from drag-start and preserves shared endpoint identity', () => {
  const document = make(), s = sketch(document);
  s.points.other = { id: 'other', x: -5, y: 0 };
  s.entities.line = { id: 'line', type: 'line', startPointId: 'other', endPointId: 's' };
  s.entityOrder.unshift('line');
  const target = createArcCenterDragTarget(document, 'arc');
  const far = solveDrawingDragCandidate(document, target, { x: 8, y: 1 });
  const near = solveDrawingDragCandidate(document, target, { x: 2, y: 1 });
  assert.equal(sketch(near).points.s.x, 2); assert.equal(sketch(far).points.s.x, 8);
  assert.equal(sketch(near).entities.line.endPointId, 's'); assert.equal(entity(near).startPointId, 's');
  assert.equal(Object.keys(sketch(near).points).length, 3);
});

test('finite body grab stores exact projected Q0 and has no initial form jump', () => {
  const document = make(), arc = resolved(document), q0 = midpoint(arc), pointer = { x: q0.x + 0.35, y: q0.y - 0.2 };
  const target = createArcBulgeDragTarget(document, 'arc', pointer); assert.ok(target);
  const exactGrab = { x: pointer.x - target.formGrabOffset.x, y: pointer.y - target.formGrabOffset.y };
  close(Math.hypot(exactGrab.x - arc.center.x, exactGrab.y - arc.center.y), arc.radius);
  assert.ok(Math.hypot(target.formGrabOffset.x, target.formGrabOffset.y) < Math.hypot(pointer.x - arc.start.x, pointer.y - arc.start.y));
  const unchanged = solveDrawingDragCandidate(document, target, { x: 0, y: 0 }, pointer);
  assert.equal(entity(unchanged).bulge, 0.5);
  assert.deepEqual(sketch(unchanged).points.s, sketch(document).points.s);
  assert.deepEqual(sketch(unchanged).points.e, sketch(document).points.e);
});

test('body drag changes only canonical bulge and can increase or decrease derived radius', () => {
  const document = make(), q = midpoint(resolved(document)), target = createArcBulgeDragTarget(document, 'arc', q);
  const outward = solveDrawingDragCandidate(document, target, { x: 0, y: 1 }, q);
  const inward = solveDrawingDragCandidate(document, target, { x: 0, y: -1 }, q);
  assert.ok(entity(outward).bulge !== 0.5); assert.ok(entity(inward).bulge !== 0.5);
  assert.ok(resolved(outward).radius > resolved(document).radius);
  assert.ok(resolved(inward).radius < resolved(document).radius);
  for (const candidate of [outward, inward]) {
    assert.deepEqual(sketch(candidate).points.s, { id: 's', x: 0, y: 0 });
    assert.deepEqual(sketch(candidate).points.e, { id: 'e', x: 10, y: 0 });
    assert.equal(entity(candidate).id, 'arc'); assert.equal(entity(candidate).startPointId, 's'); assert.equal(entity(candidate).endPointId, 'e');
    assert.equal('radius' in entity(candidate), false); assert.equal('center' in entity(candidate), false);
  }
});

test('body frames derive from start state and preserve minor, major, signs, and semicircle', () => {
  for (const bulge of [0.5, -0.5, 1, -1, 2, -2]) {
    const document = make(bulge), q = midpoint(resolved(document)), target = createArcBulgeDragTarget(document, 'arc', q);
    const direction = Math.sign(q.y) || -Math.sign(bulge);
    const first = solveDrawingDragCandidate(document, target, { x: 0, y: direction * 0.4 }, q);
    const second = solveDrawingDragCandidate(document, target, { x: 0, y: direction * 0.2 }, q);
    assert.ok(first); assert.ok(second); assert.equal(Math.sign(entity(second).bulge), Math.sign(bulge));
    if (Math.abs(bulge) !== 1) assert.equal(Math.abs(entity(second).bulge) > 1, Math.abs(bulge) > 1);
    assert.ok(Math.abs(entity(first).bulge - entity(second).bulge) > 1e-5);
  }
});

test('singular chord contact and chord crossing retain the caller last-valid candidate', () => {
  const document = make(), q = midpoint(resolved(document)), target = createArcBulgeDragTarget(document, 'arc', q);
  const valid = solveDrawingDragCandidate(document, target, { x: 0, y: 1 }, q); assert.ok(valid);
  assert.equal(solveDrawingDragCandidate(document, target, { x: 0, y: -q.y }, q), null);
  assert.equal(solveDrawingDragCandidate(document, target, { x: 0, y: -q.y + 0.5 }, q), null);
  assert.equal(entity(valid).bulge > 0, true);
});

test('point-on-Arc remains a finite directed-domain equation while bulge is targeted', () => {
  const document = make(), s = sketch(document), arc = resolved(document), q = midpoint(arc);
  s.points.p = { id: 'p', ...q };
  s.geometricConstraints.on = { id: 'on', kind: 'COINCIDENT', variant: 'point-curve', references: [{ kind: 'sketchPoint', pointId: 'p' }, { kind: 'entity', entityId: 'arc' }] };
  s.geometricConstraintOrder = ['on'];
  const target = createArcBulgeDragTarget(document, 'arc', q), candidate = solveDrawingDragCandidate(document, target, { x: 0, y: -1 }, q);
  assert.ok(candidate); assert.ok(verifyDrawingConstraints(sketch(candidate), [], ['on']));
  const changed = resolved(candidate), outside = { x: changed.center.x + changed.radius * Math.cos(changed.startAngle + changed.signedSweep + Math.sign(changed.signedSweep) * 0.5), y: changed.center.y + changed.radius * Math.sin(changed.startAngle + changed.signedSweep + Math.sign(changed.signedSweep) * 0.5) };
  assert.ok(Math.abs(finiteArcConstraintResidual(outside, entity(candidate), sketch(candidate).points.s, sketch(candidate).points.e)) > 1e-3);
});

test('one completed Arc candidate round-trips one History transaction', () => {
  const document = make(), q = midpoint(resolved(document)), target = createArcBulgeDragTarget(document, 'arc', q);
  const candidate = solveDrawingDragCandidate(document, target, { x: 0, y: -1 }, q), tx = transactDrawingDocument(EMPTY_DRAWING_HISTORY, document, () => candidate);
  assert.equal(tx.history.undo.length, 1);
  const undone = undoDrawingDocument(tx.history, tx.document); assert.equal(entity(undone.document).bulge, 0.5);
  const redone = redoDrawingDocument(undone.history, undone.document); assert.equal(entity(redone.document).bulge, entity(candidate).bulge);
  assert.equal(transactDrawingDocument(EMPTY_DRAWING_HISTORY, document, value => value).history.undo.length, 0);
});

test('workspace gives Points then derived center then finite body the shared lifecycle', () => {
  const source = fs.readFileSync('src/app/DrawingWorkspace.tsx', 'utf8');
  assert.match(source, /key={`center-hit:[\s\S]*data-sketch-arc-center-id[\s\S]*Object\.values\(activeSketch\.points\)/);
  assert.match(source, /explicitArcCenterId\s*\? createArcCenterDragTarget/);
  assert.match(source, /createArcBulgeDragTarget\(documentRef\.current, arcId, startModel\)/);
  assert.match(source, /distanceToArc\(startModel, arc\)/);
  assert.match(source, /DRAWING_DRAG_THRESHOLD_PX/);
  assert.match(source, /candidate: candidate \?\? geometryDrag\.candidate/);
  assert.match(source, /onPointerCancel=.*cancelGeometryDrag\(event\.pointerId\)/s);
  assert.match(source, /onLostPointerCapture=.*cancelGeometryDrag\(event\.pointerId\)/s);
  assert.match(source, /className="drawing-authoring-reference".*pointerEvents="none"/s);
  assert.match(source, /activeArcBodyDragId/);
  assert.match(source, /resolveArcEndpointOwner\(documentRef\.current, explicitPointId, selectedEntityIds\)/);
  assert.match(source, /createArcEndpointDragTarget\(documentRef\.current, arcId, explicitPointId\)/);
  assert.match(source, /activeArcSupportDragId/);
});
