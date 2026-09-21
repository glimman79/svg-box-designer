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
  test(`${relation} observes inclusive 5 px capture and 7 px release boundaries with immediate reacquisition`, () => {
    const acquired = resolve({ [key]: [direction(relation, 5)] });
    assert.equal(acquired.channels.directionAuthority?.relation, relation);
    assert.equal(resolve({ [key]: [direction(relation, 5.001)] }).channels.directionAuthority, null);
    for (const screenDistance of [6.999, 7]) {
      const tracked = resolve({ [key]: [direction(relation, screenDistance)] }, acquired, { x: 500, y: 0 });
      assert.equal(tracked.channels.directionAuthority?.relation, relation);
      assert.equal(tracked.channels.directionAuthority?.state, 'tracking');
    }
    const released = resolve({ [key]: [direction(relation, 7.001)] }, acquired);
    assert.equal(released.type, 'none');
    assert.equal(released.channels.directionAuthority, null);
    assert.equal(released.channels.directionAuthorityReleaseReason, 'outside-release-distance');
    const reacquired = resolve({ [key]: [direction(relation, 4.999)] }, released);
    assert.equal(reacquired.channels.directionAuthority?.relation, relation);
    assert.equal(reacquired.channels.directionAuthority?.state, 'acquired');
  });
}

test('released direction authority can switch relation and reference in the same frame', () => {
  const parallel = resolve({ parallels: [direction('parallel', 5)] });
  const switchedToPerpendicular = resolve({
    parallels: [direction('parallel', 7.001)],
    perpendiculars: [{ ...direction('perpendicular', 5), entityId: 'other-perpendicular-reference' }],
  }, parallel);
  assert.equal(switchedToPerpendicular.channels.directionAuthority?.relation, 'perpendicular');
  assert.equal(switchedToPerpendicular.channels.directionAuthority?.referenceLineId, 'other-perpendicular-reference');

  const switchedToParallel = resolve({
    perpendiculars: [{ ...direction('perpendicular', 7.001), entityId: 'other-perpendicular-reference' }],
    parallels: [{ ...direction('parallel', 5), entityId: 'new-parallel-reference' }],
  }, switchedToPerpendicular);
  assert.equal(switchedToParallel.channels.directionAuthority?.relation, 'parallel');
  assert.equal(switchedToParallel.channels.directionAuthority?.referenceLineId, 'new-parallel-reference');
});

test('production position target tolerances use the Stage 1 values', () => {
  assert.deepEqual({ endpoint: [snaps.DRAWING_ENDPOINT_SNAP_ACQUIRE_PX, snaps.DRAWING_ENDPOINT_SNAP_RELEASE_PX],
    midpoint: [snaps.DRAWING_MIDPOINT_SNAP_ACQUIRE_PX, snaps.DRAWING_MIDPOINT_SNAP_RELEASE_PX],
    line: [snaps.DRAWING_LINE_SNAP_ACQUIRE_PX, snaps.DRAWING_LINE_SNAP_RELEASE_PX],
    alignment: [snaps.DRAWING_ALIGNMENT_SNAP_ACQUIRE_PX, snaps.DRAWING_ALIGNMENT_SNAP_RELEASE_PX],
    pointReference: [snaps.DRAWING_POINT_REFERENCE_SNAP_ACQUIRE_PX, snaps.DRAWING_POINT_REFERENCE_SNAP_RELEASE_PX] },
  { endpoint: [7, 9], midpoint: [7, 9], line: [5, 7], alignment: [5, 7], pointReference: [5, 7] });
});

const endpoint = (screenDistance) => ({ type: 'endpoint', entityId: 'endpoint-line', endpoint: 'start',
  candidatePoint: { x: 0, y: 0 }, screenDistance });
const midpoint = (screenDistance) => ({ type: 'midpoint', entityId: 'midpoint-line', stableKey: 'midpoint-line:midpoint',
  candidatePoint: { x: 10, y: 0 }, screenDistance });
const line = (screenDistance) => ({ type: 'line', entityId: 'line', candidatePoint: { x: 20, y: 0 },
  segmentParameter: 0.5, screenDistance, lineStart: { x: 0, y: 0 }, lineEnd: { x: 40, y: 0 } });
const alignmentX = (screenDistance) => ({ type: 'alignment-x', referenceId: 'alignment-point', referenceKind: 'endpoint',
  candidatePoint: { x: 20, y: 10 }, screenDistance, constructionKey: 'alignment-x:20', positionOwnership: 'defining-position' });
const pointReference = (screenDistance) => ({ type: 'point-reference', sourcePointId: 'source', incidentLineId: 'support-line',
  candidatePoint: { x: 4, y: 4 }, screenDistance, supportOrigin: origin, supportDirection: { x: 1, y: 1 },
  constructionKey: 'point:line', positionOwnership: 'defining-position' });

for (const { name, key, candidate, acquire, release } of [
  { name: 'Endpoint', key: 'endpoints', candidate: endpoint, acquire: 7, release: 9 },
  { name: 'Midpoint', key: 'midpoints', candidate: midpoint, acquire: 7, release: 9 },
  { name: 'finite Line', key: 'lines', candidate: line, acquire: 5, release: 7 },
]) {
  test(`${name} observes its production capture and release boundaries`, () => {
    const acquired = resolve({ [key]: [candidate(acquire)] });
    assert.notEqual(acquired.type, 'none');
    assert.equal(resolve({ [key]: [candidate(acquire + 0.001)] }).type, 'none');
    assert.notEqual(resolve({ [key]: [candidate(release - 0.001)] }, acquired).type, 'none');
    assert.equal(resolve({ [key]: [candidate(release + 0.001)] }, acquired).type, 'none');
  });
}

test('ordinary defining-position Alignment observes its production capture and release boundaries', () => {
  const acquired = resolve({ alignmentsX: [alignmentX(5)] });
  assert.equal(acquired.type, 'alignment');
  assert.equal(resolve({ alignmentsX: [alignmentX(5.001)] }).type, 'none');
  assert.equal(resolve({ alignmentsX: [alignmentX(6.999)] }, acquired).type, 'alignment');
  assert.equal(resolve({ alignmentsX: [alignmentX(7.001)] }, acquired).type, 'none');
});

test('positional Point Reference observes its production capture and release boundaries', () => {
  const acquired = resolve({ pointReferences: [pointReference(5)] });
  assert.equal(acquired.type, 'point-reference');
  assert.equal(resolve({ pointReferences: [pointReference(5.001)] }).type, 'none');
  assert.equal(resolve({ pointReferences: [pointReference(6.999)] }, acquired).type, 'point-reference');
  assert.equal(resolve({ pointReferences: [pointReference(7.001)] }, acquired).type, 'none');
});
