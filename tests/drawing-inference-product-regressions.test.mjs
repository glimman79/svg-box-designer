import assert from 'node:assert/strict';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const built = (name) => pathToFileURL(path.resolve(`.test-build/drawing-inference-product-regressions/${name}.js`));
const inference = await import(built('drawingInference'));
const snaps = await import(built('drawingSnapEngine'));
const lines = await import(built('drawingLineTool'));

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
  const snap = snaps.resolveDrawingSnap({ rawPoint: rawModel, candidates, previousSnap, ctrlOverride: ctrl });
  const placement = lines.resolveLineEffectivePoint(interaction, rawModel, snap, null, ctrl);
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
});

test('Angular, X reference, and Y reference coexist at their common point', () => {
  const q = pointAt(45);
  const scene = [referenceLine('x-owner', { x: q.x, y: q.y + 60 }), referenceLine('y-owner', { x: q.x + 60, y: q.y })];
  const result = author({ pointer: q, scene });
  assert.deepEqual(result.placement.effectivePoint, q);
  assert.equal(result.placement.interaction.snappedAngleDegrees, 45);
  assert.ok(result.snap.channels.xAlignment);
  assert.ok(result.snap.channels.yAlignment);
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
  assert.deepEqual(overridden.snap.channels, { xAlignment: null, yAlignment: null, perpendicular: null });
});

for (const scale of [0.5, 4]) test(`endpoint acquisition remains screen-space stable at ${scale}x`, () => {
  const endpoint = { x: 100, y: 80 };
  const transform = { ...identity, a: scale, d: scale };
  const pointer = toClient({ x: endpoint.x + 8 / scale, y: endpoint.y }, scale);
  const result = author({ pointer, scene: [referenceLine('scaled-owner', endpoint)], transform });
  assert.equal(result.snap.type, 'endpoint');
  assert.ok(Math.abs(result.candidates.endpoints[0].screenDistance - 8) < 1e-9);
});
