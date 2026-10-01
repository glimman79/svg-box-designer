import assert from 'node:assert/strict';
import test from 'node:test';
import { circularSupportResidual, projectPointToCircularSupport } from '../.test-build/drawing-circular-support/drawingCircularGeometry.js';
import { resolveCircularSupport } from '../.test-build/drawing-circular-support/drawingCircularSupport.js';
import { applyDrawingSolverVector, circularRadiusSolverVariable } from '../.test-build/drawing-circular-support/drawingSolverVariables.js';
import { resolveCircle } from '../.test-build/drawing-circular-support/drawingTopology.js';

const sketch = () => ({
  id: 'sketch', name: 'Sketch',
  points: {
    center: { id: 'center', x: 4, y: -3 },
    start: { id: 'start', x: 0, y: 0 },
    end: { id: 'end', x: 10, y: 0 },
  },
  entities: {
    circle: { id: 'circle', type: 'circle', centerPointId: 'center', radius: 7 },
    arc: { id: 'arc', type: 'arc', startPointId: 'start', endPointId: 'end', bulge: 0.5 },
  },
  entityOrder: ['circle', 'arc'], dimensions: {}, dimensionOrder: [],
  geometricConstraints: {}, geometricConstraintOrder: [],
});

test('Circle resolves through Circular Support with persistent center identity and unchanged radius', () => {
  const source = sketch(), support = resolveCircularSupport(source, source.entities.circle);
  assert.ok(support);
  assert.deepEqual(support.center, { x: 4, y: -3 });
  assert.equal(support.radius, 7);
  assert.deepEqual(support.centerIdentity, { kind: 'persistent', pointId: 'center' });
  assert.deepEqual(resolveCircle(source, source.entities.circle), support.entity);
});

test('current Arc exposes the same mathematical support without persistent target-Arc state', () => {
  const source = sketch(), support = resolveCircularSupport(source, source.entities.arc);
  assert.ok(support);
  assert.equal(support.entity.type, 'arc');
  assert.equal(support.entity.bulge, 0.5);
  assert.deepEqual(support.centerIdentity, { kind: 'derived', entityId: 'arc', role: 'center' });
  assert.equal('centerPointId' in source.entities.arc, false);
  assert.equal('radius' in source.entities.arc, false);
});

test('shared support projection and radial equation are representation-neutral', () => {
  const support = { center: { x: 2, y: 3 }, radius: 5 };
  assert.deepEqual(projectPointToCircularSupport({ x: 2, y: 13 }, support), { x: 2, y: 8 });
  assert.equal(circularSupportResidual({ x: 2, y: 8 }, support), 0);
});

test('circular radius solver variable preserves Circle scalar authority', () => {
  const source = sketch(), variable = circularRadiusSolverVariable('circle');
  assert.deepEqual(variable, { kind: 'entity-scalar', entityId: 'circle', scalar: 'circular-radius' });
  const candidate = applyDrawingSolverVector(source, [variable], [11]);
  assert.ok(candidate);
  assert.equal(candidate.entities.circle.radius, 11);
  assert.equal(candidate.points.center, source.points.center);
  assert.equal(candidate.entities.arc.bulge, 0.5);
});
