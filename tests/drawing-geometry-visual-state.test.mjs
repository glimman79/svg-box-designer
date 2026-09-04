import assert from 'node:assert/strict';
import fs from 'node:fs';
import { getGeometryConstraintVisualState, geometryConstraintVisualClass } from '../.test-build/drawing-geometry-visual-state/drawingGeometryVisualState.js';

const point = (id, x, y) => ({ id, x, y });
const line = (id, startPointId, endPointId) => ({ id, type: 'line', startPointId, endPointId });
const dimension = (id, role, entityId = 'line-a') => ({ id, role, kind: 'ALIGNED_DISTANCE', value: 10, references: [{ kind: 'point', entityId, point: 'start' }, { kind: 'point', entityId, point: 'end' }], placement: { kind: 'linear', offset: 5 } });
const sketch = (dimensions = {}) => ({ id: 'sketch-1', name: 'Sketch 1', points: { a: point('a', 0, 0), b: point('b', 10, 0), c: point('c', 20, 0), x: point('x', 0, 10), y: point('y', 10, 10) }, entities: { 'line-a': line('line-a', 'a', 'b'), 'line-shared': line('line-shared', 'b', 'c'), 'line-free': line('line-free', 'x', 'y') }, entityOrder: ['line-a', 'line-shared', 'line-free'], dimensions, dimensionOrder: Object.keys(dimensions) });

assert.equal(getGeometryConstraintVisualState(sketch(), { kind: 'line', lineId: 'line-a' }), 'FREE');
assert.equal(getGeometryConstraintVisualState(sketch({ ref: dimension('ref', 'reference') }), { kind: 'line', lineId: 'line-a' }), 'FREE', 'reference measurement contributes no restriction');
const driven = sketch({ drive: dimension('drive', 'driving') });
assert.equal(getGeometryConstraintVisualState(driven, { kind: 'line', lineId: 'line-a' }), 'CONSTRAINED');
assert.equal(getGeometryConstraintVisualState(driven, { kind: 'point', pointId: 'b' }), 'CONSTRAINED', 'point participation follows stable topology identity');
assert.equal(getGeometryConstraintVisualState(driven, { kind: 'line', lineId: 'line-shared' }), 'CONSTRAINED', 'a shared constrained endpoint restricts its adjacent line');
assert.equal(getGeometryConstraintVisualState(driven, { kind: 'line', lineId: 'line-free' }), 'FREE');
const multiple = sketch({ one: dimension('one', 'driving'), two: { ...dimension('two', 'driving'), kind: 'HORIZONTAL_DISTANCE' } });
assert.equal(getGeometryConstraintVisualState(multiple, { kind: 'line', lineId: 'line-a' }), 'CONSTRAINED', 'dimension count is never a lock heuristic');
assert.equal(getGeometryConstraintVisualState(sketch(), { kind: 'line', lineId: 'line-shared' }), 'FREE', 'topology alone is not a constraint');
assert.equal(getGeometryConstraintVisualState(multiple, { kind: 'line', lineId: 'line-a' }, { isRigorous: true, degreesOfFreedom: 1 }), 'CONSTRAINED');
assert.equal(getGeometryConstraintVisualState(multiple, { kind: 'line', lineId: 'line-a' }, { isRigorous: true, degreesOfFreedom: 0 }), 'FULLY_LOCKED', 'only explicit rigorous zero-DOF proof locks');
assert.equal(geometryConstraintVisualClass('FULLY_LOCKED'), 'geometry-fully-locked');

const workspace = fs.readFileSync('src/app/DrawingWorkspace.tsx', 'utf8');
const css = fs.readFileSync('src/styles.css', 'utf8');
assert.match(workspace, /data-constraint-state=\{getGeometryConstraintVisualState/);
assert.match(workspace, /if \(geometryDrag\.exceeded\) setSelectedGeometry\(null\)/, 'meaningful drag clears persistent selection at release');
assert.match(workspace, /is-geometry-dragging/, 'active manipulation has explicit semantic state');
assert.match(css, /--drawing-geometry-free:\s*#33c757;/i);
assert.match(css, /--drawing-geometry-constrained:\s*#137a3e;/i);
assert.match(css, /--drawing-geometry-locked:\s*#111827;/i);
assert.match(css, /\.drawing-line-entity\.geometry-free \{ stroke: var\(--drawing-geometry-free\); \}/i);
assert.match(css, /\.drawing-line-entity\.geometry-constrained \{ stroke: var\(--drawing-geometry-constrained\); \}/i);
assert.match(css, /\.drawing-line-entity\.geometry-fully-locked \{ stroke: var\(--drawing-geometry-locked\); \}/i);
assert.match(css, /--drawing-hover:\s*#06b6d4;[\s\S]*\.drawing-line-entity\.is-geometry-preselected,[\s\S]*\.drawing-line-entity\.is-geometry-dragging \{ stroke: var\(--drawing-hover\); stroke-width: 2\.6; \}/, 'light-blue hover temporarily overrides every permanent state through one semantic token');
assert.match(css, /drawing-geometry-point-preselection[^}]*stroke: #0e7490;[^}]*stroke-width: 2;/, 'accepted endpoint feedback remains unchanged');
assert.match(css, /has-geometry-cursor\.is-line-target[\s\S]*cursor: default;/, 'geometry uses normal Dimension arrow convention');
assert.doesNotMatch(css, /has-geometry-cursor[^}]*cursor:\s*(?:move|grab|grabbing|pointer)/s);

console.log('drawing geometry visual-state tests passed');
