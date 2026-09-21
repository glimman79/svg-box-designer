import assert from 'node:assert/strict';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const built = (name) => pathToFileURL(path.resolve(`.test-build/drawing-profile-production-boundary/${name}.js`));
const inference = await import(built('drawingInference'));
const snaps = await import(built('drawingSnapEngine'));
const lines = await import(built('drawingProfileTool'));
const boundary = await import(built('drawingProfileCommitBoundary'));
const topology = await import(built('drawingTopology'));
const presentation = await import(built('drawingInferencePresentation'));

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
    interaction: placement.interaction, diagnostic: placement.diagnostic },
});

test('same-event continuation reads the committed transaction snapshot and is frame-equivalent to manual start', () => {
  let document = documentFor(false);
  const renderClosureLines = topology.resolveActiveSketchLines(document);
  const accepted = resolve(lines.initializeProfileSegmentAt(p.b0, 'b0'), renderClosureLines, p.s, null).placement;
  const committed = lines.applyResolvedProfileClick(accepted.interaction, accepted.effectivePoint, () => 'B', 'S');
  document = lines.appendEntityToActiveSketch(document, committed.entity);

  assert.deepEqual(renderClosureLines.map(({ id }) => id), ['A', 'T'], 'the pre-commit render closure is stale in this browser event');
  const committedLines = topology.resolveActiveSketchLines(document);
  assert.deepEqual(committedLines.map(({ id }) => id), ['A', 'T', 'B']);
  assert.equal(committed.interaction.startPointId, 'S');

  const pointers = [
    { point: { x: 13, y: 66 }, ctrl: false },
    { point: { x: 25, y: 85 }, ctrl: false },
    { point: { x: 40, y: 100 }, ctrl: false },
    { point: { x: 55, y: 115 }, ctrl: false },
    { point: p.t1, ctrl: false },
    { point: { x: 10, y: 90 }, ctrl: false },
    { point: { x: 14, y: 66 }, ctrl: false },
    { point: { x: 25, y: 85 }, ctrl: false },
    { point: { x: 25, y: 85 }, ctrl: true },
  ];
  const run = (initial) => {
    let interaction = initial, previousSnap = null;
    return pointers.map(({ point, ctrl }) => {
      const angular = lines.resolveLinePreviewPoint(interaction.start, point);
      const candidates = inference.collectDrawingInferenceCandidates(point, committedLines, identity, bounds, interaction.start,
        previousSnap?.channels.directionAuthority
          ? Math.atan2(previousSnap.channels.directionAuthority.constructionDirection.y, previousSnap.channels.directionAuthority.constructionDirection.x) * 180 / Math.PI
          : angular.snapActive ? angular.snappedAngleDegrees : null, interaction.startPointId);
      const snap = snaps.resolveDrawingSnap({ rawPoint: point, candidates, previousSnap, ctrlOverride: ctrl,
        axisDirectionActive: angular.snapActive && [0, 90, 180, 270].includes(angular.snappedAngleDegrees),
        activeLineStart: interaction.start, activeLineStartPointId: interaction.startPointId });
      const placement = lines.resolveLineEffectivePoint(interaction, point, snap, ctrl);
      interaction = placement.interaction;
      previousSnap = snap;
      return { ...summarize({ candidates, snap, placement }), presentationKinds: presentation.deriveDrawingInferencePresentations(
        snap, document.sketches.sketch, 1, identity, identity, interaction).map(({ kind }) => kind) };
    });
  };
  const chainedFrames = run(committed.interaction);
  const manualFrames = run(lines.initializeProfileSegmentAt(p.s, 'S'));
  assert.deepEqual(chainedFrames, manualFrames, 'candidates, authorities, effective point, semantics, and transient truth match on every pointer frame');
  assert.equal(chainedFrames[1].snap.channels.directionAuthority?.relation, 'parallel');
  assert.equal(chainedFrames[4].snap.type, 'endpoint');
  assert.equal(chainedFrames.at(-1).snap.type, 'none', 'Ctrl bypass is identical and clears authority');
});

