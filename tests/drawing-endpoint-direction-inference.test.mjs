import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const built = (name) => pathToFileURL(path.resolve(`.test-build/drawing-endpoint-direction-inference/${name}.js`));
const inference = await import(built('drawingInference'));
const snaps = await import(built('drawingSnapEngine'));
const lineTool = await import(built('drawingLineTool'));
const identity = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
const bounds = { x: -500, y: -500, width: 1000, height: 1000 };
const resolvedLine = (id, startPointId, endPointId, start, end) => ({ id, type: 'line', startPointId, endPointId, start, end });
const angled = resolvedLine('AB', 'A', 'B', { x: 0, y: 0 }, { x: 100, y: 50 });

const pipeline = ({ pointer, scene, start = null, previousSnap = null, ctrl = false, transform = identity, axisDirectionActive = false }) => {
  const candidates = inference.collectDrawingInferenceCandidates(pointer, scene, transform, bounds, start, null);
  const snap = snaps.resolveDrawingSnap({ rawPoint: pointer, candidates, previousSnap, ctrlOverride: ctrl, axisDirectionActive });
  const interaction = { ...lineTool.EMPTY_LINE_INTERACTION, start, startPointId: start ? 'new-start' : null };
  return { candidates, snap, resolved: lineTool.resolveLineEffectivePoint(interaction, pointer, snap, null, ctrl) };
};
const normal = (candidates, point = 'B', line = 'AB') => candidates.pointReferences.find(
  ({ constructionKey }) => constructionKey === `point-normal:${point}:${line}`,
);

const emptyDocument = () => ({ schemaVersion: 2, unit: 'mm', activeSketchId: 's', sketchOrder: ['s'], sketches: { s: {
  id: 's', name: 'Sketch', points: { A: { id: 'A', x: 0, y: 0 }, B: { id: 'B', x: 100, y: 50 } },
  entities: { AB: { id: 'AB', type: 'line', startPointId: 'A', endPointId: 'B' } }, entityOrder: ['AB'],
  dimensions: {}, dimensionOrder: [], geometricConstraints: {}, geometricConstraintOrder: [],
} } });

test('a visible non-axis SketchPoint emits H, V, and a topological normal construction without an active Line start', () => {
  const result = pipeline({ pointer: { x: -300, y: 850 }, scene: [angled] });
  const candidate = normal(result.candidates);
  assert.ok(result.candidates.alignmentsX.some(({ referenceId }) => referenceId === 'B'));
  assert.ok(result.candidates.alignmentsY.some(({ referenceId }) => referenceId === 'B'));
  assert.ok(candidate);
  assert.equal(candidate.kind, 'normal-to-incident-line');
  assert.ok(Math.abs(100 * candidate.supportDirection.x + 50 * candidate.supportDirection.y) < 1e-9);
  assert.equal(result.candidates.perpendiculars.some((item) => 'sourcePointId' in item), false);
});

test('point normal is infinite, acquires remotely on both sides, and releases off support', () => {
  for (const sign of [-1, 1]) {
    const result = pipeline({ pointer: { x: 100 - sign * 400, y: 50 + sign * 800 }, scene: [angled] });
    assert.equal(result.snap.type, 'point-reference');
    assert.equal(result.snap.sourcePointId, 'B');
    assert.equal(result.snap.incidentLineId, 'AB');
    assert.ok(Math.hypot(result.snap.effectivePoint.x - 100, result.snap.effectivePoint.y - 50) > 800);
  }
  assert.notEqual(pipeline({ pointer: { x: -290, y: 855 }, scene: [angled] }).snap.type, 'point-reference');
});

test('remote first click creates a new start point and no relation or History transaction', () => {
  const acquired = pipeline({ pointer: { x: -300, y: 850 }, scene: [angled] });
  assert.equal(acquired.snap.type, 'point-reference');
  const first = lineTool.applyResolvedLineClick(acquired.resolved.interaction, acquired.resolved.effectivePoint, () => 'new', 'X');
  assert.equal(first.entity, null);
  assert.ok(Math.hypot(first.interaction.start.x + 300, first.interaction.start.y - 850) < 1e-9);
  assert.equal(first.interaction.startPointId, 'X');
  assert.equal(first.interaction.perpendicularLineId, null);
  assert.equal(first.interaction.parallelLineId, null);
  assert.notEqual(first.interaction.startPointId, 'B');
  assert.deepEqual(emptyDocument().sketches.s.geometricConstraintOrder, []);
});

