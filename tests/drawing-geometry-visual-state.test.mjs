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
const circleSketch = {
  ...sketch(),
  entities: { ...sketch().entities, circle: { id: 'circle', type: 'circle', centerPointId: 'a', radius: 5 } },
  entityOrder: [...sketch().entityOrder, 'circle'],
};
assert.equal(getGeometryConstraintVisualState(circleSketch, { kind: 'circle', circleId: 'circle' }), 'FREE', 'an unconstrained Circle is FREE');
const centerLockedCircle = {
  ...mixed,
  entities: { ...mixed.entities, circle: { id: 'circle', type: 'circle', centerPointId: 'a', radius: 5 } },
  entityOrder: [...mixed.entityOrder, 'circle'],
};
assert.equal(getGeometryConstraintVisualState(centerLockedCircle, { kind: 'circle', circleId: 'circle' }), 'CONSTRAINED', 'a fixed center cannot fully lock the still-free authoritative radius');
assert.equal(getGeometryConstraintVisualState(centerLockedCircle, { kind: 'circle', circleId: 'circle' }, { isRigorous: true, degreesOfFreedom: 0 }), 'CONSTRAINED', 'a center proof cannot masquerade as a whole-Circle radius proof');
const pointOnCircle = {
  ...circleSketch,
  geometricConstraints: {
    poc: { id: 'poc', kind: 'COINCIDENT', variant: 'point-curve', references: [{ kind: 'sketchPoint', pointId: 'x' }, { kind: 'entity', entityId: 'circle' }] },
  },
};
assert.equal(getGeometryConstraintVisualState(pointOnCircle, { kind: 'circle', circleId: 'circle' }), 'FREE', 'a point-on-Circle record does not classify the Circle by mere constraint presence');
assert.equal(geometryConstraintVisualClass('FULLY_LOCKED'), 'geometry-fully-locked');
assert.deepEqual(
  ['FREE', 'CONSTRAINED', 'FULLY_LOCKED'].map(geometryConstraintVisualClass),
  ['geometry-free', 'geometry-constrained', 'geometry-fully-locked'],
  'the resolver exposes exactly one class for each of the three permanent states',
);

