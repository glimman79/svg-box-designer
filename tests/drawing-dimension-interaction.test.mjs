import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  availableLineDimensionKinds, chooseLineDimensionKind, collectDimensionReferenceCandidates,
  createLineDimension, createLineToLineAngleDimension, dimensionScreenPixelsToModelUnits, formatLinearDimension, moveDimensionPlacement, preselectionReference,
  resolveDimensionAnnotationPlacement,
  resolveDimensionPreselection, resolveDimensionPreselectionForTarget,
} from '../.test-build/drawing-dimension-interaction/drawingDimension.js';
import { createDrawingDocumentV2 } from '../.test-build/drawing-dimension-interaction/drawingTypes.js';
import {
  beginDimensionAnnotationDragSession, cancelDimensionAnnotationDragSession,
  dimensionPlacementForDisplay, finishDimensionAnnotationDragSession,
  updateDimensionAnnotationDragSession,
} from '../.test-build/drawing-dimension-interaction/drawingDimensionDrag.js';

const line = { id: 'line-1', type: 'line', start: { x: 10, y: 20 }, end: { x: 110, y: 30 } };
const clientLines = [{ id: line.id, start: line.start, end: line.end }];
assert.deepEqual(resolveDimensionPreselection(clientLines, { x: 11, y: 20 })?.point, 'start');
assert.deepEqual(resolveDimensionPreselection(clientLines, { x: 109, y: 30 })?.point, 'end');
assert.equal(resolveDimensionPreselection(clientLines, { x: 10, y: 20 })?.kind, 'point', 'endpoint priority overrides body');
assert.equal(resolveDimensionPreselection(clientLines, { x: 60, y: 25 })?.kind, 'line');
assert.deepEqual(resolveDimensionPreselection(clientLines, { x: 10, y: 20 }), collectDimensionReferenceCandidates(clientLines, { x: 10, y: 20 })[0], 'hover and click can consume the same resolver result');
const endpoint = resolveDimensionPreselection(clientLines, { x: 10, y: 20 });
assert.deepEqual(preselectionReference(endpoint), { kind: 'point', entityId: 'line-1', point: 'start' });
assert.equal('x' in preselectionReference(endpoint), false, 'endpoint remains semantic');
assert.deepEqual(resolveDimensionPreselection(clientLines, { x: 60, y: 25 }), resolveDimensionPreselection(clientLines, { x: 60, y: 25 }));

const coincidentOriginLines = [{ id: 'at-origin', start: { x: 0, y: 0 }, end: { x: 100, y: 0 } }];
assert.equal(resolveDimensionPreselection(coincidentOriginLines, { x: 0, y: 0 }, { x: 0, y: 0 })?.kind, 'point', 'generic CAD priority remains endpoint-first');
assert.equal(resolveDimensionPreselectionForTarget(coincidentOriginLines, { x: 0, y: 0 }, 'point', { x: 0, y: 0 })?.kind, 'origin', 'waiting-for-Point gives the explicit Origin datum priority');
assert.equal(resolveDimensionPreselectionForTarget(clientLines, { x: 60, y: 25 }, 'point'), null, 'waiting-for-Point suppresses line bodies');
assert.equal(resolveDimensionPreselectionForTarget(clientLines, { x: 10, y: 20 }, 'line')?.kind, 'line', 'waiting-for-Line suppresses endpoint priority');

