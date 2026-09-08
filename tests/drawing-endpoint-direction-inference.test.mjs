import assert from 'node:assert/strict';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const built = (name) => pathToFileURL(path.resolve(`.test-build/drawing-endpoint-direction-inference/${name}.js`));
const inference = await import(built('drawingInference'));
const snaps = await import(built('drawingSnapEngine'));
const lineTool = await import(built('drawingLineTool'));
const markers = await import(built('drawingParallelMarker'));
const identity = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
const bounds = { x: -500, y: -500, width: 1000, height: 1000 };
const resolvedLine = (id, startPointId, endPointId, start, end) => ({ id, type: 'line', startPointId, endPointId, start, end });
const angled = resolvedLine('AB', 'A', 'B', { x: 0, y: 0 }, { x: 100, y: 50 });

const pipeline = ({ pointer, scene, start = { x: -100, y: -50 }, previousSnap = null, ctrl = false, angular = null, transform = identity, visibleBounds = bounds }) => {
  const candidates = inference.collectDrawingInferenceCandidates(pointer, scene, transform, visibleBounds, start, angular);
  const snap = snaps.resolveDrawingSnap({ rawPoint: pointer, candidates, previousSnap, ctrlOverride: ctrl });
  const interaction = { ...lineTool.EMPTY_LINE_INTERACTION, start, startPointId: 'new-start' };
  return { candidates, snap, resolved: lineTool.resolveLineEffectivePoint(interaction, pointer, snap, null, ctrl) };
};

test('endpoint Parallel uses nearest rendered infinite support far from its source at every zoom', () => {
  // This anisotropic CTM mirrors the browser failure: model-space orthogonal
  // projection puts the sample about 28 px from its candidate even though it is
  // only 7 px from the rendered support. The endpoint is over 2,000 px away.
  const transform = { a: 1, b: 0, c: 0, d: 10, e: 10, f: 20 };
  const screenNormalAtSevenPx = { x: -70 / Math.sqrt(104), y: 14 / Math.sqrt(104) };
  for (const scale of [1, 2]) {
    const scaled = { ...transform, a: transform.a * scale, d: transform.d * scale };
    for (const sign of [-1, 1]) {
      const pointer = {
        x: 10 + 100 * scale + sign * 400 * scale + screenNormalAtSevenPx.x,
        y: 20 + 500 * scale + sign * 2_000 * scale + screenNormalAtSevenPx.y,
      };
      const result = pipeline({ pointer, scene: [angled], transform: scaled,
        visibleBounds: { x: 50, y: 25, width: 500, height: 500 } });
      assert.equal(result.snap.type, 'parallel');
      assert.equal(result.snap.entityId, 'AB');
      assert.equal(result.snap.sourcePointId, 'B');
      assert.ok(Math.abs(result.snap.screenDistance - 7) < 1e-9);
      assert.ok(Math.hypot(pointer.x - (10 + 100 * scale), pointer.y - (20 + 500 * scale)) > 2_000);
    }
    const offSupport = pipeline({ pointer: {
      x: 10 + 100 * scale + 400 * scale + screenNormalAtSevenPx.x * 2,
      y: 20 + 500 * scale + 2_000 * scale + screenNormalAtSevenPx.y * 2,
    }, scene: [angled], transform: scaled });
    assert.notEqual(offSupport.snap.type, 'parallel');
  }
});

test('screen-space support distance selects each incident direction independently', () => {
  const transform = { a: 2, b: 0, c: 0, d: 4, e: 10, f: 20 };
  const second = resolvedLine('BC', 'B', 'C', { x: 100, y: 50 }, { x: 100, y: 150 });
  const alongAB = pipeline({ pointer: { x: 610, y: 620 }, scene: [angled, second], transform });
  assert.equal(alongAB.snap.entityId, 'AB');
  const alongBC = pipeline({ pointer: { x: 211, y: 700 }, scene: [angled, second], transform });
  assert.equal(alongBC.snap.entityId, 'BC');
});

