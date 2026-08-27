import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const buildRoot = path.resolve('.test-build/drawing-shell');
const drawingTypes = await import(pathToFileURL(path.join(buildRoot, 'drawingTypes.js')));

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

const appSource = fs.readFileSync('src/App.tsx', 'utf8');
assert.match(appSource, /useState<WorkspaceId>\(DEFAULT_WORKSPACE\)/);
assert.match(appSource, /<DrawingWorkspace document=\{drawingDocument\} viewBox=\{drawingViewBox\}/);
assert.match(appSource, /activeWorkspace === 'construction' && <div className="toolbar-actions">/);
assert.match(appSource, /<button type="button" disabled title="Puzzle is not implemented">/);
assert.doesNotMatch(appSource, /type ActiveTool = [^;]*(drawing|puzzle)/);

const drawingSource = fs.readFileSync('src/app/DrawingWorkspace.tsx', 'utf8');
assert.doesNotMatch(drawingSource, /(generatedGeometry|FinalGeometry|ManufacturingGeometry|SvgDocumentModel|selectedEdgeId|undoStack)/);

console.log('D2.1 drawing workspace shell tests passed');