for (const degrees of [5, 10, 15]) {
  const radians = degrees * Math.PI / 180;
  const shallow = { ...line, start: { x: 0, y: 0 }, end: { x: 100 * Math.cos(radians), y: 100 * Math.sin(radians) } };
  assert.equal(chooseLineDimensionKind(shallow, { x: 50 - 60 * Math.sin(radians), y: 50 * Math.sin(radians) + 60 * Math.cos(radians) }), 'ALIGNED_DISTANCE');
  assert.equal(chooseLineDimensionKind(shallow, { x: 50, y: 80 }), 'HORIZONTAL_DISTANCE');
  assert.equal(chooseLineDimensionKind(shallow, { x: 120, y: 50 * Math.sin(radians) }), 'VERTICAL_DISTANCE');
  assert.equal(chooseLineDimensionKind(shallow, { x: 50, y: 80 }, 'HORIZONTAL_DISTANCE'), 'HORIZONTAL_DISTANCE', 'stationary hysteresis is stable');
  assert.equal(chooseLineDimensionKind(shallow, { x: 120, y: 50 * Math.sin(radians) }, 'HORIZONTAL_DISTANCE'), 'VERTICAL_DISTANCE', 'hysteresis is not sticky after a deliberate move');
}
assert.deepEqual(availableLineDimensionKinds({ ...line, end: { x: 110, y: 20 } }), ['ALIGNED_DISTANCE'], 'horizontal line has one canonical length and no zero projection');
assert.deepEqual(availableLineDimensionKinds({ ...line, end: { x: 10, y: 120 } }), ['ALIGNED_DISTANCE'], 'vertical line has one canonical length and no zero projection');
for (const degrees of [5, 85]) {
  const radians = degrees * Math.PI / 180;
  assert.deepEqual(availableLineDimensionKinds({ ...line, end: { x: 10 + 100 * Math.cos(radians), y: 20 + 100 * Math.sin(radians) } }), ['ALIGNED_DISTANCE', 'HORIZONTAL_DISTANCE', 'VERTICAL_DISTANCE']);
}
assert.equal(dimensionScreenPixelsToModelUnits(10, 2) * 2, 10);
assert.equal(dimensionScreenPixelsToModelUnits(10, 0.02) * 0.02, 10);


const dimension = createLineDimension(line, 'ALIGNED_DISTANCE', { x: 40, y: 80 }, 'dimension-1');
const nearPreview = createLineDimension(line, 'ALIGNED_DISTANCE', { x: 60, y: 35 }, 'preview');
const farPreview = createLineDimension(line, 'ALIGNED_DISTANCE', { x: 60, y: 135 }, 'preview');
assert.notEqual(nearPreview.placement.offset, farPreview.placement.offset, 'legacy preview placement follows every creation cursor');
assert.equal(createLineDimension(line, 'ALIGNED_DISTANCE', { x: 60, y: 135 }, 'committed').placement.offset, farPreview.placement.offset, 'commit at the final cursor matches its preview');
let document = createDrawingDocumentV2();
document = { ...document, sketches: { ...document.sketches, 'sketch-1': { ...document.sketches['sketch-1'], entities: { [line.id]: line }, entityOrder: [line.id], dimensions: { [dimension.id]: dimension }, dimensionOrder: [dimension.id] } } };
const moved = moveDimensionPlacement(document, dimension.id, dimension.placement.offset + 12);
assert.equal(moved.sketches['sketch-1'].dimensions[dimension.id].placement.offset, dimension.placement.offset + 12);
assert.deepEqual(moved.sketches['sketch-1'].entities, document.sketches['sketch-1'].entities, 'geometry unchanged');
assert.equal(moved.sketches['sketch-1'].dimensions[dimension.id].value, dimension.value, 'value unchanged');
assert.deepEqual(moved.sketches['sketch-1'].dimensions[dimension.id].references, dimension.references, 'references unchanged');
assert.strictEqual(moveDimensionPlacement(document, 'missing', 4), document);

const persistedPlacement = dimension.placement;
const positivePlacement = { kind: 'linear', offset: 24 };
const negativePlacement = { kind: 'linear', offset: -24 };
const beginDrag = (pointerId = 7) => beginDimensionAnnotationDragSession(pointerId, dimension, { x: 10, y: 10 });
let drag = beginDrag();
assert.strictEqual(dimensionPlacementForDisplay(dimension, drag), persistedPlacement, 'a new drag initially displays persisted placement');
drag = updateDimensionAnnotationDragSession(drag, 8, 1, { x: 10, y: 60 }, negativePlacement, 4);
assert.strictEqual(drag.previewPlacement, persistedPlacement, 'a foreign pointer cannot update preview placement');
assert.strictEqual(finishDimensionAnnotationDragSession(drag, 8).session, drag, 'a foreign pointerup cannot finish the owning pointer session');
assert.strictEqual(cancelDimensionAnnotationDragSession(drag, 8), drag, 'foreign cancel or lost capture cannot cancel the owning pointer session');

