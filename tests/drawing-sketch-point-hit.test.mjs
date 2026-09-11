import assert from 'node:assert/strict';
import fs from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DrawingWorkspace, DRAWING_INTERACTION_POINT_RADIUS_PX, DRAWING_LINE_HOVER_MARKER_SIZE_PX, DRAWING_POINT_HOVER_MARKER_SIZE_PX, DRAWING_SKETCH_POINT_HIT_RADIUS_PX, drawingGeometrySelectionClass, routeDrawingGeometryPointerSelection } from '../.test-build/drawing-sketch-point-hit/DrawingWorkspace.js';

const points = {
  shared: { id: 'shared', x: 0, y: 0 },
  p2: { id: 'p2', x: 100, y: 0 },
  p3: { id: 'p3', x: 0, y: 100 },
};
const document = { schemaVersion: 2, unit: 'mm', activeSketchId: 's', sketchOrder: ['s'], sketches: { s: {
  id: 's', name: 'Mounted point-hit sketch', points,
  entities: {
    a: { id: 'a', type: 'line', startPointId: 'shared', endPointId: 'p2' },
    b: { id: 'b', type: 'line', startPointId: 'shared', endPointId: 'p3' },
  }, entityOrder: ['a', 'b'], dimensions: {}, dimensionOrder: [], geometricConstraints: {}, geometricConstraintOrder: [],
} } };

const markup = renderToStaticMarkup(React.createElement(DrawingWorkspace, {
  document, setDocument() {}, viewBox: { x: -400, y: -300, width: 800, height: 600 }, setViewBox() {},
  constraintsPanelOpen: true, setConstraintsPanelOpen() {},
}));

assert.equal(DRAWING_SKETCH_POINT_HIT_RADIUS_PX, 7, 'point picking uses a restrained seven-screen-pixel radius');
assert.equal(DRAWING_INTERACTION_POINT_RADIUS_PX, 2.5, 'hovered and selected Points share a compact five-screen-pixel marker');
assert.equal(DRAWING_LINE_HOVER_MARKER_SIZE_PX, 3);
assert.equal(DRAWING_POINT_HOVER_MARKER_SIZE_PX, 5);
assert.ok(DRAWING_POINT_HOVER_MARKER_SIZE_PX > DRAWING_LINE_HOVER_MARKER_SIZE_PX);
assert.ok(DRAWING_INTERACTION_POINT_RADIUS_PX < DRAWING_SKETCH_POINT_HIT_RADIUS_PX, 'visible interaction and pointer hit sizes remain independent');
for (const pixelsPerMm of [0.5, 4]) {
  assert.equal((DRAWING_INTERACTION_POINT_RADIUS_PX / pixelsPerMm) * pixelsPerMm * 2, 5, 'hovered and selected Points remain five screen pixels across zoom scales');
  assert.equal((DRAWING_SKETCH_POINT_HIT_RADIUS_PX / pixelsPerMm) * pixelsPerMm * 2, 14, 'Point hit diameter remains fourteen screen pixels across zoom scales');
  assert.equal((DRAWING_LINE_HOVER_MARKER_SIZE_PX / pixelsPerMm) * pixelsPerMm, 3);
  assert.equal((DRAWING_POINT_HOVER_MARKER_SIZE_PX / pixelsPerMm) * pixelsPerMm, 5);
}
assert.equal((markup.match(/data-sketch-point-id="shared"/g) ?? []).length, 1, 'a shared SketchPoint renders one stable semantic target');
assert.equal((markup.match(/data-sketch-point-id=/g) ?? []).length, 3, 'every semantic SketchPoint is rendered before selection');
assert.match(markup, /class="drawing-sketch-point-hit drawing-interactive-hit" data-sketch-point-id="shared"/, 'the real workspace render contains the transparent point hit element');
assert.equal((markup.match(/data-sketch-line-id=/g) ?? []).length, 2, 'each rendered Line exposes its exact semantic identity to the root pointer route');

