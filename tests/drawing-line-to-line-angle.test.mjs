import assert from 'node:assert/strict';
import { MAX_SUPPORT_INTERSECTION_DISTANCE_RATIO, angleSectorKey, createLineAngleBasis, deriveLineAngleAnnotation, selectLineAngleCandidate } from '../.test-build/drawing-line-angle/drawingLineAngle.js';
import { appendDimension, canonicalDimensionReferencePairKey, createLineToLineAngleDimension, displayedDimensionMeasurement, formatAngleDimension } from '../.test-build/drawing-line-angle/drawingDimension.js';
import { EMPTY_DRAWING_HISTORY, redoDrawingDocument, transactDrawingDocument, undoDrawingDocument } from '../.test-build/drawing-line-angle/drawingHistory.js';
import { analyzeDrawingConstraints } from '../.test-build/drawing-line-angle/drawingConstraintAnalysis.js';
import { solveDrawingDimensionEdit, verifyDrawingDrivingDimensions } from '../.test-build/drawing-line-angle/drawingConstraintSolver.js';
import { solveDrawingDragCandidate } from '../.test-build/drawing-line-angle/drawingDirectManipulation.js';

const line = (id, start, end) => ({ id, type: 'line', startPointId: `${id}a`, endPointId: `${id}b`, start, end });
const horizontal = line('a', { x: -10, y: 0 }, { x: 10, y: 0 });
const diagonal = line('b', { x: -10, y: -10 }, { x: 10, y: 10 });
const cross = createLineAngleBasis(horizontal, diagonal);
assert.ok(cross);
assert.equal(cross.candidates.length, 4, 'crossing finite lines expose all support cells');
assert.deepEqual(cross.candidates.map(({ angleDegrees }) => Math.round(angleDegrees)).sort((a, b) => a - b), [45, 45, 135, 135]);
assert.equal(new Set(cross.candidates.map(({ angleDegrees }) => Math.round(angleDegrees))).size, 2, 'numeric equality does not define identity');
assert.equal(new Set(cross.candidates.map(({ sector }) => angleSectorKey(sector))).size, 4, 'all four signed half-plane identities survive');
const selected = cross.candidates.map((candidate) => {
  const middle = candidate.startAngle + candidate.sweepAngle / 2;
  return selectLineAngleCandidate(cross, { x: Math.cos(middle) * 5, y: Math.sin(middle) * 5 });
});
assert.equal(new Set(selected.map(({ sector }) => angleSectorKey(sector))).size, 4, 'cursor motion reaches every physical sector');
for (const candidate of cross.candidates) {
  assert.deepEqual(deriveLineAngleAnnotation(cross, candidate, { x: 4, y: 1 }, 2).center, cross.intersection, 'every crossing sector uses the support intersection');
}

const reverse = createLineAngleBasis(diagonal, horizontal);
assert.ok(reverse);
for (const cursor of [{ x: 4, y: 1 }, { x: -4, y: 1 }, { x: -4, y: -1 }, { x: 4, y: -1 }]) {
  const forwardCandidate = selectLineAngleCandidate(cross, cursor), reverseCandidate = selectLineAngleCandidate(reverse, cursor);
  assert.equal(angleSectorKey(forwardCandidate.sector), angleSectorKey(reverseCandidate.sector));
  assert.ok(Math.abs(forwardCandidate.angleDegrees - reverseCandidate.angleDegrees) < 1e-10);
}

