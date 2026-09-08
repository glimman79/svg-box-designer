import assert from 'node:assert/strict';
import { deleteGeometricConstraint, deriveParallelMarkers, GEOMETRIC_CONSTRAINT_MARKER_OFFSET_PX, GEOMETRIC_CONSTRAINT_MARKER_SIZE_PX, GEOMETRIC_CONSTRAINT_MARKER_SPACING_PX, layoutLineConstraintMarkers } from '../.test-build/drawing-parallel-marker/drawingParallelMarker.js';
import { EMPTY_DRAWING_HISTORY, redoDrawingDocument, transactDrawingDocument, undoDrawingDocument } from '../.test-build/drawing-parallel-marker/drawingHistory.js';
import { removeLineAndOrphans } from '../.test-build/drawing-parallel-marker/drawingTopology.js';
import { readFileSync } from 'node:fs';

const constraint = { id: 'parallel:a:b', kind: 'PARALLEL', references: [{ kind: 'entity', entityId: 'a' }, { kind: 'entity', entityId: 'b' }] };
const sketch = {
  id: 's', name: 'Sketch',
  points: { aa: { id: 'aa', x: 0, y: 0 }, ab: { id: 'ab', x: 20, y: 0 }, ba: { id: 'ba', x: 5, y: 10 }, bb: { id: 'bb', x: 25, y: 10 } },
  entities: { a: { id: 'a', type: 'line', startPointId: 'aa', endPointId: 'ab' }, b: { id: 'b', type: 'line', startPointId: 'ba', endPointId: 'bb' } },
  entityOrder: ['a', 'b'], dimensions: {}, dimensionOrder: [],
  geometricConstraints: { [constraint.id]: constraint }, geometricConstraintOrder: [constraint.id],
};
const document = { schemaVersion: 2, unit: 'mm', sketches: { s: sketch }, sketchOrder: ['s'], activeSketchId: 's' };

assert.deepEqual(deriveParallelMarkers(sketch), [
  { id: 'parallel:a:b:0', constraintId: constraint.id, lineId: 'a', x: 10, y: 12, label: '∥' },
  { id: 'parallel:a:b:1', constraintId: constraint.id, lineId: 'b', x: 15, y: 22, label: '∥' },
], 'one semantic Parallel derives one offset marker beside each finite Line');
assert.deepEqual(deriveParallelMarkers(sketch, 2).map(({ y }) => y), [6, 16], 'screen-space offset remains 12 px at 2 px/model-unit');
assert.equal(GEOMETRIC_CONSTRAINT_MARKER_OFFSET_PX, 12);
assert.equal(GEOMETRIC_CONSTRAINT_MARKER_SIZE_PX, 12, 'all geometric constraint glyphs share the refined 12 px marker size');
assert.equal(GEOMETRIC_CONSTRAINT_MARKER_SPACING_PX, 22);
assert.equal(Object.keys(sketch.geometricConstraints).length, 1, 'deriving two markers does not create a second constraint');

const genericCandidates = ['first', 'second', 'third', 'fourth', 'fifth'].map((id) => ({ id, constraintId: id, lineId: 'a', label: id }));
assert.deepEqual(layoutLineConstraintMarkers(sketch, genericCandidates, 2).map(({ x, y }) => [x, y]), [
  [10, 6], [21, 6], [-1, 6], [32, 6], [-12, 6],
], 'all marker kinds receive deterministic symmetric screen-space slots 0, +1, -1, +2, -2');

const vertical = { id: 'vertical:a', kind: 'VERTICAL', references: [{ kind: 'entity', entityId: 'a' }] };
const multiSketch = { ...sketch, geometricConstraints: { [constraint.id]: constraint, [vertical.id]: vertical }, geometricConstraintOrder: [constraint.id, vertical.id] };
assert.deepEqual(deriveParallelMarkers(multiSketch).filter(({ lineId }) => lineId === 'a').map(({ label, x, y }) => [label, x, y]), [
  ['∥', 10, 12], ['V', 32, 12],
], 'Parallel and axis markers on one Line use distinct slots from the shared layout');
const verticalDeleted = deleteGeometricConstraint({ ...document, sketches: { s: multiSketch } }, vertical.id);
assert.deepEqual(deriveParallelMarkers(verticalDeleted.sketches.s).filter(({ lineId }) => lineId === 'a').map(({ label, x, y }) => [label, x, y]), [
  ['∥', 10, 12],
], 'deleting one constraint reflows the unrelated marker to slot zero');

