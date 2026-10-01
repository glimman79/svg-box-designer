import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeDrawingConstraints, constraintJacobianRow } from '../.test-build/drawing-entity-foundation/drawingConstraintAnalysis.js';
import { drawingEntityDefiningPointIds, drawingEntityEquations, drawingEntitySolverVariables } from '../.test-build/drawing-entity-foundation/drawingEntityDefinition.js';
import { drawingSelectionKey, toggleDrawingGeometrySelection } from '../.test-build/drawing-entity-foundation/drawingConstraintsTool.js';

const sketch = {
  id: 's', name: 'S',
  points: { a: { id: 'a', x: 0, y: 0 }, b: { id: 'b', x: 8, y: 0 }, c: { id: 'c', x: 2, y: 3 } },
  entities: {
    line: { id: 'line', type: 'line', startPointId: 'a', endPointId: 'b' },
    circle: { id: 'circle', type: 'circle', centerPointId: 'c', radius: 4 },
    arc: { id: 'arc', type: 'arc', startPointId: 'a', endPointId: 'b', bulge: 0.5 },
  },
  entityOrder: ['line', 'circle', 'arc'], dimensions: {}, dimensionOrder: [], geometricConstraints: {}, geometricConstraintOrder: [],
};

test('entity definitions enumerate persistent points and current canonical variables', () => {
  assert.deepEqual(drawingEntityDefiningPointIds(sketch.entities.line), ['a', 'b']);
  assert.deepEqual(drawingEntityDefiningPointIds(sketch.entities.circle), ['c']);
  assert.deepEqual(drawingEntityDefiningPointIds(sketch.entities.arc), ['a', 'b']);
  assert.equal(drawingEntitySolverVariables(sketch.entities.circle).length, 3);
  assert.equal(drawingEntitySolverVariables(sketch.entities.arc).length, 5);
  assert.deepEqual(drawingEntityEquations(sketch, sketch.entities.arc), [], 'current bulge Arc has no target radial equations');
});

test('entity equations have a separate deterministic rank path', () => {
  const equation = {
    id: 'fixture:distance', entityId: 'fixture',
    variables: [
      { kind: 'point-axis', pointId: 'a', axis: 'x' }, { kind: 'point-axis', pointId: 'a', axis: 'y' },
      { kind: 'point-axis', pointId: 'b', axis: 'x' }, { kind: 'point-axis', pointId: 'b', axis: 'y' },
    ],
    residual: (candidate) => Math.hypot(candidate.points.b.x - candidate.points.a.x, candidate.points.b.y - candidate.points.a.y) - 8,
  };
  const row = constraintJacobianRow(sketch, { entityEquation: equation, pointKeys: ['a', 'b'] }, ['a', 'b']);
  assert.ok(row.every((value, index) => Math.abs(value - [-1, 0, 1, 0][index]) < 1e-8));
  assert.equal('kind' in equation, false, 'intrinsic equations are not user Constraints');
});

test('components retain current Circle and bulge Arc DOF', () => {
  const analysis = analyzeDrawingConstraints(sketch);
  const circle = analysis.componentByPointId.get('c');
  const arc = analysis.componentByPointId.get('a');
  assert.deepEqual({ variables: circle.variableCount, rank: circle.constraintRank, dof: circle.degreesOfFreedom }, { variables: 3, rank: 0, dof: 3 });
  assert.deepEqual({ variables: arc.variableCount, rank: arc.constraintRank, dof: arc.degreesOfFreedom }, { variables: 5, rank: 0, dof: 5 });
  assert.deepEqual(arc.entityEquationIds, []);
});

test('semantic point selection does not collapse into its owning entity', () => {
  const center = { kind: 'semanticPoint', reference: { kind: 'derivedPoint', entityId: 'arc', role: 'center' } };
  assert.notEqual(drawingSelectionKey(center), drawingSelectionKey({ kind: 'arc', arcId: 'arc' }));
  assert.deepEqual(toggleDrawingGeometrySelection([{ kind: 'arc', arcId: 'arc' }], center), [{ kind: 'arc', arcId: 'arc' }, center]);
});
