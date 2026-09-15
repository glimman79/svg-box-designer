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
const start = { x: 0, y: 0 };
const parallel = { id: 'line-a', type: 'line', start: { x: 300, y: 300 }, end: { x: 400, y: 400 } };
const perpendicular = { id: 'line-b', type: 'line', start: { x: 300, y: -300 }, end: { x: 400, y: -400 } };

// This is the production pointer-move chain in DrawingWorkspace: collect all
// candidates, resolve snap channels/position with the prior frame, then resolve
// the Line endpoint and feed both outputs into the next frame.
const move = (frame, pointer, scene) => {
  const angular = lineTool.resolveLinePreviewPoint(start, pointer);
  const candidates = inference.collectDrawingInferenceCandidates(
    pointer, scene, identity, bounds, start, angular.snappedAngleDegrees,
  );
  const axisDirectionActive = angular.snapActive && [0, 90, 180, 270].includes(angular.snappedAngleDegrees);
  const snap = snaps.resolveDrawingSnap({
    rawPoint: pointer,
    candidates,
    previousSnap: frame.snap,
    ctrlOverride: false,
    axisDirectionActive,
    activeLineStart: start,
  });
  const placement = lineTool.resolveLineEffectivePoint(frame.interaction, pointer, snap);
  return { snap, interaction: placement.interaction, point: placement.effectivePoint };
};

const emptyFrame = () => ({ snap: null, interaction: { ...lineTool.EMPTY_LINE_INTERACTION, start, startPointId: 'start' } });
const parallelTruth = (point) => Math.abs(point.x - point.y) < 1e-9;
const perpendicularTruth = parallelTruth;

const workspaceSketch = {
  id: 'sketch', points: {
    a1: { id: 'a1', x: 300, y: 300 }, a2: { id: 'a2', x: 400, y: 400 },
    b1: { id: 'b1', x: 300, y: -300 }, b2: { id: 'b2', x: 400, y: -400 },
    c1: { id: 'c1', x: 200, y: 180 }, c2: { id: 'c2', x: 290, y: 80 },
  }, entities: {
    'line-a': { id: 'line-a', type: 'line', startPointId: 'a1', endPointId: 'a2' },
    'line-b': { id: 'line-b', type: 'line', startPointId: 'b1', endPointId: 'b2' },
    'line-c': { id: 'line-c', type: 'line', startPointId: 'c1', endPointId: 'c2' },
  }, entityOrder: ['line-a', 'line-b', 'line-c'], dimensions: {}, dimensionOrder: [], geometricConstraints: {}, geometricConstraintOrder: [],
};

test('workspace production path composes compatible directions before a point-reference positional winner', () => {
  const blocker = { id: 'line-c', type: 'line', start: { x: 200, y: 180 }, end: { x: 290, y: 80 }, startPointId: 'c1', endPointId: 'c2' };
  let frame = move(emptyFrame(), { x: 100, y: 103 }, [parallel]);
  assert.equal(frame.snap.channels.parallel.entityId, parallel.id);
  assert.equal(frame.snap.type, 'parallel');
  assert.equal(frame.interaction.parallelLineId, parallel.id);
  assert.ok(parallelTruth(frame.point));

  frame = move(frame, { x: 110, y: 106 }, [parallel, perpendicular, blocker]);
  assert.equal(frame.snap.type, 'point-reference', 'real positional priority chooses the competing point construction');
  assert.equal(frame.snap.channels.parallel.entityId, parallel.id);
  assert.equal(frame.snap.channels.perpendicular.entityId, perpendicular.id);
  assert.ok(Math.abs(frame.point.x - 108) < 1e-9 && Math.abs(frame.point.y - 108) < 1e-9);
  assert.equal(frame.interaction.parallelLineId, parallel.id);
  assert.equal(frame.interaction.perpendicularLineId, perpendicular.id);
  assert.ok(parallelTruth(frame.point) && perpendicularTruth(frame.point));

  const shown = presentation.deriveDrawingInferencePresentations(frame.snap, workspaceSketch, 1, identity, identity, frame.interaction);
  assert.deepEqual(shown.map(({ kind }) => kind), ['parallel', 'perpendicular'],
    'equivalent geometry retains both distinct accepted semantic relations in transient feedback');

  frame = move(frame, { x: 111, y: 107 }, [parallel, perpendicular, blocker]);
  assert.equal(frame.interaction.parallelLineId, parallel.id);
  assert.equal(frame.interaction.perpendicularLineId, perpendicular.id);

  const click = lineTool.applyResolvedLineClick(frame.interaction, frame.point, () => 'authored');
  const document = { version: 2, activeSketchId: 'sketch', sketches: { sketch: workspaceSketch }, sketchOrder: ['sketch'] };
  const selected = lineTool.selectMinimalLineSemanticConstraints(frame.interaction);
  assert.equal(selected.parallelLineId, parallel.id);
  assert.equal(selected.perpendicularLineId, null);
  assert.deepEqual(selected.rejected, [{ relation: 'perpendicular', lineId: perpendicular.id,
    reason: 'redundant equivalent demand; preferred representative selected' }]);
  const committed = lineTool.appendEntityToActiveSketch(document, click.entity, (() => { let n = 0; return () => `new-${++n}`; })(),
    null, selected.perpendicularLineId, null, selected.parallelLineId);
  assert.deepEqual(Object.values(committed.sketches.sketch.geometricConstraints).map(({ kind }) => kind), ['PARALLEL']);
});

