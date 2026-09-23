import test from 'node:test';
import assert from 'node:assert/strict';
import { angleIsOnDrawingArc, deriveArcThroughThreePoints, distanceToArc, projectPointToArc, resolveArcFromBulge } from '../.test-build/drawing-arc/drawingArcGeometry.js';
import { acceptArcEndpoint, commitArcForm, EMPTY_ARC_INTERACTION, resolveArcPreview } from '../.test-build/drawing-arc/drawingArcTool.js';
import { drawingArcQualifiesForRect } from '../.test-build/drawing-arc/drawingBoxSelection.js';
import { appendArcToActiveSketch } from '../.test-build/drawing-arc/drawingDocumentMutation.js';
import { migrateDrawingDocument } from '../.test-build/drawing-arc/drawingTypes.js';
import { removeEntityAndOrphans, validateDrawingTopology } from '../.test-build/drawing-arc/drawingTopology.js';
import { verifyDrawingConstraints } from '../.test-build/drawing-arc/drawingConstraintSolver.js';

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
