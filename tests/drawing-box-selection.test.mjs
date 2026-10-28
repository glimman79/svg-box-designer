import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
import vm from 'node:vm';
import {
  applyDrawingBoxSelection, drawingLineQualifiesForRect, drawingSelectionMode,
  normalizeDrawingSelectionRect, selectDrawingEntitiesInRect,
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
  assert.deepEqual(selectDrawingEntitiesInRect([crossingOnly], rect, drawingSelectionMode(10, 0)), [{ kind: 'line', lineId: 'crossing-only' }]);
  assert.deepEqual(selectDrawingEntitiesInRect([crossingOnly], rect, drawingSelectionMode(0, 10)), []);
});

test('replacement and ordered Ctrl toggle preserve point selections', () => {
  const point = { kind: 'point', pointId: 'P' }, a = { kind: 'line', lineId: 'A' }, b = { kind: 'line', lineId: 'B' }, c = { kind: 'line', lineId: 'C' };
  assert.deepEqual(applyDrawingBoxSelection([a], [b, c], false), [b, c]);
  assert.deepEqual(applyDrawingBoxSelection([a], [], false), []);
  assert.deepEqual(applyDrawingBoxSelection([point, a, b], [b, c], true), [point, a, c]);
  assert.deepEqual(applyDrawingBoxSelection([point, a], [], true), [point, a]);
  assert.deepEqual(applyDrawingBoxSelection([], [b, c], true), [b, c]);
  assert.deepEqual(applyDrawingBoxSelection([a, b], [a, b], true), []);
  const circle = { kind: 'circle', circleId: 'circle' }, arc = { kind: 'arc', arcId: 'arc' };
  assert.deepEqual(applyDrawingBoxSelection([point, circle], [circle, arc], true), [point, arc]);
});

test('Circle and finite Arc selection evaluate the curve rather than its empty interior or full support', () => {
  const circle = { id: 'circle', type: 'circle', centerPointId: 'center', center: { x: 5, y: 5 }, radius: 3 };
  const arc = { id: 'arc', type: 'arc', centerPointId: 'center', startPointId: 'start', endPointId: 'end', orientation: 'CCW',
    center: circle.center, radius: 3, start: { x: 8, y: 5 }, end: { x: 5, y: 8 }, startAngle: 0, signedSweep: Math.PI / 2 };
  const curves = [circle, arc];
  const all = [{ kind: 'circle', circleId: 'circle' }, { kind: 'arc', arcId: 'arc' }];
  assert.deepEqual(selectDrawingEntitiesInRect(curves, rect, 'window'), all);
  const finiteWindow = normalizeDrawingSelectionRect({ x: 4, y: 4 }, { x: 9, y: 9 });
  assert.deepEqual(selectDrawingEntitiesInRect(curves, finiteWindow, 'window'), [all[1]], 'finite quarter Arc fits even when its support Circle does not');
  const interior = normalizeDrawingSelectionRect({ x: 4, y: 4 }, { x: 6, y: 6 });
  assert.deepEqual(selectDrawingEntitiesInRect(curves, interior, 'crossing'), [], 'empty interiors do not qualify');
  const opposite = normalizeDrawingSelectionRect({ x: 1, y: 4 }, { x: 3, y: 6 });
  assert.deepEqual(selectDrawingEntitiesInRect(curves, opposite, 'crossing'), [all[0]], 'the opposite support is not part of the finite Arc');
  const contact = normalizeDrawingSelectionRect({ x: 8, y: 4 }, { x: 10, y: 6 });
  assert.deepEqual(selectDrawingEntitiesInRect(curves, contact, 'crossing'), all, 'Circle tangent and Arc endpoint boundary contacts qualify');
  assert.deepEqual(selectDrawingEntitiesInRect(curves, contact, 'window'), []);
});

