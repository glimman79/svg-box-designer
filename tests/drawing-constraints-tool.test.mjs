import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createDrawingDocumentV2 } from '../.test-build/drawing-constraints-tool/drawingTypes.js';
import { appendEntityToActiveSketch } from '../.test-build/drawing-constraints-tool/drawingLineTool.js';
import { applyDrawingConstraint, clampConstraintsPanelPosition, constraintsPanelDragPosition, constraintsPanelGrabOffset, DRAWING_CONSTRAINT_CATALOG, getDrawingConstraintApplicability, initialConstraintsPanelPosition, toggleDrawingGeometrySelection } from '../.test-build/drawing-constraints-tool/drawingConstraintsTool.js';

const line = (id, y = 0) => ({ id, type: 'line', start: { x: 0, y }, end: { x: 20, y: y + 3 }, startPointId: `${id}:a`, endPointId: `${id}:b` });
const add = (document, draft) => appendEntityToActiveSketch(document, draft);
const enabled = (document, selection) => getDrawingConstraintApplicability(selection, document).filter((item) => item.enabled).map((item) => item.kind);
const appSource = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
const workspaceSource = readFileSync(new URL('../src/app/DrawingWorkspace.tsx', import.meta.url), 'utf8');

test('semantic selection toggle supports ordered mixed selections without a size cap', () => {
  const p1 = { kind: 'point', pointId: 'p1' }, p2 = { kind: 'point', pointId: 'p2' };
  const l1 = { kind: 'line', lineId: 'l1' }, l2 = { kind: 'line', lineId: 'l2' };
  let selection = [];
  for (const target of [p1, p2, l1, l2]) selection = toggleDrawingGeometrySelection(selection, target);
  assert.deepEqual(selection, [p1, p2, l1, l2]);
  assert.deepEqual(toggleDrawingGeometrySelection(selection, p2), [p1, l1, l2]);
  assert.deepEqual(toggleDrawingGeometrySelection(selection, l1), [p1, p2, l2]);
});

test('Select and Constraints route to the shared toggle without stealing authoring or starting drags', () => {
  assert.match(workspaceSource, /if \(activeTool === 'select'\)[\s\S]*const toggleSelection = event\.ctrlKey \|\| constraintsPanelOpen/);
  assert.match(workspaceSource, /setSelectedGeometry\(\(current\) => toggleSelection \? toggleDrawingGeometrySelection\(current, target\) : \[target\]\)/);
  assert.match(workspaceSource, /if \(!toggleSelection\) \{[\s\S]*setGeometryDrag/);
  assert.match(workspaceSource, /if \(!event\.ctrlKey && !constraintsPanelOpen\) setSelectedGeometry\(\[\]\)/, 'Ctrl or constraint-picking misses preserve accumulated references');
  assert.doesNotMatch(workspaceSource, /event\.shiftKey/, 'Shift follows the ordinary Select path');
});

test('Constraints launcher is directly after Dimension in the top bar and absent from the drawing sidebar', () => {
  const topBar = appSource.match(/drawing-operation-toolbar[\s\S]*?<\/div>}/)?.[0] ?? '';
  assert.match(topBar, />↔<\/span> Dimension<\/button>\s*<button[^>]*[\s\S]*?>Constraints<\/button>/, 'Constraints immediately follows Dimension');
  const sidebar = workspaceSource.match(/<aside[^>]*drawing-tool-sidebar[\s\S]*?<\/aside>/)?.[0] ?? '';
  assert.doesNotMatch(sidebar, />Constraints<\/button>/, 'left Drawing toolbar has no Constraints launcher');
});

test('moved launcher and close button share the one existing panel state', () => {
  assert.match(appSource, /setDrawingConstraintsPanelOpen\(\(open\) => !open\)/, 'top launcher toggles the panel state');
  assert.match(appSource, /constraintsPanelOpen=\{drawingConstraintsPanelOpen\} setConstraintsPanelOpen=\{setDrawingConstraintsPanelOpen\}/, 'workspace receives that same state authority');
  assert.match(workspaceSource, /aria-label="Close Constraints"[\s\S]*?setConstraintsPanelOpen\(false\)/, 'close button still closes the shared panel');
  assert.equal((workspaceSource.match(/className="drawing-constraints-panel"/g) ?? []).length, 1, 'exactly one floating panel is rendered');
});

test('floating panel defaults from the current frame right edge and retains session state', () => {
  assert.deepEqual(initialConstraintsPanelPosition({ width: 1400, height: 700 }, { width: 292, height: 330 }), { x: 1076, y: 58 });
  assert.deepEqual(initialConstraintsPanelPosition({ width: 900, height: 700 }, { width: 292, height: 330 }), { x: 576, y: 58 });
  assert.doesNotMatch(workspaceSource, /x: 78/, 'arbitrary left-relative x is no longer position authority');
  assert.match(workspaceSource, /if \(!constraintsPanelOpen \|\| constraintsPanelPosition\) return/, 'an existing default or user position is not recalculated on reopen');
  assert.match(workspaceSource, /left: constraintsPanelPosition\?\.x/, 'the session position remains render authority');
});

