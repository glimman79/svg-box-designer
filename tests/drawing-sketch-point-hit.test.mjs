import assert from 'node:assert/strict';
import fs from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DrawingWorkspace, DRAWING_SKETCH_POINT_HIT_RADIUS_PX } from '../.test-build/drawing-sketch-point-hit/DrawingWorkspace.js';

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
assert.equal((markup.match(/data-sketch-point-id="shared"/g) ?? []).length, 1, 'a shared SketchPoint renders one stable semantic target');
assert.equal((markup.match(/data-sketch-point-id=/g) ?? []).length, 3, 'every semantic SketchPoint is rendered before selection');
assert.match(markup, /class="drawing-sketch-point-hit drawing-interactive-hit" data-sketch-point-id="shared"/, 'the real workspace render contains the transparent point hit element');

const source = fs.readFileSync('src/app/DrawingWorkspace.tsx', 'utf8');
assert.match(source, /closest<SVGCircleElement>\('\[data-sketch-point-id\]'\)\?\.dataset\.sketchPointId/, 'the real root pointer handler acquires semantic identity from the DOM target');
assert.match(source, /explicitPointId\s*\? \{ kind: 'point', pointId: explicitPointId \}/, 'the DOM identity becomes the selected Point ref directly');
assert.match(source, /const toggleSelection = event\.ctrlKey \|\| constraintsPanelOpen/, 'Select Ctrl and the open Constraints panel share the geometry-toggle route');
assert.match(source, /toggleSelection \? toggleDrawingGeometrySelection\(current, target\) : \[target\]/, 'normal Select replacement and semantic toggle use explicit policies');
assert.doesNotMatch(source, /event\.shiftKey/, 'Shift is not a semantic geometry multi-selection modifier');
assert.match(source, /if \(!toggleSelection\) \{[\s\S]*setGeometryDrag/, 'only an ordinary replacing Select click may begin direct manipulation');

console.log('Drawing SketchPoint rendered interaction-layer regression tests passed');
