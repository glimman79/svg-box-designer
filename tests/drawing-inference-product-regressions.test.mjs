import assert from 'node:assert/strict';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const built = (name) => pathToFileURL(path.resolve(`.test-build/drawing-inference-product-regressions/${name}.js`));
const inference = await import(built('drawingInference'));
const snaps = await import(built('drawingSnapEngine'));
const lines = await import(built('drawingLineTool'));
const drawingTypes = await import(built('drawingTypes'));

const identity = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
const bounds = { x: -1000, y: -1000, width: 2000, height: 2000 };
const start = { x: 0, y: 0 };
const interaction = { ...lines.EMPTY_LINE_INTERACTION, start, startPointId: 'start-point' };
const pointAt = (degrees, radius = 100) => ({
  x: radius * Math.cos(degrees * Math.PI / 180),
  y: radius * Math.sin(degrees * Math.PI / 180),
});
const referenceLine = (id, point, other = { x: point.x + 30, y: point.y + 17 }) => ({
  id, type: 'line', start: point, end: other,
});
const angularError = (point, degrees) => {
  const direction = pointAt(degrees, 1);
  return Math.abs(point.x * direction.y - point.y * direction.x);
};

// This harness follows the workspace's production order: raw client input ->
// angular acquisition proposal -> candidate collection -> snap acquisition and
// hysteresis -> one Line placement -> final relation/presentation inputs.
const author = ({ pointer, scene, transform = identity, previousSnap = null, ctrl = false }) => {
  const rawModel = {
    x: (transform.d * (pointer.x - transform.e) - transform.c * (pointer.y - transform.f)) / (transform.a * transform.d - transform.b * transform.c),
    y: (-transform.b * (pointer.x - transform.e) + transform.a * (pointer.y - transform.f)) / (transform.a * transform.d - transform.b * transform.c),
  };
  const angular = lines.resolveLinePreviewPoint(start, rawModel);
  const candidates = inference.collectDrawingInferenceCandidates(pointer, scene, transform, bounds, start, angular.snappedAngleDegrees);
  const axisDirectionActive = angular.snapActive && [0, 90, 180, 270].includes(angular.snappedAngleDegrees);
  const candidateSnap = snaps.resolveDrawingSnap({ rawPoint: rawModel, candidates, previousSnap, ctrlOverride: ctrl, axisDirectionActive });
  const placement = lines.resolveLineEffectivePoint(interaction, rawModel, candidateSnap, null, ctrl);
  const snap = lines.automaticAxisConstraintKind(placement.interaction) ? snaps.suppressDirectionRelations(candidateSnap) : candidateSnap;
  return { rawModel, angular, candidates, snap, placement };
};

const toClient = (point, scale) => ({ x: point.x * scale, y: point.y * scale });

for (const degrees of [8, 18, 20]) test(`Perpendicular at ${degrees} degrees does not activate angular presentation`, () => {
  const end = pointAt(degrees);
  const direction = pointAt(degrees - 90, 30);
  const offset = { x: 500, y: 500 };
  const scene = [referenceLine(`perpendicular-${degrees}`, { x: offset.x - direction.x, y: offset.y - direction.y }, { x: offset.x + direction.x, y: offset.y + direction.y })];
  const result = author({ pointer: end, scene });
  assert.equal(result.snap.type, 'perpendicular', 'Perpendicular is acquired through candidate collection');
  assert.ok(angularError(result.placement.effectivePoint, degrees) < 1e-9, 'final geometry follows the acquired Perpendicular');
  assert.equal(result.placement.interaction.snappedAngleDegrees, null, 'no angular relation is active');
  assert.equal(lines.hasAngularPresentationTruth(result.placement.interaction), false, 'angular-blue presentation is false');
});

for (const degrees of [22.5, 45, 67.5, 90, 225]) test(`acquired ${degrees} degree construction is exact and presented`, () => {
  const raw = pointAt(degrees + 1, 100);
  const result = author({ pointer: raw, scene: [] });
  assert.equal(result.placement.interaction.snappedAngleDegrees, degrees);
  assert.equal(lines.hasAngularPresentationTruth(result.placement.interaction), true);
  assert.ok(angularError(result.placement.effectivePoint, degrees) < 1e-9);
});

