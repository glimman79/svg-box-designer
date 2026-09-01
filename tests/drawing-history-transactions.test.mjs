import assert from 'node:assert/strict';
import { createDrawingDocumentV2 } from '../.test-build/drawing-history-transactions/drawingTypes.js';
import { appendEntityToActiveSketch, applyResolvedLineClick, cancelLineInteraction, EMPTY_LINE_INTERACTION, updateLinePreview } from '../.test-build/drawing-history-transactions/drawingLineTool.js';
import { DRAWING_HISTORY_LIMIT, EMPTY_DRAWING_HISTORY, redoDrawingDocument, transactDrawingDocument, undoDrawingDocument } from '../.test-build/drawing-history-transactions/drawingHistory.js';

let document = createDrawingDocumentV2();
let history = EMPTY_DRAWING_HISTORY;
let interaction = EMPTY_LINE_INTERACTION;
let sequence = 0;

const click = (point) => {
  const result = applyResolvedLineClick(interaction, point, () => `line-${++sequence}`);
  interaction = result.interaction;
  if (result.entity) {
    const transaction = transactDrawingDocument(history, document, current => appendEntityToActiveSketch(current, result.entity));
    document = transaction.document;
    history = transaction.history;
  }
};
const undo = () => { const result = undoDrawingDocument(history, document); document = result.document; history = result.history; };
const redo = () => { const result = redoDrawingDocument(history, document); document = result.document; history = result.history; };
const lineCount = () => document.sketches[document.activeSketchId].entityOrder.length;

click({ x: 0, y: 0 });
assert.equal(history.undo.length, 0, 'first click creates no history entry');
interaction = updateLinePreview(interaction, { x: 5, y: 2 });
assert.equal(history.undo.length, 0, 'pointer preview creates no history entry');
interaction = updateLinePreview(interaction, { x: 10, y: 0 });
assert.equal(history.undo.length, 0, 'cursor movement creates no history entry');
click({ x: 10, y: 0 });
assert.equal(lineCount(), 1); assert.equal(history.undo.length, 1, 'second valid click commits exactly one entry');
click({ x: 20, y: 0 });
click({ x: 30, y: 0 });
assert.equal(lineCount(), 3); assert.equal(history.undo.length, 3, 'P1-P2-P3-P4 chain has three entries');
undo(); assert.equal(lineCount(), 2, 'Undo removes only latest chained segment');
undo(); assert.equal(lineCount(), 1, 'second Undo removes only the next segment');
redo(); assert.equal(lineCount(), 2, 'Redo restores one segment');
redo(); assert.equal(lineCount(), 3, 'second Redo restores one segment');

const beforeCancel = document;
const entriesBeforeCancel = history.undo.length;
interaction = EMPTY_LINE_INTERACTION;
click({ x: 50, y: 50 });
interaction = cancelLineInteraction();
assert.equal(document, beforeCancel); assert.equal(history.undo.length, entriesBeforeCancel, 'first click then Escape/tool cancellation changes neither document nor history');
interaction = EMPTY_LINE_INTERACTION;
click({ x: 60, y: 60 }); click({ x: 60, y: 60 });
assert.equal(document, beforeCancel); assert.equal(history.undo.length, entriesBeforeCancel, 'degenerate Line changes neither document nor history');

assert.equal(DRAWING_HISTORY_LIMIT, 100);
document = createDrawingDocumentV2(); history = EMPTY_DRAWING_HISTORY;
for (let index = 1; index <= 101; index += 1) {
  const entity = { id: `generated-${index}`, type: 'line', start: { x: index, y: 0 }, end: { x: index, y: 1 } };
  const result = transactDrawingDocument(history, document, current => appendEntityToActiveSketch(current, entity));
  document = result.document; history = result.history;
}
assert.equal(history.undo.length, 100, 'history never grows beyond the newest 100 entries');
for (let index = 0; index < 100; index += 1) undo();
assert.equal(lineCount(), 1, 'oldest state was discarded, retaining exactly operations 2..101 as undoable');

document = createDrawingDocumentV2(); history = EMPTY_DRAWING_HISTORY;
for (const id of ['A', 'B', 'C']) {
  const result = transactDrawingDocument(history, document, current => appendEntityToActiveSketch(current, { id, type: 'line', start: { x: 0, y: 0 }, end: { x: 1, y: 0 } }));
  document = result.document; history = result.history;
}
undo();
let result = transactDrawingDocument(history, document, current => appendEntityToActiveSketch(current, { id: 'D', type: 'line', start: { x: 0, y: 0 }, end: { x: 2, y: 0 } }));
document = result.document; history = result.history;
assert.deepEqual(document.sketches[document.activeSketchId].entityOrder, ['A', 'B', 'D']);
assert.equal(history.redo.length, 0, 'new commit clears redo branch');
const noRedo = redoDrawingDocument(history, document);
assert.equal(noRedo.changed, false, 'Redo is unavailable after branching');

console.log('Drawing history transaction tests passed');
