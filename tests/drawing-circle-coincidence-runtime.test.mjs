import test from 'node:test';
import assert from 'node:assert/strict';
import { createDrawingDocumentV2 } from '../.test-build/drawing-circle-coincidence-runtime/drawingTypes.js';
import { appendCircleToActiveSketch, appendEntityToActiveSketch } from '../.test-build/drawing-circle-coincidence-runtime/drawingDocumentMutation.js';
import { getDrawingConstraintApplicability, applyDrawingConstraint } from '../.test-build/drawing-circle-coincidence-runtime/drawingConstraintsTool.js';
import { analyzeDrawingConstraints } from '../.test-build/drawing-circle-coincidence-runtime/drawingConstraintAnalysis.js';
import { verifyDrawingConstraints } from '../.test-build/drawing-circle-coincidence-runtime/drawingConstraintSolver.js';
import { solveDrawingDragCandidate } from '../.test-build/drawing-circle-coincidence-runtime/drawingDirectManipulation.js';
import { resolveDrawingPointerOwner } from '../.test-build/drawing-circle-coincidence-runtime/drawingPointerArbitration.js';
import { EMPTY_DRAWING_HISTORY, transactDrawingDocument } from '../.test-build/drawing-circle-coincidence-runtime/drawingHistory.js';

const C = 'circle-center', L = 'line-start';
const lineDraft = (id, start, end, startPointId, endPointId) => ({ id, type: 'line', start, end, startPointId, endPointId });
const position = (document, id) => { const { x, y } = document.sketches[document.activeSketchId].points[id]; return { x, y }; };
const residual = (document, a = L, b = C) => ({ x: position(document, a).x - position(document, b).x, y: position(document, a).y - position(document, b).y });
const assertPosition = (document, id, expected) => {
  const actual = position(document, id);
  assert.ok(Math.abs(actual.x - expected.x) < 1e-7 && Math.abs(actual.y - expected.y) < 1e-7,
    `${id}: (${actual.x}, ${actual.y}) != (${expected.x}, ${expected.y})`);
};
const assertCoincident = (document, a = L, b = C) => {
  const difference = residual(document, a, b), sketch = document.sketches[document.activeSketchId];
  assert.ok(Math.abs(difference.x) < 1e-7 && Math.abs(difference.y) < 1e-7);
  const verified = verifyDrawingConstraints(sketch, [], sketch.geometricConstraintOrder);
  assert.ok(verified && verified.every(value => value < 1e-7));
};
const geometryOwner = (document, pointer, evidence) => {
  // Select mode has no authoring interaction; this is DrawingWorkspace's root resolver.
  const owner = resolveDrawingPointerOwner(document, pointer, null, evidence, []);
  assert.equal(owner.kind, 'geometry');
  return owner;
};
const createManualDocument = () => {
  let document = createDrawingDocumentV2();
  document = appendCircleToActiveSketch(document, { id: 'circle', center: { x: 20, y: 20 }, centerPointId: C, radius: 8 }, () => C);
  document = appendEntityToActiveSketch(document, lineDraft('line', { x: 20, y: 20 }, { x: 60, y: 20 }, L, 'line-end'), () => { throw new Error('explicit IDs expected'); });
  assert.notEqual(L, C); assert.deepEqual(position(document, L), position(document, C));
  const selection = [{ kind: 'point', pointId: L }, { kind: 'point', pointId: C }];
  const applicability = getDrawingConstraintApplicability(selection, document).find(({ kind }) => kind === 'coincidence');
  assert.equal(applicability.enabled, true);
  const transaction = transactDrawingDocument(EMPTY_DRAWING_HISTORY, document, current => applyDrawingConstraint(current, applicability));
  assert.equal(transaction.changed, true); assert.equal(transaction.history.undo.length, 1); document = transaction.document;
  const sketch = document.sketches[document.activeSketchId];
  const relations = Object.values(sketch.geometricConstraints).filter(({ kind, variant }) => kind === 'COINCIDENT' && variant === 'point-point');
  assert.equal(relations.length, 1);
  assert.deepEqual(relations[0].references, [C, L].sort().map(pointId => ({ kind: 'sketchPoint', pointId })));
  assertCoincident(document); return { document, relation: relations[0] };
};

