import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { applyResolvedLineClick, EMPTY_LINE_INTERACTION } from '../.test-build/drawing-line-tool/drawingLineTool.js';
import { activateDrawingTool, finishDrawingConstruction } from '../.test-build/drawing-line-tool/drawingToolLifecycle.js';

const point = (x, y) => ({ x, y });

test('standalone Line accepts P1 without geometry and completes exactly one neutral line at P2', () => {
  const first = applyResolvedLineClick(EMPTY_LINE_INTERACTION, point(1, 2), () => 'unused', 'p1', 'support', null);
  assert.equal(first.entity, null);
  assert.equal(first.interaction.startPointId, 'p1');
  assert.equal(first.interaction.startLineId, 'support');

  const second = applyResolvedLineClick(first.interaction, point(8, 9), () => 'line-1', 'p2');
  assert.deepEqual(second.entity, { id: 'line-1', type: 'line', start: point(1, 2), end: point(8, 9), startPointId: 'p1', endPointId: 'p2' });
  assert.deepEqual(second.interaction, EMPTY_LINE_INTERACTION);
  assert.equal('createdBy' in second.entity, false);
});

test('zero-length P2 neither commits nor finishes the interaction', () => {
  const first = applyResolvedLineClick(EMPTY_LINE_INTERACTION, point(4, 5), () => 'unused');
  const second = applyResolvedLineClick(first.interaction, point(4, 5), () => 'must-not-run');
  assert.equal(second.entity, null);
  assert.equal(second.interaction, first.interaction);
});

test('normal Line finishes to Select while persistent Line remains active for a fresh P1', () => {
  assert.equal(finishDrawingConstruction(activateDrawingTool('line')).activeTool, 'select');
  const persistent = finishDrawingConstruction(activateDrawingTool('line', 'persistent'));
  assert.equal(persistent.activeTool, 'line');
  const completed = applyResolvedLineClick(applyResolvedLineClick(EMPTY_LINE_INTERACTION, point(0, 0), () => 'unused').interaction, point(1, 0), () => 'a');
  const fresh = applyResolvedLineClick(completed.interaction, point(20, 20), () => 'unused');
  assert.equal(fresh.entity, null);
  assert.deepEqual(fresh.interaction.start, point(20, 20));
});

test('workspace exposes Line UI, shared placement, synchronous commit, and neutral cursor', () => {
  const workspace = fs.readFileSync('src/app/DrawingWorkspace.tsx', 'utf8');
  const styles = fs.readFileSync('src/styles.css', 'utf8');
  const app = fs.readFileSync('src/App.tsx', 'utf8');
  assert.match(workspace, />Line<\/button>/);
  assert.match(workspace, /aria-pressed=\{activeTool === 'line'\}/);
  assert.match(workspace, /commitSegmentPlacement\('line'/);
  assert.doesNotMatch(workspace, /scheduleDrawingProfileCommit[\s\S]{0,300}commitSegmentPlacement\('line'/);
  assert.match(workspace, /drawing-authoring-preview/);
  assert.match(workspace, /drawing-segment-cursor/);
  assert.match(styles, /\.drawing-svg\.has-authoring-cursor/);
  assert.match(app, /'select' \| 'line' \| 'profile' \| 'dimension'/);
  assert.match(workspace, /drawing:tool-state/);
});
