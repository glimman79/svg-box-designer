import test from 'node:test';
import assert from 'node:assert/strict';
import { createDrawingDocumentV2, migrateDrawingDocument } from '../.test-build/drawing-entity-domain/drawingTypes.js';
import { resolveArc, validateDrawingTopology } from '../.test-build/drawing-entity-domain/drawingTopology.js';
import { collectDrawingEntityEquations, drawingEntityDomainsAreValid, drawingEntitySolverVariables } from '../.test-build/drawing-entity-domain/drawingEntityDefinition.js';
import { flattenDrawingSolverVariables } from '../.test-build/drawing-entity-domain/drawingSolverVariables.js';
import { solveDrawingVariableTargets, solveDrawingConstrainedVariableIntent, solveDrawingComponentDrag, solveDrawingGeometricIntent, solveDrawingDimensionEdit, minimizeDrawingVariableObjective, verifyDrawingConstraints, DRAWING_CONSTRAINT_TOLERANCE_MM } from '../.test-build/drawing-entity-domain/drawingConstraintSolver.js';
import { solveDrawingDragCandidate } from '../.test-build/drawing-entity-domain/drawingDirectManipulation.js';
import { EMPTY_DRAWING_HISTORY, transactDrawingDocument, undoDrawingDocument, redoDrawingDocument } from '../.test-build/drawing-entity-domain/drawingHistory.js';

const point = (id, x, y) => ({ id, x, y });
const fixture = (orientation = 'CCW') => {
  const document = createDrawingDocumentV2(), sketch = document.sketches[document.activeSketchId];
  return { ...document, sketches: { [sketch.id]: { ...sketch,
    points: { c: point('c', 0, 0), a: point('a', 5, 0), b: point('b', 0, 5), q: point('q', 0, 10) },
    entities: {
      arc: { id: 'arc', type: 'arc', centerPointId: 'c', radius: 5, startPointId: 'a', endPointId: 'b', orientation },
      line: { id: 'line', type: 'line', startPointId: 'b', endPointId: 'q' },
    }, entityOrder: ['arc', 'line'],
  } } };
};
const active = document => document.sketches[document.activeSketchId];
const targetsFor = (pointId, x, y) => ['x', 'y'].map((axis, i) => ({ variable: { kind: 'point-axis', pointId, axis }, value: [x, y][i] }));
const withEnd = (sketch, x, y) => ({ ...sketch, points: { ...sketch.points, b: point('b', x, y) } });
const exactPose = sketch => {
  const variables = drawingEntitySolverVariables(sketch.entities.arc), values = flattenDrawingSolverVariables(sketch, variables);
  return variables.map((variable, i) => ({ variable, value: values[i] }));
};
const assertValid = (candidate, original) => {
  assert.ok(candidate);
  assert.ok(verifyDrawingConstraints(candidate, candidate.dimensionOrder, candidate.geometricConstraintOrder));
  assert.ok(drawingEntityDomainsAreValid(candidate));
  const arc = resolveArc(candidate, candidate.entities.arc); assert.ok(arc);
  assert.ok(Math.abs(arc.signedSweep) > 0 && Math.abs(arc.signedSweep) < 2 * Math.PI);
  assert.equal(candidate.entities.arc.orientation, original.entities.arc.orientation);
  assert.equal(candidate.entities.line.startPointId, candidate.entities.arc.endPointId);
  assert.deepEqual(Object.keys(candidate.points), Object.keys(original.points));
  for (const equation of collectDrawingEntityEquations(candidate)) assert.ok(Math.abs(equation.residual(candidate)) <= DRAWING_CONSTRAINT_TOLERANCE_MM);
};