// Both finite segments lie northeast of their support intersection. The cell
// southwest of both visible segments requires extending both supports away from
// the geometry, so the geometry-based relevance rule omits only that antipode.
const separatedA = line('a', { x: 10, y: 0 }, { x: 20, y: 0 });
const separatedB = line('b', { x: 2, y: 2 }, { x: 6, y: 6 });
const separated = createLineAngleBasis(separatedA, separatedB);
assert.ok(separated);
assert.deepEqual(separated.intersection, { x: 0, y: 0 });
assert.equal(separated.candidates.length, 3, 'common separated geometry exposes occupied plus two adjacent cells');
const annotation = deriveLineAngleAnnotation(separated, separated.candidates[0], { x: 8, y: 3 }, 2);
assert.deepEqual(annotation.center, { x: 0, y: 0 }, 'separated presentation uses the true support intersection, not its annotation anchor');
assert.deepEqual(annotation.supportA, { start: annotation.center, end: annotation.start }, 'start radius remains available as mathematical Q-to-arc geometry');
assert.deepEqual(annotation.supportB, { start: annotation.center, end: annotation.end }, 'end radius remains available as mathematical Q-to-arc geometry');
assert.equal(annotation.supportExtensions.length, 2, 'both finite segments receive only the display extensions needed to reach the vertex');
assert.deepEqual(annotation.supportExtensions.map(({ start }) => start), [
  { x: 15, y: 0 },
  { x: 4, y: 4 },
], 'separated support extensions start at derived finite-segment midpoints');
assert.deepEqual(new Set(annotation.supportExtensions.map(({ end }) => `${end.x},${end.y}`)), new Set([
  `${annotation.start.x},${annotation.start.y}`,
  `${annotation.end.x},${annotation.end.y}`,
]), 'each visible reference terminates at its corresponding angle-arc endpoint');
for (const extension of annotation.supportExtensions) {
  const source = extension.lineId === separated.lineA.id ? separated.lineA : separated.lineB;
  const lineDirection = { x: source.end.x - source.start.x, y: source.end.y - source.start.y };
  const extensionDirection = { x: extension.end.x - extension.start.x, y: extension.end.y - extension.start.y };
  assert.ok(Math.abs(lineDirection.x * extensionDirection.y - lineDirection.y * extensionDirection.x) < 1e-10, 'reference extension remains collinear with its source line');
}
assert.ok(annotation.supportExtensions.every(({ start }) =>
  (start.x !== separated.lineA.start.x || start.y !== separated.lineA.start.y) &&
  (start.x !== separated.lineA.end.x || start.y !== separated.lineA.end.y) &&
  (start.x !== separated.lineB.start.x || start.y !== separated.lineB.start.y) &&
  (start.x !== separated.lineB.end.x || start.y !== separated.lineB.end.y)), 'reference extensions do not choose the endpoint nearest Q');
for (const candidate of separated.candidates) {
  assert.deepEqual(deriveLineAngleAnnotation(separated, candidate, { x: 8, y: 3 }, 2).center, separated.intersection, 'all three practical candidates share one geometric vertex');
}
const movedAnnotation = deriveLineAngleAnnotation(separated, separated.candidates[0], { x: 16, y: 6 }, 2);
assert.deepEqual(movedAnnotation.center, annotation.center, 'moving annotation does not move its geometric vertex');
assert.equal(movedAnnotation.radius, annotation.radius * 2, 'cursor distance controls arc radius independently');
const placementOne = createLineToLineAngleDimension(separatedA, separatedB, { x: 8, y: 3 }, 'p1');
const placementTwo = createLineToLineAngleDimension(separatedA, separatedB, { x: 16, y: 6 }, 'p2');
assert.ok(placementOne && placementTwo);
assert.equal(angleSectorKey(placementOne.angleSector), angleSectorKey(placementTwo.angleSector), 'cursor movement within one sector preserves semantic identity');
assert.equal(placementOne.value, placementTwo.value, 'cursor movement within one sector preserves its measured angle');

const oneSided = createLineAngleBasis(
  line('a', { x: 0, y: 0 }, { x: 10, y: 0 }),
  line('b', { x: 2, y: 2 }, { x: 6, y: 6 }),
);
assert.ok(oneSided);
const oneSidedAnnotation = deriveLineAngleAnnotation(oneSided, oneSided.candidates[0], { x: 8, y: 3 }, 2);
assert.deepEqual(oneSidedAnnotation.supportExtensions.map(({ lineId }) => lineId), ['b'], 'a segment already reaching Q receives no redundant extension');

