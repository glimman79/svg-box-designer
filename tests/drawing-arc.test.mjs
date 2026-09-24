import test from 'node:test';
import assert from 'node:assert/strict';
import { angleIsOnDrawingArc, deriveArcThroughThreePoints, distanceToArc, finiteArcConstraintResidual, projectPointToArc, resolveArcFromBulge } from '../.test-build/drawing-arc/drawingArcGeometry.js';
import { acceptArcEndpoint, commitArcForm, EMPTY_ARC_INTERACTION, resolveArcEndpointReference, resolveArcPreview, updateArcPreview } from '../.test-build/drawing-arc/drawingArcTool.js';
import { drawingArcQualifiesForRect } from '../.test-build/drawing-arc/drawingBoxSelection.js';
import { appendArcToActiveSketch } from '../.test-build/drawing-arc/drawingDocumentMutation.js';
import { migrateDrawingDocument } from '../.test-build/drawing-arc/drawingTypes.js';
import { deriveEntityDefiningPointIds, removeEntityAndOrphans, resolveArc, validateDrawingTopology } from '../.test-build/drawing-arc/drawingTopology.js';
import { solveDrawingDragCandidate } from '../.test-build/drawing-arc/drawingDirectManipulation.js';
import { solveDrawingVariableTarget, solveDrawingVariableTargets, verifyDrawingConstraints } from '../.test-build/drawing-arc/drawingConstraintSolver.js';
import { analyzeDrawingConstraints, analyzeDrawingEntityMobility, constraintJacobianRow, geometricConstraintEquation } from '../.test-build/drawing-arc/drawingConstraintAnalysis.js';
import { applyDrawingSolverVector, arcBulgeSolverVariable, deduplicateDrawingSolverVariables, drawingSolverVariableKey, flattenDrawingSolverVariables, pointSolverVariables, readDrawingSolverVariable, writeDrawingSolverVariable } from '../.test-build/drawing-arc/drawingSolverVariables.js';

const close = (a, b, e = 1e-8) => assert.ok(Math.abs(a - b) <= e, `${a} != ${b}`);
const endpoint = (x, y, pointId = null) => ({ point: { x, y }, pointId, midpointLineId: null, lineBodyId: null, curveId: null });

test('three points construct minor arcs in both orientations and flip across chord', () => {
  const down = deriveArcThroughThreePoints({ x: -1, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 });
  const up = deriveArcThroughThreePoints({ x: -1, y: 0 }, { x: 1, y: 0 }, { x: 0, y: -1 });
  assert.ok(down && up); close(down.radius, 1); close(up.radius, 1);
  assert.equal(Math.sign(down.signedSweep), -Math.sign(up.signedSweep)); close(Math.abs(down.signedSweep), Math.PI);
});

test('off-center form chooses a major arc when it lies on that directed portion', () => {
  const arc = deriveArcThroughThreePoints({ x: -1, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 2 });
  assert.ok(arc); assert.ok(Math.abs(arc.signedSweep) > Math.PI);
  assert.ok(angleIsOnDrawingArc(Math.atan2(2 - arc.center.y, -arc.center.x), arc.startAngle, arc.signedSweep));
});

test('bulge round trip retains exact derived geometry', () => {
  const source = deriveArcThroughThreePoints({ x: 2, y: 3 }, { x: 9, y: -1 }, { x: 7, y: 6 }, 'a', 'p1', 'p2');
  assert.ok(source); const restored = resolveArcFromBulge(source, source.start, source.end); assert.ok(restored);
  close(restored.center.x, source.center.x); close(restored.center.y, source.center.y); close(restored.signedSweep, source.signedSweep);
});

test('zero chord, exact/near collinearity, and non-finite values fail closed', () => {
  assert.equal(deriveArcThroughThreePoints({ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 1, y: 1 }), null);
  assert.equal(deriveArcThroughThreePoints({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 4, y: 0 }), null);
  assert.equal(deriveArcThroughThreePoints({ x: 0, y: 0 }, { x: 1e6, y: 0 }, { x: 5e5, y: 1e-5 }), null);
  assert.equal(deriveArcThroughThreePoints({ x: 0, y: 0 }, { x: 2, y: 0 }, { x: NaN, y: 1 }), null);
});