test('dragging preserves each grab offset in frame-local coordinates without a start jump', () => {
  const frame = { left: 240, top: 120 };
  const panel = { left: 1140, top: 220 };
  for (const x of [8, 146, 284]) {
    const pointer = { x: panel.left + x, y: panel.top + 12 };
    const grab = constraintsPanelGrabOffset(pointer, panel);
    assert.deepEqual(constraintsPanelDragPosition(pointer, frame, grab), { x: 900, y: 100 });
    assert.deepEqual(constraintsPanelDragPosition({ x: pointer.x + 100, y: pointer.y + 50 }, frame, grab), { x: 1000, y: 150 });
  }
});

test('drag clamping follows the desired position and changes it only at a boundary', () => {
  const bounds = { width: 1400, height: 700 };
  const panel = { width: 292, height: 330 };
  assert.deepEqual(clampConstraintsPanelPosition({ x: 1000, y: 150 }, bounds, panel), { x: 1000, y: 150 });
  assert.deepEqual(clampConstraintsPanelPosition({ x: 1390, y: 690 }, bounds, panel), { x: 1320, y: 668 });
});

test('catalog is the exact stable fourteen-option product catalog', () => {
  assert.deepEqual(DRAWING_CONSTRAINT_CATALOG.map(({ label }) => label), ['Distance', 'Length', 'Angle', 'Radius / Diameter', 'Symmetry', 'Midpoint', 'Fix', 'Coincidence', 'Concentricity', 'Tangency', 'Parallelism', 'Perpendicular', 'Horizontal', 'Vertical']);
});

test('central applicability handles line, point, mixed, and larger selections', () => {
  let document = add(add(createDrawingDocumentV2(), line('a')), line('b', 10));
  assert.deepEqual(enabled(document, []), []);
  assert.deepEqual(enabled(document, [{ kind: 'line', lineId: 'a' }]), ['horizontal', 'vertical']);
  assert.deepEqual(enabled(document, [{ kind: 'line', lineId: 'b' }, { kind: 'line', lineId: 'a' }]), ['parallelism', 'perpendicular']);
  assert.deepEqual(enabled(document, [{ kind: 'point', pointId: 'a:a' }, { kind: 'point', pointId: 'b:a' }]), ['coincidence']);
  assert.deepEqual(enabled(document, [{ kind: 'point', pointId: 'a:a' }, { kind: 'line', lineId: 'b' }]), ['coincidence']);
  assert.deepEqual(enabled(document, [{ kind: 'line', lineId: 'a' }, { kind: 'line', lineId: 'b' }, { kind: 'point', pointId: 'a:a' }]), []);
});

test('Coincidence normalizes point/linear-edge order and rejects a degenerate support', () => {
  let document = add(add(createDrawingDocumentV2(), line('support')), line('carrier', 20));
  const forward = [{ kind: 'point', pointId: 'carrier:a' }, { kind: 'line', lineId: 'support' }];
  const reverse = [...forward].reverse();
  const a = getDrawingConstraintApplicability(forward, document).find(({ kind }) => kind === 'coincidence');
  const b = getDrawingConstraintApplicability(reverse, document).find(({ kind }) => kind === 'coincidence');
  assert.deepEqual(a.references, b.references);
  document = applyDrawingConstraint(document, a);
  assert.ok(document.sketches[document.activeSketchId].geometricConstraints['coincident:carrier:a:support:support']);
  assert.equal(getDrawingConstraintApplicability(reverse, document).find(({ kind }) => kind === 'coincidence').enabled, false);

  const sketch = document.sketches[document.activeSketchId];
  const degenerate = { ...document, sketches: { ...document.sketches, [sketch.id]: { ...sketch,
    points: { ...sketch.points, 'support:b': { ...sketch.points['support:b'], x: sketch.points['support:a'].x, y: sketch.points['support:a'].y } } } } };
  assert.equal(getDrawingConstraintApplicability(forward, degenerate).find(({ kind }) => kind === 'coincidence').enabled, false);
});

test('application uses canonical semantic IDs and disables duplicates', () => {
  let document = add(add(createDrawingDocumentV2(), line('b')), line('a', 10));
  const selected = [{ kind: 'line', lineId: 'b' }, { kind: 'line', lineId: 'a' }];
  const parallel = getDrawingConstraintApplicability(selected, document).find(({ kind }) => kind === 'parallelism');
  document = applyDrawingConstraint(document, parallel);
  assert.ok(document.sketches[document.activeSketchId].geometricConstraints['parallelism:a:b']);
  assert.equal(getDrawingConstraintApplicability(selected, document).find(({ kind }) => kind === 'parallelism').enabled, false);
});

test('panel clamping preserves a reachable header', () => {
  assert.deepEqual(clampConstraintsPanelPosition({ x: -50, y: -20 }, { width: 500, height: 400 }), { x: 0, y: 0 });
  assert.deepEqual(clampConstraintsPanelPosition({ x: 900, y: 900 }, { width: 500, height: 400 }), { x: 420, y: 368 });
});