test('fresh next-chain frame groups equivalent direction evidence before composing Y alignment', () => {
  const duplicateParallel = { ...parallel, id: 'line-a-duplicate', start: { x: 500, y: 500 }, end: { x: 600, y: 600 } };
  const candidatePoint = { x: 105.952, y: 105.952 };
  const atEdge = (candidate) => ({ ...candidate, candidatePoint, screenDistance: 8.4169 });
  const yAlignment = { type: 'alignment-y', referenceId: 'aligned', entityId: 'alignment-owner',
    candidatePoint: { x: 0, y: 100 }, positionOwnership: 'defines-position', screenDistance: 4.6948 };
  const snap = snaps.resolveDrawingSnap({ rawPoint: { x: 106, y: 100 }, previousSnap: null, ctrlOverride: false,
    activeLineStart: start, candidates: { endpoints: [], midpoints: [], lines: [], alignmentsX: [], alignmentsY: [yAlignment], pointReferences: [],
      parallels: [atEdge({ type: 'parallel', entityId: parallel.id, lineStart: parallel.start, lineEnd: parallel.end }),
        atEdge({ type: 'parallel', entityId: duplicateParallel.id, lineStart: duplicateParallel.start, lineEnd: duplicateParallel.end })],
      perpendiculars: [atEdge({ type: 'perpendicular', entityId: perpendicular.id, lineStart: perpendicular.start, lineEnd: perpendicular.end })] } });
  assert.equal(snap.type, 'parallel', 'equivalent group remains acquirable through compatible positional composition');
  assert.equal(snap.channels.parallel.entityId, parallel.id, 'equal references use stable identity');
  assert.equal(snap.channels.perpendicular.entityId, perpendicular.id);
  const accepted = lineTool.resolveLineEffectivePoint(emptyFrame().interaction, { x: 106, y: 100 }, snap);
  assert.deepEqual(accepted.effectivePoint, { x: 100, y: 100 });
  assert.equal(accepted.interaction.parallelLineId, parallel.id);
  assert.equal(accepted.interaction.perpendicularLineId, perpendicular.id);
});

test('Perpendicular alone remains the preview and persistent semantic representative', () => {
  const interaction = { ...lineTool.EMPTY_LINE_INTERACTION, start, effectivePreviewPoint: { x: 100, y: 100 },
    perpendicularLineId: perpendicular.id };
  assert.deepEqual([...presentation.selectAcceptedLineInferenceRepresentations(interaction)], ['perpendicular']);
  assert.deepEqual(lineTool.selectMinimalLineSemanticConstraints(interaction), {
    parallelLineId: null, perpendicularLineId: perpendicular.id, rejected: [],
  });
});

test('transient semantic presentation is independent from minimal persistence', () => {
  const interaction = { ...lineTool.EMPTY_LINE_INTERACTION, start, effectivePreviewPoint: { x: 160, y: 160 },
    parallelLineId: parallel.id, perpendicularLineId: perpendicular.id };
  assert.deepEqual([...presentation.selectAcceptedLineInferenceRepresentations(interaction)], ['parallel', 'perpendicular']);
  assert.deepEqual(lineTool.selectMinimalLineSemanticConstraints(interaction), {
    parallelLineId: parallel.id,
    perpendicularLineId: null,
    rejected: [{ relation: 'perpendicular', lineId: perpendicular.id,
      reason: 'redundant equivalent demand; preferred representative selected' }],
  });
});