test('direction remains free after point-reference start; ordinary Parallel remains independently commit-able', () => {
  const acquired = pipeline({ pointer: { x: -300, y: 850 }, scene: [angled] });
  const first = lineTool.applyResolvedLineClick(acquired.resolved.interaction, acquired.resolved.effectivePoint, () => 'new', 'X');
  const free = pipeline({ pointer: { x: -250, y: 930 }, scene: [angled], start: first.interaction.start });
  assert.equal(free.resolved.interaction.perpendicularLineId, null);
  assert.equal(free.resolved.interaction.parallelLineId, null);

  const parallelPointer = { x: -200, y: 900 };
  const parallel = pipeline({ pointer: parallelPointer, scene: [angled], start: first.interaction.start });
  assert.equal(parallel.snap.type, 'parallel');
  assert.equal(parallel.resolved.interaction.parallelLineId, 'AB');
  const click = lineTool.applyResolvedLineClick(parallel.resolved.interaction, parallel.resolved.effectivePoint, () => 'XY', 'Y');
  const document = lineTool.appendEntityToActiveSketch(emptyDocument(), click.entity, undefined, null, null, null, 'AB');
  assert.equal(document.sketches.s.geometricConstraints['parallel:AB:XY'].kind, 'PARALLEL');
});

test('support distance is stable in client space under anisotropic transforms', () => {
  const transform = { a: 1, b: 0, c: 0, d: 10, e: 10, f: 20 };
  const screenNormal = { x: -70 / Math.sqrt(100.25), y: -3.5 / Math.sqrt(100.25) };
  const pointer = { x: 110 - 200 + screenNormal.x, y: 520 + 4000 + screenNormal.y };
  const result = pipeline({ pointer, scene: [angled], transform });
  assert.equal(result.snap.type, 'point-reference');
  assert.ok(Math.abs(result.snap.screenDistance - 7) < 1e-9);
});

test('multiple semantic incident Lines emit distinct non-redundant supports and coordinate equality does not imply incidence', () => {
  const second = resolvedLine('BC', 'B', 'C', angled.end, { x: 140, y: 130 });
  const candidates = pipeline({ pointer: { x: 20, y: 90 }, scene: [angled, second] }).candidates.pointReferences
    .filter(({ sourcePointId }) => sourcePointId === 'B');
  assert.deepEqual(candidates.map(({ incidentLineId }) => incidentLineId).sort(), ['AB', 'BC']);
  assert.equal(pipeline({ pointer: { x: 60, y: 130 }, scene: [angled, second] }).snap.incidentLineId, 'AB');
  assert.equal(pipeline({ pointer: { x: 20, y: 90 }, scene: [angled, second] }).snap.incidentLineId, 'BC');
  const independent = resolvedLine('independent', 'P', 'Q', angled.end, { x: 130, y: 70 });
  assert.equal(pipeline({ pointer: { x: 80, y: 80 }, scene: [angled, independent] }).candidates.pointReferences
    .some(({ sourcePointId, incidentLineId }) => sourcePointId === 'P' && incidentLineId === 'AB'), false);
});

test('axis-equivalent and duplicate incident normals defer to H/V or one stable normal', () => {
  const h = resolvedLine('H', 'A', 'B', { x: 0, y: 0 }, { x: 100, y: 0 });
  const v = resolvedLine('V', 'B', 'C', { x: 100, y: 0 }, { x: 100, y: 100 });
  assert.equal(pipeline({ pointer: { x: 100, y: 200 }, scene: [h] }).candidates.pointReferences.length, 0);
  assert.equal(pipeline({ pointer: { x: 200, y: 0 }, scene: [v] }).candidates.pointReferences.length, 0);
  const sameDirection = resolvedLine('DB', 'D', 'B', { x: 20, y: 10 }, angled.end);
  assert.equal(pipeline({ pointer: { x: -300, y: 850 }, scene: [angled, sameDirection] }).candidates.pointReferences
    .filter(({ sourcePointId }) => sourcePointId === 'B').length, 1);
});

test('Ctrl clears every transient channel and restores raw placement', () => {
  const raw = { x: -300, y: 850 };
  const normalRun = pipeline({ pointer: raw, scene: [angled] });
  assert.equal(normalRun.snap.type, 'point-reference');
  const overridden = pipeline({ pointer: raw, scene: [angled], ctrl: true, previousSnap: normalRun.snap });
  assert.equal(overridden.snap.type, 'none');
  assert.deepEqual(overridden.resolved.effectivePoint, raw);
  assert.deepEqual(overridden.snap.channels, { xAlignment: null, yAlignment: null, perpendicular: null, parallel: null, pointReference: null });
});

test('workspace renders an infinite pointer-transparent transient point-reference guide', () => {
  const guide = inference.deriveInfiniteSupportGuide({ x: 100, y: 50 }, { x: 99.5, y: 51 }, { width: 800, height: 600 });
  assert.ok(guide);
  assert.ok(guide.start.x > 100 && guide.end.x < 100 && guide.start.y < 50 && guide.end.y > 50);
  const workspace = readFileSync('src/app/DrawingWorkspace.tsx', 'utf8');
  const styles = readFileSync('src/styles.css', 'utf8');
  assert.match(workspace, /drawing-point-reference-guide/);
  assert.match(workspace, /data-incident-line-id/);
  assert.match(workspace, /lineCursor\.pointReferenceGuide\.start/);
  assert.match(styles, /\.drawing-point-reference-guide[\s\S]*?pointer-events:\s*none/);
});