test('endpoint-derived Parallel retains topology identity through production commit and markers', () => {
  const result = pipeline({ pointer: { x: 202, y: 102 }, scene: [angled] });
  const candidate = result.candidates.parallels.find(({ constructionKey }) => constructionKey === 'endpoint-parallel:B:AB');
  assert.ok(candidate);
  assert.equal(candidate.sourcePointId, 'B');
  assert.equal(candidate.entityId, 'AB');
  assert.equal(result.snap.type, 'parallel');
  assert.equal(result.snap.sourcePointId, 'B');
  assert.equal(result.resolved.interaction.parallelLineId, 'AB');
  assert.ok(Math.abs((result.resolved.effectivePoint.x - 100) * .5 - (result.resolved.effectivePoint.y - 50)) < 1e-9);

  let document = { schemaVersion: 2, unit: 'mm', activeSketchId: 's', sketchOrder: ['s'], sketches: { s: {
    id: 's', name: 'Sketch', points: { A: { id: 'A', x: 0, y: 0 }, B: { id: 'B', x: 100, y: 50 } },
    entities: { AB: { id: 'AB', type: 'line', startPointId: 'A', endPointId: 'B' } }, entityOrder: ['AB'],
    dimensions: {}, dimensionOrder: [], geometricConstraints: {}, geometricConstraintOrder: [],
  } } };
  const click = lineTool.applyResolvedLineClick(result.resolved.interaction, result.resolved.effectivePoint, () => 'new-line', 'new-end');
  document = lineTool.appendEntityToActiveSketch(document, click.entity, undefined, null, null, null, result.resolved.interaction.parallelLineId);
  const sketch = document.sketches.s;
  assert.deepEqual(sketch.geometricConstraintOrder, ['parallel:AB:new-line']);
  assert.deepEqual(sketch.geometricConstraints['parallel:AB:new-line'].references.map(({ entityId }) => entityId), ['AB', 'new-line']);
  assert.equal(markers.deriveParallelMarkers(sketch, 1).length, 2);
});

test('multiple incident Lines remain distinct and hysteresis retains the acquired target', () => {
  const second = resolvedLine('BC', 'B', 'C', { x: 100, y: 50 }, { x: 140, y: 130 });
  const result = pipeline({ pointer: { x: 69, y: -12 }, scene: [angled, second], start: { x: 80, y: 10 } });
  const endpointCandidates = result.candidates.parallels.filter(({ sourcePointId }) => sourcePointId === 'B');
  assert.deepEqual(endpointCandidates.map(({ entityId }) => entityId).sort(), ['AB', 'BC']);
  assert.equal(result.snap.entityId, 'BC');
  const retained = pipeline({ pointer: { x: 66, y: -18 }, scene: [angled, second], start: { x: 80, y: 10 }, previousSnap: result.snap });
  assert.equal(retained.snap.entityId, 'BC');
  assert.equal(retained.snap.constructionKey, 'endpoint-parallel:B:BC');
});

test('incidence uses point IDs, Ctrl bypasses, and ordinary references remain independent', () => {
  const independent = resolvedLine('independent', 'P', 'Q', { x: 100, y: 50 }, { x: 130, y: 70 });
  const candidates = inference.collectDrawingInferenceCandidates({ x: 150, y: 75 }, [angled, independent], identity, bounds, { x: -100, y: -50 });
  assert.equal(candidates.parallels.some(({ sourcePointId, entityId }) => sourcePointId === 'P' && entityId === 'AB'), false);
  const xReference = resolvedLine('reference', 'R', 'S', { x: 202, y: 200 }, { x: 260, y: 240 });
  const normal = pipeline({ pointer: { x: 202, y: 102 }, scene: [angled, xReference] });
  assert.ok(normal.snap.channels.xAlignment || normal.snap.channels.yAlignment, 'point-reference channel is still independently populated');
  assert.equal(normal.resolved.effectivePoint.x, 202);
  assert.ok(normal.resolved.resolvedReferences.x);
  const raw = { x: 202, y: 102 };
  const overridden = pipeline({ pointer: raw, scene: [angled], ctrl: true });
  assert.equal(overridden.snap.type, 'none');
  assert.deepEqual(overridden.resolved.effectivePoint, raw);
  assert.equal(overridden.resolved.interaction.parallelLineId, null);
  assert.deepEqual(overridden.snap.channels, { xAlignment: null, yAlignment: null, perpendicular: null, parallel: null });
  const pointOnly = resolvedLine('legacy', undefined, undefined, { x: 12, y: 15 }, { x: 30, y: 40 });
  assert.ok(inference.collectDrawingInferenceCandidates({ x: 12, y: 100 }, [pointOnly], identity, bounds).alignmentsX.length);
});

test('axis-aligned incident directions retain H/V semantic authority', () => {
  for (const spec of [
    { line: resolvedLine('H', 'HA', 'HB', { x: 0, y: 20 }, { x: 100, y: 20 }), start: { x: -50, y: 20 }, pointer: { x: 150, y: 21 }, kind: 'HORIZONTAL' },
    { line: resolvedLine('V', 'VA', 'VB', { x: 20, y: 0 }, { x: 20, y: 100 }), start: { x: 20, y: -50 }, pointer: { x: 21, y: 150 }, kind: 'VERTICAL' },
  ]) {
    const result = pipeline({ pointer: spec.pointer, scene: [spec.line], start: spec.start });
    assert.equal(lineTool.automaticAxisConstraintKind(result.resolved.interaction), spec.kind);
    assert.equal(result.resolved.interaction.parallelLineId, null);
  }
});