for (const spec of [
  { name: 'Vertical + Y reference', degrees: 90, reference: { x: 45, y: 100 }, channel: 'yAlignment' },
  { name: 'Horizontal + X reference', degrees: 0, reference: { x: 100, y: 45 }, channel: 'xAlignment' },
]) test(`${spec.name} coexist without a Perpendicular candidate`, () => {
  const exact = pointAt(spec.degrees);
  const result = author({ pointer: exact, scene: [referenceLine('reference', spec.reference)] });
  assert.equal(result.placement.interaction.snappedAngleDegrees, spec.degrees);
  assert.ok(Math.hypot(result.placement.effectivePoint.x - exact.x, result.placement.effectivePoint.y - exact.y) < 1e-9);
  assert.ok(result.snap.channels[spec.channel], 'reference guide remains available');
  assert.equal(result.placement.resolvedReferences[spec.channel === 'xAlignment' ? 'x' : 'y'], result.snap.channels[spec.channel], 'resolved guide truth preserves the acquired identity');
  assert.equal(result.snap.channels.perpendicular, null);
});

for (const spec of [
  { name: 'Vertical + Y reference', degrees: 90, channel: 'yAlignment', target: { x: 0, y: 100 }, perpendicular: [{ x: -30, y: 100 }, { x: 30, y: 100 }] },
  { name: 'Horizontal + X reference', degrees: 0, channel: 'xAlignment', target: { x: 100, y: 0 }, perpendicular: [{ x: 100, y: -30 }, { x: 100, y: 30 }] },
]) test(`${spec.name} survive while a compatible Perpendicular is available`, () => {
  const scene = [referenceLine('reference', spec.target), { id: 'perpendicular', type: 'line', start: spec.perpendicular[0], end: spec.perpendicular[1] }];
  const result = author({ pointer: spec.target, scene });
  assert.deepEqual(result.placement.effectivePoint, spec.target);
  assert.equal(result.placement.interaction.snappedAngleDegrees, spec.degrees);
  assert.ok(result.snap.channels[spec.channel], 'compatible reference remains acquired');
});

for (const degrees of [22.5, 45, 67.5]) for (const axis of ['x', 'y']) test(`${degrees} degree construction coexists with ${axis.toUpperCase()} reference`, () => {
  const q = pointAt(degrees);
  const reference = axis === 'x' ? { x: q.x, y: q.y + 40 } : { x: q.x + 40, y: q.y };
  const result = author({ pointer: q, scene: [referenceLine('reference', reference)] });
  assert.ok(angularError(result.placement.effectivePoint, degrees) < 1e-9);
  assert.ok(Math.abs(result.placement.effectivePoint[axis] - reference[axis]) < 1e-9);
  assert.equal(result.placement.interaction.snappedAngleDegrees, degrees);
  assert.ok(result.snap.channels[`${axis}Alignment`]);
  assert.equal(result.placement.resolvedReferences[axis], result.snap.channels[`${axis}Alignment`]);
});

test('Endpoint position authority preserves a compatible angular relation and freezes the accepted click', () => {
  const endpoint = pointAt(45);
  const result = author({ pointer: { x: endpoint.x + 1, y: endpoint.y }, scene: [referenceLine('endpoint-owner', endpoint)] });
  assert.equal(result.snap.type, 'endpoint');
  assert.deepEqual(result.placement.effectivePoint, endpoint);
  assert.equal(result.placement.interaction.snappedAngleDegrees, 45);
  const acceptedPointId = 'existing-endpoint-point';
  const committed = lines.applyResolvedLineClick(result.placement.interaction, result.placement.effectivePoint, () => 'committed-line', acceptedPointId);
  assert.deepEqual(committed.entity.end, endpoint);
  assert.equal(committed.entity.endPointId, acceptedPointId);
});

test('Endpoint defeats an incompatible angular proposal rather than counting weaker relations', () => {
  const endpoint = pointAt(5);
  const result = author({ pointer: pointAt(1), scene: [referenceLine('endpoint-owner', endpoint)] });
  assert.equal(result.snap.type, 'endpoint');
  assert.deepEqual(result.placement.effectivePoint, endpoint);
  assert.equal(result.placement.interaction.snappedAngleDegrees, null);
  assert.equal(lines.hasAngularPresentationTruth(result.placement.interaction), false);
});

