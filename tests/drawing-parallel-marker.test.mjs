import assert from 'node:assert/strict';
import { deleteGeometricConstraint, deriveParallelMarkers, GEOMETRIC_CONSTRAINT_MARKER_OFFSET_PX, GEOMETRIC_CONSTRAINT_MARKER_SIZE_PX, GEOMETRIC_CONSTRAINT_MARKER_SPACING_PX, layoutLineConstraintMarkers } from '../.test-build/drawing-parallel-marker/drawingParallelMarker.js';
import { EMPTY_DRAWING_HISTORY, redoDrawingDocument, transactDrawingDocument, undoDrawingDocument } from '../.test-build/drawing-parallel-marker/drawingHistory.js';
import { removeLineAndOrphans } from '../.test-build/drawing-parallel-marker/drawingTopology.js';
import { createDrawingDocumentV2 } from '../.test-build/drawing-parallel-marker/drawingTypes.js';
import { appendEntityToActiveSketch, applyResolvedLineClick, EMPTY_LINE_INTERACTION, resolveLineEffectivePoint } from '../.test-build/drawing-parallel-marker/drawingLineTool.js';
import { collectDrawingInferenceCandidates } from '../.test-build/drawing-parallel-marker/drawingInference.js';
import { resolveDrawingSnap } from '../.test-build/drawing-parallel-marker/drawingSnapEngine.js';
import { DrawingInferenceOverlay, DrawingWorkspace, initialDrawingViewBox } from '../.test-build/drawing-parallel-marker/DrawingWorkspace.js';
import { deriveDrawingInferencePresentations, deriveMidpointInferencePresentation } from '../.test-build/drawing-parallel-marker/drawingInferencePresentation.js';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
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

const midpointCenter = { x: 100, y: 80 };
const identity = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
const midpointInput = (targetStart, targetEnd, transforms = {}) => ({
  targetLineId: 'accepted-target', acceptedPoint: midpointCenter, targetStart, targetEnd,
  drawingToClientTransform: transforms.drawing ?? identity, overlayToClientTransform: transforms.overlay ?? identity,
});
const horizontalMidpoint = deriveMidpointInferencePresentation(midpointInput({ x: 0, y: 0 }, { x: 20, y: 0 }));
assert.deepEqual(horizontalMidpoint, {
  kind: 'midpoint', targetLineId: 'accepted-target', center: midpointCenter, direction: { x: 1, y: 0 },
  start: { x: 93, y: 80 }, end: { x: 107, y: 80 }, squareSize: 4,
}, 'shared transient Midpoint geometry retains accepted identity and fixed overlay-pixel size');
const verticalMidpoint = deriveMidpointInferencePresentation(midpointInput({ x: 5, y: 0 }, { x: 5, y: 20 }));
assert.deepEqual(verticalMidpoint?.start, { x: 100, y: 73 });
assert.deepEqual(verticalMidpoint?.end, { x: 100, y: 87 }, 'vertical target orientation is retained');
const diagonalMidpoint = deriveMidpointInferencePresentation(midpointInput({ x: 0, y: 0 }, { x: 20, y: 20 }));
assert.ok(diagonalMidpoint && Math.hypot(diagonalMidpoint.end.x - diagonalMidpoint.start.x, diagonalMidpoint.end.y - diagonalMidpoint.start.y) > 0);
assert.ok(diagonalMidpoint.direction.x > 0 && diagonalMidpoint.direction.y > 0, 'diagonal marker follows its target');
assert.equal(deriveMidpointInferencePresentation(midpointInput(midpointCenter, midpointCenter)), null, 'degenerate targets do not produce a glyph');
const panned = deriveMidpointInferencePresentation(midpointInput({ x: 90, y: 80 }, { x: 110, y: 80 }, {
  drawing: { ...identity, e: 40, f: -10 }, overlay: identity,
}));
assert.deepEqual(panned?.center, { x: 140, y: 70 }, 'center and target geometry share the same model-to-overlay transform');
assert.equal(Math.hypot(panned.end.x - panned.start.x, panned.end.y - panned.start.y), 14, 'pan/zoom transforms do not scale the glyph');
const acceptedMidpointSnap = { type: 'midpoint', active: true, effectivePoint: midpointCenter, entityId: 'accepted-target', screenDistance: 0, channels: {} };
const resolvedTarget = [{ id: 'accepted-target', start: { x: 90, y: 80 }, end: { x: 110, y: 80 } }];
const sharedItems = deriveDrawingInferencePresentations(acceptedMidpointSnap, resolvedTarget, identity, identity);
assert.equal(sharedItems.length, 1, 'accepted Midpoint produces exactly one shared presentation item');
assert.equal(sharedItems[0].targetLineId, 'accepted-target');
assert.deepEqual(sharedItems[0].center, midpointCenter);
assert.ok(Math.hypot(sharedItems[0].direction.x, sharedItems[0].direction.y) > 0);
for (const losingSnap of [
  { type: 'endpoint', active: true, effectivePoint: midpointCenter, entityId: 'accepted-target', endpoint: 'start', screenDistance: 0, channels: {} },
  { type: 'line', active: true, effectivePoint: midpointCenter, entityId: 'accepted-target', segmentParameter: 0.3, screenDistance: 0, channels: {} },
  { type: 'none', active: false, effectivePoint: midpointCenter, channels: {} },
]) assert.deepEqual(deriveDrawingInferencePresentations(losingSnap, resolvedTarget, identity, identity), [],
  `${losingSnap.type} position authority does not manufacture Midpoint presentation`);

