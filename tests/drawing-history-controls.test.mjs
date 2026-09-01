import assert from 'node:assert/strict';
import fs from 'node:fs';
import { solveDrawingDimensionEdit } from '../.test-build/drawing-history-controls/drawingConstraintSolver.js';
import { createDrawingDocumentV2 } from '../.test-build/drawing-history-controls/drawingTypes.js';
import { appendEntityToActiveSketch } from '../.test-build/drawing-history-controls/drawingLineTool.js';

const app = fs.readFileSync('src/App.tsx', 'utf8');
const workspace = fs.readFileSync('src/app/DrawingWorkspace.tsx', 'utf8');
const controls = fs.readFileSync('src/app/HistoryControls.tsx', 'utf8');

assert.match(controls, /canUndo: boolean;[\s\S]*canRedo: boolean;[\s\S]*onUndo: \(\) => void;[\s\S]*onRedo: \(\) => void;/, 'controls expose a generic presentation contract');
assert.match(controls, /disabled=\{!canUndo\}[\s\S]*disabled=\{!canRedo\}/, 'both buttons derive disabled state from capabilities');
assert.match(controls, /aria-label="Undo \(Ctrl\+Z\)" title="Undo \(Ctrl\+Z\)"/, 'Undo has an accessible label and matching tooltip');
assert.match(controls, /aria-label="Redo \(Ctrl\+Y\)" title="Redo \(Ctrl\+Y\)"/, 'Redo has an accessible label and matching tooltip');
assert.match(controls, />↶<\/button>[\s\S]*>↷<\/button>/, 'Box icon order and orientation are retained');
assert.equal((app.match(/<HistoryControls /g) ?? []).length, 2, 'Box and Drawing render the same component');
assert.match(app, /activeWorkspace === 'construction'[\s\S]*?<HistoryControls canUndo=\{undoStack\.length > 0\}/, 'Box retains its own history connection');
assert.match(app, /activeWorkspace === 'drawing'[\s\S]*?<HistoryControls canUndo=\{drawingHistoryController\?\.canUndo \?\? false\}/, 'Drawing controls live in its top toolbar');
assert.match(workspace, /transactDocument\(\(current\) => appendEntityToActiveSketch/, 'Line creation uses existing Drawing history transactions');
assert.match(workspace, /key\.toLowerCase\(\) === 'z'[\s\S]*undo\(\)/, 'Ctrl/Cmd+Z and the button share Undo');
assert.match(workspace, /key\.toLowerCase\(\) === 'y'[\s\S]*redo\(\)/, 'Ctrl/Cmd+Y and the button share Redo');
assert.doesNotMatch(controls, /undoLine|undoDimension|redoLine|redoDimension/, 'presentation is operation-agnostic');
assert.doesNotMatch(controls, /useState|useRef/, 'presentation owns no history stack');

const line = { id: 'line', type: 'line', start: { x: 0, y: 0 }, end: { x: 100, y: 0 } };
const dimension = { id: 'dimension', kind: 'ALIGNED_DISTANCE', value: 100, role: 'driving', references: [{ kind: 'point', entityId: 'line', point: 'start' }, { kind: 'point', entityId: 'line', point: 'end' }], placement: { kind: 'linear', offset: 10 } };
const initial = createDrawingDocumentV2();
const withLine = appendEntityToActiveSketch(initial, line);
const sketch = withLine.sketches[withLine.activeSketchId];
const beforeSolve = { ...withLine, sketches: { ...withLine.sketches, [sketch.id]: { ...sketch, dimensions: { dimension }, dimensionOrder: ['dimension'] } } };
const solved = solveDrawingDimensionEdit({ document: beforeSolve, dimensionId: 'dimension', targetValue: 120 });
assert.equal(solved.ok, true);

let current = initial, undoStack = [], redoStack = [];
const transact = next => { if (next !== current) { undoStack.push(current); redoStack = []; current = next; } };
const undo = () => { const previous = undoStack.pop(); if (previous) { redoStack.push(current); current = previous; } };
const redo = () => { const next = redoStack.pop(); if (next) { undoStack.push(current); current = next; } };
transact(withLine);
assert.equal(undoStack.length, 1); undo(); assert.equal(current.sketches['sketch-1'].entityOrder.length, 0, 'Undo removes a Line');
assert.equal(redoStack.length, 1); redo(); assert.equal(current.sketches['sketch-1'].entities.line.id, 'line', 'Redo restores a Line');
current = beforeSolve; undoStack = []; redoStack = []; transact(solved.document); undo();
assert.equal(current.sketches['sketch-1'].dimensions.dimension.value, 100);
assert.equal(current.sketches['sketch-1'].entities.line.end.x, 100, 'one Undo restores target and geometry');
redo(); assert.equal(current.sketches['sketch-1'].dimensions.dimension.value, 120);
assert.equal(current.sketches['sketch-1'].entities.line.end.x, 120, 'one Redo restores target and geometry');
undo(); transact(withLine); assert.equal(redoStack.length, 0, 'a new transaction clears the redo branch');

const failed = solveDrawingDimensionEdit({ document: beforeSolve, dimensionId: 'dimension', targetValue: -1 });
assert.equal(failed.ok, false);
const steps = undoStack.length;
assert.equal(undoStack.length, steps, 'a failed solve creates no transaction');

console.log('Drawing history controls tests passed');
