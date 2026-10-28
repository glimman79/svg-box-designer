import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { stripTypeScriptTypes } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const buildRoot = path.resolve('.test-build/drawing-shell');
const drawingTypes = await import(pathToFileURL(path.join(buildRoot, 'drawingTypes.js')));
const drawingGrid = await import(pathToFileURL(path.join(buildRoot, 'drawingGrid.js')));

const document = drawingTypes.createDrawingDocumentV1();
assert.equal(drawingTypes.DEFAULT_WORKSPACE, 'construction');
assert.equal(document.schemaVersion, 1);
assert.equal(document.unit, 'mm');
assert.deepEqual(document.sketchOrder, ['sketch-1']);
assert.equal(document.activeSketchId, 'sketch-1');
assert.equal(document.sketches['sketch-1'].name, 'Sketch 1');

const sameDocument = document;
let workspace = drawingTypes.selectWorkspace(drawingTypes.DEFAULT_WORKSPACE, 'drawing');
assert.equal(workspace, 'drawing');
workspace = drawingTypes.selectWorkspace(workspace, 'construction');
assert.equal(workspace, 'construction');
workspace = drawingTypes.selectWorkspace(workspace, 'drawing');
assert.equal(workspace, 'drawing');
assert.equal(document, sameDocument, 'workspace navigation must not replace the Drawing document');
assert.equal(drawingTypes.selectWorkspace(workspace, 'puzzle'), 'drawing', 'disabled Puzzle navigation is inert');

assert.deepEqual(drawingGrid.DRAWING_ORIGIN, { x: 0, y: 0 });
assert.equal(drawingGrid.getDrawingGridSpacing(800), 10, 'default view uses the 10 mm grid');
assert.equal(drawingGrid.getDrawingGridSpacing(120), 1, 'close view uses the 1 mm grid');
assert.equal(drawingGrid.getDrawingGridSpacing(2400), 100, 'far view uses the 100 mm grid');
const returnedSpacings = new Set([-Infinity, 0, 100, 240, 241, 800, 1799, 1800, 10000, Infinity, NaN].map(drawingGrid.getDrawingGridSpacing));
assert.deepEqual(returnedSpacings, new Set([1, 10, 100]), 'no intermediate grid spacing can be returned');
assert.deepEqual(document, sameDocument, 'view/grid calculations must not mutate the Drawing document');

assert.equal(drawingGrid.getAxisLabelInterval(10, 1), 100);
assert.equal(drawingGrid.getAxisLabelInterval(10, 2), 50, 'label interval adapts independently of the 10 mm grid');
assert.deepEqual(drawingGrid.getVisibleAxisValues(-125, 125, 50), [-100, -50, 0, 50, 100]);
assert.deepEqual(drawingGrid.getVisibleAxisValues(75, 225, 50), [100, 150, 200], 'panning changes visible model values');
const anchored = drawingGrid.zoomViewBoxAtPoint({ x: 0, y: 0, width: 800, height: 600 }, 2, { x: 200, y: 150 });
assert.deepEqual(anchored, { x: 100, y: 75, width: 400, height: 300 }, 'wheel zoom preserves its model-space pointer anchor');