test('finite projection uses radial point inside sweep and nearest endpoint outside', () => {
  const arc = deriveArcThroughThreePoints({ x: -1, y: 0 }, { x: 1, y: 0 }, { x: 0, y: -1 }); assert.ok(arc);
  const inside = projectPointToArc({ x: 0, y: -2 }, arc); close(inside.x, 0); close(inside.y, -1);
  const outside = projectPointToArc({ x: -2, y: .2 }, arc); assert.deepEqual(outside, arc.start);
  close(distanceToArc({ x: 0, y: -2 }, arc), 1);
  assert.ok(distanceToArc({ x: 0, y: 1 }, arc) > 1);
});

test('authoring rejects duplicate P2 and invalid P3 without resetting', () => {
  const p1 = acceptArcEndpoint(EMPTY_ARC_INTERACTION, endpoint(0, 0, 'p'));
  assert.equal(acceptArcEndpoint(p1, endpoint(0, 0, 'p')), p1);
  const p2 = acceptArcEndpoint(p1, endpoint(10, 0, 'q'));
  const invalid = commitArcForm(p2, { x: 5, y: 0 }, 'arc'); assert.equal(invalid.entity, null); assert.ok(invalid.interaction.end);
  assert.equal(resolveArcPreview({ ...p2, form: { x: 5, y: 0 } }), null);
});

test('P1 to P2 reference consumes the authoritative effective placement and has no persistent effects', () => {
  assert.equal(resolveArcEndpointReference(EMPTY_ARC_INTERACTION), null);
  const p1 = acceptArcEndpoint(EMPTY_ARC_INTERACTION, endpoint(2, 3, 'existing'));
  assert.deepEqual(resolveArcEndpointReference(p1), { start: { x: 2, y: 3 }, end: { x: 2, y: 3 } });
  const effectiveCandidates = [
    { x: 9, y: 4 }, // free/raw
    { x: 10, y: 5 }, // persistent point
    { x: 11, y: 6 }, // midpoint
    { x: 12, y: 7 }, // finite line
    { x: 13, y: 8 }, // Circle curve
    { x: 14, y: 9 }, // finite Arc curve
    { x: 15, y: 3 }, // alignment
    { x: 16, y: 10 }, // stationary Ctrl bypass/recompute
  ];
  let preview = p1;
  for (const candidate of effectiveCandidates) {
    preview = updateArcPreview(preview, candidate);
    assert.deepEqual(resolveArcEndpointReference(preview), { start: { x: 2, y: 3 }, end: candidate });
  }
  const p2 = acceptArcEndpoint(preview, endpoint(preview.preview.x, preview.preview.y));
  assert.equal(resolveArcEndpointReference(p2), null);
  assert.equal(p2.start.pointId, 'existing');
});

test('successful P3 produces canonical draft and resets interaction', () => {
  const p2 = acceptArcEndpoint(acceptArcEndpoint(EMPTY_ARC_INTERACTION, endpoint(0, 0)), endpoint(10, 0));
  const result = commitArcForm(p2, { x: 5, y: 5 }, 'arc'); assert.ok(result.entity); assert.equal(result.interaction, EMPTY_ARC_INTERACTION);
  assert.deepEqual(Object.keys(result.entity).sort(), ['bulge', 'end', 'formPointId', 'id', 'start', 'type']);
});

const document = () => ({ schemaVersion: 2, unit: 'mm', sketchOrder: ['s'], activeSketchId: 's', sketches: { s: { id: 's', name: 'S', points: {}, entities: {}, entityOrder: [], dimensions: {}, dimensionOrder: [], geometricConstraints: {}, geometricConstraintOrder: [] } } });
test('one mutation persists endpoints, arc, and P3 point-curve relation without a P3 duplicate', () => {
  const doc = document(); Object.assign(doc.sketches.s.points, { q: { id: 'q', x: 5, y: 5 }, r: { id: 'r', x: 6, y: 5 } });
  doc.sketches.s.entities.support = { id: 'support', type: 'line', startPointId: 'q', endPointId: 'r' }; doc.sketches.s.entityOrder = ['support'];
  const draft = commitArcForm(acceptArcEndpoint(acceptArcEndpoint(EMPTY_ARC_INTERACTION, endpoint(0, 0)), endpoint(10, 0)), { x: 5, y: 5 }, 'a', 'q').entity;
  const next = appendArcToActiveSketch(doc, draft, (() => { let n = 0; return () => `p${++n}`; })());
  assert.equal(Object.keys(next.sketches.s.points).length, 4); assert.equal(next.sketches.s.entities.a.type, 'arc');
  assert.equal(next.sketches.s.geometricConstraints['coincident:q:curve:a'].variant, 'point-curve');
  assert.deepEqual(validateDrawingTopology(next), { ok: true });
});