test('a lone acquired semantic direction composes with a different positional support and owns hover/click truth', () => {
  const pointer = { x: 100, y: 53 };
  const target = { id: 'line-a', type: 'line', start: { x: 300, y: 300 }, end: { x: 400, y: 350 } };
  const collected = inference.collectDrawingInferenceCandidates(pointer, [target], identity, bounds, start, null);
  const pointReference = {
    type: 'point-reference', kind: 'normal-to-incident-line', incidentLineId: 'support-line', sourcePointId: 'support-point',
    supportOrigin: { x: 100, y: 0 }, supportDirection: { x: 0, y: 1 }, constructionKey: 'support',
    candidatePoint: { x: 100, y: 53 }, screenDistance: 0,
  };
  const snap = snaps.resolveDrawingSnap({ rawPoint: pointer, previousSnap: null, ctrlOverride: false, axisDirectionActive: false,
    candidates: { ...collected, endpoints: [], midpoints: [], lines: [], alignmentsX: [], alignmentsY: [],
      perpendiculars: [], pointReferences: [pointReference] } });
  assert.equal(snap.type, 'point-reference');
  assert.equal(snap.channels.parallel.entityId, target.id);
  assert.equal(snap.channels.perpendicular, null);

  const accepted = lineTool.resolveLineEffectivePoint(emptyFrame().interaction, pointer, snap);
  assert.deepEqual(accepted.effectivePoint, { x: 100, y: 50 }, 'position support and direction meet at one endpoint');
  assert.equal(accepted.interaction.parallelLineId, target.id, 'the positional winner does not erase compatible semantics');
  assert.equal(accepted.interaction.perpendicularLineId, null);
  assert.deepEqual(accepted.interaction.effectivePreviewPoint, accepted.effectivePoint, 'semantic evaluation cannot move final geometry');

  const sketch = { ...workspaceSketch, points: { ...workspaceSketch.points,
    a1: { id: 'a1', x: 300, y: 300 }, a2: { id: 'a2', x: 400, y: 350 } } };
  const shown = presentation.deriveDrawingInferencePresentations(snap, sketch, 1, identity, identity, accepted.interaction);
  assert.deepEqual(shown.map(({ kind }) => kind), ['parallel'], 'presentation is a pure projection of accepted semantics');
  assert.equal(accepted.interaction.parallelLineId, target.id, 'presentation does not mutate acceptance');

  const click = lineTool.applyResolvedLineClick(accepted.interaction, accepted.effectivePoint, () => 'authored');
  assert.deepEqual(click.entity.end, accepted.effectivePoint, 'click consumes the frozen hover endpoint');
  const document = { version: 2, activeSketchId: 'sketch', sketches: { sketch }, sketchOrder: ['sketch'] };
  const committed = lineTool.appendEntityToActiveSketch(document, click.entity, (() => { let n = 0; return () => `solo-${++n}`; })(),
    null, null, null, accepted.interaction.parallelLineId);
  const committedLine = committed.sketches.sketch.entities.authored;
  const committedEnd = committed.sketches.sketch.points[committedLine.endPointId];
  assert.deepEqual({ x: committedEnd.x, y: committedEnd.y }, accepted.effectivePoint, 'commit retains the accepted click geometry');
  assert.equal(committed.sketches.sketch.geometricConstraints['parallel:authored:line-a'].kind, 'PARALLEL');
});

