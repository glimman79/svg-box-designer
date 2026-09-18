import assert from 'node:assert/strict';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const snaps = await import(pathToFileURL(path.resolve('.test-build/drawing-acquisition-tolerances/drawingSnapEngine.js')));
const origin = { x: 0, y: 0 };
const empty = () => ({ endpoints: [], midpoints: [], lines: [], alignmentsX: [], alignmentsY: [], perpendiculars: [], parallels: [], pointReferences: [] });
const direction = (type, screenDistance) => ({ type, entityId: `${type}-reference`, candidatePoint: { x: 20, y: 0 },
  screenDistance, lineStart: { x: 0, y: 10 }, lineEnd: type === 'parallel' ? { x: 20, y: 10 } : { x: 0, y: 30 } });
const resolve = (candidates, previousSnap = null, rawPoint = { x: 20, y: 0 }) => snaps.resolveDrawingSnap({
  rawPoint, candidates: { ...empty(), ...candidates }, previousSnap, ctrlOverride: false,
  activeLineStart: origin, activeLineStartPointId: 'origin',
});

for (const [relation, key] of [['parallel', 'parallels'], ['perpendicular', 'perpendiculars']]) {
  test(`${relation} acquires inside 5 px, rejects outside, and tracks beyond acquisition`, () => {
    const inside = resolve({ [key]: [direction(relation, 4.999)] });
    assert.equal(inside.channels.directionAuthority?.relation, relation);
    assert.equal(resolve({ [key]: [direction(relation, 5.001)] }).channels.directionAuthority, null);
    const tracked = resolve({ [key]: [direction(relation, 20)] }, inside, { x: 80, y: 20 });
    assert.equal(tracked.channels.directionAuthority?.relation, relation);
    assert.equal(tracked.channels.directionAuthority?.state, 'tracking');
  });
}

test('Point Reference acquires inside 6 px but not outside', () => {
  const pointReference = (screenDistance) => ({ type: 'point-reference', sourcePointId: 'source', incidentLineId: 'line',
    candidatePoint: { x: 4, y: 4 }, screenDistance, supportOrigin: origin, supportDirection: { x: 1, y: 1 }, constructionKey: 'point:line' });
  assert.equal(resolve({ pointReferences: [pointReference(5.999)] }).channels.pointReference?.constructionKey, 'point:line');
  assert.equal(resolve({ pointReferences: [pointReference(6.001)] }).channels.pointReference, null);
});

test('position target tolerances remain deliberately unchanged', () => {
  assert.deepEqual({ endpoint: [snaps.DRAWING_ENDPOINT_SNAP_ACQUIRE_PX, snaps.DRAWING_ENDPOINT_SNAP_RELEASE_PX],
    midpoint: [snaps.DRAWING_MIDPOINT_SNAP_ACQUIRE_PX, snaps.DRAWING_MIDPOINT_SNAP_RELEASE_PX],
    line: [snaps.DRAWING_LINE_SNAP_ACQUIRE_PX, snaps.DRAWING_LINE_SNAP_RELEASE_PX],
    alignment: [snaps.DRAWING_ALIGNMENT_SNAP_ACQUIRE_PX, snaps.DRAWING_ALIGNMENT_SNAP_RELEASE_PX] },
  { endpoint: [9, 12], midpoint: [8, 11], line: [8, 11], alignment: [8, 11] });
});
