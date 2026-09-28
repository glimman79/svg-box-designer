import test from 'node:test';
import assert from 'node:assert/strict';
import { collectDrawingAuthoringPoints, resolveActiveSketchLines } from '../.test-build/drawing-semantic-point-inference/drawingTopology.js';
import { collectDrawingInferenceCandidates } from '../.test-build/drawing-semantic-point-inference/drawingInference.js';
import { resolveDrawingSnap } from '../.test-build/drawing-semantic-point-inference/drawingSnapEngine.js';

const identity = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
const bounds = { x: -100, y: -100, width: 500, height: 500 };
const sketch = {
  id: 's', name: 'Semantic points',
  points: {
    shared: { id: 'shared', x: 0, y: 0 }, arcEnd: { id: 'arcEnd', x: 10, y: 0 },
    lineEnd: { id: 'lineEnd', x: -10, y: -10 }, center: { id: 'center', x: 5, y: 0 },
    circleOnly: { id: 'circleOnly', x: 30, y: 40 }, arcOnlyStart: { id: 'arcOnlyStart', x: 50, y: 40 },
    arcOnlyEnd: { id: 'arcOnlyEnd', x: 60, y: 40 },
  },
  entities: {
    line: { id: 'line', type: 'line', startPointId: 'lineEnd', endPointId: 'shared' },
    arc: { id: 'arc', type: 'arc', startPointId: 'shared', endPointId: 'arcEnd', bulge: 1 },
    circleShared: { id: 'circleShared', type: 'circle', centerPointId: 'shared', radius: 2 },
    circleCoincident: { id: 'circleCoincident', type: 'circle', centerPointId: 'center', radius: 1 },
    circleOnly: { id: 'circleOnly', type: 'circle', centerPointId: 'circleOnly', radius: 3 },
    arcOnly: { id: 'arcOnly', type: 'arc', startPointId: 'arcOnlyStart', endPointId: 'arcOnlyEnd', bulge: 1 },
  },
  entityOrder: ['line', 'arc', 'circleShared', 'circleCoincident', 'circleOnly', 'arcOnly'], dimensions: {}, dimensionOrder: [],
  geometricConstraints: {}, geometricConstraintOrder: [],
};
const document = { schemaVersion: 2, unit: 'mm', activeSketchId: 's', sketchOrder: ['s'], sketches: { s: sketch } };
const semantic = collectDrawingAuthoringPoints(sketch);
const lines = resolveActiveSketchLines(document);
const candidates = (pointer) => collectDrawingInferenceCandidates(pointer, lines, identity, bounds, null, null, null,
  Object.values(sketch.points), semantic);
const snap = (rawPoint, values, previousSnap = null, ctrlOverride = false) => resolveDrawingSnap({
  rawPoint, candidates: values, previousSnap, ctrlOverride,
});

test('persistent semantic points deduplicate by SketchPoint identity while derived centers remain distinct', () => {
  assert.equal(semantic.filter(({ persistentPointId }) => persistentPointId === 'shared').length, 1);
  const shared = semantic.find(({ persistentPointId }) => persistentPointId === 'shared');
  assert.deepEqual(shared.reference, { kind: 'sketchPoint', pointId: 'shared' });
  assert.deepEqual(shared.incidentLineIds, ['line']);
  const center = semantic.find(({ id }) => id === 'arc:center');
  assert.deepEqual(center.reference, { kind: 'derivedPoint', entityId: 'arc', role: 'center' });
  assert.deepEqual(center.point, { x: 5, y: 0 });
  assert.equal(semantic.filter(({ point }) => point.x === 5 && point.y === 0).length, 2,
    'coordinate equality does not merge a derived center with a persistent center');
});

