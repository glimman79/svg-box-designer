import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createDrawingDocumentV2 } from '../.test-build/drawing-constraints-tool/drawingTypes.js';
import { appendEntityToActiveSketch } from '../.test-build/drawing-constraints-tool/drawingLineTool.js';
import { applyDrawingConstraint, clampConstraintsPanelPosition, constraintsPanelDragPosition, constraintsPanelGrabOffset, DRAWING_CONSTRAINT_CATALOG, getDrawingConstraintApplicability, getExistingAxisConstraintForLine, initialConstraintsPanelPosition, toggleDrawingGeometrySelection } from '../.test-build/drawing-constraints-tool/drawingConstraintsTool.js';
import { analyzeDrawingConstraints, constraintJacobianRow, geometricConstraintEquations } from '../.test-build/drawing-constraints-tool/drawingConstraintAnalysis.js';
import { EMPTY_DRAWING_HISTORY, transactDrawingDocument, undoDrawingDocument, redoDrawingDocument } from '../.test-build/drawing-constraints-tool/drawingHistory.js';
import { solveDrawingComponentDrag } from '../.test-build/drawing-constraints-tool/drawingConstraintSolver.js';
import { deleteGeometricConstraint, deriveGeometricConstraintMarkers } from '../.test-build/drawing-constraints-tool/drawingParallelMarker.js';

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
  assert.match(workspaceSource, /if \(activeTool === 'select'\)[\s\S]*const beginDrag = !event\.ctrlKey && !constraintsPanelOpen/);
  assert.match(workspaceSource, /setSelectedGeometry\(\(current\) => routeDrawingGeometryPointerSelection\(current, target, event\.ctrlKey, constraintsPanelOpen\)\.selection\)/);
  assert.match(workspaceSource, /if \(beginDrag\) \{[\s\S]*setGeometryDrag/);
  assert.match(workspaceSource, /if \(!event\.ctrlKey\) \{[\s\S]*?setSelectedGeometry\(\[\]\)[\s\S]*?setSelectedDimensionId\(null\)[\s\S]*?setSelectedGeometricConstraintId\(null\)[\s\S]*?\}/, 'an empty-canvas click clears every selection authority while Constraints stays active');
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

test('OK clears only semantic selection while Escape exits Constraints after higher-priority interactions', () => {
  assert.match(workspaceSource, /const finishConstraintSelection = \(\) => setSelectedGeometry\(\[\]\)/);
  assert.match(workspaceSource, /drawing-constraints-actions[\s\S]*disabled=\{selectedGeometry\.length === 0\}[\s\S]*onClick=\{finishConstraintSelection\}>OK/);
  assert.match(workspaceSource, /if \(editingDimensionId\)[\s\S]*if \(activeToolRef\.current === 'select' && constraintsPanelOpen\) \{\s*setConstraintsPanelOpen\(false\);\s*setSelectedGeometry\(\[\]\);/);
  assert.match(workspaceSource, /onClick=\{\(\) => transactDocument\(\(current\) => applyDrawingConstraint\(current, item\)\)\}/, 'constraint application does not clear the selection');
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
  assert.deepEqual(enabled(document, [{ kind: 'point', pointId: 'a:a' }, { kind: 'line', lineId: 'b' }]), ['midpoint', 'coincidence']);
  assert.deepEqual(enabled(document, [{ kind: 'line', lineId: 'a' }, { kind: 'line', lineId: 'b' }, { kind: 'point', pointId: 'a:a' }]), []);
});

test('Midpoint applicability, canonical equations, solve, duplicate and endpoint guards', () => {
  let document = add(add(createDrawingDocumentV2(), line('target')), line('connected', 20));
  const sketch = document.sketches[document.activeSketchId];
  sketch.entities.connected = { ...sketch.entities.connected, startPointId: 'p' };
  sketch.points.p = { id: 'p', x: 30, y: 20 };
  const selections = [[{ kind: 'point', pointId: 'p' }, { kind: 'line', lineId: 'target' }], [{ kind: 'line', lineId: 'target' }, { kind: 'point', pointId: 'p' }]];
  for (const selection of selections) assert.equal(getDrawingConstraintApplicability(selection, document).find(({ kind }) => kind === 'midpoint').enabled, true);
  for (const selection of [[{ kind: 'line', lineId: 'target' }], [{ kind: 'point', pointId: 'p' }], [{ kind: 'point', pointId: 'target:a' }, { kind: 'point', pointId: 'p' }], [{ kind: 'line', lineId: 'target' }, { kind: 'line', lineId: 'connected' }], [{ kind: 'point', pointId: 'target:a' }, { kind: 'line', lineId: 'target' }]])
    assert.equal(getDrawingConstraintApplicability(selection, document).find(({ kind }) => kind === 'midpoint').enabled, false);
  const choice = getDrawingConstraintApplicability(selections[0], document).find(({ kind }) => kind === 'midpoint');
  const result = applyDrawingConstraint(document, choice), solved = result.sketches[result.activeSketchId];
  assert.equal(solved.points.p.id, 'p');
  assert.ok(Math.abs(solved.points.p.x - 10) < 1e-7 && Math.abs(solved.points.p.y - 1.5) < 1e-7);
  assert.equal(solved.entities.connected.startPointId, 'p', 'shared topology is preserved');
  assert.equal(analyzeDrawingConstraints(solved).components.find((component) => component.pointIds.has('p')).constraintRank, 2);
  const equations = geometricConstraintEquations(solved, solved.geometricConstraints['midpoint:p:target']);
  assert.deepEqual(equations.map((equation) => equation.coordinateAxis), ['x', 'y']);
  assert.deepEqual(constraintJacobianRow(solved, equations[0], ['p', 'target:a', 'target:b']), [1, 0, -.5, 0, -.5, 0]);
  assert.deepEqual(constraintJacobianRow(solved, equations[1], ['p', 'target:a', 'target:b']), [0, 1, 0, -.5, 0, -.5]);
  assert.equal(getDrawingConstraintApplicability(selections[0], result).find(({ kind }) => kind === 'midpoint').enabled, false);
  assert.equal(applyDrawingConstraint(result, choice), result, 'stale applicability cannot bypass the production duplicate guard');
  const dragged = solveDrawingComponentDrag(solved, { 'target:b': { x: 70, y: 80 } }, { directPointIds: ['target:b'] });
  assert.ok(dragged);
  assert.ok(Math.abs(dragged.points.p.x - (dragged.points['target:a'].x + dragged.points['target:b'].x) / 2) < 1e-7);
  assert.ok(Math.abs(dragged.points.p.y - (dragged.points['target:a'].y + dragged.points['target:b'].y) / 2) < 1e-7);
  const marker = deriveGeometricConstraintMarkers(solved, 2)[0];
  assert.equal(marker.label, 'MIDPOINT');
  assert.ok(Math.abs(Math.hypot(marker.ux, marker.uy) - 1) < 1e-12, 'marker carries target Line orientation');
  const removed = deleteGeometricConstraint(result, 'midpoint:p:target');
  assert.ok(removed.sketches[removed.activeSketchId].points.p && removed.sketches[removed.activeSketchId].entities.target);
});

test('Midpoint narrowly replaces same point/support Coincidence in one document update', () => {
  let document = add(add(createDrawingDocumentV2(), line('target')), line('other', 20));
  const sketch = document.sketches[document.activeSketchId];
  sketch.points.p = { id: 'p', x: 3, y: 8 };
  sketch.entities.other = { ...sketch.entities.other, startPointId: 'p' };
  sketch.geometricConstraints = {
    same: { id: 'same', kind: 'COINCIDENT', variant: 'point-linear-support', references: [{ kind: 'sketchPoint', pointId: 'p' }, { kind: 'entity', entityId: 'target' }] },
    other: { id: 'other', kind: 'COINCIDENT', variant: 'point-linear-support', references: [{ kind: 'sketchPoint', pointId: 'p' }, { kind: 'entity', entityId: 'other' }] },
  };
  sketch.geometricConstraintOrder = ['same', 'other'];
  const selection = [{ kind: 'point', pointId: 'p' }, { kind: 'line', lineId: 'target' }];
  const choice = getDrawingConstraintApplicability(selection, document).find(({ kind }) => kind === 'midpoint');
  const result = applyDrawingConstraint(document, choice), constraints = result.sketches[result.activeSketchId].geometricConstraints;
  assert.equal(constraints.same, undefined);
  assert.ok(constraints.other);
  assert.equal(constraints['midpoint:p:target'].kind, 'MIDPOINT');
  const transaction = transactDrawingDocument(EMPTY_DRAWING_HISTORY, document, () => result);
  assert.equal(transaction.history.undo.length, 1, 'replacement is one History action');
  const undone = undoDrawingDocument(transaction.history, transaction.document);
  assert.ok(undone.document.sketches[document.activeSketchId].geometricConstraints.same);
  assert.equal(undone.document.sketches[document.activeSketchId].geometricConstraints['midpoint:p:target'], undefined);
  const redone = redoDrawingDocument(undone.history, undone.document);
  assert.equal(redone.document.sketches[document.activeSketchId].geometricConstraints.same, undefined);
  assert.ok(redone.document.sketches[document.activeSketchId].geometricConstraints['midpoint:p:target']);
});

test('one existing axis constraint locks both manual axis choices and the application authority', () => {
  let document = add(createDrawingDocumentV2(), line('axis'));
  const selection = [{ kind: 'line', lineId: 'axis' }];
  const horizontal = getDrawingConstraintApplicability(selection, document).find(({ kind }) => kind === 'horizontal');
  document = applyDrawingConstraint(document, horizontal);
  const constrained = document;
  const sketch = document.sketches[document.activeSketchId];
  assert.equal(getExistingAxisConstraintForLine(sketch, 'axis')?.kind, 'HORIZONTAL');
  assert.deepEqual(enabled(document, selection), []);
  const vertical = getDrawingConstraintApplicability(selection, document).find(({ kind }) => kind === 'vertical');
  assert.equal(vertical.disabledReason, 'Line already has a Horizontal/Vertical constraint');
  const endpointsBeforeBypass = { a: sketch.points['axis:a'], b: sketch.points['axis:b'] };
  const bypass = { ...vertical, applicable: true, creatable: true, enabled: true };
  assert.strictEqual(applyDrawingConstraint(document, bypass), constrained, 'stale or direct UI data cannot add the opposing axis');
  assert.deepEqual({ a: sketch.points['axis:a'], b: sketch.points['axis:b'] }, endpointsBeforeBypass, 'rejection cannot collapse or otherwise move the Line');

  const withoutAxis = { ...document, sketches: { ...document.sketches, [sketch.id]: { ...sketch, geometricConstraints: {}, geometricConstraintOrder: [] } } };
  assert.deepEqual(enabled(withoutAxis, selection), ['horizontal', 'vertical'], 'deleting the marker constraint unlocks both choices');
});

test('vertical axis intent also locks both choices and degenerate Lines offer neither', () => {
  let document = add(createDrawingDocumentV2(), line('axis'));
  const selection = [{ kind: 'line', lineId: 'axis' }];
  document = applyDrawingConstraint(document, getDrawingConstraintApplicability(selection, document).find(({ kind }) => kind === 'vertical'));
  assert.deepEqual(enabled(document, selection), []);
  const horizontal = getDrawingConstraintApplicability(selection, document).find(({ kind }) => kind === 'horizontal');
  assert.strictEqual(applyDrawingConstraint(document, { ...horizontal, applicable: true, creatable: true, enabled: true }), document);

  const degenerate = add(createDrawingDocumentV2(), { ...line('zero'), end: { x: 0, y: 0 } });
  assert.deepEqual(enabled(degenerate, [{ kind: 'line', lineId: 'zero' }]), []);
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