const deletion = transactDrawingDocument(EMPTY_DRAWING_HISTORY, document, (current) => deleteGeometricConstraint(current, constraint.id));
assert.equal(deletion.changed, true);
assert.equal(Object.keys(deletion.document.sketches.s.geometricConstraints).length, 0, 'deleting either derived marker target removes its shared constraint');
assert.equal(deriveParallelMarkers(deletion.document.sketches.s).length, 0, 'both derived markers disappear together');
assert.deepEqual(deletion.document.sketches.s.entityOrder, ['a', 'b'], 'constraint deletion preserves both Lines');
assert.equal(deletion.history.undo.length, 1, 'constraint deletion is one History transaction');
const undone = undoDrawingDocument(deletion.history, deletion.document);
assert.equal(Object.keys(undone.document.sketches.s.geometricConstraints).length, 1, 'Undo restores one semantic constraint');
assert.equal(deriveParallelMarkers(undone.document.sketches.s).length, 2, 'Undo restores both derived markers');
const redone = redoDrawingDocument(undone.history, undone.document);
assert.equal(deriveParallelMarkers(redone.document.sketches.s).length, 0, 'Redo removes both markers again');

const lineDeleted = removeLineAndOrphans(sketch, 'a');
assert.equal(Object.keys(lineDeleted.geometricConstraints).length, 0, 'deleting a participating Line removes the dependent constraint');
assert.equal(deriveParallelMarkers(lineDeleted).length, 0, 'line dependency cleanup removes both marker representations');

const workspace = readFileSync(new URL('../src/app/DrawingWorkspace.tsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
const parallelRenderer = workspace.slice(workspace.indexOf("const isParallel = marker.label === '∥'"), workspace.indexOf('{rightAngleMarkers.map'));
assert.ok(parallelRenderer.length > 0, 'persistent Parallel has an explicit renderer branch');
assert.equal((parallelRenderer.match(/<line className="drawing-parallel-marker-stroke"/g) ?? []).length, 2,
  'each persistent Parallel symbol paints exactly two SVG Line strokes');
assert.doesNotMatch(parallelRenderer, /isParallel[^]*?<text[^>]*>∥<\/text>/,
  'persistent Parallel is not painted as Unicode text');
for (const stroke of parallelRenderer.matchAll(/<line className="drawing-parallel-marker-stroke"([^>]*)\/>/g)) {
  assert.match(stroke[1], /x1=\{[^}]+\} y1=\{[^}]+\} x2=\{[^}]+\} y2=\{[^}]+\}/, 'stroke has non-empty endpoint geometry');
  assert.match(stroke[1], /fill="none" stroke="currentColor" strokeWidth="1\.25" strokeLinecap="round" vectorEffect="non-scaling-stroke"/, 'stroke owns reliable non-scaling paint');
  assert.doesNotMatch(stroke[1], /(?:opacity=\{?0|display="none")/, 'stroke is not visually suppressed');
}
assert.match(parallelRenderer, /data-constraint-id=\{marker\.constraintId\} data-line-id=\{marker\.lineId\}/,
  'visible geometry and unchanged hit target share the semantic constraint and Line association');
assert.match(css, /\.drawing-parallel-marker\.is-hovered \{ color: var\(--drawing-hover\); \}/, 'Parallel strokes retain the existing hover color');
assert.match(css, /\.drawing-parallel-marker\.is-selected \{ color: var\(--drawing-dimension-active\); \}/, 'Parallel strokes retain the existing selected color');

console.log('drawing parallel marker tests passed');
