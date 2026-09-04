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
assert.equal(getGeometryConstraintVisualState(driven, { kind: 'line', lineId: 'line-shared' }), 'FREE', 'AB length does not reduce BC endpoint mobility when A can compensate for B');
assert.equal(getGeometryConstraintVisualState(driven, { kind: 'line', lineId: 'line-free' }), 'FREE');
const reverseOrder = { ...driven, entityOrder: ['line-shared', 'line-a', 'line-free'] };
assert.equal(getGeometryConstraintVisualState(reverseOrder, { kind: 'line', lineId: 'line-a' }), 'CONSTRAINED');
assert.equal(getGeometryConstraintVisualState(reverseOrder, { kind: 'line', lineId: 'line-shared' }), 'FREE', 'per-Line mobility is independent of creation order');
const multiple = sketch({ one: dimension('one', 'driving'), two: { ...dimension('two', 'driving'), kind: 'HORIZONTAL_DISTANCE' } });
assert.equal(getGeometryConstraintVisualState(multiple, { kind: 'line', lineId: 'line-a' }), 'CONSTRAINED', 'dimension count is never a lock heuristic');
assert.equal(getGeometryConstraintVisualState(sketch(), { kind: 'line', lineId: 'line-shared' }), 'FREE', 'topology alone is not a constraint');
assert.equal(getGeometryConstraintVisualState(multiple, { kind: 'line', lineId: 'line-a' }, { isRigorous: true, degreesOfFreedom: 1 }), 'CONSTRAINED');
assert.equal(getGeometryConstraintVisualState(multiple, { kind: 'line', lineId: 'line-a' }, { isRigorous: true, degreesOfFreedom: 0 }), 'FULLY_LOCKED', 'only explicit rigorous zero-DOF proof locks');

const origin = { kind: 'datum', datum: 'ORIGIN' };
const pointReference = (pointId) => ({ kind: 'sketchPoint', pointId });
const datumDimension = (id, kind, pointId, value) => ({ id, kind, role: 'driving', value, references: [origin, pointReference(pointId)], placement: { kind: 'linear', offset: 5 } });
const mixed = {
  id: 'mixed', name: 'Mixed',
  points: { a: point('a', 0, 0), b: point('b', 10, 0), c: point('c', 20, 0), d: point('d', 30, 0) },
  entities: { ab: line('ab', 'a', 'b'), bc: line('bc', 'b', 'c'), cd: line('cd', 'c', 'd') },
  entityOrder: ['ab', 'bc', 'cd'],
  dimensions: {
    ax: datumDimension('ax', 'HORIZONTAL_DISTANCE', 'a', 0), ay: datumDimension('ay', 'VERTICAL_DISTANCE', 'a', 0),
    bx: datumDimension('bx', 'HORIZONTAL_DISTANCE', 'b', 10), by: datumDimension('by', 'VERTICAL_DISTANCE', 'b', 0),
  },
  dimensionOrder: ['ax', 'ay', 'bx', 'by'],
};
assert.equal(getGeometryConstraintVisualState(mixed, { kind: 'line', lineId: 'ab' }), 'FULLY_LOCKED', 'both endpoints have zero legitimate mobility');
assert.equal(getGeometryConstraintVisualState(mixed, { kind: 'line', lineId: 'bc' }), 'CONSTRAINED', 'one fixed endpoint removes two of the Line endpoint freedoms');
assert.equal(getGeometryConstraintVisualState(mixed, { kind: 'line', lineId: 'cd' }), 'FREE', 'a connected Line whose endpoints retain all four motions remains free');
assert.equal(geometryConstraintVisualClass('FULLY_LOCKED'), 'geometry-fully-locked');
assert.deepEqual(
  ['FREE', 'CONSTRAINED', 'FULLY_LOCKED'].map(geometryConstraintVisualClass),
  ['geometry-free', 'geometry-constrained', 'geometry-fully-locked'],
  'the resolver exposes exactly one class for each of the three permanent states',
);

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
assert.match(css, /\.drawing-line-entity\.is-geometry-selected \{ stroke-width: 2\.2; \}/, 'selection preserves the permanent state stroke');
assert.doesNotMatch(css, /\.drawing-line-entity\.is-geometry-selected\s*\{[^}]*stroke\s*:/s, 'selection cannot introduce a fourth permanent green');
assert.match(css, /--drawing-hover:\s*#06b6d4;[\s\S]*\.drawing-line-entity\.is-geometry-preselected,[\s\S]*\.drawing-line-entity\.is-geometry-dragging \{ stroke: var\(--drawing-hover\); stroke-width: 2\.6; \}/, 'light-blue hover temporarily overrides every permanent state through one semantic token');
assert.match(css, /\.drawing-line-entity\.is-dimension-preselected \{ stroke: var\(--drawing-hover\); stroke-width: 2\.4; \}/, 'Dimension preselection uses only the shared temporary hover authority');
assert.doesNotMatch(css, /\.drawing-line-entity[^}]*stroke:\s*(?:#2db65b|var\(--drawing-dimension(?:-hover|-active)?\))/i, 'Dimension green and the old FREE green cannot control committed geometry');

const committedLineStrokeRules = [...css.matchAll(/([^{}]*\.drawing-line-entity[^{}]*)\{([^{}]*)\}/g)]
  .filter(([, , declarations]) => /(?:^|;)\s*stroke\s*:/.test(declarations))
  .map(([, selector, declarations]) => ({ selector: selector.trim(), stroke: declarations.match(/(?:^|;)\s*stroke\s*:\s*([^;]+)/)?.[1].trim() }));
assert.deepEqual(committedLineStrokeRules, [
  { selector: '.drawing-line-entity.geometry-free', stroke: 'var(--drawing-geometry-free)' },
  { selector: '.drawing-line-entity.geometry-constrained', stroke: 'var(--drawing-geometry-constrained)' },
  { selector: '.drawing-line-entity.geometry-fully-locked', stroke: 'var(--drawing-geometry-locked)' },
  { selector: '.drawing-line-entity.is-dimension-preselected', stroke: 'var(--drawing-hover)' },
  { selector: '.drawing-line-entity.is-geometry-preselected,\n.drawing-line-entity.is-geometry-dragging', stroke: 'var(--drawing-hover)' },
], 'committed Lines have three permanent stroke authorities and only temporary light-blue overrides');
assert.match(css, /drawing-geometry-point-preselection[^}]*stroke: #0e7490;[^}]*stroke-width: 2;/, 'accepted endpoint feedback remains unchanged');
assert.match(css, /has-geometry-cursor\.is-line-target[\s\S]*cursor: default;/, 'geometry uses normal Dimension arrow convention');
assert.doesNotMatch(css, /has-geometry-cursor[^}]*cursor:\s*(?:move|grab|grabbing|pointer)/s);

console.log('drawing geometry visual-state tests passed');