for (const orientation of ['CCW', 'CW']) {
  test(`${orientation}: coincidence fails domain verification despite zero radial residuals`, () => {
    const sketch = active(fixture(orientation)), invalid = withEnd(sketch, 5, 0);
    assert.deepEqual(collectDrawingEntityEquations(invalid).map(e => e.residual(invalid)), [0, 0]);
    assert.equal(resolveArc(invalid, invalid.entities.arc), null);
    assert.equal(drawingEntityDomainsAreValid(invalid), false);
    assert.equal(verifyDrawingConstraints(invalid, [], []), null);
    assert.equal(verifyDrawingConstraints(invalid, [], [], ['b']), null);
    assert.equal(solveDrawingVariableTargets(sketch, exactPose(invalid)), null, 'fixed invalid exact pose cannot escape by moving another variable');
  });

  test(`${orientation}: variable-target, component, and ordinary shared-point drag are safe`, () => {
    const document = fixture(orientation), sketch = active(document), snapshot = JSON.stringify(document), targets = targetsFor('b', 5, 0);
    for (const candidate of [solveDrawingVariableTargets(sketch, targets), solveDrawingComponentDrag(sketch, { b: { x: 5, y: 0 } })]) {
      if (candidate) assertValid(candidate, sketch);
      else assert.equal(candidate, null, 'rejection is an allowed result at the singular exact seed');
    }
    const dragged = solveDrawingDragCandidate(document, { kind: 'point', pointId: 'b' }, { x: 5, y: -5 });
    assertValid(active(dragged), sketch);
    assert.ok(Math.hypot(active(dragged).points.b.x - 5, active(dragged).points.b.y) < 5, 'existing intent hierarchy seeks a feasible result');
    assert.equal(JSON.stringify(document), snapshot, 'trial and rejection leave persistent input untouched');
    assert.equal(validateDrawingTopology(dragged).ok, true);
  });

  test(`${orientation}: shared solver intent, continuation, objective and invalid no-op paths`, () => {
    const sketch = active(fixture(orientation)), invalid = withEnd(sketch, 5, 0), targets = targetsFor('b', 5, 0);
    const primaryResiduals = candidate => [candidate.points.b.x - 5, candidate.points.b.y];
    for (const candidate of [
      solveDrawingConstrainedVariableIntent(sketch, targets.map(t => ({ ...t, priority: 1 }))),
      solveDrawingGeometricIntent(sketch, { seedVariable: targets[0].variable, modelScale: 5, primaryResiduals, exactVariableTargets: exactPose(invalid), continuationSeeds: [invalid] }),
      minimizeDrawingVariableObjective(sketch, { variable: targets[0].variable, coordinateRange: [0, 5], valueFromCoordinate: x => x, evaluate: candidate => primaryResiduals(candidate).reduce((s, x) => s + x * x, 0), exactTargets: [targets[1]], sampleCount: 5, refinementIterations: 2 }),
    ]) if (candidate) assertValid(candidate, sketch);
    assert.equal(solveDrawingGeometricIntent(invalid, { seedVariable: targets[0].variable, modelScale: 5, primaryResiduals: () => [0] }), null, 'zero-error fallback cannot return an invalid input');
    assert.equal(solveDrawingGeometricIntent(invalid, { seedVariable: targets[0].variable, modelScale: 5, primaryResiduals: () => [1] }), null, 'no-improvement early return is verified');
  });

  test(`${orientation}: small and near-full representable sweeps remain exact and stable`, () => {
    const sketch = active(fixture(orientation));
    for (const angle of [1e-8, 1e-11, 1e-14, -1e-8, -1e-11, -1e-14]) {
      const near = withEnd(sketch, 5 * Math.cos(angle), 5 * Math.sin(angle));
      assertValid(near, sketch);
      const arc = resolveArc(near, near.entities.arc);
      const small = (angle > 0) === (orientation === 'CCW');
      assert.ok(small ? Math.abs(arc.signedSweep) < 1e-7 : Math.abs(arc.signedSweep) > 2 * Math.PI - 1e-7);
      const targets = targetsFor('b', near.points.b.x, near.points.b.y);
      for (const candidate of [solveDrawingVariableTargets(sketch, targets), solveDrawingComponentDrag(sketch, { b: near.points.b }), active(solveDrawingDragCandidate(fixture(orientation), { kind: 'point', pointId: 'b' }, { x: near.points.b.x, y: near.points.b.y - 5 }))]) {
        assertValid(candidate, sketch);
        // Adding a delta to drag-start y=5 can round a sub-ULP target slightly;
        // exact direct-variable and component targets remain byte exact.
        assert.ok(Math.abs(candidate.points.b.y - near.points.b.y) <= Number.EPSILON * 5);
      }
      assertValid(active(migrateDrawingDocument(JSON.parse(JSON.stringify({ ...fixture(orientation), sketches: { [sketch.id]: near } })))), sketch);
    }
  });
}

test('roundoff guard separates exact and numerically ambiguous coincidence without an absolute spacing minimum', () => {
  const sketch = active(fixture());
  for (const y of [0, Number.EPSILON * 5, 8 * Number.EPSILON * 5]) {
    const invalid = withEnd(sketch, 5, y);
    assert.equal(verifyDrawingConstraints(invalid, [], []), null);
    assert.equal(resolveArc(invalid, invalid.entities.arc), null);
  }
  assertValid(withEnd(sketch, 5, 16 * Number.EPSILON * 5), sketch);
  const smallRadius = { ...sketch, points: { ...sketch.points, a: point('a', 1e-6, 0), b: point('b', 1e-6, 1e-14) }, entities: { ...sketch.entities, arc: { ...sketch.entities.arc, radius: 1e-6 } } };
  assertValid(smallRadius, sketch);
  const translated = { ...sketch, points: Object.fromEntries(Object.entries(sketch.points).map(([id, p]) => [id, { ...p, x: p.x + 1e9, y: p.y + 1e9 }])) };
  assertValid(withEnd(translated, 1e9 + 5, 1e9 + 1e-4), sketch);
  const ambiguous = withEnd(translated, 1e9 + 5, 1e9 + Number.EPSILON * 1e9);
  assert.equal(resolveArc(ambiguous, ambiguous.entities.arc), null);
  assert.equal(verifyDrawingConstraints(ambiguous, [], []), null);
  const sameRay = withEnd(sketch, 5 + 1e-8, 0);
  assert.equal(resolveArc(sameRay, sameRay.entities.arc), null, 'same ray is not an exact full circle even with distinct off-circle points');
});