const parallel = createLineAngleBasis(horizontal, line('c', { x: -10, y: 5 }, { x: 10, y: 5 }));
assert.equal(parallel, null, 'parallel lines fail closed without zero-angle or NaN candidates');
assert.equal(createLineToLineAngleDimension(horizontal, line('c', { x: -10, y: 5 }, { x: 10, y: 5 }), { x: 0, y: 2 }, 'bad'), null);
const nearParallel = createLineAngleBasis(
  line('near-a', { x: 0, y: 0 }, { x: 1, y: 0 }),
  line('near-b', { x: 0, y: 1 }, { x: 1, y: 1 + 1 / (MAX_SUPPORT_INTERSECTION_DISTANCE_RATIO * 2) }),
);
assert.equal(nearParallel, null, 'remote near-parallel intersections fail closed instead of producing runaway SVG or a fake local vertex');

const makeDocument = () => ({ schemaVersion: 2, unit: 'mm', activeSketchId: 's', sketchOrder: ['s'], sketches: { s: { id: 's', name: 'Sketch', points: { aa: { id: 'aa', ...horizontal.start }, ab: { id: 'ab', ...horizontal.end }, ba: { id: 'ba', ...diagonal.start }, bb: { id: 'bb', ...diagonal.end } }, entities: { a: { id: 'a', type: 'line', startPointId: 'aa', endPointId: 'ab' }, b: { id: 'b', type: 'line', startPointId: 'ba', endPointId: 'bb' } }, entityOrder: ['a', 'b'], dimensions: {}, dimensionOrder: [] } } });
const cursor = { x: 4, y: 1 };
const preview = createLineToLineAngleDimension(diagonal, horizontal, cursor, 'preview');
assert.ok(preview);
assert.equal(preview.role, 'reference', 'preview remains non-authoritative until commit classification');
assert.deepEqual(preview.references.map(({ entityId }) => entityId), ['a', 'b']);
assert.equal(formatAngleDimension(preview.value), '45°');
const before = makeDocument();
assert.equal(before.sketches.s.dimensionOrder.length, 0, 'preview does not mutate Sketch or History');
const committed = { ...preview, id: 'angle-1' };
let transaction = transactDrawingDocument(EMPTY_DRAWING_HISTORY, before, (document) => appendDimension(document, committed));
assert.equal(transaction.changed, true); assert.equal(transaction.history.undo.length, 1); assert.equal(transaction.document.sketches.s.dimensionOrder.length, 1);
assert.equal(displayedDimensionMeasurement(transaction.document.sketches.s, committed), 45);
assert.equal(transaction.document.sketches.s.dimensions['angle-1'].role, 'driving', 'an independent angle commits as Driving');
assert.equal(analyzeDrawingConstraints(transaction.document.sketches.s).components.find(({ dimensionIds }) => dimensionIds.includes('angle-1')).constraintRank, 1, 'angle adds one canonical Jacobian row');
const sectorBeforeEdit = structuredClone(transaction.document.sketches.s.dimensions['angle-1'].angleSector);
const edited = solveDrawingDimensionEdit({ document: transaction.document, dimensionId: 'angle-1', targetValue: 50 });
assert.equal(edited.ok, true, 'Driving Angle is solved by the component solver');
assert.notDeepEqual(edited.document.sketches.s.points.aa, transaction.document.sketches.s.points.aa, 'first-created Line is the preferred moving side');
assert.deepEqual(edited.document.sketches.s.points.ba, transaction.document.sketches.s.points.ba, 'later-created Line start remains stable');
assert.deepEqual(edited.document.sketches.s.points.bb, transaction.document.sketches.s.points.bb, 'later-created Line end remains stable');
assert.ok(Math.abs(displayedDimensionMeasurement(edited.document.sketches.s, edited.document.sketches.s.dimensions['angle-1']) - 50) < 1e-7);
assert.deepEqual(edited.document.sketches.s.dimensions['angle-1'].angleSector, sectorBeforeEdit, 'editing preserves the exact semantic sector');
assert.ok(verifyDrawingDrivingDimensions(edited.document.sketches.s, ['angle-1']));
const editTransaction = transactDrawingDocument(transaction.history, transaction.document, () => edited.document);
assert.equal(editTransaction.history.undo.length, 2, 'a successful Angle edit creates exactly one additional History step');
const editUndone = undoDrawingDocument(editTransaction.history, editTransaction.document);
assert.deepEqual(editUndone.document, transaction.document, 'one Undo restores the complete pre-edit geometry, value, and sector');
const zeroEdit = solveDrawingDimensionEdit({ document: edited.document, dimensionId: 'angle-1', targetValue: 0 });
assert.equal(zeroEdit.ok, false, 'zero degrees remains deferred');
assert.equal('document' in zeroEdit, false, 'a rejected solve supplies no replacement document for History');
assert.equal(solveDrawingDimensionEdit({ document: edited.document, dimensionId: 'angle-1', targetValue: 180 }).ok, false, 'straight-angle boundary is rejected conservatively');