test('Endpoint, angular, and reference relations coexist at one final point', () => {
  const endpoint = pointAt(45);
  const scene = [referenceLine('endpoint-owner', endpoint), referenceLine('reference-owner', { x: endpoint.x, y: endpoint.y + 50 })];
  const result = author({ pointer: endpoint, scene });
  assert.equal(result.snap.type, 'endpoint');
  assert.deepEqual(result.placement.effectivePoint, endpoint);
  assert.equal(result.placement.interaction.snappedAngleDegrees, 45);
  assert.ok(result.snap.channels.xAlignment, 'reference guide remains active');
  assert.equal(result.placement.resolvedReferences.x, result.snap.channels.xAlignment, 'endpoint authority preserves final reference truth');

  const finiteReference = { ...result.snap.channels.xAlignment, candidatePoint: { ...result.snap.channels.xAlignment.candidatePoint, x: endpoint.x + 1e-12 } };
  const finite = lines.resolveLineEffectivePoint(interaction, pointAt(46), {
    active: true, type: 'line', entityId: 'finite-owner', effectivePoint: endpoint, segmentParameter: 0.5,
    lineStart: { x: endpoint.x - 20, y: endpoint.y + 20 }, lineEnd: { x: endpoint.x + 20, y: endpoint.y - 20 },
    channels: { xAlignment: finiteReference, yAlignment: null, perpendicular: null },
  });
  assert.equal(finite.interaction.snappedAngleDegrees, 45);
  assert.equal(finite.resolvedReferences.x, finiteReference, 'finite Line composition preserves geometrically true acquired reference identity');
});

test('Angular, X reference, and Y reference coexist at their common point', () => {
  const q = pointAt(45);
  const scene = [referenceLine('x-owner', { x: q.x, y: q.y + 60 }), referenceLine('y-owner', { x: q.x + 60, y: q.y })];
  const result = author({ pointer: q, scene });
  assert.deepEqual(result.placement.effectivePoint, q);
  assert.equal(result.placement.interaction.snappedAngleDegrees, 45);
  assert.ok(result.snap.channels.xAlignment);
  assert.ok(result.snap.channels.yAlignment);
  assert.equal(result.placement.resolvedReferences.x, result.snap.channels.xAlignment);
  assert.equal(result.placement.resolvedReferences.y, result.snap.channels.yAlignment);
});

test('Ctrl clears acquired and hysteretic inference and authors the raw point', () => {
  const endpoint = pointAt(45);
  const acquired = author({ pointer: endpoint, scene: [referenceLine('owner', endpoint)] });
  const raw = { x: 73, y: 19 };
  const overridden = author({ pointer: raw, scene: [referenceLine('owner', endpoint)], previousSnap: acquired.snap, ctrl: true });
  assert.equal(overridden.snap.type, 'none');
  assert.deepEqual(overridden.placement.effectivePoint, raw);
  assert.equal(lines.hasAngularPresentationTruth(overridden.placement.interaction), false);
  assert.equal(overridden.placement.interaction.perpendicularLineId, null);
  assert.deepEqual(overridden.snap.channels, { xAlignment: null, yAlignment: null, perpendicular: null, parallel: null, pointReference: null });
});

for (const degrees of [18, 198]) test(`Parallel target identity drives and retains the ${degrees} degree branch`, () => {
  const direction = pointAt(18, 40);
  const scene = [referenceLine('parallel-target', { x: 400, y: 400 }, { x: 400 + direction.x, y: 400 + direction.y })];
  const acquired = author({ pointer: pointAt(degrees, 100), scene });
  assert.equal(acquired.snap.type, 'parallel');
  assert.equal(acquired.placement.interaction.parallelLineId, 'parallel-target');
  assert.equal(acquired.placement.interaction.perpendicularLineId, null);
  const retained = author({ pointer: pointAt(degrees, 250), scene, previousSnap: acquired.snap });
  assert.equal(retained.snap.channels.parallel.entityId, 'parallel-target');
  assert.equal(retained.placement.interaction.parallelLineId, 'parallel-target');
  assert.equal(lines.hasAngularPresentationTruth(retained.placement.interaction), false);
});

