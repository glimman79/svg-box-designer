import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = path.resolve('.test-build/d2-3a');
const line = await import(pathToFileURL(path.join(root, 'drawingLineTool.js')));
const start = { x: 4.25, y: -7.5 };
const tolerance = 1e-10;

for (const degrees of [0, 22.5, 45, 90]) {
  const radians = (degrees + 1) * Math.PI / 180;
  const preview = line.resolveLinePreviewPoint(start, { x: start.x + 30 * Math.cos(radians), y: start.y + 30 * Math.sin(radians) });
  const acceptedSnapshot = Object.freeze({ ...preview.effectivePreviewPoint });
  const pointerAfterClick = { x: -999, y: 1234 };
  void pointerAfterClick;
  const interaction = line.applyResolvedLineClick(line.EMPTY_LINE_INTERACTION, start, () => 'start').interaction;
  const committed = line.applyResolvedLineClick(interaction, acceptedSnapshot, () => `angle-${degrees}`).entity;
  assert.deepEqual(committed.end, acceptedSnapshot, `${degrees} degree commit is the accepted preview object geometry`);
  const dx = committed.end.x - start.x;
  const dy = committed.end.y - start.y;
  assert.ok(Math.abs(Math.atan2(dy, dx) * 180 / Math.PI - degrees) < tolerance, `${degrees} degree endpoint cannot drift`);
}

const workspace = fs.readFileSync('src/app/DrawingWorkspace.tsx', 'utf8');
assert.match(workspace, /const placement = resolvePlacement[\s\S]*const effectivePoint = placement\.effectivePoint[\s\S]*setTimeout\([\s\S]*commitLinePoint\(effectivePoint\)/, 'delayed handler closes over the accepted effective point');
assert.doesNotMatch(workspace, /setTimeout\([\s\S]{0,180}resolvePlacement/, 'delayed commit does not resolve coordinates again');
assert.match(workspace, /if \(panHandlers\.onPointerMove\(event\)\) return;/, 'right-pan skips candidate scanning and preview updates');

console.log('D2.3a line stabilization tests passed');
