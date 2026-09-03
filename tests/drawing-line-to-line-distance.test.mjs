import assert from 'node:assert/strict';
import { appendDimension, canonicalDimensionReferencePairKey, createLinePairDimension, createLineToLineDistanceDimension, deriveLineToLineAnnotationGeometry, displayedDimensionMeasurement, measureLineToLineDistance, resolveLinePairDimensionMode } from '../.test-build/drawing-line-distance/drawingDimension.js';
import { resolveLineToLineMovementIntent, solveDrawingDimensionEdit } from '../.test-build/drawing-line-distance/drawingConstraintSolver.js';

const resolved = (id, start, end, reverse = false) => ({ id, type: 'line', startPointId: `${id}0`, endPointId: `${id}1`, start: reverse ? end : start, end: reverse ? start : end });
const documentFor = (a, b, extra = {}) => ({ schemaVersion: 2, unit: 'mm', activeSketchId: 's', sketchOrder: ['s'], sketches: { s: { id: 's', name: 'Sketch', points: { [a.startPointId]: { id: a.startPointId, ...a.start }, [a.endPointId]: { id: a.endPointId, ...a.end }, [b.startPointId]: { id: b.startPointId, ...b.start }, [b.endPointId]: { id: b.endPointId, ...b.end }, ...(extra.points ?? {}) }, entities: { [a.id]: { id: a.id, type: 'line', startPointId: a.startPointId, endPointId: a.endPointId }, [b.id]: { id: b.id, type: 'line', startPointId: b.startPointId, endPointId: b.endPointId }, ...(extra.entities ?? {}) }, entityOrder: extra.order ?? [a.id, b.id], dimensions: {}, dimensionOrder: [] } } });
const verticalA = resolved('a', { x: 0, y: 0 }, { x: 0, y: 20 });
const verticalB = resolved('b', { x: 50, y: -5 }, { x: 50, y: 30 });
assert.equal(resolveLinePairDimensionMode(verticalA, verticalB), 'DISTANCE');
assert.equal(resolveLinePairDimensionMode(verticalA, resolved('c', { x: 0, y: 0 }, { x: 1, y: 20 })), 'ANGLE');
assert.equal(measureLineToLineDistance(verticalA, verticalB), 50, 'infinite-support distance ignores finite extents');
const forward = createLinePairDimension(verticalA, verticalB, { x: 10, y: 10 }, 'd');
const reverse = createLinePairDimension(verticalB, verticalA, { x: 10, y: 10 }, 'r');
assert.equal(forward.kind, 'LINE_TO_LINE_DISTANCE'); assert.deepEqual(forward.references, reverse.references); assert.equal(forward.signedSide, reverse.signedSide); assert.equal(canonicalDimensionReferencePairKey(forward), canonicalDimensionReferencePairKey(reverse));
const annotation = deriveLineToLineAnnotationGeometry(verticalA, verticalB, forward.placement.offset);
assert.ok(annotation); assert.ok(Math.abs((annotation.b.x - annotation.a.x) * (verticalA.end.x - verticalA.start.x) + (annotation.b.y - annotation.a.y) * (verticalA.end.y - verticalA.start.y)) < 1e-10); assert.equal(Math.hypot(annotation.b.x - annotation.a.x, annotation.b.y - annotation.a.y), 50);
const below = deriveLineToLineAnnotationGeometry(verticalA, verticalB, 40 - 11.25);
const above = deriveLineToLineAnnotationGeometry(verticalA, verticalB, -10 - 11.25);
assert.deepEqual(below, { a: { x: 0, y: 40 }, b: { x: 50, y: 40 }, sourceA: { x: 0, y: 20 }, sourceB: { x: 50, y: 30 } }, 'below placement derives two finite-endpoint-to-Dimension witnesses');
assert.deepEqual(above, { a: { x: 0, y: -10 }, b: { x: 50, y: -10 }, sourceA: { x: 0, y: 0 }, sourceB: { x: 50, y: -5 } }, 'above placement reverses both witnesses without changing their Dimension endpoints');
for (const geometry of [below, above]) {
  assert.equal(Math.hypot(geometry.b.x - geometry.a.x, geometry.b.y - geometry.a.y), 50, 'annotation placement does not affect the measured span');
  for (const [source, endpoint] of [[geometry.sourceA, geometry.a], [geometry.sourceB, geometry.b]])
    assert.equal((endpoint.x - source.x) * (verticalA.end.y - verticalA.start.y) - (endpoint.y - source.y) * (verticalA.end.x - verticalA.start.x), 0, 'each witness is collinear with its source Line and ends at its Dimension endpoint');
}
const inside = deriveLineToLineAnnotationGeometry(verticalA, verticalB, 10 - 11.25);
assert.deepEqual(inside, { a: { x: 0, y: 10 }, b: { x: 50, y: 10 }, sourceA: { x: 0, y: 10 }, sourceB: { x: 50, y: 10 } }, 'inside-extent attachment uses the finite Line region without an endpoint extension');
assert.deepEqual(verticalA, resolved('a', { x: 0, y: 0 }, { x: 0, y: 20 }), 'witness derivation does not mutate source DrawingLineEntity geometry');
let doc = appendDimension(documentFor(verticalA, verticalB), forward); assert.equal(doc.sketches.s.dimensions.d.role, 'driving'); assert.equal(appendDimension(doc, { ...reverse, id: 'duplicate' }), doc, 'reverse relation is a duplicate');
let intent = resolveLineToLineMovementIntent(doc.sketches.s, doc.sketches.s.dimensions.d); assert.deepEqual(intent.preferred.lineIds, ['a'], 'creation order breaks an otherwise exact isolated tie');
let solved = solveDrawingDimensionEdit({ document: doc, dimensionId: 'd', targetValue: 80 }); assert.equal(solved.ok, true); assert.equal(measureLineToLineDistance({ ...verticalA, start: solved.document.sketches.s.points.a0, end: solved.document.sketches.s.points.a1 }, verticalB), 80); assert.deepEqual({ x: solved.document.sketches.s.points.a1.x - solved.document.sketches.s.points.a0.x, y: solved.document.sketches.s.points.a1.y - solved.document.sketches.s.points.a0.y }, { x: 0, y: 20 }, 'rigid edit preserves direction and length');
solved = solveDrawingDimensionEdit({ document: solved.document, dimensionId: 'd', targetValue: 0 }); assert.equal(solved.ok, true); assert.equal(displayedDimensionMeasurement(solved.document.sketches.s, solved.document.sketches.s.dimensions.d), 0, 'zero produces coincident supports without clamping');
const angle = Math.PI / 8, tangent = { x: Math.cos(angle), y: Math.sin(angle) }, normal = { x: -tangent.y, y: tangent.x };
const obliqueA = resolved('a', { x: 0, y: 0 }, { x: tangent.x * 20, y: tangent.y * 20 });
const obliqueB = resolved('b', { x: normal.x * 7, y: normal.y * 7 }, { x: normal.x * 7 - tangent.x * 30, y: normal.y * 7 - tangent.y * 30 });
doc = appendDimension(documentFor(obliqueA, obliqueB), createLineToLineDistanceDimension(obliqueB, obliqueA, { x: 0, y: 0 }, 'd'));
solved = solveDrawingDimensionEdit({ document: doc, dimensionId: 'd', targetValue: 12.5 }); assert.equal(solved.ok, true); const os = solved.document.sketches.s; assert.ok(Math.abs(measureLineToLineDistance({ ...obliqueA, start: os.points.a0, end: os.points.a1 }, { ...obliqueB, start: os.points.b0, end: os.points.b1 }) - 12.5) < 1e-7); assert.ok(Math.abs((os.points.a1.x - os.points.a0.x) * tangent.y - (os.points.a1.y - os.points.a0.y) * tangent.x) < 1e-10, '22.5 degree orientation is preserved');
const solvedA = { ...obliqueA, start: os.points.a0, end: os.points.a1 }, solvedB = { ...obliqueB, start: os.points.b0, end: os.points.b1 };
const obliqueAnnotation = deriveLineToLineAnnotationGeometry(solvedA, solvedB, doc.sketches.s.dimensions.d.placement.offset);
assert.ok(obliqueAnnotation);
for (const [source, endpoint] of [[obliqueAnnotation.sourceA, obliqueAnnotation.a], [obliqueAnnotation.sourceB, obliqueAnnotation.b]])
  assert.ok(Math.abs(tangent.x * (endpoint.y - source.y) - tangent.y * (endpoint.x - source.x)) < 1e-10, '22.5 degree witness remains collinear with the source direction');