const inferenceMarkup = renderToStaticMarkup(createElement(DrawingInferenceOverlay, { presentations: [horizontalMidpoint] }));
assert.match(inferenceMarkup, /^<g class="drawing-inference-presentation" aria-hidden="true">/,
  'shared Drawing inference overlay mounts independently of the CAD cursor glyph');
assert.match(inferenceMarkup, /class="drawing-midpoint-inference-preview" data-inference-kind="midpoint" data-target-line-id="accepted-target"/);
for (const attribute of ['x1="93"', 'y1="80"', 'x2="107"', 'y2="80"', 'width="4"', 'height="4"']) {
  assert.match(inferenceMarkup, new RegExp(attribute), `rendered shared overlay has visible ${attribute} geometry`);
}
assert.doesNotMatch(inferenceMarkup, /display="none"|visibility="hidden"|opacity="0"|drawing-cad-cursor/);
const workspaceSource = readFileSync('src/app/DrawingWorkspace.tsx', 'utf8');
const stylesSource = readFileSync('src/styles.css', 'utf8');
assert.match(workspaceSource, /deriveDrawingInferencePresentations\(snap, resolvedLines, drawingTransform, overlayTransform\)/,
  'workspace derives shared presentation directly from the accepted snap and current transforms');
assert.doesNotMatch(workspaceSource, /midpointPreview/, 'CadCursorPresentation and JSX have no Midpoint-specific storage path');
assert.match(workspaceSource, /<DrawingInferenceOverlay presentations=\{inferencePresentations\} \/>[\s\S]*activeTool === 'line' && lineCursor/,
  'shared inference overlay is mounted before, and independently from, the cursor-only branch');
assert.match(stylesSource, /\.drawing-midpoint-inference-preview\s*\{[^}]*stroke:\s*var\(--drawing-inference\);[^}]*pointer-events:\s*none;/s,
  'transient Midpoint presentation uses the inference token and cannot intercept input');

// Follow the production pointer-candidate -> snap -> Line resolution -> click -> append transaction.
const transform = identity;
let authoredDocument = appendEntityToActiveSketch(createDrawingDocumentV2(),
  { id: 'reference', type: 'line', start: { x: 0, y: 0 }, end: { x: 30, y: 15 } }, (() => { let n = 0; return () => `reference-p${++n}`; })());
const reference = { id: 'reference', start: { x: 0, y: 0 }, end: { x: 30, y: 15 } };
const authoringStart = { x: 5, y: 20 };
const rawPointer = { x: 25, y: 31 };
const candidates = collectDrawingInferenceCandidates(rawPointer, [reference], transform, undefined, authoringStart, null);
const snap = resolveDrawingSnap({ rawPoint: rawPointer, candidates, previousSnap: null, ctrlOverride: false });
assert.equal(snap.type, 'parallel', 'production candidate acquisition accepts Parallel');
const resolved = resolveLineEffectivePoint({ ...EMPTY_LINE_INTERACTION, start: authoringStart }, rawPointer, snap);
assert.equal(resolved.interaction.parallelLineId, 'reference', 'production preview retains the inferred reference Line');
const click = applyResolvedLineClick(resolved.interaction, resolved.effectivePoint, () => 'authored');
authoredDocument = appendEntityToActiveSketch(authoredDocument, click.entity,
  (() => { let n = 0; return () => `authored-p${++n}`; })(), null, null, null, resolved.interaction.parallelLineId);