test('finite point-on-arc verifies interior and rejects opposite support side', () => {
  const doc = document(); Object.assign(doc.sketches.s.points, { a: { id: 'a', x: -1, y: 0 }, b: { id: 'b', x: 1, y: 0 }, q: { id: 'q', x: 0, y: -1 } });
  doc.sketches.s.entities.arc = { id: 'arc', type: 'arc', startPointId: 'a', endPointId: 'b', bulge: 1 };
  doc.sketches.s.entityOrder = ['arc']; doc.sketches.s.geometricConstraints.c = { id: 'c', kind: 'COINCIDENT', variant: 'point-curve', references: [{ kind: 'sketchPoint', pointId: 'q' }, { kind: 'entity', entityId: 'arc' }] }; doc.sketches.s.geometricConstraintOrder = ['c'];
  assert.ok(verifyDrawingConstraints(doc.sketches.s, [], ['c']));
  doc.sketches.s.points.q = { id: 'q', x: 0, y: 1 }; assert.equal(verifyDrawingConstraints(doc.sketches.s, [], ['c']), null);
});

test('shared solver variables preserve point behavior and immutably apply Arc bulge', () => {
  const doc = document(), sketch = doc.sketches.s;
  Object.assign(sketch.points, { a: { id: 'a', x: -1, y: 0 }, b: { id: 'b', x: 1, y: 0 } });
  sketch.entities.arc = { id: 'arc', type: 'arc', startPointId: 'a', endPointId: 'b', bulge: 1 };
  const pointVariables = pointSolverVariables('a'), bulge = arcBulgeSolverVariable('arc');
  assert.deepEqual(flattenDrawingSolverVariables(sketch, [...pointVariables, bulge]), [-1, 0, 1]);
  assert.equal(drawingSolverVariableKey(bulge), 'entity:arc:arc-bulge');
  assert.equal(deduplicateDrawingSolverVariables([bulge, bulge]).length, 1);
  assert.equal(readDrawingSolverVariable(sketch, bulge), 1);
  const candidate = writeDrawingSolverVariable(sketch, bulge, -0.5); assert.ok(candidate);
  assert.notEqual(candidate, sketch); assert.equal(sketch.entities.arc.bulge, 1);
  assert.deepEqual({ id: candidate.entities.arc.id, start: candidate.entities.arc.startPointId, end: candidate.entities.arc.endPointId }, { id: 'arc', start: 'a', end: 'b' });
  assert.ok(resolveArcFromBulge(candidate.entities.arc, candidate.points.a, candidate.points.b));
  assert.equal(writeDrawingSolverVariable(sketch, bulge, 0), null);
  assert.equal(applyDrawingSolverVector(sketch, [bulge], [Infinity]), null);
  const unconstrained = analyzeDrawingConstraints(sketch).componentByVariableKey.get(drawingSolverVariableKey(bulge));
  assert.ok(unconstrained); assert.equal(unconstrained.variableCount, 5); assert.equal(unconstrained.degreesOfFreedom, 5);
});

test('point-on-finite-Arc component and Jacobian include meaningful bulge sensitivity', () => {
  const sketch = document().sketches.s;
  Object.assign(sketch.points, { a: { id: 'a', x: -1, y: 0 }, b: { id: 'b', x: 1, y: 0 }, q: { id: 'q', x: 0, y: -1 } });
  sketch.entities.arc = { id: 'arc', type: 'arc', startPointId: 'a', endPointId: 'b', bulge: 1 };
  sketch.geometricConstraints.c = { id: 'c', kind: 'COINCIDENT', variant: 'point-curve', references: [{ kind: 'sketchPoint', pointId: 'q' }, { kind: 'entity', entityId: 'arc' }] };
  sketch.geometricConstraintOrder = ['c'];
  const equation = geometricConstraintEquation(sketch, sketch.geometricConstraints.c), bulge = arcBulgeSolverVariable('arc'); assert.ok(equation);
  const component = analyzeDrawingConstraints(sketch).componentByPointId.get('q'); assert.ok(component);
  assert.deepEqual([...component.pointIds].sort(), ['a', 'b', 'q']);
  assert.deepEqual(component.scalarVariables, [bulge]); assert.equal(component.variableCount, 7);
  const row = constraintJacobianRow(sketch, equation, ['q', 'a', 'b'], [bulge]); assert.ok(row);
  assert.ok(Math.abs(row.at(-1)) > 1e-6);
  const changed = finiteArcConstraintResidual(sketch.points.q, { ...sketch.entities.arc, bulge: .8 }, sketch.points.a, sketch.points.b);
  assert.ok(changed !== null && Math.abs(changed) > 1e-3);
  assert.equal(finiteArcConstraintResidual({ x: 0, y: 1 }, sketch.entities.arc, sketch.points.a, sketch.points.b), 2 ** .5);
});