test('Arc endpoints and Circle centers retain exact persistent acquisition and gain X/Y alignment', () => {
  for (const [pointId, point] of Object.entries({ shared: sketch.points.shared, arcEnd: sketch.points.arcEnd,
    circleOnly: sketch.points.circleOnly, arcOnlyStart: sketch.points.arcOnlyStart, arcOnlyEnd: sketch.points.arcOnlyEnd })) {
    const exact = candidates({ x: point.x, y: point.y });
    assert.equal(exact.endpoints.find((candidate) => candidate.pointId === pointId)?.screenDistance, 0);
    assert.ok(candidates({ x: point.x + 4.9, y: point.y + 100 }).alignmentsX.some(({ referenceId }) => referenceId === pointId));
    assert.ok(candidates({ x: point.x + 100, y: point.y + 4.9 }).alignmentsY.some(({ referenceId }) => referenceId === pointId));
  }
  const isolated = candidates({ x: 36.9, y: 40 });
  const acquired = snap({ x: 36.9, y: 40 }, isolated);
  assert.equal(acquired.pointId, 'circleOnly', 'persistent point acquires within 7 px');
  assert.equal(snap({ x: 38.9, y: 40 }, candidates({ x: 38.9, y: 40 }), acquired).pointId, 'circleOnly',
    'persistent point retains within 9 px');
});

test('derived Arc centers supply exact semantic acquisition and retain alignment channels', () => {
  const nearX = candidates({ x: 5 + 4.9, y: 100 });
  const nearY = candidates({ x: 100, y: 4.9 });
  assert.ok(nearX.alignmentsX.some(({ referenceId }) => referenceId === 'arc:center'));
  assert.ok(nearY.alignmentsY.some(({ referenceId }) => referenceId === 'arc:center'));
  const exactCandidates = candidates({ x: 5, y: 0 });
  const centerCandidate = exactCandidates.endpoints.find(({ reference }) => reference.kind === 'derivedPoint' && reference.entityId === 'arc');
  assert.deepEqual(centerCandidate.reference, { kind: 'derivedPoint', entityId: 'arc', role: 'center' });
  assert.equal(centerCandidate.pointId, undefined);
  const acquired = snap({ x: 55, y: 46.9 }, candidates({ x: 55, y: 46.9 }));
  assert.deepEqual(acquired.reference, { kind: 'derivedPoint', entityId: 'arcOnly', role: 'center' });
  assert.deepEqual(snap({ x: 55, y: 48.9 }, candidates({ x: 55, y: 48.9 }), acquired).reference, acquired.reference);
  assert.notEqual(snap({ x: 55, y: 49.1 }, candidates({ x: 55, y: 49.1 }), acquired).reference?.entityId, 'arcOnly');
  assert.equal(snap({ x: 5, y: 0 }, exactCandidates, null, true).active, false, 'Ctrl bypasses derived exact acquisition');
  assert.equal(Object.keys(sketch.points).length, 7, 'collection creates no Arc-center SketchPoint');
  assert.equal(Object.values(sketch.entities).filter(({ type }) => type === 'circle').length, 3,
    'collection persists no support Circle');
});

test('only real Line incidence produces normal Point References', () => {
  const values = candidates({ x: 31, y: 41 });
  assert.ok(values.pointReferences.every(({ sourcePointId }) => sourcePointId !== 'circleOnly'
    && sourcePointId !== 'arcOnlyStart' && sourcePointId !== 'arcOnlyEnd' && sourcePointId !== 'arc:center'));
  assert.ok(values.pointReferences.some(({ sourcePointId, incidentLineId }) => sourcePointId === 'shared' && incidentLineId === 'line'));
});

test('Ctrl bypasses persistent acquisition and curve semantic alignment together', () => {
  const endpointValues = candidates({ x: 30 + 2, y: 40 + 2 });
  assert.equal(snap({ x: 32, y: 42 }, endpointValues, null, true).type, 'none');
  const centerAlignment = candidates({ x: 5 + 2, y: 100 });
  assert.equal(snap({ x: 7, y: 100 }, centerAlignment, null, true).type, 'none');
});