const appSource = fs.readFileSync('src/App.tsx', 'utf8');
assert.match(appSource, /useState<WorkspaceId>\(DEFAULT_WORKSPACE\)/);
assert.match(appSource, /<DrawingWorkspace document=\{drawingDocument\} viewBox=\{drawingViewBox\}/);
assert.match(appSource, /workspace workspace-shell/);
assert.match(appSource, /aria-label="Active Tool overlay"/);
assert.match(appSource, /onClick=\{fitCanvasToScreen\}>Fit/);
assert.match(appSource, /useCadWheelCapture\(svgRef,[\s\S]*?getSvgPointFromClient/);
assert.doesNotMatch(appSource, /grid-template-columns:.*active/);
assert.match(appSource, /activeWorkspace === 'construction' && <div className="toolbar-actions">/);
assert.match(appSource, /<button type="button" disabled title="Puzzle is not implemented">/);
assert.doesNotMatch(appSource, /type ActiveTool = [^;]*(drawing|puzzle)/);

const drawingSource = fs.readFileSync('src/app/DrawingWorkspace.tsx', 'utf8');
assert.doesNotMatch(drawingSource, /(generatedGeometry|FinalGeometry|ManufacturingGeometry|SvgDocumentModel|selectedEdgeId|undoStack)/);
assert.match(drawingSource, /drawing-workspace workspace-shell/);
assert.match(drawingSource, /patternUnits="userSpaceOnUse"/);
assert.match(drawingSource, /DRAWING_ORIGIN\.x/);
assert.match(drawingSource, /drawing-label-overlay/);
assert.match(drawingSource, /getVisibleAxisValues/);
assert.match(drawingSource, /useCadWheelCapture\(svgRef,/);
assert.match(fs.readFileSync('src/app/useCadWheelCapture.ts', 'utf8'), /event\.preventDefault\(\);/);
// The original D2.1 prohibition protected unconditional wheel zoom (#387).
// Ctrl selection and Ctrl acquisition bypass have since become separate contracts.
const wheelSource = fs.readFileSync('src/app/useCadWheelCapture.ts', 'utf8');
const wheelHook = stripTypeScriptTypes(wheelSource.replace(/^import .*\n/m, '').replace('export function', 'function'));
const wheelBody = drawingSource.match(/useCadWheelCapture\(svgRef, (\(event\) => \{[\s\S]*?)\n  \}\);/)?.[1];
assert.ok(wheelBody, 'the actual Drawing wheel callback is required');
const zoomResults = [];
for (const ctrlKey of [false, true]) {
  let wheel, cleanup, cancellations = 0, propagation = 0, updates = 0;
  let view = { x: 0, y: 0, width: 800, height: 600 };
  const svg = {
    getBoundingClientRect: () => ({ left: 10, top: 20, width: 800, height: 600 }),
    addEventListener: (type, fn, options) => { assert.equal(type, 'wheel'); assert.equal(options.passive, false); wheel = fn; },
    removeEventListener: (type, fn) => { assert.equal(type, 'wheel'); assert.equal(fn, wheel); },
  };
  const context = vm.createContext({
    useRef: (current) => ({ current }), useEffect: (effect) => { cleanup = effect(); },
    svgRef: { current: svg }, zoomViewBoxAtPoint: drawingGrid.zoomViewBoxAtPoint,
    setViewBox: (update) => { updates++; view = update(view); },
  });
  vm.runInContext(`${wheelHook}\nuseCadWheelCapture(svgRef, ${wheelBody}\n});`, context);
  wheel({ ctrlKey, clientX: 210, clientY: 170, deltaY: -120,
    preventDefault: () => cancellations++, stopPropagation: () => propagation++ });
  assert.equal(cancellations, 1, 'wheel cancels browser defaults with either Ctrl state');
  assert.equal(propagation, 1, 'wheel stays owned by the CAD viewport');
  assert.equal(updates, 1, 'Ctrl cannot gate Drawing zoom');
  assert.ok(view.width < 800);
  assert.ok(Math.abs(view.x + view.width / 4 - 200) < 1e-10, 'pointer anchor is preserved');
  zoomResults.push(view);
  cleanup();
}
assert.deepEqual(zoomResults[0], zoomResults[1], 'Ctrl does not alter wheel zoom');

// Both current !event.ctrlKey occurrences belong to Select box/click completion.
const finishBoxSource = drawingSource.match(/const finishBoxSelection = [\s\S]*?\n  \};/)?.[0];
assert.ok(finishBoxSource);
for (const ctrlKey of [false, true]) {
  let cleared = 0, ended = 0, selection = ['existing'];
  const finish = vm.runInNewContext(stripTypeScriptTypes(`${finishBoxSource}\nfinishBoxSelection`), {
    boxSelectionRef: { current: { pointerId: 7, exceeded: false } },
    setSelectedGeometry: (value) => { selection = value; },
    setSelectedDimensionId: () => cleared++, setSelectedGeometricConstraintId: () => cleared++,
    endBoxSelection: () => ended++,
  });
  finish({ pointerId: 8, ctrlKey });
  assert.equal(ended, 0, 'foreign pointer cannot finish selection');
  finish({ pointerId: 7, ctrlKey });
  assert.equal(selection.length, ctrlKey ? 1 : 0, 'Ctrl empty click preserves selection; ordinary empty click clears it');
  assert.equal(cleared, ctrlKey ? 0 : 2);
  assert.equal(ended, 1);
}

const boxSource = fs.readFileSync('src/app/drawingBoxSelection.ts', 'utf8');
const applySource = boxSource.match(/export const applyDrawingBoxSelection = [\s\S]*?\n\};/)?.[0];
assert.ok(applySource);
const applySelection = vm.runInNewContext(stripTypeScriptTypes(applySource.replace('export ', '')) + '\napplyDrawingBoxSelection');
for (const ctrlKey of [false, true]) {
  let selection = [{ kind: 'line', lineId: 'existing' }], cleared = 0, ended = 0;
  const qualifying = [{ kind: 'line', lineId: 'existing' }, { kind: 'line', lineId: 'new' }];
  const finish = vm.runInNewContext(stripTypeScriptTypes(`${finishBoxSource}\nfinishBoxSelection`), {
    boxSelectionRef: { current: { pointerId: 7, exceeded: true, originClient: { x: 0 }, currentClient: { x: 10 },
      originModel: { x: 0, y: 0 }, currentModel: { x: 10, y: 10 } } },
    documentRef: { current: { activeSketchId: 's', sketches: { s: { entityOrder: [] } } } },
    normalizeDrawingSelectionRect: () => ({}), drawingSelectionMode: () => 'window',
    resolveActiveSketchLines: () => [], selectDrawingEntitiesInRect: () => qualifying,
    applyDrawingBoxSelection: applySelection,
    setSelectedGeometry: (update) => { selection = update(selection); },
    setSelectedDimensionId: () => cleared++, setSelectedGeometricConstraintId: () => cleared++,
    endBoxSelection: () => ended++,
  });
  finish({ pointerId: 7, ctrlKey });
  assert.deepEqual(Array.from(selection, ({ lineId }) => lineId), ctrlKey ? ['new'] : ['existing', 'new'],
    'Select Ctrl toggles qualifying entities; ordinary completion replaces selection');
  assert.equal(cleared, ctrlKey ? 0 : 2, 'Ctrl preserves independent Dimension/Constraint selection');
  assert.equal(ended, 1);
}

const styles = fs.readFileSync('src/styles.css', 'utf8');
assert.match(styles, /grid-template-columns: 62px minmax\(0, 1fr\)/, 'Tools uses a fixed layout column');
assert.match(styles, /grid-template-areas: "tools canvas" "history history"/, 'History remains below Tools and canvas');
assert.match(styles, /\.workspace-shell \.active-tool-panel \{[\s\S]*?position: absolute/, 'Active Tool remains an overlay');
assert.match(styles, /\.drawing-label-overlay text \{[^}]*font-size: 11px/, 'coordinate text uses screen-space pixels');
assert.match(styles, /drawing-grid-line-primary/);
assert.match(styles, /drawing-grid-line-major/);

console.log('D2.1 drawing workspace shell tests passed');