test('manual Circle-center Coincidence survives production ownership, candidates, commit, and reverse Circle gestures', () => {
  const setup = createManualDocument(), before = setup.document, sketch = before.sketches[before.activeSketchId];
  const component = analyzeDrawingConstraints(sketch).componentByPointId.get(L);
  assert.ok(component.pointIds.has(L) && component.pointIds.has(C));
  assert.ok(component.geometricConstraintIds.includes(setup.relation.id));
  const body = geometryOwner(before, { x: 40, y: 20 }, { explicitLineId: 'line' });
  assert.deepEqual(body.selection, { kind: 'line', lineId: 'line' });
  assert.deepEqual(body.target, { kind: 'line', lineId: 'line', segmentParameter: 0.5, grabOffset: { x: 0, y: 0 } });
  const endpoint = geometryOwner(before, { x: 20, y: 20 }, { explicitPointId: L });
  assert.deepEqual(endpoint.target, { kind: 'point', pointId: L });
  const bodyCandidate = solveDrawingDragCandidate(before, body.target, { x: 14, y: 9 }, { x: 40, y: 20 });
  assert.ok(bodyCandidate); assertCoincident(bodyCandidate);
  assertPosition(bodyCandidate, L, { x: 34, y: 29 }); assertPosition(bodyCandidate, C, { x: 34, y: 29 });
  assert.deepEqual(bodyCandidate.sketches[bodyCandidate.activeSketchId].geometricConstraints[setup.relation.id], setup.relation);
  assert.notDeepEqual(position(bodyCandidate, L), position(before, L));
  const committed = transactDrawingDocument(EMPTY_DRAWING_HISTORY, before, () => bodyCandidate);
  assert.equal(committed.changed, true); assert.equal(committed.history.undo.length, 1); assertCoincident(committed.document);
  assertPosition(committed.document, L, { x: 34, y: 29 }); assertPosition(committed.document, C, { x: 34, y: 29 });
  assert.ok(committed.document.sketches[committed.document.activeSketchId].geometricConstraints[setup.relation.id]);
  const endpointCandidate = solveDrawingDragCandidate(before, endpoint.target, { x: -7, y: 11 }, { x: 20, y: 20 });
  assert.ok(endpointCandidate); assertCoincident(endpointCandidate);
  assertPosition(endpointCandidate, L, { x: 13, y: 31 }); assertPosition(endpointCandidate, C, { x: 13, y: 31 });
  assertCoincident(transactDrawingDocument(EMPTY_DRAWING_HISTORY, before, () => endpointCandidate).document);
  const centerOwner = geometryOwner(committed.document, position(committed.document, C), { explicitPointId: C });
  assert.deepEqual(centerOwner.target, { kind: 'point', pointId: C });
  const centerCandidate = solveDrawingDragCandidate(committed.document, centerOwner.target, { x: 5, y: -6 });
  assert.ok(centerCandidate); assertCoincident(centerCandidate);
  assertPosition(centerCandidate, L, { x: 39, y: 23 }); assertPosition(centerCandidate, C, { x: 39, y: 23 });
  const center = position(committed.document, C), circumference = { x: center.x + 8, y: center.y };
  const circleOwner = geometryOwner(committed.document, circumference, { explicitCircleId: 'circle' });
  assert.equal(circleOwner.target.kind, 'entity-scalar');
  const radiusCandidate = solveDrawingDragCandidate(committed.document, circleOwner.target, { x: 3, y: 0 }, circumference);
  assert.ok(radiusCandidate); assertCoincident(radiusCandidate);
  assertPosition(radiusCandidate, L, { x: 34, y: 29 }); assertPosition(radiusCandidate, C, { x: 34, y: 29 });
});

test('automatic shared-topology Circle center follows a production Line-body drag', () => {
  let document = createDrawingDocumentV2();
  document = appendCircleToActiveSketch(document, { id: 'circle', center: { x: 20, y: 20 }, centerPointId: C, radius: 8 }, () => C);
  document = appendEntityToActiveSketch(document, lineDraft('line', { x: 20, y: 20 }, { x: 60, y: 20 }, C, 'line-end'), () => 'unused', null, null, { startPointId: C });
  assert.equal(document.sketches[document.activeSketchId].entities.line.startPointId, C);
  const owner = geometryOwner(document, { x: 40, y: 20 }, { explicitLineId: 'line' });
  const candidate = solveDrawingDragCandidate(document, owner.target, { x: 14, y: 9 }, { x: 40, y: 20 });
  assert.ok(candidate);
  assert.ok(Math.abs(position(candidate, C).x - 34) < 1e-7 && Math.abs(position(candidate, C).y - 29) < 1e-7);
});

test('ordinary external point-point Coincidence also survives a production Line-body drag', () => {
  let document = createDrawingDocumentV2();
  document = appendEntityToActiveSketch(document, lineDraft('carrier', { x: 20, y: 20 }, { x: 60, y: 20 }, L, 'line-end'), () => 'unused');
  document = appendEntityToActiveSketch(document, lineDraft('external', { x: 20, y: 20 }, { x: 20, y: 50 }, 'external-point', 'external-end'), () => 'unused');
  const selection = [{ kind: 'point', pointId: L }, { kind: 'point', pointId: 'external-point' }];
  const choice = getDrawingConstraintApplicability(selection, document).find(({ kind }) => kind === 'coincidence');
  document = applyDrawingConstraint(document, choice);
  const owner = geometryOwner(document, { x: 40, y: 20 }, { explicitLineId: 'carrier' });
  const candidate = solveDrawingDragCandidate(document, owner.target, { x: -9, y: 12 }, { x: 40, y: 20 });
  assert.ok(candidate); assertCoincident(candidate, L, 'external-point');
});
