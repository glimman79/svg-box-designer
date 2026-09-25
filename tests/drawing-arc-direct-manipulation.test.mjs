import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createDrawingDocumentV2 } from '../.test-build/drawing-arc-direct-manipulation/drawingTypes.js';
import { finiteArcConstraintResidual, resolveArcFromBulge } from '../.test-build/drawing-arc-direct-manipulation/drawingArcGeometry.js';
import { createArcRadiusDragTarget, createArcCenterDragTarget, createArcEndpointDragTarget, resolveArcEndpointOwner, solveDrawingDragCandidate } from '../.test-build/drawing-arc-direct-manipulation/drawingDirectManipulation.js';
import { verifyDrawingConstraints } from '../.test-build/drawing-arc-direct-manipulation/drawingConstraintSolver.js';
import { createCircularSizeDimension } from '../.test-build/drawing-arc-direct-manipulation/drawingDimension.js';
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

test('endpoint target has no form anchor, gives identity at pointer-down, and supports both orientation branches', () => {
  for (const bulge of [.5, -.5, 2, -2, 1, -1]) {
    const document = make(bulge), target = createArcEndpointDragTarget(document, 'arc', 'e');
    assert.ok(target); assert.deepEqual(solveDrawingDragCandidate(document, target, { x: 0, y: 0 }), document);
    const candidate = solveDrawingDragCandidate(document, target, { x: 0.25, y: Math.sign(bulge) * .15 });
    assert.ok(candidate); assert.equal(Math.sign(entity(candidate).bulge), Math.sign(bulge));
    assert.equal('formAnchor' in target, false); assert.equal('formAnchor' in entity(candidate), false);
    assert.equal(Object.values(sketch(candidate).geometricConstraints).length, 0);
  }
});

test('endpoint rejects only chord collapse and remains valid across the former anchor half-plane', () => {
  const document = make(), target = createArcEndpointDragTarget(document, 'arc', 's');
  const valid = solveDrawingDragCandidate(document, target, { x: 1, y: 1 }); assert.ok(valid);
  assert.equal(solveDrawingDragCandidate(document, target, { x: 10, y: 0 }), null);
  const crossing = solveDrawingDragCandidate(document, target, { x: -10, y: -30 }); assert.ok(crossing);
  assert.deepEqual(sketch(crossing).points.s, { id: 's', x: -10, y: -30 });
  assert.deepEqual(sketch(crossing).points.e, sketch(document).points.e);
  assert.ok(entity(valid).bulge > 0); assert.ok(entity(crossing).bulge > 0);
});

test('free endpoint reaches all quadrants, far chords, and short nondegenerate chords exactly', () => {
  const document = make(), target = createArcEndpointDragTarget(document, 'arc', 'e');
  for (const destination of [{ x: 6, y: 7 }, { x: -6, y: 7 }, { x: -6, y: -7 }, { x: 6, y: -7 }, { x: 200, y: -150 }, { x: 1e-4, y: -2e-4 }]) {
    const candidate = solveDrawingDragCandidate(document, target, { x: destination.x - 10, y: destination.y });
    assert.ok(candidate, `valid at ${JSON.stringify(destination)}`);
    close(sketch(candidate).points.e.x, destination.x); close(sketch(candidate).points.e.y, destination.y);
    assert.deepEqual(sketch(candidate).points.s, sketch(document).points.s);
    assert.ok(resolved(candidate));
  }
});

test('endpoint result is drag-start absolute, event-rate independent, and reversible', () => {
  const document = make(2), target = createArcEndpointDragTarget(document, 'arc', 'e'), finalDelta = { x: -17, y: 13 };
  const direct = solveDrawingDragCandidate(document, target, finalDelta); assert.ok(direct);
  for (let step = 1; step <= 40; step += 1) assert.ok(solveDrawingDragCandidate(document, target, { x: finalDelta.x * step / 40, y: finalDelta.y * step / 40 }));
  const denseFinal = solveDrawingDragCandidate(document, target, finalDelta); assert.deepEqual(denseFinal, direct);
  const returned = solveDrawingDragCandidate(document, target, { x: 0, y: 0 }); assert.deepEqual(returned, document);
  assert.equal(entity(returned).bulge, 2);
});