const authoredSketch = authoredDocument.sketches['sketch-1'];
const [authoredConstraint] = Object.values(authoredSketch.geometricConstraints);
assert.equal(authoredConstraint.kind, 'PARALLEL', 'production Line append transaction stores Parallel intent');
assert.deepEqual(authoredConstraint.references.map(({ entityId }) => entityId), ['authored', 'reference']);
assert.deepEqual(authoredSketch.geometricConstraintOrder, [authoredConstraint.id], 'stored Parallel is ordered in the same transaction');
const authoredMarkers = deriveParallelMarkers(authoredSketch, 1);
assert.equal(authoredMarkers.length, 2, 'the production-authored constraint derives one marker per Line');
assert.deepEqual(authoredMarkers.map(({ constraintId, lineId }) => [constraintId, lineId]), [
  [authoredConstraint.id, 'authored'], [authoredConstraint.id, 'reference'],
]);
assert.ok(authoredMarkers.every(({ x, y }) => Number.isFinite(x) && Number.isFinite(y)), 'production-authored marker coordinates are finite');
const geometricOnlyDocument = appendEntityToActiveSketch(createDrawingDocumentV2(),
  { id: 'plain-a', type: 'line', start: { x: 0, y: 0 }, end: { x: 30, y: 15 } }, () => 'plain-a-point');
const geometricOnlyPair = appendEntityToActiveSketch(geometricOnlyDocument,
  { id: 'plain-b', type: 'line', start: { x: 0, y: 20 }, end: { x: 30, y: 35 } }, () => 'plain-b-point');
assert.equal(deriveParallelMarkers(geometricOnlyPair.sketches['sketch-1']).length, 0,
  'geometrically Parallel Lines without stored semantic intent do not manufacture markers');

const markup = renderToStaticMarkup(createElement(DrawingWorkspace, {
  document: authoredDocument, setDocument: () => {}, viewBox: initialDrawingViewBox, setViewBox: () => {},
}));
const parallelGroups = [...markup.matchAll(/<g class="drawing-geometric-constraint-marker drawing-parallel-marker"[^>]*>(.*?)<\/g>/g)];
assert.equal(parallelGroups.length, 2, 'actual DrawingWorkspace DOM contains two persistent Parallel groups');
assert.equal(parallelGroups.flatMap(([, contents]) => [...contents.matchAll(/<line class="drawing-parallel-marker-stroke"/g)]).length, 4,
  'actual DrawingWorkspace DOM contains four Parallel strokes');
for (const [, contents] of parallelGroups) {
  const strokes = [...contents.matchAll(/<line class="drawing-parallel-marker-stroke"([^>]*)>/g)];
  assert.equal(strokes.length, 2);
  for (const [, attributes] of strokes) {
    for (const name of ['x1', 'y1', 'x2', 'y2']) assert.ok(Number.isFinite(Number(attributes.match(new RegExp(`${name}="([^"]+)"`))?.[1])));
    assert.match(attributes, /stroke="currentColor"/);
    assert.match(attributes, /stroke-width="1\.25"/);
    assert.match(attributes, /vector-effect="non-scaling-stroke"/);
    assert.doesNotMatch(attributes, /(?:opacity="0"|visibility="hidden"|display="none")/);
  }
}
for (const pixelsPerMm of [0.5, 1, 4]) {
  const halfLength = GEOMETRIC_CONSTRAINT_MARKER_SIZE_PX / 2 / pixelsPerMm;
  const screenLength = halfLength * 2 * pixelsPerMm;
  assert.equal(screenLength, 12, `Parallel stroke remains 12 CSS px at ${pixelsPerMm} px/mm`);
  assert.ok(screenLength > 3 && screenLength < 30);
}

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