test('direct scalar target projects through shared constraints without mutating source or History', () => {
  const sketch = document().sketches.s;
  Object.assign(sketch.points, { a: { id: 'a', x: -1, y: 0 }, b: { id: 'b', x: 1, y: 0 }, q: { id: 'q', x: 0, y: -1 } });
  sketch.entities.arc = { id: 'arc', type: 'arc', startPointId: 'a', endPointId: 'b', bulge: 1 };
  sketch.geometricConstraints.c = { id: 'c', kind: 'COINCIDENT', variant: 'point-curve', references: [{ kind: 'sketchPoint', pointId: 'q' }, { kind: 'entity', entityId: 'arc' }] };
  sketch.geometricConstraintOrder = ['c'];
  const candidate = solveDrawingVariableTarget(sketch, { variable: arcBulgeSolverVariable('arc'), value: .5 });
  assert.ok(candidate); assert.equal(candidate.entities.arc.bulge, .5); assert.equal(sketch.entities.arc.bulge, 1);
  assert.ok(verifyDrawingConstraints(candidate, [], ['c'])); assert.equal('history' in candidate, false);
  assert.equal(solveDrawingVariableTarget(sketch, { variable: arcBulgeSolverVariable('arc'), value: 0 }), null);
  assert.deepEqual(analyzeDrawingEntityMobility(document().sketches.s, 'missing'), null);
  const mobility = analyzeDrawingEntityMobility(sketch, 'arc'); assert.ok(mobility); assert.equal(mobility.unconstrainedDegreesOfFreedom, 5);
});

test('mixed point-axis and Arc-bulge component solve uses candidate scalar residuals deterministically', () => {
  const sketch = document().sketches.s;
  Object.assign(sketch.points, { a: { id: 'a', x: -1, y: 0 }, b: { id: 'b', x: 1, y: 0 }, q: { id: 'q', x: 0, y: -1 } });
  sketch.entities.arc = { id: 'arc', type: 'arc', startPointId: 'a', endPointId: 'b', bulge: 1 };
  sketch.geometricConstraints.c = { id: 'c', kind: 'COINCIDENT', variant: 'point-curve', references: [{ kind: 'sketchPoint', pointId: 'q' }, { kind: 'entity', entityId: 'arc' }] };
  sketch.geometricConstraintOrder = ['c'];
  const targets = [{ variable: pointSolverVariables('q')[0], value: .25 }, { variable: pointSolverVariables('q')[1], value: -1.2 }];
  const first = solveDrawingVariableTargets(sketch, targets), second = solveDrawingVariableTargets(sketch, targets);
  assert.ok(first); assert.ok(second); assert.equal(first.points.q.x, .25); assert.equal(first.points.q.y, -1.2);
  assert.notEqual(first.entities.arc.bulge, 1); assert.ok(verifyDrawingConstraints(first, [], ['c']));
  close(first.entities.arc.bulge, second.entities.arc.bulge, 1e-10);
  assert.deepEqual(first.points, second.points);
});

test('analytic Window/Crossing considers only the finite arc', () => {
  const arc = deriveArcThroughThreePoints({ x: -1, y: 0 }, { x: 1, y: 0 }, { x: 0, y: -1 }); assert.ok(arc);
  assert.equal(drawingArcQualifiesForRect(arc, { minX: -2, maxX: 2, minY: -2, maxY: .5 }, 'window'), true);
  assert.equal(drawingArcQualifiesForRect(arc, { minX: -1, maxX: 1, minY: -1, maxY: 0 }, 'window'), false);
  assert.equal(drawingArcQualifiesForRect(arc, { minX: -.2, maxX: .2, minY: -.2, maxY: .2 }, 'crossing'), false);
  assert.equal(drawingArcQualifiesForRect(arc, { minX: -.2, maxX: .2, minY: -1, maxY: -.8 }, 'crossing'), true);
});