let selection = routeDrawingGeometryPointerSelection([], { kind: 'line', lineId: 'a' }, false, false);
assert.deepEqual(selection.selection, [{ kind: 'line', lineId: 'a' }]); assert.equal(selection.beginDrag, true);
selection = routeDrawingGeometryPointerSelection(selection.selection, { kind: 'line', lineId: 'b' }, true, false);
assert.deepEqual(selection.selection.map(({ lineId }) => lineId), ['a', 'b']); assert.equal(selection.beginDrag, false);
selection = routeDrawingGeometryPointerSelection(selection.selection, { kind: 'line', lineId: 'a' }, true, false);
assert.deepEqual(selection.selection, [{ kind: 'line', lineId: 'b' }], 'Ctrl removes only the clicked Line');
selection = routeDrawingGeometryPointerSelection([], { kind: 'point', pointId: 'shared' }, false, true);
selection = routeDrawingGeometryPointerSelection(selection.selection, { kind: 'line', lineId: 'a' }, false, true);
assert.deepEqual(selection.selection, [{ kind: 'point', pointId: 'shared' }, { kind: 'line', lineId: 'a' }]); assert.equal(selection.beginDrag, false);
assert.equal(drawingGeometrySelectionClass(selection.selection, { kind: 'point', pointId: 'shared' }), ' is-geometry-selected');
assert.equal(drawingGeometrySelectionClass(selection.selection, { kind: 'line', lineId: 'a' }), ' is-geometry-selected');
assert.equal(drawingGeometrySelectionClass(selection.selection, { kind: 'line', lineId: 'b' }), '');

const source = fs.readFileSync('src/app/DrawingWorkspace.tsx', 'utf8');
const css = fs.readFileSync('src/styles.css', 'utf8');
assert.equal((source.match(/r=\{DRAWING_INTERACTION_POINT_RADIUS_PX \/ pixelsPerMm\}/g) ?? []).length, 2, 'selected and Dimension-preselected Points retain the accepted zoom-independent radius');
assert.match(source, /const size = DRAWING_POINT_HOVER_MARKER_SIZE_PX \/ pixelsPerMm; return p \? <rect className="drawing-geometry-point-preselection"/);
assert.match(source, /snap\.type === 'line' && <rect[^>]*DRAWING_LINE_HOVER_MARKER_SIZE_PX/);
assert.match(source, /snap\.type === 'endpoint' && <rect[^>]*DRAWING_POINT_HOVER_MARKER_SIZE_PX/);
assert.doesNotMatch(source, /drawing-line-cursor-line" d=/, 'Line hover has no triangle path');
assert.match(source, /r=\{DRAWING_SKETCH_POINT_HIT_RADIUS_PX \/ pixelsPerMm\}/, 'the independently rendered hit target retains its larger zoom-independent radius');
assert.match(css, /--drawing-selected-point:\s*#1d4ed8;/i);
assert.match(css, /\.drawing-geometry-point-selected \{ fill: var\(--drawing-selected-point\); stroke: none; \}/, 'selected Point uses only the compact dark-blue presentation authority');
assert.match(source, /closest<SVGCircleElement>\('\[data-sketch-point-id\]'\)\?\.dataset\.sketchPointId/, 'the real root pointer handler acquires semantic identity from the DOM target');
assert.match(source, /explicitPointId\s*\? \{ kind: 'point', pointId: explicitPointId \}/, 'the DOM identity becomes the selected Point ref directly');
assert.match(source, /routeDrawingGeometryPointerSelection\(current, target, event\.ctrlKey, constraintsPanelOpen\)\.selection/, 'the rendered target uses the shared production selection route with functional state');
assert.doesNotMatch(source, /event\.shiftKey/, 'Shift is not a semantic geometry multi-selection modifier');
assert.match(source, /const beginDrag = !event\.ctrlKey && !constraintsPanelOpen;[\s\S]*if \(beginDrag\) \{[\s\S]*setGeometryDrag/, 'only an ordinary replacing Select click may begin direct manipulation');
const emptyMissStart = source.indexOf('if (!hit && !explicitPointId && !explicitLineId)');
const emptyMissBranch = source.slice(emptyMissStart, source.indexOf('setDimensionDrag(null)', emptyMissStart));
assert.match(emptyMissBranch, /if \(!event\.ctrlKey\)/, 'an unmodified Select miss clears selection whether or not Constraints is open');
assert.match(emptyMissBranch, /setSelectedGeometry\(\[\]\)/, 'an ordinary empty-canvas miss clears all geometry selection');
assert.match(emptyMissBranch, /setSelectedDimensionId\(null\)/, 'an ordinary empty-canvas miss clears persistent Dimension selection');
assert.match(emptyMissBranch, /setSelectedGeometricConstraintId\(null\)/, 'an ordinary empty-canvas miss clears persistent geometric-constraint selection');
assert.doesNotMatch(emptyMissBranch, /!constraintsPanelOpen/, 'Constraints does not preserve accumulated selection after an empty-canvas click');

console.log('Drawing SketchPoint rendered interaction-layer regression tests passed');
