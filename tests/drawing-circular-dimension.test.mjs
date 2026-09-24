import test from 'node:test';
import assert from 'node:assert/strict';
import { createCircularSizeDimension, displayedDimensionMeasurement, formatCircularDimension, appendDimension, moveDimensionPlacement, deleteEntityWithDependentDimensions } from '../.test-build/drawing-circular-dimension/drawingDimension.js';
import { resolveCircularSize, circularAttachment } from '../.test-build/drawing-circular-dimension/drawingCircularSize.js';
import { solveDrawingDimensionEdit } from '../.test-build/drawing-circular-dimension/drawingConstraintSolver.js';
import { migrateDrawingDocument } from '../.test-build/drawing-circular-dimension/drawingTypes.js';

const document = () => ({ schemaVersion: 2, unit: 'mm', activeSketchId: 's', sketchOrder: ['s'], sketches: { s: { id: 's', name: 'S', points: { c: { id: 'c', x: 2, y: 3 }, a: { id: 'a', x: -5, y: 0 }, b: { id: 'b', x: 5, y: 0 } }, entities: { circle: { id: 'circle', type: 'circle', centerPointId: 'c', radius: 5 }, arc: { id: 'arc', type: 'arc', startPointId: 'a', endPointId: 'b', bulge: 1 } }, entityOrder: ['circle', 'arc'], dimensions: {}, dimensionOrder: [], geometricConstraints: {}, geometricConstraintOrder: [] } } });

test('Circle creates diameter semantic, measures and formats Ø', () => {
  const doc = document(), sketch = doc.sketches.s, d = createCircularSizeDimension(sketch, 'circle', { x: 10, y: 3 }, 'd');
  assert.equal(d.mode, 'diameter'); assert.equal(d.value, 10); assert.equal(formatCircularDimension(10, d.mode, 'driving'), 'Ø10');
  assert.equal(displayedDimensionMeasurement(sketch, d), 10);
});

test('Arc creates radius semantic for positive/negative, minor/major and semicircle bulges', () => {
  for (const bulge of [0.25, -0.25, 1, 2, -2, 1e-4]) {
    const doc = document(); doc.sketches.s.entities.arc = { ...doc.sketches.s.entities.arc, bulge };
    const resolved = resolveCircularSize(doc.sketches.s, 'arc'), d = createCircularSizeDimension(doc.sketches.s, 'arc', { x: 0, y: -8 }, 'd');
    assert.ok(resolved && Number.isFinite(resolved.radius)); assert.equal(d.mode, 'radius'); assert.equal(d.value, resolved.radius); assert.match(formatCircularDimension(d.value, d.mode, 'driving'), /^R/);
  }
});

test('reference measurement is live while driving value is authoritative', () => {
  const doc = document(), d = createCircularSizeDimension(doc.sketches.s, 'circle', { x: 10, y: 3 }, 'd');
  assert.equal(displayedDimensionMeasurement(doc.sketches.s, { ...d, role: 'reference', value: 99 }), 10);
  assert.equal(displayedDimensionMeasurement(doc.sketches.s, { ...d, value: 99 }), 99);
});

test('driving circle diameter edit changes radius only and center translation preserves value', () => {
  let doc = document(); const d = createCircularSizeDimension(doc.sketches.s, 'circle', { x: 10, y: 3 }, 'd'); doc = appendDimension(doc, d);
  const result = solveDrawingDimensionEdit({ document: doc, dimensionId: 'd', targetValue: 14 }); assert.equal(result.ok, true);
  assert.equal(result.document.sketches.s.entities.circle.radius, 7); assert.deepEqual(result.document.sketches.s.points.c, { id: 'c', x: 2, y: 3 });
  result.document.sketches.s.points.c = { id: 'c', x: 20, y: 30 }; assert.equal(displayedDimensionMeasurement(result.document.sketches.s, result.document.sketches.s.dimensions.d), 14);
});

test('driving semicircle radius edit uses canonical endpoints/bulge and shared solver', () => {
  let doc = document(); const d = createCircularSizeDimension(doc.sketches.s, 'arc', { x: 0, y: -8 }, 'd'); doc = appendDimension(doc, d);
  const result = solveDrawingDimensionEdit({ document: doc, dimensionId: 'd', targetValue: 8 }); assert.equal(result.ok, true);
  assert.ok(Math.abs(resolveCircularSize(result.document.sketches.s, 'arc').radius - 8) < 1e-7);
});

test('radial placement move changes presentation only and finite Arc attachment clamps', () => {
  let doc = document(); const d = createCircularSizeDimension(doc.sketches.s, 'arc', { x: 0, y: -8 }, 'd'); doc = appendDimension(doc, d);
  const geometry = JSON.stringify({ points: doc.sketches.s.points, entities: doc.sketches.s.entities });
  const moved = moveDimensionPlacement(doc, 'd', { kind: 'radial', anchor: { x: 100, y: 100 } }); assert.equal(JSON.stringify({ points: moved.sketches.s.points, entities: moved.sketches.s.entities }), geometry);
  const resolved = resolveCircularSize(moved.sketches.s, 'arc'), attachment = circularAttachment(resolved, { x: 100, y: 100 });
  const endpointDistances = [resolved.entity.start, resolved.entity.end].map((p) => Math.hypot(p.x - attachment.x, p.y - attachment.y)); assert.ok(Math.min(...endpointDistances) < 1e-8 || Math.abs(Math.hypot(attachment.x-resolved.entity.center.x, attachment.y-resolved.entity.center.y)-resolved.radius)<1e-8);
});

test('deleting geometry removes dependent circular dimension', () => {
  let doc = document(); doc = appendDimension(doc, createCircularSizeDimension(doc.sketches.s, 'circle', { x: 8, y: 3 }, 'd'));
  doc = deleteEntityWithDependentDimensions(doc, 'circle'); assert.equal(doc.sketches.s.dimensions.d, undefined); assert.deepEqual(doc.sketches.s.dimensionOrder, []);
});

test('restore rejects invalid circular applicability and placement', () => {
  const doc = document(), valid = createCircularSizeDimension(doc.sketches.s, 'circle', { x: 8, y: 3 }, 'valid');
  doc.sketches.s.dimensions = { valid, badMode: { ...valid, id: 'badMode', mode: 'radius' }, badPlacement: { ...valid, id: 'badPlacement', placement: { kind: 'radial', anchor: { x: NaN, y: 0 } } } }; doc.sketches.s.dimensionOrder = Object.keys(doc.sketches.s.dimensions);
  const restored = migrateDrawingDocument(doc); assert.deepEqual(restored.sketches.s.dimensionOrder, ['valid']);
});