test('schema v2 restores valid arcs, rejects malformed arcs, and orphan cleanup preserves shared points', () => {
  const doc = document(); Object.assign(doc.sketches.s.points, { a: { id: 'a', x: 0, y: 0 }, b: { id: 'b', x: 2, y: 0 }, c: { id: 'c', x: 3, y: 0 } });
  Object.assign(doc.sketches.s.entities, { arc: { id: 'arc', type: 'arc', startPointId: 'a', endPointId: 'b', bulge: 1 }, line: { id: 'line', type: 'line', startPointId: 'b', endPointId: 'c' }, bad: { id: 'bad', type: 'arc', startPointId: 'a', endPointId: 'missing', bulge: 0 } }); doc.sketches.s.entityOrder = ['arc', 'line', 'bad'];
  const restored = migrateDrawingDocument(doc); assert.deepEqual(restored.sketches.s.entityOrder, ['arc', 'line']);
  const removed = removeEntityAndOrphans(restored.sketches.s, 'arc'); assert.ok(removed.points.b); assert.equal(removed.points.a, undefined);
});

test('Arc endpoints are entity-defining persistent points and shared point dragging preserves identities', () => {
  const doc = document();
  Object.assign(doc.sketches.s.points, {
    a: { id: 'a', x: -1, y: 0 }, shared: { id: 'shared', x: 1, y: 0 }, c: { id: 'c', x: 3, y: 0 }, d: { id: 'd', x: 1, y: 2 },
  });
  Object.assign(doc.sketches.s.entities, {
    arc1: { id: 'arc1', type: 'arc', startPointId: 'a', endPointId: 'shared', bulge: 1 },
    arc2: { id: 'arc2', type: 'arc', startPointId: 'shared', endPointId: 'd', bulge: .5 },
    line: { id: 'line', type: 'line', startPointId: 'shared', endPointId: 'c' },
  });
  doc.sketches.s.entityOrder = ['arc1', 'arc2', 'line'];
  assert.deepEqual([...deriveEntityDefiningPointIds(doc.sketches.s)], ['a', 'shared', 'd']);
  const candidate = solveDrawingDragCandidate(doc, { kind: 'point', pointId: 'shared' }, { x: 2, y: 1 });
  assert.ok(candidate);
  assert.equal(Object.keys(candidate.sketches.s.points).length, 4);
  assert.deepEqual(candidate.sketches.s.points.shared, { id: 'shared', x: 3, y: 1 });
  for (const id of ['arc1', 'arc2', 'line']) assert.equal(candidate.sketches.s.entities[id], doc.sketches.s.entities[id]);
  assert.deepEqual(resolveArc(candidate.sketches.s, candidate.sketches.s.entities.arc1).end, { id: 'shared', x: 3, y: 1 });
  assert.deepEqual(resolveArc(candidate.sketches.s, candidate.sketches.s.entities.arc2).start, { id: 'shared', x: 3, y: 1 });
});

test('derived Arc center follows endpoint movement without entering topology or persistence', () => {
  const doc = document();
  Object.assign(doc.sketches.s.points, { a: { id: 'a', x: -1, y: 0 }, b: { id: 'b', x: 1, y: 0 } });
  doc.sketches.s.entities.arc = { id: 'arc', type: 'arc', startPointId: 'a', endPointId: 'b', bulge: 1 };
  doc.sketches.s.entityOrder = ['arc'];
  const before = resolveArc(doc.sketches.s, doc.sketches.s.entities.arc); assert.ok(before); close(before.center.x, 0); close(before.center.y, 0);
  const moved = solveDrawingDragCandidate(doc, { kind: 'point', pointId: 'b' }, { x: 2, y: 2 }); assert.ok(moved);
  const after = resolveArc(moved.sketches.s, moved.sketches.s.entities.arc); assert.ok(after); assert.notDeepEqual(after.center, before.center);
  assert.deepEqual(Object.keys(after).filter((key) => ['center', 'radius', 'startAngle', 'endAngle', 'signedSweep'].includes(key)).sort(), ['center', 'endAngle', 'radius', 'signedSweep', 'startAngle']);
  assert.deepEqual(Object.keys(moved.sketches.s.entities.arc).sort(), ['bulge', 'endPointId', 'id', 'startPointId', 'type']);
  assert.deepEqual(Object.keys(moved.sketches.s.points).sort(), ['a', 'b']);
});
