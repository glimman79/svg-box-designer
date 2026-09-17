import assert from 'node:assert/strict';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const built = (name) => pathToFileURL(path.resolve(`.test-build/drawing-line-production-boundary/${name}.js`));
const inference = await import(built('drawingInference'));
const snaps = await import(built('drawingSnapEngine'));
const lines = await import(built('drawingLineTool'));
const boundary = await import(built('drawingLineCommitBoundary'));

const identity = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
const bounds = { x: -500, y: -500, width: 1000, height: 1000 };
const p = { a0: { x: 0, y: 0 }, a1: { x: 40, y: 40 }, b0: { x: -20, y: 100 }, s: { x: 10, y: 70 }, t1: { x: 80, y: 70 } };
const A = { id: 'A', type: 'line', startPointId: 'a0', endPointId: 'a1', start: p.a0, end: p.a1 };
const B = { id: 'B', type: 'line', startPointId: 'b0', endPointId: 'S', start: p.b0, end: p.s };
const T = { id: 'T', type: 'line', startPointId: 'S', endPointId: 't1', start: p.s, end: p.t1 };
const basePoints = { a0: { id: 'a0', ...p.a0 }, a1: { id: 'a1', ...p.a1 }, b0: { id: 'b0', ...p.b0 }, S: { id: 'S', ...p.s }, t1: { id: 't1', ...p.t1 } };
const sketch = (includeB) => ({ id: 'sketch', points: basePoints,
  entities: { A: { id: 'A', type: 'line', startPointId: 'a0', endPointId: 'a1' }, T: { id: 'T', type: 'line', startPointId: 'S', endPointId: 't1' },
    ...(includeB ? { B: { id: 'B', type: 'line', startPointId: 'b0', endPointId: 'S' } } : {}) },
  entityOrder: includeB ? ['A', 'T', 'B'] : ['A', 'T'], dimensions: {}, dimensionOrder: [], geometricConstraints: {}, geometricConstraintOrder: [] });
const documentFor = (includeB) => ({ schemaVersion: 2, unit: 'mm', activeSketchId: 'sketch', sketchOrder: ['sketch'], sketches: { sketch: sketch(includeB) } });

const resolve = (interaction, scene, pointer, previousSnap) => {
  const angular = interaction.start ? lines.resolveLinePreviewPoint(interaction.start, pointer) : null;
  const candidates = inference.collectDrawingInferenceCandidates(pointer, scene, identity, bounds, interaction.start,
    previousSnap?.channels.directionAuthority
      ? Math.atan2(previousSnap.channels.directionAuthority.constructionDirection.y, previousSnap.channels.directionAuthority.constructionDirection.x) * 180 / Math.PI
      : angular?.snapActive ? angular.snappedAngleDegrees : null, interaction.startPointId);
  const axisDirectionActive = angular?.snapActive === true && [0, 90, 180, 270].includes(angular.snappedAngleDegrees);
  const snap = snaps.resolveDrawingSnap({ rawPoint: pointer, candidates, previousSnap, ctrlOverride: false, axisDirectionActive,
    activeLineStart: interaction.start, activeLineStartPointId: interaction.startPointId });
  const placement = lines.resolveLineEffectivePoint(interaction, pointer, snap);
  return { candidates, snap, placement };
};

const fakeClock = () => {
  let next = 1;
  const tasks = new Map();
  return { scheduler: { setTimeout(fn, delay) { const id = next++; tasks.set(id, { fn, delay }); return id; }, clearTimeout(id) { tasks.delete(id); } },
    run() { const queued = [...tasks.values()]; tasks.clear(); queued.forEach(({ fn }) => fn()); }, tasks };
};

const summarize = ({ candidates, snap, placement }) => ({
  candidates, snap, placement: { effectivePoint: placement.effectivePoint,
    interaction: { ...placement.interaction, previousChainedLineId: null }, diagnostic: placement.diagnostic },
});