for (const spec of [
  { axis: 'HORIZONTAL', degrees: 0, targetDegrees: 5 },
  { axis: 'VERTICAL', degrees: 90, targetDegrees: 95 },
]) test(`retained Parallel cannot override ${spec.axis} direction authority`, () => {
  const targetDirection = pointAt(spec.targetDegrees, 40);
  const scene = [referenceLine('parallel-target', { x: 400, y: 400 }, { x: 400 + targetDirection.x, y: 400 + targetDirection.y })];
  const acquired = author({ pointer: pointAt(spec.targetDegrees), scene });
  assert.equal(acquired.snap.type, 'parallel');
  const axis = author({ pointer: pointAt(spec.degrees, 120), scene, previousSnap: acquired.snap });
  assert.equal(axis.snap.channels.parallel, null, 'retained target is removed from accepted channels');
  assert.equal(axis.snap.channels.perpendicular, null);
  assert.equal(axis.placement.interaction.parallelLineId, null);
  assert.equal(axis.placement.interaction.perpendicularLineId, null);
  assert.equal(lines.automaticAxisConstraintKind(axis.placement.interaction), spec.axis);
  assert.ok(angularError(axis.placement.effectivePoint, spec.degrees) < 1e-9);
});

for (const spec of [
  { name: 'target H + new H', axis: 'HORIZONTAL', targetDegrees: 0, pointer: { x: 100, y: 6 }, relation: 'parallel' },
  { name: 'target V + new V', axis: 'VERTICAL', targetDegrees: 90, pointer: { x: 6, y: 100 }, relation: 'parallel' },
  { name: 'target H + new V', axis: 'VERTICAL', targetDegrees: 0, pointer: { x: 6, y: 100 }, relation: 'perpendicular' },
  { name: 'target V + new H', axis: 'HORIZONTAL', targetDegrees: 90, pointer: { x: 100, y: 6 }, relation: 'perpendicular' },
]) test(`${spec.name} derives exclusive axis semantics from final geometry`, () => {
  const targetDirection = pointAt(spec.targetDegrees, 40);
  const target = referenceLine('axis-target', { x: 400, y: 400 }, { x: 400 + targetDirection.x, y: 400 + targetDirection.y });
  const acquired = author({ pointer: spec.pointer, scene: [target] });
  assert.equal(acquired.angular.snapActive, false, 'raw pointer begins outside the H/V angular window');
  assert.equal(lines.automaticAxisConstraintKind(acquired.placement.interaction), spec.axis);
  assert.equal(acquired.placement.interaction.parallelLineId, null);
  assert.equal(acquired.placement.interaction.perpendicularLineId, null);
  assert.equal(acquired.snap.type, 'none', `${spec.relation} cursor presentation is removed`);
  assert.equal(acquired.snap.channels.parallel, null);
  assert.equal(acquired.snap.channels.perpendicular, null);

  const priorTargetDegrees = spec.relation === 'parallel' ? spec.targetDegrees + 5 : spec.targetDegrees + 95;
  const priorDirection = pointAt(priorTargetDegrees, 40);
  const priorTarget = referenceLine('axis-target', { x: 400, y: 400 }, { x: 400 + priorDirection.x, y: 400 + priorDirection.y });
  const retainedPointer = spec.relation === 'parallel' ? pointAt(priorTargetDegrees) : pointAt(priorTargetDegrees + 90);
  const retained = author({ pointer: retainedPointer, scene: [priorTarget] });
  assert.equal(retained.snap.type, spec.relation);
  const axisAfterRetention = author({ pointer: spec.pointer, scene: [target], previousSnap: retained.snap });
  assert.equal(lines.automaticAxisConstraintKind(axisAfterRetention.placement.interaction), spec.axis);
  assert.equal(axisAfterRetention.placement.interaction.parallelLineId, null);
  assert.equal(axisAfterRetention.placement.interaction.perpendicularLineId, null);
  assert.equal(axisAfterRetention.snap.type, 'none');
});

