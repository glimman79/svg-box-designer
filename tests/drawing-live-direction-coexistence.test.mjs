import assert from 'node:assert/strict';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const built = (name) => pathToFileURL(path.resolve(`.test-build/drawing-live-direction-coexistence/${name}.js`));
const inference = await import(built('drawingInference'));
const snaps = await import(built('drawingSnapEngine'));
const lineTool = await import(built('drawingLineTool'));

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
  });
  const placement = lineTool.resolveLineEffectivePoint(frame.interaction, pointer, snap);
  return { snap, interaction: placement.interaction, point: placement.effectivePoint };
};

const emptyFrame = () => ({ snap: null, interaction: { ...lineTool.EMPTY_LINE_INTERACTION, start, startPointId: 'start' } });
const parallelTruth = (point) => Math.abs(point.x - point.y) < 1e-9;
const perpendicularTruth = parallelTruth;

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