for (const [name, delayPointers] of [
  ['no movement', []],
  ['slight movement', [{ x: 9, y: 69 }]],
  ['movement toward C', [{ x: 20, y: 80 }, { x: 35, y: 95 }]],
]) test(`delayed continuation (${name}) discards old-segment hover state and matches manual restart`, () => {
  const events = [];
  const pending = { current: null };
  const clock = fakeClock();
  let interaction = { ...lines.EMPTY_LINE_INTERACTION, start: p.b0, startPointId: 'b0' };
  let snap = null;
  let document = documentFor(false);

  const accepted = resolve(interaction, [A, T], p.s, snap);
  interaction = accepted.placement.interaction;
  snap = accepted.snap;
  events.push({ type: 'click-accepted', interaction, snap });
  boundary.scheduleDrawingLineCommit(pending, clock.scheduler, () => {
    const click = lines.applyResolvedLineClick(accepted.placement.interaction, accepted.placement.effectivePoint, () => 'B', 'S');
    document = lines.appendEntityToActiveSketch(document, click.entity);
    interaction = click.interaction;
    snap = null;
    events.push({ type: 'commit', interaction, snap });
  });
  assert.equal([...clock.tasks.values()][0].delay, 220);

  for (const pointer of delayPointers) {
    const oldSegmentFrame = resolve(interaction, [A, T], pointer, snap);
    interaction = oldSegmentFrame.placement.interaction;
    snap = oldSegmentFrame.snap;
    events.push({ type: 'pending-pointermove', interaction, snap });
  }
  clock.run();

  assert.deepEqual(document.sketches.sketch.entityOrder, ['A', 'T', 'B']);
  assert.equal(document.sketches.sketch.entities.B.endPointId, 'S');
  assert.deepEqual(interaction.start, p.s);
  assert.equal(interaction.startPointId, 'S');
  assert.equal(interaction.previousChainedLineId, 'B');
  assert.equal(snap, null, 'both state/ref model enter the continued segment without old hysteresis');

  const postPointers = [{ x: 25, y: 85 }, { x: 40, y: 100 }, { x: 55, y: 115 }];
  const continuedFrames = [];
  for (const pointer of postPointers) {
    const frame = resolve(interaction, [A, T, B], pointer, snap);
    interaction = frame.placement.interaction;
    snap = frame.snap;
    continuedFrames.push(frame);
  }
  let manualInteraction = { ...lines.EMPTY_LINE_INTERACTION, start: p.s, startPointId: 'S' };
  let manualSnap = null;
  const manualFrames = postPointers.map((pointer) => {
    const frame = resolve(manualInteraction, [A, T, B], pointer, manualSnap);
    manualInteraction = frame.placement.interaction;
    manualSnap = frame.snap;
    return frame;
  });
  assert.deepEqual(continuedFrames.map(summarize), manualFrames.map(summarize));
  assert.equal(continuedFrames[0].snap.channels.directionAuthority.referenceLineId, 'A');
  assert.equal(continuedFrames[0].snap.channels.directionAuthority.relation, 'parallel');
  assert.equal(events.filter(({ type }) => type === 'pending-pointermove').length, delayPointers.length,
    'pointermove remains executable and resolves the old B interaction while commit is pending');
});

test('a second accepted chain click inside the 220 ms window cancels B and is resolved as another B endpoint', () => {
  const pending = { current: null };
  const clock = fakeClock();
  const oldInteraction = { ...lines.EMPTY_LINE_INTERACTION, start: p.b0, startPointId: 'b0' };
  const acceptedB = resolve(oldInteraction, [A, T], p.s, null);
  const intendedCPointer = { x: 40, y: 100 };
  const prematureC = resolve(acceptedB.placement.interaction, [A, T], intendedCPointer, acceptedB.snap);
  const committed = [];
  boundary.scheduleDrawingLineCommit(pending, clock.scheduler, () => committed.push({ name: 'B', placement: acceptedB.placement }));
  boundary.scheduleDrawingLineCommit(pending, clock.scheduler, () => committed.push({ name: 'premature-C', placement: prematureC.placement }));
  clock.run();
  assert.equal(committed.length, 1);
  assert.equal(committed[0].name, 'premature-C');
  assert.deepEqual(committed[0].placement.interaction.start, p.b0,
    'the replacement click is resolved against old B, because continuation C does not exist yet');
  assert.deepEqual(committed[0].placement.effectivePoint, intendedCPointer);
  assert.notDeepEqual(committed[0].placement.effectivePoint, p.s,
    'the accepted B endpoint/topology is lost before persistence');
});