drag = updateDimensionAnnotationDragSession(drag, 7, 1, { x: 10, y: 11 }, positivePlacement, 4);
let completion = finishDimensionAnnotationDragSession(drag, 7);
assert.equal(completion.session, null, 'click without drag clears the session');
assert.equal(completion.commit, null, 'click without drag creates no placement transaction');
assert.strictEqual(dimensionPlacementForDisplay(dimension, completion.session), persistedPlacement, 'passive movement after a click cannot overlay persisted placement');

drag = updateDimensionAnnotationDragSession(beginDrag(), 7, 1, { x: 10, y: 30 }, positivePlacement, 4);
assert.strictEqual(dimensionPlacementForDisplay(dimension, drag), positivePlacement, 'valid owned drag displays its transient preview');
drag = cancelDimensionAnnotationDragSession(drag, 7);
assert.equal(drag, null, 'matching lostpointercapture cancels the session');
assert.strictEqual(dimensionPlacementForDisplay(dimension, drag), persistedPlacement, 'lost capture discards preview and restores persisted placement');
for (const offset of [24, 0, -24]) {
  assert.strictEqual(dimensionPlacementForDisplay(dimension, drag), persistedPlacement, `idle axis crossing at ${offset} cannot re-author placement`);
}

drag = updateDimensionAnnotationDragSession(beginDrag(), 7, 1, { x: 10, y: 30 }, positivePlacement, 4);
drag = cancelDimensionAnnotationDragSession(drag, 7);
assert.equal(drag, null, 'matching pointercancel terminates the session without a commit result');
assert.strictEqual(document.sketches['sketch-1'].dimensions[dimension.id].placement, persistedPlacement, 'cancel does not mutate the document');

drag = updateDimensionAnnotationDragSession(beginDrag(), 7, 0, { x: 10, y: 50 }, negativePlacement, 4);
assert.equal(drag, null, 'passive no-button movement invalidates a leaked drag session');
assert.strictEqual(dimensionPlacementForDisplay(dimension, drag), persistedPlacement, 'no-button movement cannot retain preview authority');

drag = updateDimensionAnnotationDragSession(beginDrag(), 7, 1, { x: 10, y: 30 }, positivePlacement, 4);
drag = updateDimensionAnnotationDragSession(drag, 7, 1, { x: 10, y: -30 }, negativePlacement, 4);
completion = finishDimensionAnnotationDragSession(drag, 7);
assert.deepEqual(completion.commit, { id: dimension.id, placement: negativePlacement }, 'intentional owned drag can cross zero and commit its signed placement');
const intentionallyMoved = moveDimensionPlacement(document, completion.commit.id, completion.commit.placement);
assert.deepEqual(intentionallyMoved.sketches['sketch-1'].dimensions[dimension.id].placement, negativePlacement, 'successful completion persists the final preview');
assert.strictEqual(dimensionPlacementForDisplay(intentionallyMoved.sketches['sketch-1'].dimensions[dimension.id], completion.session), intentionallyMoved.sketches['sketch-1'].dimensions[dimension.id].placement, 'passive movement after commit uses the new persisted placement');

for (const [kind, placement] of [
  ['HORIZONTAL_DISTANCE', { kind: 'linear', offset: 12 }],
  ['VERTICAL_DISTANCE', { kind: 'linear', offset: -12 }],
  ['POINT_TO_LINE_DISTANCE', { kind: 'linear', offset: 8 }],
  ['LINE_TO_LINE_DISTANCE', { kind: 'linear', offset: -8 }],
  ['LINE_TO_LINE_ANGLE', { kind: 'angular', anchor: { x: 3, y: 4 } }],
  ['CIRCULAR_SIZE radius', { kind: 'radial', anchor: { x: 5, y: 6 } }],
  ['CIRCULAR_SIZE diameter', { kind: 'radial', anchor: { x: -5, y: -6 } }],
]) {
  const familyDimension = { ...dimension, id: kind, placement };
  const familyDrag = beginDimensionAnnotationDragSession(11, familyDimension, { x: 0, y: 0 });
  assert.strictEqual(dimensionPlacementForDisplay(familyDimension, cancelDimensionAnnotationDragSession(familyDrag, 11)), placement, `${kind} shares canceled-preview placement authority`);
}

