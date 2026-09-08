import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
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

const pipeline = ({ pointer, scene, start = angled.end, previousSnap = null, ctrl = false, transform = identity, axisDirectionActive = false }) => {
  const candidates = inference.collectDrawingInferenceCandidates(pointer, scene, transform, bounds, start, null);
  const snap = snaps.resolveDrawingSnap({ rawPoint: pointer, candidates, previousSnap, ctrlOverride: ctrl, axisDirectionActive });
  const interaction = { ...lineTool.EMPTY_LINE_INTERACTION, start, startPointId: 'B' };
  return { candidates, snap, resolved: lineTool.resolveLineEffectivePoint(interaction, pointer, snap, null, ctrl) };
};

const endpointPerpendicular = (candidates, source = 'B', target = 'AB') => candidates.perpendiculars.find(
  ({ constructionKey }) => constructionKey === `endpoint-perpendicular:${source}:${target}`,
);

test('a non-axis endpoint provides H/V references and an exact perpendicular, never endpoint Parallel', () => {
  const result = pipeline({ pointer: { x: 200, y: -150 }, scene: [angled] });
  const candidate = endpointPerpendicular(result.candidates);
  assert.ok(result.candidates.alignmentsX.some(({ referenceId }) => referenceId === 'B'));
  assert.ok(result.candidates.alignmentsY.some(({ referenceId }) => referenceId === 'B'));
  assert.ok(candidate);
  const d = { x: 100, y: 50 };
  assert.ok(Math.abs(d.x * candidate.supportDirection.x + d.y * candidate.supportDirection.y) < 1e-9);
  assert.equal(result.candidates.parallels.some(({ constructionKey }) => constructionKey?.startsWith('endpoint-')), false);
});

test('infinite endpoint Perpendicular acquires far away on both sides and releases off-support', () => {
  for (const sign of [-1, 1]) {
    const result = pipeline({ pointer: { x: 100 - sign * 400, y: 50 + sign * 800 }, scene: [angled] });
    assert.equal(result.snap.type, 'perpendicular');
    assert.equal(result.snap.sourcePointId, 'B');
    assert.equal(result.snap.entityId, 'AB');
    assert.equal(result.resolved.interaction.perpendicularLineId, 'AB');
    assert.ok(Math.hypot(result.snap.effectivePoint.x - 100, result.snap.effectivePoint.y - 50) > 800);
  }
  assert.notEqual(pipeline({ pointer: { x: -290, y: 855 }, scene: [angled] }).snap.type, 'perpendicular');
});

test('support distance is rendered screen-space distance under anisotropic transforms and zoom', () => {
  const base = { a: 1, b: 0, c: 0, d: 10, e: 10, f: 20 };
  // Rendered perpendicular direction is (-.5, 10); its unit screen normal is (-10,-.5)/sqrt(100.25).
  const normal = { x: -70 / Math.sqrt(100.25), y: -3.5 / Math.sqrt(100.25) };
  for (const scale of [1, 2]) {
    const transform = { ...base, a: scale, d: 10 * scale };
    const origin = { x: 10 + 100 * scale, y: 20 + 500 * scale };
    const pointer = { x: origin.x - 200 * scale + normal.x, y: origin.y + 4000 * scale + normal.y };
    const result = pipeline({ pointer, scene: [angled], transform });
    assert.equal(result.snap.type, 'perpendicular');
    assert.ok(Math.abs(result.snap.screenDistance - 7) < 1e-9);
    assert.ok(Math.hypot(pointer.x - origin.x, pointer.y - origin.y) > 2000);
  }
});