const workspace = fs.readFileSync('src/app/DrawingWorkspace.tsx', 'utf8');
const css = fs.readFileSync('src/styles.css', 'utf8');
assert.match(workspace, /data-constraint-state=\{getGeometryConstraintVisualState/);
assert.match(workspace, /kind: 'circle', circleId: entity\.id[\s\S]*geometryConstraintVisualClass\(getGeometryConstraintVisualState\(activeSketch, \{ kind: 'circle', circleId: entity\.id \}\)\)/,
  'committed Circle retains its semantic state class beneath interaction overrides');
assert.match(workspace, /className=\{`drawing-geometry-entity drawing-interactive-hit \$\{geometryConstraintVisualClass[\s\S]*kind: 'circle'/,
  'Circle consumes the same committed-geometry base presentation as Line');
assert.match(workspace, /if \(geometryDrag\.exceeded\) setSelectedGeometry\(\[\]\)/, 'meaningful drag clears persistent selection at release');
assert.match(workspace, /is-geometry-dragging/, 'active manipulation has explicit semantic state');
const normalLineColors = {
  FREE: ['--drawing-geometry-free', '#39ff5a'],
  CONSTRAINED: ['--drawing-geometry-constrained', '#00a83e'],
  FULLY_LOCKED: ['--drawing-geometry-fully-locked', '#111827'],
};
for (const [state, [token, color]] of Object.entries(normalLineColors)) {
  assert.match(css, new RegExp(`${token}:\\s*${color};`, 'i'), `${state} has its exact authoritative color`);
}
assert.equal(Object.values(normalLineColors).filter(([, color]) => color !== '#111827').length, 2, 'normal Line status has exactly two green authorities');
assert.match(css, /\.drawing-geometry-entity\s*\{[^}]*stroke-opacity:\s*1;/s, 'committed Line status cannot blend through CSS stroke opacity');
assert.match(css, /\.drawing-geometry-entity\.geometry-free \{ stroke: var\(--drawing-geometry-free\); \}/i);
assert.match(css, /\.drawing-geometry-entity\.geometry-constrained \{ stroke: var\(--drawing-geometry-constrained\); \}/i);
assert.match(css, /\.drawing-geometry-entity\.geometry-fully-locked \{ stroke: var\(--drawing-geometry-fully-locked\); \}/i);
assert.match(css, /\.drawing-geometry-entity\.is-inference-target \{[^}]*stroke: var\(--drawing-inference\);[^}]*stroke-width: 1\.8;/s,
  'transient relation target overrides solver color at the normal Line stroke weight');
assert.match(css, /\.drawing-geometry-entity\.is-geometry-selected \{ stroke: var\(--drawing-hover\); stroke-width: 2\.6; \}/, 'selected interaction blue persistently overrides the permanent solver color');
assert.doesNotMatch(css, /--drawing-circle-|\.circle-(?:free|constrained|fully-locked|selected)/i, 'Circle introduces no private palette or semantic presentation policy');
assert.match(workspace, /className="drawing-authoring-preview" cx=\{circleInteraction\.center\.x\}/, 'Circle preview consumes the global Authoring Preview role');
assert.match(workspace, /<line className=\{`drawing-authoring-preview/, 'Line and Profile previews consume the global Authoring Preview role');
assert.match(css, /--drawing-inference:\s*#38bdf8;[\s\S]*--drawing-authoring-preview:\s*#38bdf8;/,
  'Inference and Authoring Preview retain separate semantic tokens even while their values match');
assert.match(css, /\.drawing-authoring-preview,[\s\S]*stroke: var\(--drawing-authoring-preview\);[\s\S]*stroke-width: 1\.25;[\s\S]*stroke-dasharray: 5 4;/,
  'global Authoring Preview keeps its established visible values');
assert.match(css, /--drawing-hover:\s*#06b6d4;[\s\S]*\.drawing-geometry-entity\.is-geometry-preselected,[\s\S]*\.drawing-geometry-entity\.is-geometry-dragging \{ stroke: var\(--drawing-hover\); stroke-width: 2\.6; \}/, 'light-blue hover temporarily overrides every permanent state through one semantic token');
assert.match(css, /\.drawing-geometry-entity\.is-dimension-preselected \{ stroke: var\(--drawing-hover\); stroke-width: 2\.4; \}/, 'Dimension preselection uses only the shared temporary hover authority');
assert.doesNotMatch(css, /\.drawing-geometry-entity[^}]*stroke:\s*(?:#2db65b|var\(--drawing-dimension(?:-hover|-active)?\))/i, 'Dimension green and the old FREE green cannot control committed geometry');

const committedLineStrokeRules = [...css.matchAll(/([^{}]*\.drawing-geometry-entity[^{}]*)\{([^{}]*)\}/g)]
  .filter(([, , declarations]) => /(?:^|;)\s*stroke\s*:/.test(declarations))
  .map(([, selector, declarations]) => ({ selector: selector.trim(), stroke: declarations.match(/(?:^|;)\s*stroke\s*:\s*([^;]+)/)?.[1].trim() }));
assert.deepEqual(committedLineStrokeRules, [
  { selector: '.drawing-geometry-entity.geometry-free', stroke: 'var(--drawing-geometry-free)' },
  { selector: '.drawing-geometry-entity.geometry-constrained', stroke: 'var(--drawing-geometry-constrained)' },
  { selector: '.drawing-geometry-entity.geometry-fully-locked', stroke: 'var(--drawing-geometry-fully-locked)' },
  { selector: '.drawing-geometry-entity.is-inference-target', stroke: 'var(--drawing-inference)' },
  { selector: '.drawing-geometry-entity.is-geometry-selected', stroke: 'var(--drawing-hover)' },
  { selector: '.drawing-geometry-entity.is-dimension-preselected', stroke: 'var(--drawing-hover)' },
  { selector: '.drawing-geometry-entity.is-geometry-preselected,\n.drawing-geometry-entity.is-geometry-dragging', stroke: 'var(--drawing-hover)' },
], 'committed Lines retain three solver authorities plus separate selected and temporary interaction overrides');
assert.match(css, /drawing-geometry-point-preselection[^}]*fill: #0e7490;[^}]*stroke: none;/, 'Point preselection uses the stronger blue square fill');
assert.match(css, /has-geometry-cursor\.is-line-target[\s\S]*cursor: default;/, 'geometry uses normal Dimension arrow convention');
assert.doesNotMatch(css, /has-geometry-cursor[^}]*cursor:\s*(?:move|grab|grabbing|pointer)/s);

console.log('drawing geometry visual-state tests passed');
