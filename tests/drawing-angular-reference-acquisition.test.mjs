import assert from 'node:assert/strict';
import { collectDrawingInferenceCandidates } from '../.test-build/drawing-angular-reference/drawingInference.js';
import { resolveDrawingSnap } from '../.test-build/drawing-angular-reference/drawingSnapEngine.js';
import { EMPTY_LINE_INTERACTION, resolveLineEffectivePoint, resolveLinePreviewPoint } from '../.test-build/drawing-angular-reference/drawingLineTool.js';

const identity = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
const bounds = { x: -500, y: -500, width: 1000, height: 1000 };
const start = { x: 0, y: 0 };
const interaction = { ...EMPTY_LINE_INTERACTION, start, startPointId: 'origin', previousChainedLineId: 'chain' };
const referenceLine = (id, point) => ({ id, type: 'line', start: point, end: { x: point.x - 31, y: point.y - 47 } });
const assertPointClose = (actual, expected) => {
  assert.ok(Math.abs(actual.x - expected.x) < 1e-10, `${actual.x} != ${expected.x}`);
  assert.ok(Math.abs(actual.y - expected.y) < 1e-10, `${actual.y} != ${expected.y}`);
};

const pipeline = ({ raw, lines, transform = identity, previous = null, ctrl = false }) => {
  const angular = resolveLinePreviewPoint(start, raw);
  const client = { x: transform.a * raw.x + transform.c * raw.y + transform.e, y: transform.b * raw.x + transform.d * raw.y + transform.f };
  const candidates = collectDrawingInferenceCandidates(client, lines, transform, bounds, start,
    !ctrl && angular.snapActive ? angular.snappedAngleDegrees : null);
  const snap = resolveDrawingSnap({ rawPoint: raw, candidates, previousSnap: previous, ctrlOverride: ctrl });
  return { angular, candidates, snap, resolved: resolveLineEffectivePoint(interaction, raw, snap, null, ctrl) };
};

let run = pipeline({ raw: { x: 102, y: 98 }, lines: [referenceLine('point-45-x', { x: 100, y: 70 })] });
assertPointClose(run.resolved.effectivePoint, { x: 100, y: 100 });
assert.equal(run.resolved.interaction.snappedAngleDegrees, 45);
assert.equal(run.snap.channels.xAlignment?.entityId, 'point-45-x');
assert.deepEqual(run.snap.channels.xAlignment?.referencePoint, { x: 100, y: 70 }, 'X guide retains its source SketchPoint');
assert.equal(run.snap.channels.yAlignment, null);

run = pipeline({ raw: { x: 72, y: 68 }, lines: [referenceLine('point-45-y', { x: 100, y: 70 })] });
assertPointClose(run.resolved.effectivePoint, { x: 70, y: 70 });
assert.equal(run.resolved.interaction.snappedAngleDegrees, 45);
assert.equal(run.snap.channels.yAlignment?.entityId, 'point-45-y');
assert.deepEqual(run.snap.channels.yAlignment?.referencePoint, { x: 100, y: 70 }, 'Y guide retains its source SketchPoint');
assert.equal(run.snap.channels.xAlignment, null);

run = pipeline({ raw: { x: 100, y: 90 }, lines: [referenceLine('p', { x: 95, y: 70 }), referenceLine('q', { x: 100, y: 200 }), referenceLine('r', { x: 103, y: 300 })] });
assert.equal(run.angular.snappedAngleDegrees, 45);
assert.deepEqual(run.resolved.effectivePoint, { x: 95, y: 95 });
assert.equal(run.snap.channels.xAlignment.entityId, 'p', 'composed X distance beats raw-X-nearest distractor');
assert.equal(run.resolved.interaction.snappedAngleDegrees, 45);

run = pipeline({ raw: { x: 90, y: 100 }, lines: [referenceLine('p', { x: 70, y: 95 }), referenceLine('q', { x: 200, y: 100 })] });
assert.deepEqual(run.resolved.effectivePoint, { x: 95.00000000000001, y: 95 });
assert.equal(run.snap.channels.yAlignment.entityId, 'p', 'composed Y distance beats raw-Y-nearest distractor');

for (const [angle, radius] of [[22.5, 100], [67.5, 100], [225, 100], [157.5, 100]]) {
  const radians = angle * Math.PI / 180;
  const target = { x: radius * Math.cos(radians), y: radius * Math.sin(radians) };
  const tangent = { x: -Math.sin(radians), y: Math.cos(radians) };
  const raw = { x: target.x + tangent.x * 5, y: target.y + tangent.y * 5 };
  const result = pipeline({ raw, lines: [referenceLine(`angle-${angle}`, { x: target.x, y: target.y + 40 })] });
  assert.equal(result.angular.snappedAngleDegrees, angle);
  assert.equal(result.snap.channels.xAlignment?.entityId, `angle-${angle}`);
  assert.equal(result.resolved.interaction.snappedAngleDegrees, angle);
  assert.ok(Math.abs(result.resolved.effectivePoint.x - target.x) < 1e-10);
  assert.ok(Math.abs(result.resolved.effectivePoint.y - target.y) < 1e-10, `${angle} degree intersection is mathematically exact`);
}