test('closer alignment authority retains compatible acquired direction channels beyond their independent release radius', () => {
  const previousCandidates = inference.collectDrawingInferenceCandidates({ x: 100, y: 103 }, [parallel, perpendicular], identity, bounds, start, null);
  const previous = snaps.resolveDrawingSnap({ rawPoint: { x: 100, y: 103 }, candidates: previousCandidates,
    previousSnap: null, ctrlOverride: false, activeLineStart: start });
  assert.ok(previous.channels.parallel && previous.channels.perpendicular);

  const yAlignment = { type: 'alignment-y', referenceId: 'aligned-point', entityId: 'alignment-owner',
    candidatePoint: { x: 0, y: 120 }, positionOwnership: 'defines-position', screenDistance: 4.8 };
  const outsideRelease = inference.collectDrawingInferenceCandidates({ x: 130, y: 112.13 }, [parallel, perpendicular], identity, bounds, start, null);
  const aligned = snaps.resolveDrawingSnap({ rawPoint: { x: 130, y: 112.13 }, previousSnap: previous,
    ctrlOverride: false, activeLineStart: start, candidates: { ...outsideRelease, endpoints: [], midpoints: [], lines: [],
      alignmentsX: [], alignmentsY: [yAlignment], pointReferences: [] } });
  assert.equal(aligned.type, 'alignment');
  assert.equal(aligned.channels.parallel?.entityId, parallel.id);
  assert.equal(aligned.channels.perpendicular?.entityId, perpendicular.id);
  const accepted = lineTool.resolveLineEffectivePoint(emptyFrame().interaction, { x: 130, y: 112.13 }, aligned);
  assert.deepEqual(accepted.effectivePoint, { x: 120, y: 120 });
  assert.equal(accepted.interaction.parallelLineId, parallel.id);
  assert.equal(accepted.interaction.perpendicularLineId, perpendicular.id);
});

test('alignment retention composes either direction family and rejects an incompatible coordinate demand', () => {
  for (const family of ['parallel', 'perpendicular']) {
    const scene = family === 'parallel' ? [parallel] : [perpendicular];
    const initialCandidates = inference.collectDrawingInferenceCandidates({ x: 100, y: 103 }, scene, identity, bounds, start, null);
    const initial = snaps.resolveDrawingSnap({ rawPoint: { x: 100, y: 103 }, candidates: initialCandidates,
      previousSnap: null, ctrlOverride: false, activeLineStart: start });
    const movedCandidates = inference.collectDrawingInferenceCandidates({ x: 130, y: 112.13 }, scene, identity, bounds, start, null);
    const aligned = snaps.resolveDrawingSnap({ rawPoint: { x: 130, y: 112.13 }, previousSnap: initial,
      ctrlOverride: false, activeLineStart: start, candidates: { ...movedCandidates, endpoints: [], midpoints: [], lines: [],
        alignmentsX: [], alignmentsY: [{ type: 'alignment-y', referenceId: 'ref', entityId: 'owner', candidatePoint: { x: 0, y: 120 },
          positionOwnership: 'defines-position', screenDistance: 4 }], pointReferences: [] } });
    assert.equal(aligned.type, 'alignment');
    assert.equal(aligned.channels[family]?.entityId, scene[0].id);
  }

  const horizontal = { id: 'horizontal', type: 'line', start: { x: 0, y: 0 }, end: { x: 100, y: 0 } };
  const near = inference.collectDrawingInferenceCandidates({ x: 100, y: 3 }, [horizontal], identity, bounds, start, null);
  const held = snaps.resolveDrawingSnap({ rawPoint: { x: 100, y: 3 }, candidates: near, previousSnap: null,
    ctrlOverride: false, activeLineStart: start });
  const far = inference.collectDrawingInferenceCandidates({ x: 100, y: 20 }, [horizontal], identity, bounds, start, null);
  const incompatible = snaps.resolveDrawingSnap({ rawPoint: { x: 100, y: 20 }, previousSnap: held,
    ctrlOverride: false, activeLineStart: start, candidates: { ...far, endpoints: [], midpoints: [], lines: [],
      alignmentsX: [], alignmentsY: [{ type: 'alignment-y', referenceId: 'ref', entityId: 'owner', candidatePoint: { x: 0, y: 20 },
        positionOwnership: 'defines-position', screenDistance: 1 }], pointReferences: [] } });
  assert.equal(incompatible.channels.parallel, null, 'a coordinate with no directional intersection cannot retain semantic truth');
});

const endpointSnap = ({ end, parallelTarget = null, perpendicularTarget = null }) => snaps.resolveDrawingSnap({
  rawPoint: end,
  previousSnap: null,
  ctrlOverride: false,
  axisDirectionActive: false,
  candidates: {
    endpoints: [{ type: 'endpoint', entityId: 'endpoint-owner', endpoint: 'end', candidatePoint: end, screenDistance: 0 }],
    midpoints: [], lines: [], alignmentsX: [], alignmentsY: [], pointReferences: [],
    parallels: parallelTarget ? [{ type: 'parallel', entityId: parallelTarget.id, candidatePoint: end, screenDistance: 0,
      lineStart: parallelTarget.start, lineEnd: parallelTarget.end }] : [],
    perpendiculars: perpendicularTarget ? [{ type: 'perpendicular', entityId: perpendicularTarget.id, candidatePoint: end, screenDistance: 0,
      lineStart: perpendicularTarget.start, lineEnd: perpendicularTarget.end }] : [],
  },
});