test('malformed finite Arc states fail through the same resolver and generic verifier', () => {
  const sketch = active(fixture());
  for (const fields of [{ radius: 0 }, { radius: -5 }, { radius: Infinity }, { centerPointId: 'missing' }, { startPointId: 'missing' }, { endPointId: 'missing' }, { orientation: 'invalid' }]) {
    const invalid = { ...sketch, entities: { ...sketch.entities, arc: { ...sketch.entities.arc, ...fields } } };
    assert.equal(resolveArc(invalid, invalid.entities.arc), null);
    assert.equal(verifyDrawingConstraints(invalid, [], []), null);
  }
});

test('valid fallback commits once, Undo/Redo and canonical persistence preserve shared identity', () => {
  const document = fixture(), candidate = solveDrawingDragCandidate(document, { kind: 'point', pointId: 'b' }, { x: 5, y: -5 });
  const transaction = transactDrawingDocument(EMPTY_DRAWING_HISTORY, document, () => candidate);
  assert.equal(transaction.history.undo.length, 1);
  const undone = undoDrawingDocument(transaction.history, transaction.document); assert.deepEqual(undone.document, document);
  const redone = redoDrawingDocument(undone.history, undone.document); assert.deepEqual(redone.document, candidate);
  const restored = migrateDrawingDocument(JSON.parse(JSON.stringify(candidate))); assert.deepEqual(restored, candidate);
  assertValid(active(restored), active(document));
  assert.deepEqual(Object.keys(active(restored).entities.arc).sort(), ['centerPointId', 'endPointId', 'id', 'orientation', 'radius', 'startPointId', 'type']);
  const rejected = solveDrawingVariableTargets(active(document), exactPose(withEnd(active(document), 5, 0)));
  assert.equal(rejected, null);
  assert.equal(transactDrawingDocument(EMPTY_DRAWING_HISTORY, document, () => document).history.undo.length, 0);
});

test('dimension-edit fast paths cannot commit coincidence or lose authority on an invalid radius trial', () => {
  const document = fixture(), sketch = active(document);
  const dimension = { id: 'endX', kind: 'HORIZONTAL_DISTANCE', role: 'driving', value: 0, references: [{ kind: 'datum', datum: 'ORIGIN' }, { kind: 'sketchPoint', pointId: 'b' }], placement: { kind: 'linear', offset: 5 } };
  const input = { ...document, sketches: { [sketch.id]: { ...sketch, dimensions: { endX: dimension }, dimensionOrder: ['endX'] } } };
  const result = solveDrawingDimensionEdit({ document: input, dimensionId: 'endX', targetValue: 5 });
  if (result.ok) assertValid(active(result.document), active(input));
  else assert.ok(result.reason);
  const translated = { ...sketch, points: Object.fromEntries(Object.entries(sketch.points).map(([id, p]) => [id, { ...p, x: p.x + 1e9, y: p.y + 1e9 }])) };
  const near = withEnd(translated, 1e9 + 5, 1e9 + 1e-5);
  const radius = { id: 'radius', kind: 'CIRCULAR_SIZE', mode: 'radius', role: 'driving', value: 5, references: [{ kind: 'entity', entityId: 'arc' }], placement: { kind: 'radial', anchor: { x: 6, y: 6 } } };
  const sized = { ...document, sketches: { [sketch.id]: { ...near, dimensions: { radius }, dimensionOrder: ['radius'] } } };
  // At these large coordinates, radial scaling to 0.1 makes the endpoint
  // separation numerically ambiguous.
  // The original dimension must still participate, and a bad trial must fail.
  const edit = solveDrawingDimensionEdit({ document: sized, dimensionId: 'radius', targetValue: .1 });
  assert.equal(edit.ok, false, 'invalid scaled pose cannot drop the circular-size equation and commit');
  assert.equal(edit.reason, 'UNSATISFIABLE_DIMENSION_SET');
});