for (const [name, delayPointers] of [
  ['no movement', []],
  ['slight movement', [{ x: 9, y: 69 }]],
  ['movement toward C', [{ x: 20, y: 80 }, { x: 35, y: 95 }]],
]) test(`delayed continuation (${name}) discards old-segment hover state and matches manual restart`, () => {
  const events = [];
  const pending = { current: null };
  const clock = fakeClock();
  let interaction = { ...lines.EMPTY_PROFILE_INTERACTION, start: p.b0, startPointId: 'b0' };
  let snap = null;
  let document = documentFor(false);

  const accepted = resolve(interaction, [A, T], p.s, snap);
  interaction = accepted.placement.interaction;
  snap = accepted.snap;
  events.push({ type: 'click-accepted', interaction, snap });
  boundary.scheduleDrawingProfileCommit(pending, clock.scheduler, () => {
    const click = lines.applyResolvedProfileClick(accepted.placement.interaction, accepted.placement.effectivePoint, () => 'B', 'S');
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
  assert.equal(snap, null, 'both state/ref model enter the continued segment without old hysteresis');

  const postPointers = [{ x: 25, y: 85 }, { x: 40, y: 100 }, { x: 55, y: 115 }];
  const continuedFrames = [];
  for (const pointer of postPointers) {
    const frame = resolve(interaction, [A, T, B], pointer, snap);
    interaction = frame.placement.interaction;
    snap = frame.snap;
    continuedFrames.push(frame);
  }
  let manualInteraction = { ...lines.EMPTY_PROFILE_INTERACTION, start: p.s, startPointId: 'S' };
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

test('a second click inside 220 ms flushes B before it is resolved as C', () => {
  const pending = { current: null };
  const clock = fakeClock();
  let interaction = lines.initializeProfileSegmentAt(p.b0, 'b0');
  let scene = [A, T];
  const committed = [];
  const acceptedB = resolve(interaction, scene, p.s, null);
  boundary.scheduleDrawingProfileCommit(pending, clock.scheduler, () => {
    const click = lines.applyResolvedProfileClick(acceptedB.placement.interaction, acceptedB.placement.effectivePoint, () => 'B', 'S');
    interaction = click.interaction; scene = [...scene, { ...B }]; committed.push(click.entity);
  });
  const intendedCPointer = { x: 40, y: 100 };
  assert.equal(boundary.flushDrawingProfileCommit(pending, clock.scheduler), true);
  const acceptedC = resolve(interaction, scene, intendedCPointer, null);
  boundary.scheduleDrawingProfileCommit(pending, clock.scheduler, () => {
    const click = lines.applyResolvedProfileClick(acceptedC.placement.interaction, acceptedC.placement.effectivePoint, () => 'C', 'C-end');
    interaction = click.interaction; committed.push(click.entity);
  });
  clock.run();
  assert.deepEqual(committed.map(({ id }) => id), ['B', 'C']);
  assert.equal(committed[0].endPointId, 'S');
  assert.equal(committed[1].startPointId, 'S', 'C resolves only after B establishes continuation topology');
  assert.deepEqual(committed[1].start, p.s);
});

test('multiple rapid clicks commit every accepted segment exactly once with connected topology', () => {
  const pending = { current: null }, clock = fakeClock();
  let interaction = lines.initializeProfileSegmentAt({ x: 0, y: 0 }, 'P0');
  const committed = [];
  for (const [index, point] of [{ x: 10, y: 10 }, { x: 20, y: 20 }, { x: 30, y: 30 }].entries()) {
    boundary.flushDrawingProfileCommit(pending, clock.scheduler);
    const accepted = resolve(interaction, [], point, null).placement;
    boundary.scheduleDrawingProfileCommit(pending, clock.scheduler, () => {
      const click = lines.applyResolvedProfileClick(accepted.interaction, accepted.effectivePoint, () => `L${index + 1}`, `P${index + 1}`);
      interaction = click.interaction; committed.push(click.entity);
    });
  }
  clock.run();
  assert.deepEqual(committed.map(({ id, startPointId, endPointId }) => ({ id, startPointId, endPointId })), [
    { id: 'L1', startPointId: 'P0', endPointId: 'P1' },
    { id: 'L2', startPointId: 'P1', endPointId: 'P2' },
    { id: 'L3', startPointId: 'P2', endPointId: 'P3' },
  ]);
});

test('explicit cancellation discards the pending accepted click', () => {
  const pending = { current: null }, clock = fakeClock();
  let commits = 0;
  boundary.scheduleDrawingProfileCommit(pending, clock.scheduler, () => commits++);
  assert.equal(boundary.cancelDrawingProfileCommit(pending, clock.scheduler), true);
  clock.run();
  assert.equal(commits, 0);
});