test('geometric form search evolves continuously from minor through semicircle to major', () => {
  const document = make(0.5), target = createArcEndpointDragTarget(document, 'arc', 'e');
  const destinations = [{ x: 20, y: 0 }, { x: 10, y: 10 }, { x: 5, y: 10 }, { x: 5, y: 5 }];
  const bulges = destinations.map((destination) => {
    const candidate = solveDrawingDragCandidate(document, target, { x: destination.x - 10, y: destination.y });
    assert.ok(candidate); assert.ok(resolved(candidate)); return entity(candidate).bulge;
  });
  assert.ok(bulges[0] < 1); assert.ok(bulges[2] > 0.9 && bulges[2] < 1.1); assert.ok(bulges[3] > 1);
  const semicircle = make(1), semicircleTarget = createArcEndpointDragTarget(semicircle, 'arc', 'e');
  assert.ok(solveDrawingDragCandidate(semicircle, semicircleTarget, { x: 2, y: -3 }), '|bulge| = 1 is not a branch failure');
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

test('driving R endpoint intent jointly uses endpoints and bulge while preserving hard radius', () => {
  for (const bulge of [.05, .5, 1, 2, -.05, -.5, -1, -2]) {
    const document = make(bulge), s = sketch(document);
    const radius = createCircularSizeDimension(s, 'arc', { x: 5, y: -20 }, 'radius');
    s.dimensions.radius = radius; s.dimensionOrder = ['radius'];
    const target = createArcEndpointDragTarget(document, 'arc', 'e');
    const candidate = solveDrawingDragCandidate(document, target, { x: 3, y: 4 });
    assert.ok(candidate, `R-constrained endpoint remains movable for bulge ${bulge}`);
    assert.ok(verifyDrawingConstraints(sketch(candidate), ['radius'], []), `R remains exact for bulge ${bulge}`);
    assert.ok(Math.hypot(sketch(candidate).points.e.x - s.points.e.x, sketch(candidate).points.e.y - s.points.e.y) > 1,
      'pointer motion outranks an unconstrained opposite-end stay');
    assert.ok(resolved(candidate));
  }
});

test('driving R plus one endpoint axis retains feasible endpoint motion', () => {
  const document = make(.5), s = sketch(document);
  s.dimensions.radius = createCircularSizeDimension(s, 'arc', { x: 5, y: -20 }, 'radius');
  s.dimensions.endY = { id: 'endY', kind: 'VERTICAL_DISTANCE', references: [{ kind: 'datum', datum: 'ORIGIN' }, { kind: 'sketchPoint', pointId: 'e' }], value: 0, role: 'driving', placement: { kind: 'linear', offset: 5 } };
  s.dimensionOrder = ['radius', 'endY'];
  const candidate = solveDrawingDragCandidate(document, createArcEndpointDragTarget(document, 'arc', 'e'), { x: 4, y: 5 });
  assert.ok(candidate); close(sketch(candidate).points.e.y, 0);
  assert.ok(Math.abs(sketch(candidate).points.e.x - 10) > 1, 'remaining feasible axis is not frozen');
  assert.ok(verifyDrawingConstraints(sketch(candidate), ['radius', 'endY'], []));
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

test('body radius drag has no initial jump and preserves the canonical Arc form', () => {
  const document = make(), before = resolved(document), q = midpoint(before);
  const pointer = { x: q.x + 0.35, y: q.y - 0.2 };
  const target = createArcRadiusDragTarget(document, 'arc', pointer); assert.ok(target);
  assert.equal(target.kind, 'arc-radius');
  assert.equal(solveDrawingDragCandidate(document, target, { x: 0, y: 0 }, pointer), document);

  const radial = { x: pointer.x - before.center.x, y: pointer.y - before.center.y };
  const length = Math.hypot(radial.x, radial.y), delta = { x: radial.x / length * 2, y: radial.y / length * 2 };
  const candidate = solveDrawingDragCandidate(document, target, delta, pointer); assert.ok(candidate);
  const after = resolved(candidate);
  close(after.radius, before.radius + 2); close(after.center.x, before.center.x); close(after.center.y, before.center.y);
  close(after.startAngle, before.startAngle); close(after.endAngle, before.endAngle); close(after.signedSweep, before.signedSweep);
  assert.equal(entity(candidate).bulge, entity(document).bulge);
  assert.notDeepEqual(sketch(candidate).points.s, sketch(document).points.s);
  assert.notDeepEqual(sketch(candidate).points.e, sketch(document).points.e);
  assert.equal(entity(candidate).startPointId, 's'); assert.equal(entity(candidate).endPointId, 'e');
});

test('body drag increases and decreases radius for minor, semicircle, and major signed Arcs', () => {
  for (const bulge of [0.5, -0.5, 1, -1, 2, -2]) {
    const document = make(bulge), before = resolved(document), q = midpoint(before);
    const target = createArcRadiusDragTarget(document, 'arc', q);
    const radial = { x: q.x - before.center.x, y: q.y - before.center.y };
    const length = Math.hypot(radial.x, radial.y), unit = { x: radial.x / length, y: radial.y / length };
    const outward = solveDrawingDragCandidate(document, target, { x: unit.x, y: unit.y }, q);
    const inward = solveDrawingDragCandidate(document, target, { x: -unit.x, y: -unit.y }, q);
    assert.ok(outward); assert.ok(inward);
    assert.ok(resolved(outward).radius > before.radius); assert.ok(resolved(inward).radius < before.radius);
    assert.equal(entity(outward).bulge, bulge); assert.equal(entity(inward).bulge, bulge);
    close(resolved(outward).signedSweep, before.signedSweep); close(resolved(inward).signedSweep, before.signedSweep);
  }
});

test('body radius candidates are event-rate independent and reversible', () => {
  const document = make(), arc = resolved(document), q = midpoint(arc), target = createArcRadiusDragTarget(document, 'arc', q);
  const finalDelta = { x: q.x - arc.center.x, y: q.y - arc.center.y };
  const sparse = solveDrawingDragCandidate(document, target, finalDelta, q);
  solveDrawingDragCandidate(document, target, { x: finalDelta.x / 2, y: finalDelta.y / 2 }, q);
  const dense = solveDrawingDragCandidate(document, target, finalDelta, q);
  assert.deepEqual(dense, sparse);
  assert.equal(solveDrawingDragCandidate(document, target, { x: 0, y: 0 }, q), document);
});

test('invalid collapsed radius is rejected and crossing center retains a valid signed branch', () => {
  const document = make(), before = resolved(document), q = midpoint(before), target = createArcRadiusDragTarget(document, 'arc', q);
  const radial = { x: q.x - before.center.x, y: q.y - before.center.y };
  assert.equal(solveDrawingDragCandidate(document, target, { x: -radial.x, y: -radial.y }, q), null);
  const crossed = solveDrawingDragCandidate(document, target, { x: -2.5 * radial.x, y: -2.5 * radial.y }, q); assert.ok(crossed);
  const after = resolved(crossed); assert.ok(after);
  assert.equal(entity(crossed).bulge, entity(document).bulge);
  assert.equal(Math.sign(after.signedSweep), Math.sign(before.signedSweep));
});

const axisDimension = (id, pointId, axis, value) => ({ id, kind: axis === 'x' ? 'HORIZONTAL_DISTANCE' : 'VERTICAL_DISTANCE',
  references: [{ kind: 'datum', datum: 'ORIGIN' }, { kind: 'sketchPoint', pointId }], value, role: 'driving', placement: { kind: 'linear', offset: 5 } });

test('fixed endpoint axes leave Arc body bulge as usable geometric grab motion', () => {
  for (const bulge of [.05, .5, 1, 2, -.05, -.5, -1, -2]) {
    const document = make(bulge), s = sketch(document); s.points.s = { id: 's', x: 2, y: 3 }; s.points.e = { id: 'e', x: 12, y: 3 };
    const before = resolved(document), q = midpoint(before);
    s.dimensions.sx = axisDimension('sx', 's', 'x', 2); s.dimensions.sy = axisDimension('sy', 's', 'y', 3);
    s.dimensions.ex = axisDimension('ex', 'e', 'x', 12); s.dimensions.ey = axisDimension('ey', 'e', 'y', 3);
    s.dimensionOrder = ['sx', 'sy', 'ex', 'ey'];
    const target = createArcRadiusDragTarget(document, 'arc', q), towardCenter = { x: 0, y: Math.sign(q.y || -bulge) * 2 };
    const candidate = solveDrawingDragCandidate(document, target, towardCenter, q); assert.ok(candidate, `bulge ${bulge}`);
    assert.ok(verifyDrawingConstraints(sketch(candidate), s.dimensionOrder, []));
    assert.deepEqual(sketch(candidate).points.s, s.points.s); assert.deepEqual(sketch(candidate).points.e, s.points.e);
    assert.notEqual(entity(candidate).bulge, bulge); assert.equal(Math.sign(entity(candidate).bulge), Math.sign(bulge));
    assert.notEqual(resolved(candidate).radius, before.radius); assert.notEqual(resolved(candidate).center.y, before.center.y);
    assert.notEqual(resolved(candidate).signedSweep, before.signedSweep);
    const oldError = Math.hypot(q.x - (q.x + towardCenter.x), q.y - (q.y + towardCenter.y));
    const moved = arcPointAtForTest(resolved(candidate), .5);
    assert.ok(Math.hypot(moved.x - q.x - towardCenter.x, moved.y - q.y - towardCenter.y) < oldError);
  }
});

test('driving radius stays hard while Arc body grab uses remaining canonical motion', () => {
  const document = make(.5), s = sketch(document), before = resolved(document), q = midpoint(before);
  s.dimensions.radius = createCircularSizeDimension(s, 'arc', { x: 5, y: -20 }, 'radius'); s.dimensionOrder = ['radius'];
  const candidate = solveDrawingDragCandidate(document, createArcRadiusDragTarget(document, 'arc', q), { x: 3, y: -2 }, q);
  assert.ok(candidate); assert.ok(verifyDrawingConstraints(sketch(candidate), ['radius'], []));
  close(resolved(candidate).radius, before.radius, 1e-7);
  assert.ok(Math.hypot(resolved(candidate).center.x - before.center.x, resolved(candidate).center.y - before.center.y) > 1e-3);
});

const arcPointAtForTest = (arc, t) => ({ x: arc.center.x + arc.radius * Math.cos(arc.startAngle + arc.signedSweep * t), y: arc.center.y + arc.radius * Math.sin(arc.startAngle + arc.signedSweep * t) });

test('one completed Arc candidate round-trips one History transaction', () => {
  const document = make(), q = midpoint(resolved(document)), target = createArcRadiusDragTarget(document, 'arc', q);
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
  assert.match(source, /createArcRadiusDragTarget\(documentRef\.current, arcId, startModel\)/);
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