test('final H/V authority retains a compatible point reference while removing the Line relation', () => {
  const target = referenceLine('horizontal-target', { x: 400, y: 400 }, { x: 440, y: 400 });
  const pointReference = referenceLine('point-reference', { x: 100, y: 40 }, { x: 130, y: 57 });
  const result = author({ pointer: { x: 100, y: 6 }, scene: [target, pointReference] });
  assert.equal(lines.automaticAxisConstraintKind(result.placement.interaction), 'HORIZONTAL');
  assert.ok(result.snap.channels.xAlignment, 'visible point reference remains acquired');
  assert.equal(result.placement.resolvedReferences.x, result.snap.channels.xAlignment);
  assert.equal(result.placement.interaction.parallelLineId, null);
  assert.equal(result.placement.interaction.perpendicularLineId, null);
  assert.equal(result.snap.type, 'alignment');
});

for (const spec of [
  { axis: 'HORIZONTAL', degrees: 0, targetDegrees: 95 },
  { axis: 'VERTICAL', degrees: 90, targetDegrees: 5 },
]) test(`retained Perpendicular cannot override ${spec.axis} direction authority`, () => {
  const targetDirection = pointAt(spec.targetDegrees, 40);
  const scene = [referenceLine('perpendicular-target', { x: 400, y: 400 }, { x: 400 + targetDirection.x, y: 400 + targetDirection.y })];
  const acquired = author({ pointer: pointAt(spec.degrees + 5), scene });
  assert.equal(acquired.snap.type, 'perpendicular');
  const axis = author({ pointer: pointAt(spec.degrees, 120), scene, previousSnap: acquired.snap });
  assert.equal(axis.snap.channels.parallel, null);
  assert.equal(axis.snap.channels.perpendicular, null, 'retained target is removed from accepted channels');
  assert.equal(axis.placement.interaction.parallelLineId, null);
  assert.equal(axis.placement.interaction.perpendicularLineId, null);
  assert.equal(lines.automaticAxisConstraintKind(axis.placement.interaction), spec.axis);
  assert.ok(angularError(axis.placement.effectivePoint, spec.degrees) < 1e-9);
});

test('automatic axis semantics suppress Perpendicular and Parallel remains transient-only at commit', () => {
  let document = lines.appendEntityToActiveSketch(drawingTypes.createDrawingDocumentV2(),
    referenceLine('target', { x: 0, y: 0 }, { x: 20, y: 0 }), () => 'target-point', null);
  document = lines.appendEntityToActiveSketch(document, referenceLine('axis', { x: 0, y: 10 }, { x: 20, y: 10 }),
    () => 'axis-point', 'HORIZONTAL', 'target');
  assert.deepEqual(Object.values(document.sketches['sketch-1'].geometricConstraints).map(({ kind }) => kind), ['HORIZONTAL']);

  document = lines.appendEntityToActiveSketch(document, referenceLine('vertical-axis', { x: 30, y: 0 }, { x: 30, y: 20 }),
    () => 'vertical-axis-point', 'VERTICAL', 'target');
  assert.deepEqual(Object.values(document.sketches['sketch-1'].geometricConstraints).map(({ kind }) => kind), ['HORIZONTAL', 'VERTICAL']);
  assert.equal(Object.values(document.sketches['sketch-1'].geometricConstraints).filter(({ kind }) => kind === 'PARALLEL').length, 0);
  assert.equal(Object.values(document.sketches['sketch-1'].geometricConstraints).filter(({ kind }) => kind === 'PERPENDICULAR').length, 0);
});

for (const scale of [0.5, 4]) test(`endpoint acquisition remains screen-space stable at ${scale}x`, () => {
  const endpoint = { x: 100, y: 80 };
  const transform = { ...identity, a: scale, d: scale };
  const pointer = toClient({ x: endpoint.x + 8 / scale, y: endpoint.y }, scale);
  const result = author({ pointer, scene: [referenceLine('scaled-owner', endpoint)], transform });
  assert.equal(result.snap.type, 'endpoint');
  assert.ok(Math.abs(result.candidates.endpoints[0].screenDistance - 8) < 1e-9);
});