test('hard Endpoint position retains every acquired direction that is true at its frozen geometry', () => {
  const end = { x: 100, y: 100 };
  for (const [parallelTarget, perpendicularTarget, expected] of [
    [parallel, null, ['line-a']],
    [null, perpendicular, ['line-b']],
    [parallel, perpendicular, ['line-a', 'line-b']],
  ]) {
    const snap = endpointSnap({ end, parallelTarget, perpendicularTarget });
    assert.equal(snap.type, 'endpoint');
    const accepted = lineTool.resolveLineEffectivePoint(emptyFrame().interaction, end, snap);
    assert.deepEqual(accepted.effectivePoint, end, 'Endpoint remains immutable position authority');
    assert.deepEqual([accepted.interaction.parallelLineId, accepted.interaction.perpendicularLineId].filter(Boolean), expected);
  }
});

test('hard Endpoint position rejects acquired directions that are false at its frozen geometry', () => {
  const end = { x: 100, y: 80 };
  const snap = endpointSnap({ end, parallelTarget: parallel, perpendicularTarget: perpendicular });
  const accepted = lineTool.resolveLineEffectivePoint(emptyFrame().interaction, end, snap);
  assert.deepEqual(accepted.effectivePoint, end);
  assert.equal(accepted.interaction.parallelLineId, null);
  assert.equal(accepted.interaction.perpendicularLineId, null);
});

test('continuous 90-degree chain retains incident Perpendicular and derived Parallel semantics', () => {
  const a = { id: 'A', type: 'line', start: { x: 0, y: 0 }, end: { x: 100, y: 50 }, startPointId: 'a0', endPointId: 'shared-a' };
  const bStart = a.end, bEnd = { x: 50, y: 150 };
  const bCandidates = inference.collectDrawingInferenceCandidates(bEnd, [a], identity, bounds, bStart, null);
  const bSnap = snaps.resolveDrawingSnap({ rawPoint: bEnd, candidates: bCandidates, previousSnap: null, ctrlOverride: false, axisDirectionActive: false });
  const bInteraction = { ...lineTool.EMPTY_LINE_INTERACTION, start: bStart, startPointId: 'shared-a', previousChainedLineId: 'A' };
  const bAccepted = lineTool.resolveLineEffectivePoint(bInteraction, bEnd, bSnap);
  assert.equal(bAccepted.interaction.perpendicularLineId, 'A');
  const bClick = lineTool.applyResolvedLineClick(bAccepted.interaction, bAccepted.effectivePoint, () => 'B', 'shared-b');
  assert.equal(bClick.interaction.previousChainedLineId, 'B');
  assert.deepEqual(bClick.interaction.start, bAccepted.effectivePoint);

  const b = { ...bClick.entity, startPointId: 'shared-a', endPointId: 'shared-b' };
  const cEnd = { x: 150, y: 200 };
  const cCandidates = inference.collectDrawingInferenceCandidates(cEnd, [a, b], identity, bounds, bClick.interaction.start, null);
  const cSnap = snaps.resolveDrawingSnap({ rawPoint: cEnd, candidates: cCandidates, previousSnap: null, ctrlOverride: false, axisDirectionActive: false });
  const cAccepted = lineTool.resolveLineEffectivePoint(bClick.interaction, cEnd, cSnap);
  assert.deepEqual(cAccepted.effectivePoint, cEnd);
  assert.equal(cAccepted.interaction.parallelLineId, 'A');
  assert.equal(cAccepted.interaction.perpendicularLineId, 'B');
});

