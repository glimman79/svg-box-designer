import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {
  applyDrawingBoxSelection, drawingLineQualifiesForRect, drawingSelectionMode,
  normalizeDrawingSelectionRect, selectDrawingGeometryInRect,
} from '../.test-build/drawing-box-selection/drawingBoxSelection.js';

const line = (id, start, end) => ({ id, type: 'line', startPointId: `${id}:a`, endPointId: `${id}:b`, start, end });
const rect = normalizeDrawingSelectionRect({ x: 10, y: 10 }, { x: 0, y: 0 });

test('window selection requires both endpoints strictly inside normalized bounds', () => {
  assert.deepEqual(rect, { minX: 0, maxX: 10, minY: 0, maxY: 10 });
  for (const candidate of [
    line('outside', { x: 2, y: 2 }, { x: 12, y: 2 }),
    line('crossing', { x: -2, y: 5 }, { x: 12, y: 5 }),
    line('boundary', { x: 0, y: 2 }, { x: 8, y: 2 }),
    line('touch', { x: -2, y: -2 }, { x: 0, y: 0 }),
    line('overlap', { x: 0, y: 2 }, { x: 0, y: 8 }),
  ]) assert.equal(drawingLineQualifiesForRect(candidate, rect, 'window'), false, candidate.id);
  assert.equal(drawingLineQualifiesForRect(line('contained', { x: 2, y: 2 }, { x: 8, y: 8 }), rect, 'window'), true);
  assert.equal(drawingLineQualifiesForRect(line('reversed', { x: 8, y: 8 }, { x: 2, y: 2 }), rect, 'window'), true);
});

test('crossing selection includes containment, crossing, and every boundary contact', () => {
  for (const candidate of [
    line('contained', { x: 2, y: 2 }, { x: 8, y: 8 }),
    line('one-inside', { x: 5, y: 5 }, { x: 15, y: 5 }),
    line('crossing', { x: -2, y: 5 }, { x: 12, y: 5 }),
    line('endpoint-boundary', { x: 0, y: 2 }, { x: -2, y: 2 }),
    line('edge-touch', { x: -2, y: 5 }, { x: 0, y: 5 }),
    line('corner-touch', { x: -2, y: -2 }, { x: 0, y: 0 }),
    line('overlap', { x: 0, y: 2 }, { x: 0, y: 8 }),
    line('reversed', { x: 12, y: 5 }, { x: -2, y: 5 }),
  ]) assert.equal(drawingLineQualifiesForRect(candidate, rect, 'crossing'), true, candidate.id);
  assert.equal(drawingLineQualifiesForRect(line('separated', { x: -3, y: 2 }, { x: -1, y: 8 }), rect, 'crossing'), false);
});

test('direction is derived continuously and final qualification uses the current mode', () => {
  assert.equal(drawingSelectionMode(5, 9), 'window');
  assert.equal(drawingSelectionMode(5, 5), 'window');
  assert.equal(drawingSelectionMode(5, 1), 'crossing');
  assert.equal(drawingSelectionMode(5, 7), 'window');
  const crossingOnly = line('crossing-only', { x: -2, y: 5 }, { x: 5, y: 5 });
  assert.deepEqual(selectDrawingGeometryInRect([crossingOnly], rect, drawingSelectionMode(10, 0)), [{ kind: 'line', lineId: 'crossing-only' }]);
  assert.deepEqual(selectDrawingGeometryInRect([crossingOnly], rect, drawingSelectionMode(0, 10)), []);
});

test('replacement and ordered Ctrl toggle preserve point selections', () => {
  const point = { kind: 'point', pointId: 'P' }, a = { kind: 'line', lineId: 'A' }, b = { kind: 'line', lineId: 'B' }, c = { kind: 'line', lineId: 'C' };
  assert.deepEqual(applyDrawingBoxSelection([a], [b, c], false), [b, c]);
  assert.deepEqual(applyDrawingBoxSelection([a], [], false), []);
  assert.deepEqual(applyDrawingBoxSelection([point, a, b], [b, c], true), [point, a, c]);
  assert.deepEqual(applyDrawingBoxSelection([point, a], [], true), [point, a]);
  assert.deepEqual(applyDrawingBoxSelection([], [b, c], true), [b, c]);
  assert.deepEqual(applyDrawingBoxSelection([a, b], [a, b], true), []);
});

test('workspace keeps threshold in client space and isolates transient selection behavior', () => {
  const workspace = fs.readFileSync('src/app/DrawingWorkspace.tsx', 'utf8');
  assert.match(workspace, /Math\.hypot\(event\.clientX - session\.originClient\.x, event\.clientY - session\.originClient\.y\) >= DRAWING_DRAG_THRESHOLD_PX/);
  assert.match(workspace, /if \(activeTool === 'select'\)/);
  assert.match(workspace, /if \(!hit && !explicitPointId && !explicitLineId && !explicitCircleId && !circleHit\)/);
  assert.match(workspace, /onLostPointerCapture=/);
  assert.match(workspace, /className=\{`drawing-selection-box is-\$\{selectionBoxMode\}`\}/);
  assert.doesNotMatch(workspace, /transactDocument\([^\n]*BoxSelection/);
});