const opposite = cross.supportCandidates.find(({ sector }) => sector.sideA === -sectorBeforeEdit.sideA && sector.sideB === -sectorBeforeEdit.sideB);
assert.ok(opposite);
const redundant = appendDimension(transaction.document, { ...committed, id: 'opposite', angleSector: opposite.sector, value: opposite.angleDegrees });
assert.equal(redundant.sketches.s.dimensions.opposite.role, 'reference', 'the equal opposite-sector equation is rank-redundant');
const dragged = solveDrawingDragCandidate(redundant, { kind: 'point', pointId: 'bb' }, { x: 20, y: 20 });
assert.ok(dragged && verifyDrawingDrivingDimensions(dragged.sketches.s, ['angle-1']), 'Direct Manipulation preserves Driving Angle while Reference contributes no equation');

const sharedDocument = structuredClone(makeDocument());
sharedDocument.sketches.s.entities.b.startPointId = 'ab';
delete sharedDocument.sketches.s.points.ba;
const sharedA = { ...horizontal, start: sharedDocument.sketches.s.points.aa, end: sharedDocument.sketches.s.points.ab };
const sharedB = { ...diagonal, startPointId: 'ab', start: sharedDocument.sketches.s.points.ab, end: sharedDocument.sketches.s.points.bb };
const sharedAngle = createLineToLineAngleDimension(sharedA, sharedB, { x: 4, y: 1 }, 'shared-angle'); assert.ok(sharedAngle);
const withSharedAngle = appendDimension(sharedDocument, sharedAngle), sharedEdit = solveDrawingDimensionEdit({ document: withSharedAngle, dimensionId: 'shared-angle', targetValue: 60 });
assert.equal(sharedEdit.ok, true); assert.equal(sharedEdit.document.sketches.s.entities.a.endPointId, sharedEdit.document.sketches.s.entities.b.startPointId, 'shared SketchPoint topology survives solving');
assert.deepEqual(sharedEdit.document.sketches.s.points.ab, withSharedAngle.sketches.s.points.ab, 'shared pivot remains stable rather than being detached');
assert.deepEqual(sharedEdit.document.sketches.s.points.bb, withSharedAngle.sketches.s.points.bb, 'later-created shared Line remains stable');
assert.notDeepEqual(sharedEdit.document.sketches.s.points.aa, withSharedAngle.sketches.s.points.aa, 'first-created side absorbs the shared-endpoint edit');

const length = { id: 'length', kind: 'ALIGNED_DISTANCE', role: 'driving', references: [{ kind: 'point', entityId: 'a', point: 'start' }, { kind: 'point', entityId: 'a', point: 'end' }], value: 20, placement: { kind: 'linear', offset: 2 } };
const withLength = appendDimension(transaction.document, length), lengthEdit = solveDrawingDimensionEdit({ document: withLength, dimensionId: 'angle-1', targetValue: 70 });
assert.equal(lengthEdit.ok, true); assert.ok(verifyDrawingDrivingDimensions(lengthEdit.document.sketches.s, ['angle-1', 'length']), 'existing Driving length remains a hard equation');
assert.deepEqual(lengthEdit.document.sketches.s.points.ba, withLength.sketches.s.points.ba, 'partially constrained first Line still moves before the later Line');
assert.deepEqual(lengthEdit.document.sketches.s.points.bb, withLength.sketches.s.points.bb, 'length does not unnecessarily switch ownership');