const placementCursor = { x: 70, y: 90 };
const placementLine = { ...line, startPointId: 'p0', endPointId: 'p1' };
const placementSketch = { ...document.sketches['sketch-1'], points: { p0: { id: 'p0', ...line.start }, p1: { id: 'p1', ...line.end } }, entities: { [line.id]: placementLine }, entityOrder: [line.id] };
for (const kind of ['ALIGNED_DISTANCE', 'HORIZONTAL_DISTANCE', 'VERTICAL_DISTANCE']) {
  const candidate = createLineDimension(placementLine, kind, { x: 40, y: 80 }, `dimension-${kind}`);
  const placement = resolveDimensionAnnotationPlacement(placementSketch, candidate, placementCursor);
  assert.equal(placement?.kind, 'linear', `${kind} uses the shared annotation placement resolver`);
  assert.equal(candidate.value, createLineDimension(line, kind, { x: 40, y: 80 }, 'comparison').value, 'placement resolution does not alter measurement');
}
const crossingA = { ...line, id: 'a', startPointId: 'a0', endPointId: 'a1', start: { x: -50, y: 0 }, end: { x: 50, y: 0 } };
const crossingB = { ...line, id: 'b', startPointId: 'b0', endPointId: 'b1', start: { x: 0, y: -50 }, end: { x: 0, y: 50 } };
let angleDocument = createDrawingDocumentV2();
angleDocument = { ...angleDocument, sketches: { ...angleDocument.sketches, 'sketch-1': { ...angleDocument.sketches['sketch-1'], points: { a0: { id: 'a0', ...crossingA.start }, a1: { id: 'a1', ...crossingA.end }, b0: { id: 'b0', ...crossingB.start }, b1: { id: 'b1', ...crossingB.end } }, entities: { a: crossingA, b: crossingB }, entityOrder: ['a', 'b'] } } };
const angle = createLineToLineAngleDimension(crossingA, crossingB, { x: 20, y: 20 }, 'angle');
const movedAnglePlacement = resolveDimensionAnnotationPlacement(angleDocument.sketches['sketch-1'], angle, { x: 35, y: 35 });
assert.deepEqual(movedAnglePlacement?.anchor, { x: 35, y: 35 }, 'Angle drag updates the existing annotation anchor');
assert.deepEqual(angle.angleSector, createLineToLineAngleDimension(crossingA, crossingB, { x: 20, y: 20 }, 'angle-copy').angleSector, 'Angle placement does not redesign sector selection');

