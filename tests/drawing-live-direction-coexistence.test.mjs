import assert from 'node:assert/strict';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const built = (name) => pathToFileURL(path.resolve(`.test-build/drawing-live-direction-coexistence/${name}.js`));
const inference = await import(built('drawingInference'));
const snaps = await import(built('drawingSnapEngine'));
const lineTool = await import(built('drawingLineTool'));
const presentation = await import(built('drawingInferencePresentation'));

const identity = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
const bounds = { x: -1000, y: -1000, width: 2000, height: 2000 };
const points = {
  p0: { id: 'p0', x: 0, y: 0 }, p1: { id: 'p1', x: 40, y: 40 },
  p2: { id: 'p2', x: 10, y: 70 }, p3: { id: 'p3', x: 50, y: 110 }, p4: { id: 'p4', x: 20, y: 140 },
};
const line = (id, startPointId, endPointId) => ({ id, type: 'line', startPointId, endPointId,
  start: points[startPointId], end: points[endPointId] });
const A = line('A', 'p0', 'p1'), B = line('B', 'p1', 'p2'), C = line('C', 'p2', 'p3');
const sketchFor = (lines) => ({ id: 'sketch', points, entities: Object.fromEntries(lines.map(({ id, startPointId, endPointId }) =>
  [id, { id, type: 'line', startPointId, endPointId }])), entityOrder: lines.map(({ id }) => id), dimensions: {}, dimensionOrder: [],
  geometricConstraints: {}, geometricConstraintOrder: [] });

const evaluate = ({ scene, start, startPointId, pointer, previousChainedLineId = null, visibleBounds = bounds, ctrlOverride = false }) => {
  const interaction = { ...lineTool.EMPTY_LINE_INTERACTION, start, startPointId, previousChainedLineId };
  const angular = lineTool.resolveLinePreviewPoint(start, pointer);
  const candidates = inference.collectDrawingInferenceCandidates(pointer, scene, identity, visibleBounds, start,
    angular.snapActive ? angular.snappedAngleDegrees : null, startPointId);
  const axisDirectionActive = angular.snapActive && [0, 90, 180, 270].includes(angular.snappedAngleDegrees);
  const snap = snaps.resolveDrawingSnap({ rawPoint: pointer, candidates, previousSnap: null, ctrlOverride,
    axisDirectionActive, activeLineStart: start });
  const resolution = lineTool.resolveLineEffectivePoint(interaction, pointer, snap, ctrlOverride);
  return { candidates, snap, resolution, interaction };
};

const shownKinds = (result, scene) => presentation.deriveDrawingInferencePresentations(
  result.snap, sketchFor(scene), 1, identity, identity, result.resolution.interaction).map(({ kind }) => kind);

test('B perpendicular to A is the sole direction authority, preview, and persistent relation', () => {
  const result = evaluate({ scene: [A], start: points.p1, startPointId: 'p1', pointer: points.p2 });
  assert.deepEqual(result.snap.channels.directionAuthority, {
    relation: 'perpendicular', referenceLineId: 'A', referenceLineStart: points.p0,
    referenceLineEnd: points.p1, reason: 'nearest acquired non-axis direction',
  });
  assert.equal(result.resolution.interaction.perpendicularLineId, 'A');
  assert.deepEqual(shownKinds(result, [A]), ['perpendicular']);
  assert.equal(lineTool.selectMinimalLineSemanticConstraints(result.resolution.interaction).perpendicularLineId, 'A');
});

test('C parallel to A rejects equivalent start-incident Perpendicular as authoring authority', () => {
  const result = evaluate({ scene: [A, B], start: points.p2, startPointId: 'p2', pointer: points.p3 });
  assert.equal(result.snap.channels.directionAuthority.relation, 'parallel');
  assert.equal(result.snap.channels.directionAuthority.referenceLineId, 'A');
  assert.equal(result.snap.channels.parallel.entityId, 'A');
  assert.equal(result.snap.channels.perpendicular, null);
  assert.deepEqual(result.snap.channels.rejectedRedundantDirectionRelations, [{ relation: 'perpendicular', referenceLineId: 'B',
    reason: 'equivalent direction already governed by preferred authority' }]);
  assert.equal(result.resolution.interaction.parallelLineId, 'A');
  assert.equal(result.resolution.interaction.perpendicularLineId, null);
  assert.deepEqual(shownKinds(result, [A, B]), ['parallel']);
});