const reverseCreation = structuredClone(transaction.document);
reverseCreation.sketches.s.entityOrder = ['b', 'a'];
const reverseCreationEdit = solveDrawingDimensionEdit({ document: reverseCreation, dimensionId: 'angle-1', targetValue: 55 });
assert.equal(reverseCreationEdit.ok, true);
assert.deepEqual(reverseCreationEdit.document.sketches.s.points.aa, reverseCreation.sketches.s.points.aa, 'reversed creation order keeps later-created a stable');
assert.deepEqual(reverseCreationEdit.document.sketches.s.points.ab, reverseCreation.sketches.s.points.ab, 'reversed creation order keeps both a endpoints stable');
assert.notDeepEqual(reverseCreationEdit.document.sketches.s.points.ba, reverseCreation.sketches.s.points.ba, 'reversed creation order makes first-created b move');

const selectedAB = createLineToLineAngleDimension(horizontal, diagonal, cursor, 'selected-ab');
const selectedBA = createLineToLineAngleDimension(diagonal, horizontal, cursor, 'selected-ba');
assert.ok(selectedAB && selectedBA);
const selectionResults = [selectedAB, selectedBA].map((dimension) => {
  const document = appendDimension(makeDocument(), dimension);
  return solveDrawingDimensionEdit({ document, dimensionId: dimension.id, targetValue: 52 });
});
assert.ok(selectionResults.every(({ ok }) => ok));
assert.deepEqual(selectionResults[0].document.sketches.s.points, selectionResults[1].document.sketches.s.points, 'selection order cannot change Angle movement ownership');

const horizontalLock = { id: 'a-horizontal', kind: 'VERTICAL_DISTANCE', role: 'driving', references: length.references, value: 0, placement: { kind: 'linear', offset: 3 } };
const firstLocked = appendDimension(withLength, horizontalLock);
const fallbackEdit = solveDrawingDimensionEdit({ document: firstLocked, dimensionId: 'angle-1', targetValue: 65 });
assert.equal(fallbackEdit.ok, true, 'a fully orientation-constrained first Line falls back to the second Line');
assert.deepEqual(fallbackEdit.document.sketches.s.points.aa, firstLocked.sketches.s.points.aa);
assert.deepEqual(fallbackEdit.document.sketches.s.points.ab, firstLocked.sketches.s.points.ab);
assert.notDeepEqual(fallbackEdit.document.sketches.s.points.ba, firstLocked.sketches.s.points.ba);

const impossible = structuredClone(transaction.document), origin = { kind: 'datum', datum: 'ORIGIN' };
for (const [pointId, point] of Object.entries(impossible.sketches.s.points)) for (const [axis, kind] of [['x', 'HORIZONTAL_DISTANCE'], ['y', 'VERTICAL_DISTANCE']]) {
  const id = `lock-${pointId}-${axis}`;
  impossible.sketches.s.dimensions[id] = { id, kind, role: 'driving', references: [origin, { kind: 'sketchPoint', pointId }], value: Math.abs(point[axis]), placement: { kind: 'linear', offset: 3 } };
  impossible.sketches.s.dimensionOrder.push(id);
}
const impossibleEdit = solveDrawingDimensionEdit({ document: impossible, dimensionId: 'angle-1', targetValue: 65 });
assert.equal(impossibleEdit.ok, false, 'an impossible edit is rejected atomically');
assert.equal('document' in impossibleEdit, false, 'failed ownership candidates cannot expose partial geometry or target changes');
assert.equal(canonicalDimensionReferencePairKey(committed), canonicalDimensionReferencePairKey(createLineToLineAngleDimension(horizontal, diagonal, cursor, 'reverse')));
const persisted = structuredClone(transaction.document.sketches.s.dimensions['angle-1']);
const undone = undoDrawingDocument(transaction.history, transaction.document); assert.equal(undone.document.sketches.s.dimensionOrder.length, 0);
const redone = redoDrawingDocument(undone.history, undone.document); assert.deepEqual(redone.document.sketches.s.dimensions['angle-1'], persisted);
// View transforms are deliberately absent from semantic helpers/state. Re-read
// after hypothetical pan/zoom and verify no model coordinate or sector changed.
assert.deepEqual(redone.document.sketches.s.dimensions['angle-1'].angleSector, persisted.angleSector);
assert.deepEqual(redone.document.sketches.s.points, before.sketches.s.points);
assert.deepEqual(redone.document.sketches.s.entities, before.sketches.s.entities, 'derived support extensions never create or mutate Sketch entities');
console.log('drawing line-to-line angle tests passed');