test('multiple topologically incident Lines retain distinct exact targets', () => {
  const second = resolvedLine('BC', 'B', 'C', angled.end, { x: 140, y: 130 });
  const candidates = pipeline({ pointer: { x: 20, y: 90 }, scene: [angled, second] }).candidates.perpendiculars
    .filter(({ sourcePointId }) => sourcePointId === 'B');
  assert.deepEqual(candidates.map(({ entityId }) => entityId).sort(), ['AB', 'BC']);
  assert.equal(pipeline({ pointer: { x: 60, y: 130 }, scene: [angled, second] }).snap.entityId, 'AB');
  assert.equal(pipeline({ pointer: { x: 20, y: 90 }, scene: [angled, second] }).snap.entityId, 'BC');
  const independent = resolvedLine('independent', 'P', 'Q', angled.end, { x: 130, y: 70 });
  assert.equal(pipeline({ pointer: { x: 80, y: 80 }, scene: [angled, independent] }).candidates.perpendiculars
    .some(({ sourcePointId, entityId }) => sourcePointId === 'P' && entityId === 'AB'), false);
});

test('production commit reuses topology and persists one existing Perpendicular transaction and marker', () => {
  const result = pipeline({ pointer: { x: -300, y: 850 }, scene: [angled] });
  const click = lineTool.applyResolvedLineClick(result.resolved.interaction, result.resolved.effectivePoint, () => 'BC', 'C');
  let document = { schemaVersion: 2, unit: 'mm', activeSketchId: 's', sketchOrder: ['s'], sketches: { s: {
    id: 's', name: 'Sketch', points: { A: { id: 'A', x: 0, y: 0 }, B: { id: 'B', x: 100, y: 50 } },
    entities: { AB: { id: 'AB', type: 'line', startPointId: 'A', endPointId: 'B' } }, entityOrder: ['AB'],
    dimensions: {}, dimensionOrder: [], geometricConstraints: {}, geometricConstraintOrder: [],
  } } };
  document = lineTool.appendEntityToActiveSketch(document, click.entity, undefined, null, result.resolved.interaction.perpendicularLineId);
  const sketch = document.sketches.s;
  assert.equal(sketch.entities.BC.startPointId, 'B');
  assert.deepEqual(sketch.geometricConstraintOrder, ['perpendicular:AB:BC']);
  assert.equal(sketch.geometricConstraints['perpendicular:AB:BC'].kind, 'PERPENDICULAR');
  assert.equal(markers.deriveRightAngleMarkers(sketch, 1).length, 1);
});

test('axis authority suppresses redundant Perpendicular and Ctrl is a raw global override', () => {
  for (const spec of [
    { line: resolvedLine('H', 'A', 'B', { x: 0, y: 0 }, { x: 100, y: 0 }), pointer: { x: 101, y: 200 }, kind: 'VERTICAL' },
    { line: resolvedLine('V', 'A', 'B', { x: 0, y: 0 }, { x: 0, y: 100 }), pointer: { x: 200, y: 101 }, kind: 'HORIZONTAL' },
  ]) {
    const result = pipeline({ pointer: spec.pointer, scene: [spec.line], start: spec.line.end, axisDirectionActive: true });
    assert.equal(lineTool.automaticAxisConstraintKind(result.resolved.interaction), spec.kind);
    assert.equal(result.resolved.interaction.perpendicularLineId, null);
  }
  const raw = { x: -300, y: 850 };
  const overridden = pipeline({ pointer: raw, scene: [angled], ctrl: true });
  assert.equal(overridden.snap.type, 'none');
  assert.deepEqual(overridden.resolved.effectivePoint, raw);
  assert.deepEqual(overridden.snap.channels, { xAlignment: null, yAlignment: null, perpendicular: null, parallel: null });
  assert.equal(pipeline({ pointer: raw, scene: [angled] }).snap.type, 'perpendicular');
});

test('workspace presentation renders the acquired infinite blue support guide', () => {
  const guide = inference.deriveInfiniteSupportGuide({ x: 100, y: 50 }, { x: 99.5, y: 51 }, { width: 800, height: 600 });
  assert.ok(guide);
  assert.ok(guide.start.x > 100 && guide.end.x < 100);
  assert.ok(guide.start.y < 50 && guide.end.y > 50);
  const workspace = readFileSync('src/app/DrawingWorkspace.tsx', 'utf8');
  assert.match(workspace, /drawing-perpendicular-support-guide/);
  assert.match(workspace, /lineCursor\.perpendicularSupportGuide\.start/);
});
