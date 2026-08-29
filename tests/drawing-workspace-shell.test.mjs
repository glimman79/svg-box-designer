import assert from 'node:assert/strict';
import fs from 'node:fs';
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
assert.deepEqual(drawingGrid.getDrawingGridHierarchy(1), { normalSpacing: 1, majorSpacing: 10 });
assert.deepEqual(drawingGrid.getDrawingGridHierarchy(10), { normalSpacing: 10, majorSpacing: 100 });
assert.deepEqual(drawingGrid.getDrawingGridHierarchy(100), { normalSpacing: 100, majorSpacing: null });

assert.equal(drawingGrid.getAxisLabelInterval(10, 1), 100);
assert.equal(drawingGrid.getAxisLabelInterval(10, 2), 50, 'label interval adapts independently of the 10 mm grid');
assert.deepEqual(drawingGrid.getVisibleAxisLabels(-125, 125, 50, 500).map(({ value }) => value), [-100, -50, 0, 50, 100]);
assert.deepEqual(drawingGrid.getVisibleAxisLabels(75, 225, 50, 300).map(({ value }) => value), [100, 150, 200], 'panning changes visible model values');
const anchored = drawingGrid.zoomViewBoxAtPoint({ x: 0, y: 0, width: 800, height: 600 }, 2, { x: 200, y: 150 });
assert.deepEqual(anchored, { x: 100, y: 75, width: 400, height: 300 }, 'wheel zoom preserves its model-space pointer anchor');

const appSource = fs.readFileSync('src/App.tsx', 'utf8');
assert.match(appSource, /useState<WorkspaceId>\(DEFAULT_WORKSPACE\)/);
assert.match(appSource, /<DrawingWorkspace document=\{drawingDocument\} viewBox=\{drawingViewBox\}/);
assert.match(appSource, /workspace workspace-shell/);
assert.match(appSource, /aria-label="Active Tool overlay"/);
assert.match(appSource, /onClick=\{fitCanvasToScreen\}>Fit/);
assert.match(appSource, /const handleCanvasWheel[\s\S]*?event\.preventDefault\(\);[\s\S]*?getSvgPointFromClient/);
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
assert.match(drawingSource, /getVisibleAxisLabels/);
assert.match(drawingSource, /event\.preventDefault\(\);/);
assert.doesNotMatch(drawingSource, /if \(!event\.ctrlKey\)/);
assert.doesNotMatch(drawingSource, /gridSpacing \/ 5/, 'fifth subdivisions do not govern the grid hierarchy');
assert.match(drawingSource, /xLabels\.filter\(\(\{ value, screenPosition \}\) => value !== 0/);
assert.match(drawingSource, /yLabels\.filter\(\(\{ value, screenPosition \}\) => value !== 0/);
assert.equal((drawingSource.match(/>0<\/text>/g) ?? []).length, 1, 'the screen overlay renders exactly one origin zero');
assert.equal((drawingSource.match(/>X<\/text>/g) ?? []).length, 1, 'one positive X direction indicator is rendered');
assert.equal((drawingSource.match(/>Y<\/text>/g) ?? []).length, 1, 'one positive Y direction indicator is rendered');
assert.match(drawingSource, /const xLabelY = .*\? originScreenY - 9 : originScreenY \+ 16/, 'all X values share one clipping-aware side');
assert.match(drawingSource, /const yLabelX = .*\? originScreenX - 8 : originScreenX \+ 8/, 'all Y values share one clipping-aware side');
assert.equal((drawingSource.match(/className="drawing-coordinate-value"/g) ?? []).length, 2, 'both coordinate scales use the same orderly presentation');
assert.equal((drawingSource.match(/transform=\{`rotate\(90/g) ?? []).length, 2, 'both coordinate scales follow the reference orientation');

const styles = fs.readFileSync('src/styles.css', 'utf8');
assert.match(styles, /grid-template-columns: 62px minmax\(0, 1fr\)/, 'Tools uses a fixed layout column');
assert.match(styles, /grid-template-areas: "tools canvas" "history history"/, 'History remains below Tools and canvas');
assert.match(styles, /\.workspace-shell \.active-tool-panel \{[\s\S]*?position: absolute/, 'Active Tool remains an overlay');
assert.match(styles, /\.drawing-label-overlay text \{[^}]*font-size: 11px/, 'coordinate text uses screen-space pixels');
assert.match(styles, /drawing-grid-line-normal/);
assert.match(styles, /drawing-grid-line-major/);
assert.doesNotMatch(styles, /drawing-grid-line-minor/);

console.log('D2.1 drawing workspace shell tests passed');
