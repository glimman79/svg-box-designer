import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = path.resolve('.test-build/drawing-line-snap');
const lineTool = await import(pathToFileURL(path.join(root, 'drawingLineTool.js')));
const types = await import(pathToFileURL(path.join(root, 'drawingTypes.js')));
const transform = await import(pathToFileURL(path.join(root, 'drawingTransform.js')));
const epsilon = 1e-10;
const radians = (degrees) => degrees * Math.PI / 180;
const pointAt = (angle, distance = 17.3) => ({ x: 2.125 + distance * Math.cos(radians(angle)), y: -4.75 + distance * Math.sin(radians(angle)) });
const start = { x: 2.125, y: -4.75 };
const close = (actual, expected, message) => assert.ok(Math.abs(actual - expected) < epsilon, `${message}: ${actual} != ${expected}`);

assert.equal(lineTool.LINE_ANGULAR_SNAP_INCREMENT_DEGREES, 22.5);
assert.equal(lineTool.LINE_ANGULAR_SNAP_TOLERANCE_DEGREES, 3);

for (const angle of [0, 22.5, 45, 67.5, 90, 135, 180, 225, 270, 315, 337.5]) {
  const resolved = lineTool.resolveLinePreviewPoint(start, pointAt(angle + 1));
  assert.equal(resolved.snapActive, true, `${angle} degree candidate snaps`);
  assert.equal(resolved.snappedAngleDegrees, angle);
  const dx = resolved.effectivePreviewPoint.x - start.x;
  const dy = resolved.effectivePreviewPoint.y - start.y;
  close(Math.hypot(dx, dy), 17.3, `${angle} degrees preserves radial length`);
  close(Math.cos(radians(angle)) * dy - Math.sin(radians(angle)) * dx, 0, `${angle} degrees has exact direction`);
}

const wrap = lineTool.resolveLinePreviewPoint(start, pointAt(359));
assert.equal(wrap.snappedAngleDegrees, 0, '360/0 wrap chooses global +X');
close(wrap.effectivePreviewPoint.y, start.y, '0 degrees has zero dy');
const vertical = lineTool.resolveLinePreviewPoint(start, pointAt(89));
close(vertical.effectivePreviewPoint.x, start.x, '90 degrees has zero dx');
const diagonal = lineTool.resolveLinePreviewPoint(start, pointAt(46));
close(Math.abs(diagonal.effectivePreviewPoint.x - start.x), Math.abs(diagonal.effectivePreviewPoint.y - start.y), '45 degrees has equal components');

assert.equal(lineTool.resolveLinePreviewPoint(start, pointAt(3)).snapActive, true, 'tolerance boundary is inclusive');
const outsidePoint = pointAt(3.0001);
const outside = lineTool.resolveLinePreviewPoint(start, outsidePoint);
assert.equal(outside.snapActive, false, 'outside tolerance remains free-angle');
assert.equal(outside.effectivePreviewPoint, outsidePoint, 'free-angle effective point is the raw object without rounding');

const raw = pointAt(44);
const resolved = lineTool.resolveLinePreviewPoint(start, raw);
assert.equal(resolved.rawPointerPoint, raw, 'raw pointer identity remains available');
assert.notDeepEqual(resolved.effectivePreviewPoint, raw, 'effective point may differ from raw pointer');
assert.deepEqual(raw, pointAt(44), 'resolution never mutates the raw pointer');

const zero = lineTool.resolveLinePreviewPoint(start, start);
assert.equal(zero.snapActive, false);
assert.equal(zero.snappedAngleDegrees, null);
assert.deepEqual(zero.effectivePreviewPoint, start, 'zero vector is returned safely without normalization');
assert.ok(Number.isFinite(zero.effectivePreviewPoint.x) && Number.isFinite(zero.effectivePreviewPoint.y));

let id = 0;
const createId = () => `snap-${++id}`;
let interaction = lineTool.applyLineClick(lineTool.EMPTY_LINE_INTERACTION, start, createId).interaction;
const rawB = pointAt(44, 10.125);
interaction = lineTool.updateLinePreview(interaction, rawB);
assert.equal(interaction.snapActive, true, 'preview exposes angular snap state');
let result = lineTool.applyLineClick(interaction, rawB, createId);
assert.notDeepEqual(result.entity.end, rawB, 'commit uses effective endpoint rather than raw pointer');
close(Math.abs(result.entity.end.x - start.x), Math.abs(result.entity.end.y - start.y), 'committed AB is exactly 45 degrees');
assert.deepEqual(result.interaction.start, result.entity.end, 'snapped B becomes next chain start');
assert.equal(result.interaction.snapActive, false, 'commit clears stale snap feedback');

const rawC = { x: result.entity.end.x + 8.375, y: result.entity.end.y + 0.2 };
const second = lineTool.applyLineClick(lineTool.updateLinePreview(result.interaction, rawC), rawC, createId);
close(second.entity.end.y, result.entity.end.y, 'chained BC commits exactly horizontal');
let document = types.createDrawingDocumentV1();
document = lineTool.appendEntityToActiveSketch(document, result.entity);
document = lineTool.appendEntityToActiveSketch(document, second.entity);
assert.deepEqual(document.sketches[document.activeSketchId].entityOrder, ['snap-1', 'snap-2']);
const committed = document;
assert.deepEqual(lineTool.cancelLineInteraction(), lineTool.EMPTY_LINE_INTERACTION, 'Escape/tool switch clears all preview and snap state');
assert.equal(document, committed, 'cancellation preserves committed geometry');

const fractionalStart = { x: 1.2345, y: 6.7891 };
const fractionalRaw = { x: 9.8765, y: 11.1113 };
const fractional = lineTool.resolveLinePreviewPoint(fractionalStart, fractionalRaw);
assert.equal(fractional.snapActive, false);
assert.deepEqual(fractional.effectivePreviewPoint, fractionalRaw, 'no grid rounding is introduced');

const ctm = { a: 3.5, b: 0, c: 0, d: 3.5, e: 121, f: -48 };
assert.deepEqual(transform.clientToModelPoint({ x: 128.875, y: -35.75 }, ctm), { x: 2.25, y: 3.5 }, 'getScreenCTM inverse conversion remains model-space input');

const css = fs.readFileSync('src/styles.css', 'utf8');
const workspace = fs.readFileSync('src/app/DrawingWorkspace.tsx', 'utf8');
assert.match(css, /\.drawing-line-entity\s*{[^}]*stroke-width:\s*1\.8;/s, 'committed geometry keeps its non-scaling state-driven treatment');
assert.match(css, /\.drawing-axis\s*{[^}]*stroke:\s*#64748b;[^}]*stroke-width:\s*1\.4;/s, 'axes remain structurally subordinate');
assert.match(css, /--drawing-preview:\s*#0284c7;[\s\S]*\.drawing-line-preview\s*{[^}]*stroke:\s*var\(--drawing-preview\);[^}]*stroke-width:\s*1\.25;[^}]*stroke-dasharray:\s*5 4;/s, 'normal preview uses the global dark-blue token and is dashed');
assert.match(css, /\.drawing-line-preview\.is-angular-snapped\s*{[^}]*stroke-width:\s*1\.7;[^}]*stroke-dasharray:\s*none;/s, 'snapped preview remains in the inherited dark-blue family and becomes solid');
assert.match(workspace, /getScreenCTM\(\)/, 'accepted CTM pointer path remains present');
assert.match(workspace, /drawing-line-preview\$\{lineInteraction\.snapActive \? ' is-angular-snapped' : ''\}/, 'snap state selects its distinct line style');

console.log('D2.2a line visibility and full-circle angular snap tests passed');