test('a non-start Line supplying the same Perpendicular direction is observation, not a second authority or preview', () => {
  const other = { id: 'other', type: 'line', start: { x: 300, y: 0 }, end: { x: 270, y: 30 }, startPointId: 'o0', endPointId: 'o1' };
  const result = evaluate({ scene: [A, other], start: points.p2, startPointId: 'p2', pointer: points.p3 });
  assert.equal(result.snap.channels.directionAuthority.referenceLineId, 'A');
  assert.equal(result.snap.channels.perpendicular, null);
  assert.equal(result.snap.channels.rejectedRedundantDirectionRelations[0].referenceLineId, 'other');
  assert.deepEqual(shownKinds(result, [A, other]), ['parallel']);
});

test('Parallel ray composes with a hard free-end Endpoint without replacing direction authority', () => {
  const target = { id: 'target', type: 'line', start: points.p3, end: { x: 80, y: 70 }, startPointId: 'p3', endPointId: 't1' };
  const result = evaluate({ scene: [A, target], start: points.p2, startPointId: 'p2', pointer: points.p3 });
  assert.equal(result.snap.type, 'endpoint');
  assert.equal(result.snap.channels.directionAuthority.referenceLineId, 'A');
  assert.deepEqual(result.resolution.effectivePoint, points.p3);
  assert.equal(result.resolution.interaction.parallelLineId, 'A');
});

test('production handoff preserves acquired Parallel through Endpoint resolution and commit', () => {
  const target = { id: 'target', type: 'line', start: points.p3, end: { x: 80, y: 70 }, startPointId: 'p3', endPointId: 't1' };
  const start = points.p2;
  const acquirePointer = { x: 40, y: 100 };
  const angular = lineTool.resolveLinePreviewPoint(start, acquirePointer);
  const acquiredCandidates = inference.collectDrawingInferenceCandidates(acquirePointer, [A, B, target], identity, bounds, start,
    angular.snapActive ? angular.snappedAngleDegrees : null, 'p2');
  const acquiredSnap = snaps.resolveDrawingSnap({ rawPoint: acquirePointer, candidates: acquiredCandidates, previousSnap: null,
    ctrlOverride: false, axisDirectionActive: false, activeLineStart: start });
  assert.notEqual(acquiredSnap.type, 'endpoint', 'Parallel is acquired before the hard Endpoint owns position');
  assert.equal(acquiredSnap.channels.directionAuthority.referenceLineId, 'A');

  const endpointCandidates = inference.collectDrawingInferenceCandidates(points.p3, [A, B, target], identity, bounds, start, null, 'p2');
  const endpointSnap = snaps.resolveDrawingSnap({ rawPoint: points.p3, candidates: endpointCandidates, previousSnap: acquiredSnap,
    ctrlOverride: false, axisDirectionActive: false, activeLineStart: start });
  const interaction = { ...lineTool.EMPTY_LINE_INTERACTION, start, startPointId: 'p2', previousChainedLineId: 'B' };
  const resolution = lineTool.resolveLineEffectivePoint(interaction, points.p3, endpointSnap);
  assert.equal(endpointSnap.type, 'endpoint');
  assert.equal(endpointSnap.channels.directionAuthority.referenceLineId, 'A');
  assert.equal(resolution.diagnostic.finalGeometryCompatibleWithDirectionAuthority, true);
  assert.deepEqual(resolution.diagnostic.directionalSemanticsBeforeAxisFinalization,
    { parallelLineId: 'A', perpendicularLineId: null });
  assert.equal(resolution.interaction.parallelLineId, 'A');

  const click = lineTool.applyResolvedLineClick(resolution.interaction, resolution.effectivePoint, () => 'C', 'p3');
  assert.equal(click.entity.endPointId, 'p3', 'Endpoint topology is reused exactly');
  const sketch = sketchFor([A, B, target]);
  const document = { schemaVersion: 2, unit: 'mm', activeSketchId: sketch.id, sketchOrder: [sketch.id], sketches: { [sketch.id]: sketch } };
  const committed = lineTool.appendEntityToActiveSketch(document, click.entity, undefined, null, null, null,
    lineTool.selectMinimalLineSemanticConstraints(resolution.interaction).parallelLineId);
  assert.equal(committed.sketches.sketch.geometricConstraints['parallel:A:C'].kind, 'PARALLEL');
});

