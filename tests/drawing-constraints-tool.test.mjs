import test from 'node:test';
import assert from 'node:assert/strict';
import { createDrawingDocumentV2 } from '../.test-build/drawing-constraints-tool/drawingTypes.js';
import { appendEntityToActiveSketch } from '../.test-build/drawing-constraints-tool/drawingLineTool.js';
import { applyDrawingConstraint, clampConstraintsPanelPosition, DRAWING_CONSTRAINT_CATALOG, getDrawingConstraintApplicability } from '../.test-build/drawing-constraints-tool/drawingConstraintsTool.js';

const line = (id, y = 0) => ({ id, type: 'line', start: { x: 0, y }, end: { x: 20, y: y + 3 }, startPointId: `${id}:a`, endPointId: `${id}:b` });
const add = (document, draft) => appendEntityToActiveSketch(document, draft);
const enabled = (document, selection) => getDrawingConstraintApplicability(selection, document).filter((item) => item.enabled).map((item) => item.kind);

test('catalog is the exact stable fourteen-option product catalog', () => {
  assert.deepEqual(DRAWING_CONSTRAINT_CATALOG.map(({ label }) => label), ['Distance', 'Length', 'Angle', 'Radius / Diameter', 'Symmetry', 'Midpoint', 'Fix', 'Coincidence', 'Concentricity', 'Tangency', 'Parallelism', 'Perpendicular', 'Horizontal', 'Vertical']);
});

test('central applicability handles line, point, mixed, and larger selections', () => {
  let document = add(add(createDrawingDocumentV2(), line('a')), line('b', 10));
  assert.deepEqual(enabled(document, []), []);
  assert.deepEqual(enabled(document, [{ kind: 'line', lineId: 'a' }]), ['horizontal', 'vertical']);
  assert.deepEqual(enabled(document, [{ kind: 'line', lineId: 'b' }, { kind: 'line', lineId: 'a' }]), ['parallelism', 'perpendicular']);
  assert.deepEqual(enabled(document, [{ kind: 'point', pointId: 'a:a' }, { kind: 'point', pointId: 'b:a' }]), ['coincidence']);
  assert.deepEqual(enabled(document, [{ kind: 'point', pointId: 'a:a' }, { kind: 'line', lineId: 'b' }]), []);
  assert.deepEqual(enabled(document, [{ kind: 'line', lineId: 'a' }, { kind: 'line', lineId: 'b' }, { kind: 'point', pointId: 'a:a' }]), []);
});

test('application uses canonical semantic IDs and disables duplicates', () => {
  let document = add(add(createDrawingDocumentV2(), line('b')), line('a', 10));
  const selected = [{ kind: 'line', lineId: 'b' }, { kind: 'line', lineId: 'a' }];
  const parallel = getDrawingConstraintApplicability(selected, document).find(({ kind }) => kind === 'parallelism');
  document = applyDrawingConstraint(document, parallel);
  assert.ok(document.sketches[document.activeSketchId].geometricConstraints['parallelism:a:b']);
  assert.equal(getDrawingConstraintApplicability(selected, document).find(({ kind }) => kind === 'parallelism').enabled, false);
});

test('panel clamping preserves a reachable header', () => {
  assert.deepEqual(clampConstraintsPanelPosition({ x: -50, y: -20 }, { width: 500, height: 400 }), { x: 0, y: 0 });
  assert.deepEqual(clampConstraintsPanelPosition({ x: 900, y: 900 }, { width: 500, height: 400 }), { x: 420, y: 368 });
});