assert.ok(Math.abs(tangent.x * (obliqueAnnotation.b.x - obliqueAnnotation.a.x) + tangent.y * (obliqueAnnotation.b.y - obliqueAnnotation.a.y)) < 1e-10, 'main Dimension remains normal to the 22.5 degree Lines');
assert.ok(Math.abs(Math.hypot(obliqueAnnotation.b.x - obliqueAnnotation.a.x, obliqueAnnotation.b.y - obliqueAnnotation.a.y) - 12.5) < 1e-7, 'edited witness geometry is recomputed at the new Dimension endpoints');
const beforePlacement = JSON.stringify(solved.document.sketches.s.points), movedAnnotation = deriveLineToLineAnnotationGeometry(solvedA, solvedB, doc.sketches.s.dimensions.d.placement.offset + 25);
assert.notDeepEqual(movedAnnotation, obliqueAnnotation, 'annotation-only placement recomputes witness geometry');
assert.equal(JSON.stringify(solved.document.sketches.s.points), beforePlacement, 'annotation-only placement creates no Sketch points, Lines, or topology mutation');
const connected = documentFor(verticalA, verticalB, { points: { q: { id: 'q', x: 10, y: 20 } }, entities: { branch: { id: 'branch', type: 'line', startPointId: 'a1', endPointId: 'q' } }, order: ['b', 'a', 'branch'] }); connected.sketches.s.dimensions.d = forward; connected.sketches.s.dimensionOrder = ['d']; intent = resolveLineToLineMovementIntent(connected.sketches.s, forward); assert.deepEqual(intent.preferred.lineIds, ['b'], 'isolated Line wins over earlier/later connected topology regardless of selection order'); solved = solveDrawingDimensionEdit({ document: connected, dimensionId: 'd', targetValue: 80 }); assert.equal(solved.ok, true); assert.deepEqual(solved.document.sketches.s.points.a0, connected.sketches.s.points.a0); assert.deepEqual(solved.document.sketches.s.points.q, connected.sketches.s.points.q);
console.log('drawing line-to-line distance tests passed');