test('the actual Select pointer handler starts box selection only for the resolved empty owner', () => {
  const workspace = fs.readFileSync('src/app/DrawingWorkspace.tsx', 'utf8');
  const source = ts.createSourceFile('DrawingWorkspace.tsx', workspace, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let handler;
  const visit = (node) => {
    if (ts.isVariableDeclaration(node) && node.name.getText(source) === 'handlePointerDown') handler = node.initializer;
    ts.forEachChild(node, visit);
  };
  visit(source);
  assert.ok(handler, 'the workspace pointer handler must be found');
  const executable = ts.transpileModule(`const handler = ${handler.getText(source)}; handler;`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  }).outputText;
  for (const owner of [
    { kind: 'empty' }, { kind: 'dimension', dimensionId: 'dim', surface: 'line' },
    ...[
      { kind: 'point', pointId: 'p' }, { kind: 'line', lineId: 'line' },
      { kind: 'circle', circleId: 'circle' }, { kind: 'arc', arcId: 'arc' },
    ].map(selection => ({ kind: 'geometry', selection, target: null })),
  ]) {
    const document = {}, startModel = { x: 10, y: 20 }, semantic = { kind: 'curve', entityId: 'arc', distancePx: 2 };
    const boxSelectionRef = { current: null };
    let resolutions = 0, sessions = 0, captures = 0, geometryRoutes = 0, dimensionRoutes = 0;
    const dataset = { sketchPointId: 'p', sketchLineId: 'line', sketchCircleId: 'circle', sketchArcId: 'arc', dimensionId: 'dim', dimensionSurface: 'line' };
    const context = {
      CAD_PRIMARY_BUTTON: 0, activeTool: 'select', panHandlers: { onPointerDown: () => false },
      svgRef: { current: { getScreenCTM: () => ({}) } }, clientToModelPoint: () => startModel,
      documentRef: { current: document }, resolveDimensionCandidate: () => semantic,
      selectedGeometry: [{ kind: 'arc', arcId: 'selected-arc' }], constraintsPanelOpen: false,
      resolveDrawingPointerOwner: (actualDocument, point, hit, evidence, selected) => {
        resolutions++;
        assert.equal(actualDocument, document); assert.equal(point, startModel); assert.equal(hit, semantic);
        assert.deepEqual({ ...evidence }, { explicitPointId: 'p', explicitLineId: 'line', explicitCircleId: 'circle', explicitArcId: 'arc', dimensionId: 'dim', dimensionSurface: 'line' });
        assert.deepEqual([...selected], ['selected-arc']);
        return owner;
      },
      boxSelectionRef, setBoxSelection: session => {
        sessions++;
        assert.equal(boxSelectionRef.current, session);
        assert.equal(session.originModel, startModel);
        assert.equal(session.pointerId, 7); assert.equal(session.exceeded, false);
        assert.deepEqual({ ...session.originClient }, { x: 100, y: 200 });
      },
      activeSketch: { dimensions: { dim: {} } }, beginDimensionAnnotationDrag: () => dimensionRoutes++,
      cancelDimensionDrag: () => {}, routeDrawingGeometryPointerSelection: () => {
        geometryRoutes++; return { selection: [owner.selection], beginDrag: false };
      },
      setSelectedGeometry: () => {}, setSelectedDimensionId: () => {}, setSelectedGeometricConstraintId: () => {},
    };
    const onPointerDown = vm.runInNewContext(executable, context);
    onPointerDown({ button: 0, pointerId: 7, clientX: 100, clientY: 200, ctrlKey: false,
      target: { closest: selector => selector.startsWith('[data-') ? { dataset } : null },
      currentTarget: { setPointerCapture: pointerId => { assert.equal(pointerId, 7); captures++; } } });
    assert.equal(resolutions, 1, 'collected evidence is arbitrated once');
    assert.equal(sessions, owner.kind === 'empty' ? 1 : 0, `${owner.kind} box-session ownership`);
    assert.equal(captures, owner.kind === 'empty' ? 1 : 0, 'only empty canvas captures a box session');
    assert.equal(geometryRoutes, owner.kind === 'geometry' ? 1 : 0);
    assert.equal(dimensionRoutes, owner.kind === 'dimension' ? 1 : 0);
  }
});

test('workspace keeps threshold in client space and isolates transient selection behavior', () => {
  const workspace = fs.readFileSync('src/app/DrawingWorkspace.tsx', 'utf8');
  assert.match(workspace, /Math\.hypot\(event\.clientX - session\.originClient\.x, event\.clientY - session\.originClient\.y\) >= DRAWING_DRAG_THRESHOLD_PX/);
  assert.match(workspace, /if \(activeTool === 'select'\)/);
  assert.match(workspace, /onLostPointerCapture=/);
  assert.match(workspace, /className=\{`drawing-selection-box is-\$\{selectionBoxMode\}`\}/);
  assert.doesNotMatch(workspace, /transactDocument\([^\n]*BoxSelection/);
});
