import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  availableLineDimensionKinds, chooseLineDimensionKind, collectDimensionReferenceCandidates,
  createLineDimension, dimensionScreenPixelsToModelUnits, formatLinearDimension, moveDimensionPlacement, preselectionReference,
  resolveDimensionPreselection,
} from '../.test-build/drawing-dimension-interaction/drawingDimension.js';
import { createDrawingDocumentV2 } from '../.test-build/drawing-dimension-interaction/drawingTypes.js';

const line = { id: 'line-1', type: 'line', start: { x: 10, y: 20 }, end: { x: 110, y: 30 } };
const clientLines = [{ id: line.id, start: line.start, end: line.end }];
assert.deepEqual(resolveDimensionPreselection(clientLines, { x: 11, y: 20 })?.point, 'start');
assert.deepEqual(resolveDimensionPreselection(clientLines, { x: 109, y: 30 })?.point, 'end');
assert.equal(resolveDimensionPreselection(clientLines, { x: 10, y: 20 })?.kind, 'point', 'endpoint priority overrides body');
assert.equal(resolveDimensionPreselection(clientLines, { x: 60, y: 25 })?.kind, 'line');
assert.deepEqual(resolveDimensionPreselection(clientLines, { x: 10, y: 20 }), collectDimensionReferenceCandidates(clientLines, { x: 10, y: 20 })[0], 'hover and click can consume the same resolver result');
const endpoint = resolveDimensionPreselection(clientLines, { x: 10, y: 20 });
assert.deepEqual(preselectionReference(endpoint), { kind: 'point', entityId: 'line-1', point: 'start' });
assert.equal('x' in preselectionReference(endpoint), false, 'endpoint remains semantic');
assert.deepEqual(resolveDimensionPreselection(clientLines, { x: 60, y: 25 }), resolveDimensionPreselection(clientLines, { x: 60, y: 25 }));

for (const degrees of [5, 10, 15]) {
  const radians = degrees * Math.PI / 180;
  const shallow = { ...line, start: { x: 0, y: 0 }, end: { x: 100 * Math.cos(radians), y: 100 * Math.sin(radians) } };
  assert.equal(chooseLineDimensionKind(shallow, { x: 50 - 60 * Math.sin(radians), y: 50 * Math.sin(radians) + 60 * Math.cos(radians) }), 'ALIGNED_DISTANCE');
  assert.equal(chooseLineDimensionKind(shallow, { x: 50, y: 80 }), 'HORIZONTAL_DISTANCE');
  assert.equal(chooseLineDimensionKind(shallow, { x: 120, y: 50 * Math.sin(radians) }), 'VERTICAL_DISTANCE');
  assert.equal(chooseLineDimensionKind(shallow, { x: 50, y: 80 }, 'HORIZONTAL_DISTANCE'), 'HORIZONTAL_DISTANCE', 'stationary hysteresis is stable');
  assert.equal(chooseLineDimensionKind(shallow, { x: 120, y: 50 * Math.sin(radians) }, 'HORIZONTAL_DISTANCE'), 'VERTICAL_DISTANCE', 'hysteresis is not sticky after a deliberate move');
}
assert.deepEqual(availableLineDimensionKinds({ ...line, end: { x: 110, y: 20 } }), ['ALIGNED_DISTANCE'], 'horizontal line has one canonical length and no zero projection');
assert.deepEqual(availableLineDimensionKinds({ ...line, end: { x: 10, y: 120 } }), ['ALIGNED_DISTANCE'], 'vertical line has one canonical length and no zero projection');
for (const degrees of [5, 85]) {
  const radians = degrees * Math.PI / 180;
  assert.deepEqual(availableLineDimensionKinds({ ...line, end: { x: 10 + 100 * Math.cos(radians), y: 20 + 100 * Math.sin(radians) } }), ['ALIGNED_DISTANCE', 'HORIZONTAL_DISTANCE', 'VERTICAL_DISTANCE']);
}
assert.equal(dimensionScreenPixelsToModelUnits(10, 2) * 2, 10);
assert.equal(dimensionScreenPixelsToModelUnits(10, 0.02) * 0.02, 10);


const dimension = createLineDimension(line, 'ALIGNED_DISTANCE', { x: 40, y: 80 }, 'dimension-1');
let document = createDrawingDocumentV2();
document = { ...document, sketches: { ...document.sketches, 'sketch-1': { ...document.sketches['sketch-1'], entities: { [line.id]: line }, entityOrder: [line.id], dimensions: { [dimension.id]: dimension }, dimensionOrder: [dimension.id] } } };
const moved = moveDimensionPlacement(document, dimension.id, dimension.placement.offset + 12);
assert.equal(moved.sketches['sketch-1'].dimensions[dimension.id].placement.offset, dimension.placement.offset + 12);
assert.deepEqual(moved.sketches['sketch-1'].entities, document.sketches['sketch-1'].entities, 'geometry unchanged');
assert.equal(moved.sketches['sketch-1'].dimensions[dimension.id].value, dimension.value, 'value unchanged');
assert.deepEqual(moved.sketches['sketch-1'].dimensions[dimension.id].references, dimension.references, 'references unchanged');
assert.strictEqual(moveDimensionPlacement(document, 'missing', 4), document);

for (const [value, expected] of [[120, '120 mm'], [120.5, '120.5 mm'], [120.125, '120.125 mm'], [120.1254, '120.125 mm'], [120.1255, '120.126 mm'], [98.39327, '98.393 mm'], [120.1, '120.1 mm'], [0, '0 mm']]) assert.equal(formatLinearDimension(value), expected);
assert.equal(dimension.value, Math.hypot(100, 10), 'formatting never mutates stored precision');
assert.equal(document.schemaVersion, 2, 'dimension graphics remain outside DrawingEntity/document entities');
assert.equal('Circle' in document.sketches['sketch-1'].entities, false);
const workspace = fs.readFileSync('src/app/DrawingWorkspace.tsx', 'utf8');
const css = fs.readFileSync('src/styles.css', 'utf8');
assert.match(workspace, /style=\{\{ fontSize: dimensionScreenPixelsToModelUnits\(DIMENSION_TEXT_SIZE_PX, pixelsPerMm\) \}\}/, 'model anchor uses an inverse-scale text size');
assert.match(workspace, /middle\.x[\s\S]*middle\.y/, 'dimension text remains attached to model-derived annotation geometry');
assert.match(css, /\.drawing-dimension \{ color: #2db65b; \}/, 'passive dimensions use the brighter D2.5a4 CAD green');
assert.match(css, /is-line-target \{ cursor: default; \}[\s\S]*is-point-target \{ cursor: default; \}/, 'line and endpoint targets use normal arrows');
assert.match(css, /\.drawing-svg\.has-dimension-cursor \{ cursor: crosshair; \}/, 'empty Dimension canvas uses crosshair');
assert.match(css, /is-hovered \{ color: #2fb85f; \}[\s\S]*is-selected[^}]*#137a3e/, 'interactive states remain distinct from passive green');
console.log('drawing dimension interaction tests passed');