test('D parallel to B uses the same one-authority rule', () => {
  const result = evaluate({ scene: [A, B, C], start: points.p3, startPointId: 'p3', pointer: points.p4 });
  assert.equal(result.snap.channels.directionAuthority.relation, 'parallel');
  assert.equal(result.snap.channels.directionAuthority.referenceLineId, 'B');
  assert.equal(result.snap.channels.perpendicular, null);
  assert.deepEqual(shownKinds(result, [A, B, C]), ['parallel']);
});

test('manual restart and continuous continuation have identical inference', () => {
  for (const args of [
    { scene: [A, B], start: points.p2, startPointId: 'p2', pointer: points.p3, previousChainedLineId: 'B' },
    { scene: [A, B, C], start: points.p3, startPointId: 'p3', pointer: points.p4, previousChainedLineId: 'C' },
  ]) {
    const chained = evaluate(args);
    const manual = evaluate({ ...args, previousChainedLineId: null });
    assert.deepEqual(chained.candidates, manual.candidates);
    assert.deepEqual(chained.snap, manual.snap);
    assert.deepEqual({ ...chained.resolution, interaction: { ...chained.resolution.interaction, previousChainedLineId: null } }, manual.resolution);
  }
});

test('candidate discovery and semantic direction are invariant when an interfering Line leaves viewport bounds', () => {
  const visible = evaluate({ scene: [A, B], start: points.p2, startPointId: 'p2', pointer: points.p3,
    visibleBounds: { x: -10, y: -10, width: 100, height: 130 } });
  const outside = evaluate({ scene: [A, B], start: points.p2, startPointId: 'p2', pointer: points.p3,
    visibleBounds: { x: 45, y: 75, width: 100, height: 130 } });
  assert.deepEqual(outside.candidates, visible.candidates, 'viewport culling cannot alter semantic candidates');
  assert.deepEqual(outside.snap.channels.directionAuthority, visible.snap.channels.directionAuthority);
  assert.deepEqual(outside.resolution.effectivePoint, visible.resolution.effectivePoint);
});

test('Endpoint owns final position while compatible direction authority remains truth-checked', () => {
  const endpoint = { id: 'endpoint-owner', type: 'line', start: points.p3, end: { x: 90, y: 60 }, startPointId: 'p3', endPointId: 'e1' };
  const compatible = evaluate({ scene: [A, endpoint], start: points.p2, startPointId: 'p2', pointer: points.p3 });
  assert.equal(compatible.snap.type, 'endpoint');
  assert.equal(compatible.resolution.interaction.parallelLineId, 'A');
  const incompatiblePoint = { x: 50, y: 100 };
  const badEndpoint = { ...endpoint, start: incompatiblePoint };
  const incompatible = evaluate({ scene: [A, badEndpoint], start: points.p2, startPointId: 'p2', pointer: incompatiblePoint });
  assert.equal(incompatible.snap.type, 'endpoint');
  assert.equal(incompatible.resolution.interaction.parallelLineId, null);
  assert.equal(incompatible.resolution.diagnostic.finalGeometryCompatibleWithDirectionAuthority, false);
  assert.match(incompatible.resolution.diagnostic.directionAuthorityRejectionReason, /final geometry is not parallel/);
});

test('Ctrl bypasses all automatic authority and presentation', () => {
  const result = evaluate({ scene: [A, B], start: points.p2, startPointId: 'p2', pointer: points.p3, ctrlOverride: true });
  assert.equal(result.snap.type, 'none');
  assert.equal(result.snap.channels.directionAuthority, null);
  assert.equal(result.resolution.interaction.parallelLineId, null);
  assert.equal(result.resolution.interaction.perpendicularLineId, null);
});

test('Midpoint, H/V, and Point Reference positional families retain their contracts', () => {
  const midpoint = { x: 20, y: 20 };
  const midpointResult = evaluate({ scene: [A], start: { x: -10, y: 10 }, startPointId: 's', pointer: midpoint });
  assert.equal(midpointResult.snap.type, 'midpoint');
  const axisResult = evaluate({ scene: [A], start: { x: 0, y: 80 }, startPointId: 's', pointer: { x: 50, y: 80 } });
  assert.equal(axisResult.resolution.interaction.snappedAngleDegrees, 0);
  assert.equal(axisResult.snap.channels.directionAuthority, null);
  const pointReferenceResult = evaluate({ scene: [A], start: { x: 80, y: 10 }, startPointId: 's', pointer: { x: 50, y: 30 } });
  assert.ok(pointReferenceResult.candidates.pointReferences.length > 0);
});