for (const [value, expected] of [[120, '120 mm'], [120.5, '120.5 mm'], [120.125, '120.125 mm'], [120.1254, '120.125 mm'], [120.1255, '120.126 mm'], [98.39327, '98.393 mm'], [120.1, '120.1 mm'], [0, '0 mm']]) assert.equal(formatLinearDimension(value), expected);
assert.equal(dimension.value, Math.hypot(100, 10), 'formatting never mutates stored precision');
assert.equal(document.schemaVersion, 2, 'dimension graphics remain outside DrawingEntity/document entities');
assert.equal('Circle' in document.sketches['sketch-1'].entities, false);
const workspace = fs.readFileSync('src/app/DrawingWorkspace.tsx', 'utf8');
const css = fs.readFileSync('src/styles.css', 'utf8');
assert.match(workspace, /style=\{\{ fontSize: dimensionScreenPixelsToModelUnits\(DIMENSION_TEXT_SIZE_PX, pixelsPerMm\) \}\}/, 'model anchor uses an inverse-scale text size');
assert.match(workspace, /middle\.x[\s\S]*middle\.y/, 'dimension text remains attached to model-derived annotation geometry');
assert.match(workspace, /phase: 'lineTargetSelected'/, 'line-first intent has an explicit state instead of inspecting legacy references');
assert.doesNotMatch(workspace, /const lineId = preview\.kind/, 'legacy preview is not reinterpreted by a click-time shape heuristic');
assert.match(workspace, /createPointToPointDimension\(d\.references, a, b, kind, point, 'preview'\)/, 'legacy pointer movement re-derives kind and complete placement');
assert.match(css, /\.drawing-dimension \{ color: var\(--drawing-dimension\); \}/, 'passive dimensions use the global Dimension green token');
assert.match(css, /\.drawing-svg \{[^}]*cursor: crosshair;/, 'empty Drawing canvas uses the global crosshair cursor');
assert.match(css, /\.drawing-svg\.has-geometry-cursor \.drawing-interactive-hit \{ cursor: default; \}/, 'one shared interactive target rule supplies the normal arrow cursor');
assert.match(workspace, /drawing-geometry-entity drawing-interactive-hit/, 'selectable Sketch Lines consume shared cursor authority');
assert.match(workspace, /drawing-dimension-hit drawing-interactive-hit/, 'Dimension line and arc handles consume shared cursor authority');
assert.match(workspace, /drawing-dimension-value-hit drawing-interactive-hit/, 'Dimension text handles consume shared cursor authority');
assert.doesNotMatch(workspace, /drawing-dimension-(?:hit|value-hit)[^>]*onPointerDown=/, 'Dimension children do not compete with root pointer arbitration');
assert.match(workspace, /data-dimension-id=\{dimension\.id\} data-dimension-surface="(?:line|value)"/, 'Dimension surfaces provide semantic evidence to the root');
assert.match(workspace, /data-dimension-sketch-point-id=\{pointId\}/, 'Dimension authoring renders a semantic hit target for every entity-defining SketchPoint, including Circle centers');
assert.match(workspace, /explicitPointId[\s\S]*kind: 'sketchPoint'[\s\S]*resolveDimensionCandidate/, 'an explicit semantic point hit wins before curve arbitration');
const pointerRouter = workspace.slice(workspace.indexOf('const handlePointerDown'), workspace.indexOf("if (activeTool === 'profile')"));
assert.match(pointerRouter, /dimensionTarget && activeTool !== 'select'/,
  'Select-mode annotation hits always reach the authoritative root arbitration');
assert.match(pointerRouter, /if \(activeTool === 'dimension'\)[\s\S]*explicitPointId[\s\S]*resolveDimensionCandidate/,
  'Dimension-mode annotation-line events reach semantic point-first acquisition and then curve acquisition');
assert.match(css, /\.drawing-dimension-hit\s*\{[^}]*stroke:\s*transparent;[^}]*stroke-width:\s*14;[^}]*vector-effect:\s*non-scaling-stroke;[^}]*pointer-events:\s*stroke;/s,
  'routing regression exercises the retained 14 px transparent annotation corridor rather than shrinking it');
assert.match(pointerRouter, /resolveDrawingPointerOwner[\s\S]*owner\.kind === 'dimension'[\s\S]*beginDimensionAnnotationDrag/,
  'Select-mode annotation selection and drag begin only after root semantic ownership is resolved');
assert.match(workspace, /drawing-dimension-value-hit[\s\S]*onDoubleClick=\{beginDimensionEdit\}/,
  'explicit circular/linear value targets remain double-click editable');
assert.match(workspace, /drawing-dimension-editor-frame[\s\S]*drawing-dimension-editor/, 'the mounted editor remains an explicit interactive target');
assert.match(workspace, /editingCircularAnchor[\s\S]*editingDimension\.placement\.anchor[\s\S]*const editorAnchor/, 'circular driving dimensions use the existing value editor at their radial label');
assert.match(css, /\.drawing-svg\.has-dimension-cursor \{ cursor: crosshair; \}/, 'empty Dimension canvas uses crosshair');
assert.match(css, /is-hovered \{ color: var\(--drawing-dimension-hover\); \}[\s\S]*is-selected[^}]*var\(--drawing-dimension-active\)/, 'interactive states remain distinct through semantic tokens');
console.log('drawing dimension interaction tests passed');