run = pipeline({ raw: { x: 100, y: 2 }, lines: [referenceLine('horizontal', { x: 95, y: 40 }), referenceLine('parallel-y', { x: 200, y: 2 })] });
assert.equal(run.angular.snappedAngleDegrees, 0);
assert.deepEqual(run.resolved.effectivePoint, { x: 95, y: 0 });
assert.equal(run.snap.channels.xAlignment.entityId, 'horizontal');
assert.equal(run.snap.channels.yAlignment, null);
run = pipeline({ raw: { x: 2, y: 100 }, lines: [referenceLine('vertical', { x: 40, y: 95 }), referenceLine('parallel-x', { x: 2, y: 200 })] });
assert.equal(run.angular.snappedAngleDegrees, 90);
assert.equal(run.snap.channels.yAlignment.entityId, 'vertical');
assert.equal(run.snap.channels.xAlignment, null);

const behind = pipeline({ raw: { x: 100, y: 90 }, lines: [referenceLine('behind', { x: -95, y: -70 })] });
assert.equal(behind.snap.channels.xAlignment, null, 'behind-ray axis intersection is never generated');

run = pipeline({ raw: { x: 100, y: 100 }, lines: [referenceLine('far-x', { x: 94, y: 180 }), referenceLine('near-y', { x: 180, y: 102 })] });
assert.equal(run.snap.channels.yAlignment?.entityId, 'near-y', 'closest composed intersection wins across X and Y references');
assert.equal(run.snap.channels.xAlignment, null);

run = pipeline({ raw: { x: 100, y: 100 }, lines: [referenceLine('endpoint', { x: 100, y: 100 }), referenceLine('reference', { x: 100, y: 70 })] });
assert.equal(run.snap.type, 'endpoint', 'real endpoint retains positional authority over angular/reference');
assert.equal(run.snap.entityId, 'endpoint');
assert.deepEqual(run.resolved.effectivePoint, { x: 100, y: 100 });

const pLine = referenceLine('held', { x: 95, y: 70 });
const acquired = pipeline({ raw: { x: 100, y: 90 }, lines: [pLine] });
const retained = pipeline({ raw: { x: 102, y: 90 }, lines: [pLine], previous: acquired.snap });
assert.equal(retained.snap.channels.xAlignment.entityId, 'held', 'composed target retains through release radius');
const changedDirection = pipeline({ raw: { x: 44, y: 100 }, lines: [pLine], previous: retained.snap });
assert.notEqual(changedDirection.snap.channels.xAlignment?.entityId, 'held', 'direction change cannot retain a distant recomputed target');

for (const transform of [identity, { a: 4, b: 0, c: 0, d: 4, e: 20, f: -12 }]) {
  const target = { x: 250, y: 250 };
  const pointerClient = { x: transform.a * target.x + transform.e + 7.9 / Math.sqrt(2), y: transform.d * target.y + transform.f - 7.9 / Math.sqrt(2) };
  const raw = { x: (pointerClient.x - transform.e) / transform.a, y: (pointerClient.y - transform.f) / transform.d };
  assert.equal(pipeline({ raw, transform, lines: [referenceLine('zoom', { x: 250, y: 170 })] }).snap.channels.xAlignment?.entityId, 'zoom');
  const outsideClient = { x: transform.a * target.x + transform.e + 8.1 / Math.sqrt(2), y: transform.d * target.y + transform.f - 8.1 / Math.sqrt(2) };
  const outsideRaw = { x: (outsideClient.x - transform.e) / transform.a, y: (outsideClient.y - transform.f) / transform.d };
  assert.equal(pipeline({ raw: outsideRaw, transform, lines: [referenceLine('zoom', { x: 250, y: 170 })] }).snap.channels.xAlignment, null);
}

const ctrlRaw = { x: 100, y: 90 };
assert.equal(pipeline({ raw: ctrlRaw, lines: [pLine], ctrl: true }).snap.type, 'none');
assert.deepEqual(pipeline({ raw: ctrlRaw, lines: [pLine], ctrl: true }).resolved.effectivePoint, ctrlRaw);
assert.equal(pipeline({ raw: ctrlRaw, lines: [pLine] }).snap.channels.xAlignment.entityId, 'held', 'Ctrl release restores composition immediately');

console.log('Drawing angular/reference acquisition pipeline tests passed');