test('direction compatibility fails closed and preserves H/V and Ctrl policies', () => {
  const incompatible = { ...perpendicular, id: 'bad', start: { x: 300, y: -300 }, end: { x: 420, y: -360 } };
  let frame = move(emptyFrame(), { x: 7, y: 7 }, [parallel, incompatible]);
  assert.equal(frame.snap.channels.parallel.entityId, parallel.id);
  assert.equal(frame.snap.channels.perpendicular.entityId, incompatible.id);
  assert.notEqual(frame.interaction.parallelLineId !== null && frame.interaction.perpendicularLineId !== null, true);

  const reversedParallel = { ...parallel, start: parallel.end, end: parallel.start };
  const reversedPerpendicular = { ...perpendicular, start: perpendicular.end, end: perpendicular.start };
  frame = move(emptyFrame(), { x: 110, y: 106 }, [reversedParallel, reversedPerpendicular]);
  assert.equal(frame.interaction.parallelLineId, parallel.id);
  assert.equal(frame.interaction.perpendicularLineId, perpendicular.id);

  const degenerate = { id: 'zero', type: 'line', start: { x: 5, y: 5 }, end: { x: 5, y: 5 } };
  const candidates = inference.collectDrawingInferenceCandidates({ x: 5, y: 5 }, [degenerate], identity, bounds, start, null);
  assert.equal(candidates.parallels.length + candidates.perpendiculars.length, 0);

  const axisCandidates = inference.collectDrawingInferenceCandidates({ x: 100, y: 1 }, [parallel, perpendicular], identity, bounds, start, 0);
  const axis = snaps.resolveDrawingSnap({ rawPoint: { x: 100, y: 1 }, candidates: axisCandidates, previousSnap: null, ctrlOverride: false, axisDirectionActive: true });
  assert.equal(axis.channels.parallel, null); assert.equal(axis.channels.perpendicular, null);
  const ctrl = snaps.resolveDrawingSnap({ rawPoint: { x: 110, y: 106 }, candidates: axisCandidates, previousSnap: frame.snap, ctrlOverride: true });
  assert.equal(ctrl.type, 'none'); assert.equal(ctrl.channels.parallel, null); assert.equal(ctrl.channels.perpendicular, null);
});

test('live pointer frames retain, release, and reacquire Parallel and Perpendicular independently', () => {
  let frame = move(emptyFrame(), { x: 100, y: 70 }, []); // frame 1: raw
  assert.equal(frame.interaction.parallelLineId, null);
  assert.equal(frame.interaction.perpendicularLineId, null);

  frame = move(frame, { x: 100, y: 103 }, [parallel]); // frame 2: Parallel first
  assert.equal(frame.interaction.parallelLineId, parallel.id);
  assert.equal(frame.interaction.perpendicularLineId, null);
  assert.ok(parallelTruth(frame.point), 'Parallel is functional geometry, not metadata');

  frame = move(frame, { x: 110, y: 106 }, [parallel, perpendicular]); // frame 3: Perpendicular joins
  assert.equal(frame.interaction.parallelLineId, parallel.id, 'the live transition does not erase Parallel');
  assert.equal(frame.interaction.perpendicularLineId, perpendicular.id);
  assert.ok(parallelTruth(frame.point) && perpendicularTruth(frame.point));

  for (const pointer of [{ x: 111, y: 107 }, { x: 109, y: 113 }, { x: 112, y: 108 }]) { // frames 4-6
    frame = move(frame, pointer, [parallel, perpendicular]);
    assert.equal(frame.interaction.parallelLineId, parallel.id);
    assert.equal(frame.interaction.perpendicularLineId, perpendicular.id);
    assert.ok(parallelTruth(frame.point) && perpendicularTruth(frame.point));
  }

  frame = move(frame, { x: 120, y: 117 }, [parallel]);
  assert.equal(frame.interaction.parallelLineId, parallel.id);
  assert.equal(frame.interaction.perpendicularLineId, null, 'a stale Perpendicular target is rejected');

  frame = move(frame, { x: 125, y: 128 }, [perpendicular]);
  assert.equal(frame.interaction.parallelLineId, null, 'a stale Parallel target is rejected');
  assert.equal(frame.interaction.perpendicularLineId, perpendicular.id);
});

test('live acquisition order does not matter', () => {
  let frame = move(emptyFrame(), { x: 80, y: 77 }, [perpendicular]);
  assert.equal(frame.interaction.parallelLineId, null);
  assert.equal(frame.interaction.perpendicularLineId, perpendicular.id);

  frame = move(frame, { x: 90, y: 94 }, [parallel, perpendicular]);
  assert.equal(frame.interaction.parallelLineId, parallel.id);
  assert.equal(frame.interaction.perpendicularLineId, perpendicular.id);
  assert.ok(parallelTruth(frame.point) && perpendicularTruth(frame.point));
});
