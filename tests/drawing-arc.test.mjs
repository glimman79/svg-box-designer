import test from 'node:test';
import assert from 'node:assert/strict';
import { angleIsOnDrawingArc, deriveArcThroughThreePoints, drawingArcPath, migrateLegacyArc, resolveDrawingArc } from '../.test-build/drawing-arc/drawingArcGeometry.js';
import { commitArcForm, EMPTY_ARC_INTERACTION, acceptArcEndpoint, updateArcPreview, resolveArcPreview } from '../.test-build/drawing-arc/drawingArcTool.js';
import { appendArcToActiveSketch } from '../.test-build/drawing-arc/drawingDocumentMutation.js';
import { migrateDrawingDocument } from '../.test-build/drawing-arc/drawingTypes.js';
import { analyzeDrawingConstraints } from '../.test-build/drawing-arc/drawingConstraintAnalysis.js';
import { drawingEntityEquations, drawingEntitySolverVariables } from '../.test-build/drawing-arc/drawingEntityDefinition.js';
import { circularRadiusSolverVariable, readDrawingSolverVariable, writeDrawingSolverVariable } from '../.test-build/drawing-arc/drawingSolverVariables.js';
import { solveDrawingDragCandidate } from '../.test-build/drawing-arc/drawingDirectManipulation.js';
import { solveDrawingVariableTargets, DRAWING_CONSTRAINT_TOLERANCE_MM } from '../.test-build/drawing-arc/drawingConstraintSolver.js';
import { resolveArc, resolveLine, validateDrawingTopology } from '../.test-build/drawing-arc/drawingTopology.js';

const accepted = (point, pointId = null) => ({ point, pointId, midpointLineId: null, lineBodyId: null, curveId: null, derivedPointReference: null });
const emptyDocument = () => ({ schemaVersion: 2, unit: 'mm', activeSketchId: 's', sketchOrder: ['s'], sketches: { s: { id: 's', name: 'S', points: {}, entities: {}, entityOrder: [], dimensions: {}, dimensionOrder: [], geometricConstraints: {}, geometricConstraintOrder: [] } } });
const close = (a, b, eps = 1e-8) => assert.ok(Math.abs(a - b) <= eps, `${a} != ${b}`);

test('three-point authoring creates target Arc and preserves directed major/minor branches', () => {
  const minor = deriveArcThroughThreePoints({x:0,y:0},{x:10,y:0},{x:5,y:-5});
  const major = deriveArcThroughThreePoints({x:0,y:0},{x:10,y:0},{x:5,y:10});
  assert.ok(minor && major);
  assert.notEqual(minor.orientation, major.orientation);
  assert.ok(Math.abs(minor.signedSweep) <= Math.PI + 1e-9);
  assert.ok(Math.abs(major.signedSweep) > Math.PI);
  assert.ok(angleIsOnDrawingArc(Math.atan2(10-major.center.y,5-major.center.x), major.startAngle, major.signedSweep));
  assert.match(drawingArcPath(major), /^M /);
});

test('authoring commit persists center/radius/endpoints/orientation without P3 or bulge', () => {
  let state = acceptArcEndpoint(EMPTY_ARC_INTERACTION, accepted({x:0,y:0}, 'a'));
  state = acceptArcEndpoint(state, accepted({x:10,y:0}, 'b'));
  const committed = commitArcForm(state, {x:5,y:-5}, 'arc');
  assert.ok(committed.entity);
  const doc = appendArcToActiveSketch({ ...emptyDocument(), sketches: { s: { ...emptyDocument().sketches.s, points: { a:{id:'a',x:0,y:0}, b:{id:'b',x:10,y:0} } } } }, committed.entity, (() => { let n=0; return () => `new-${++n}`; })());
  const arc = doc.sketches.s.entities.arc;
  assert.deepEqual(Object.keys(arc).sort(), ['centerPointId','endPointId','id','orientation','radius','startPointId','type']);
  assert.equal('bulge' in arc, false); assert.equal('formPointId' in arc, false);
  assert.ok(doc.sketches.s.points[arc.centerPointId]);
  assert.equal(validateDrawingTopology(doc).ok, true);
});

test('legacy boundary migration is deterministic and geometrically equivalent for both signs', () => {
  for (const bulge of [.5, 2, -.5, -2, 1, -1]) {
    const start={id:'a',x:0,y:0}, end={id:'b',x:10,y:0};
    const expected=migrateLegacyArc({id:'arc',type:'arc',startPointId:'a',endPointId:'b',bulge},start,end); assert.ok(expected);
    const legacy={...emptyDocument(),sketches:{s:{...emptyDocument().sketches.s,points:{a:start,b:end},entities:{arc:{id:'arc',type:'arc',startPointId:'a',endPointId:'b',bulge}},entityOrder:['arc']}}};
    const first=migrateDrawingDocument(legacy), second=migrateDrawingDocument(first), arc=first.sketches.s.entities.arc;
    assert.equal(arc.orientation,bulge>0?'CCW':'CW'); assert.equal(arc.centerPointId,'legacy:arc:center');
    assert.equal(Object.keys(second.sketches.s.points).length,3);
    const resolved=resolveArc(first.sketches.s,arc); assert.ok(resolved);
    close(resolved.center.x,expected.center.x); close(resolved.center.y,expected.center.y); close(resolved.radius,expected.radius); close(resolved.signedSweep,expected.signedSweep);
    for (const t of [.2,.5,.8]) { close(resolved.center.x+resolved.radius*Math.cos(resolved.startAngle+resolved.signedSweep*t), expected.center.x+expected.radius*Math.cos(resolved.startAngle+expected.signedSweep*t)); }
  }
});

test('target Arc exposes seven variables, two intrinsic equations and five DOF', () => {
  const sketch={...emptyDocument().sketches.s,points:{o:{id:'o',x:0,y:0},a:{id:'a',x:5,y:0},b:{id:'b',x:0,y:5}},entities:{arc:{id:'arc',type:'arc',centerPointId:'o',radius:5,startPointId:'a',endPointId:'b',orientation:'CCW'}},entityOrder:['arc']};
  assert.equal(drawingEntitySolverVariables(sketch.entities.arc).length,7);
  const equations=drawingEntityEquations(sketch,sketch.entities.arc); assert.equal(equations.length,2); assert.ok(equations.every(e=>!('kind' in e)&&e.residual(sketch)===0));
  const component=analyzeDrawingConstraints(sketch).componentByPointId.get('o');
  assert.deepEqual({variables:component.variableCount,rank:component.constraintRank,dof:component.degreesOfFreedom},{variables:7,rank:2,dof:5});
  const radius=circularRadiusSolverVariable('arc'); assert.equal(readDrawingSolverVariable(sketch,radius),5); assert.equal(writeDrawingSolverVariable(sketch,radius,6).entities.arc.radius,6);
});

test('persistent center shares ordinary point topology and solver movement immediately', () => {
  const sketch={...emptyDocument().sketches.s,points:{o:{id:'o',x:0,y:0},a:{id:'a',x:5,y:0},b:{id:'b',x:0,y:5},q:{id:'q',x:-4,y:0}},entities:{arc:{id:'arc',type:'arc',centerPointId:'o',radius:5,startPointId:'a',endPointId:'b',orientation:'CCW'},line:{id:'line',type:'line',startPointId:'q',endPointId:'o'}},entityOrder:['arc','line']};
  const moved = solveDrawingVariableTargets(sketch, ['x', 'y'].map((axis, i) => ({ variable: { kind: 'point-axis', pointId: sketch.entities.line.endPointId, axis }, value: [2, 3][i] })));
  assert.ok(moved, 'shared Line endpoint targets must project through canonical hard geometry');
  for (const equation of drawingEntityEquations(moved, moved.entities.arc)) assert.ok(Math.abs(equation.residual(moved)) <= DRAWING_CONSTRAINT_TOLERANCE_MM);
  assert.deepEqual(resolveLine(moved, moved.entities.line).end, { x: moved.points.o.x, y: moved.points.o.y });
  assert.equal(moved.entities.arc.orientation, sketch.entities.arc.orientation);
  const dragDocument = { ...emptyDocument(), sketches: { s: sketch } };
  const dragged = solveDrawingDragCandidate(dragDocument, { kind: 'point', pointId: sketch.entities.line.endPointId }, { x: 2, y: 3 });
  assert.ok(dragged, 'ordinary Line endpoint manipulation propagates through the shared center');
  const dragSketch = dragged.sketches.s;
  assert.ok(resolveArc(dragSketch, dragSketch.entities.arc));
  assert.deepEqual(dragSketch.points.o, { id: 'o', x: 2, y: 3 });
  for (const equation of drawingEntityEquations(dragSketch, dragSketch.entities.arc)) assert.ok(Math.abs(equation.residual(dragSketch)) <= DRAWING_CONSTRAINT_TOLERANCE_MM);

  const arc=resolveArc(moved,moved.entities.arc); assert.ok(arc); assert.deepEqual({x:arc.center.x,y:arc.center.y},{x:2,y:3});
  assert.equal(moved.entities.line.endPointId,moved.entities.arc.centerPointId);
  assert.ok(analyzeDrawingConstraints(sketch).componentByPointId.get('o').pointIds.has('a'));
  // A driving radius and an ordinary Line relation remain hard alongside
  // intrinsic geometry, even though the raw center target is off-manifold.
  const dimension = { id: 'radius', kind: 'CIRCULAR_SIZE', mode: 'radius', role: 'driving', references: [{ kind: 'entity', entityId: 'arc' }], value: 5, placement: { kind: 'radial', anchor: { x: 6, y: 6 } } };
  const horizontal = { id: 'horizontal', kind: 'HORIZONTAL', references: [{ kind: 'entity', entityId: 'line' }] };
  const constrained = { ...sketch, dimensions: { radius: dimension }, dimensionOrder: ['radius'], geometricConstraints: { horizontal }, geometricConstraintOrder: ['horizontal'] };
  const projected = solveDrawingVariableTargets(constrained, ['x', 'y'].map((axis, i) => ({ variable: { kind: 'point-axis', pointId: 'o', axis }, value: [2, 3][i] })));
  assert.ok(projected);
  assert.ok(resolveArc(projected, projected.entities.arc));
  close(projected.entities.arc.radius, 5, DRAWING_CONSTRAINT_TOLERANCE_MM);
  close(projected.points.q.y, 3, DRAWING_CONSTRAINT_TOLERANCE_MM);
  for (const equation of drawingEntityEquations(projected, projected.entities.arc)) assert.ok(Math.abs(equation.residual(projected)) <= DRAWING_CONSTRAINT_TOLERANCE_MM);

});


test('three-point preview and production commit are invariant under translations, rotation and reflection', () => {
  for (const offset of [0, 1e9, -1e9]) for (const rotation of [0, .7, 2.3]) for (const reflection of [1, -1]) {
    const transform = (x, y) => ({ x: offset + x * Math.cos(rotation) - reflection * y * Math.sin(rotation), y: -offset + x * Math.sin(rotation) + reflection * y * Math.cos(rotation) });
    const start = transform(5, 0), end = transform(0, 5), form = transform(-5, 0);
    let state = acceptArcEndpoint(EMPTY_ARC_INTERACTION, accepted(start));
    state = acceptArcEndpoint(state, accepted(end));
    const preview = resolveArcPreview(updateArcPreview(state, form));
    const result = commitArcForm(state, form, 'arc'); assert.ok(preview && result.entity);
    const document = appendArcToActiveSketch(emptyDocument(), result.entity, (() => { let n=0; return () => `p${++n}`; })());
    const sketch = document.sketches.s, arc = resolveArc(sketch, sketch.entities.arc); assert.ok(arc);
    close(arc.center.x, offset, 5e-7); close(arc.center.y, -offset, 5e-7); close(arc.radius, 5, 5e-7);
    assert.equal(arc.orientation, reflection === 1 ? 'CW' : 'CCW'); close(arc.signedSweep, -reflection * 3 * Math.PI / 2, 1e-7);
    assert.deepEqual({x:arc.center.x,y:arc.center.y}, preview.center);
    assert.ok(angleIsOnDrawingArc(Math.atan2(form.y-arc.center.y, form.x-arc.center.x), arc.startAngle, arc.signedSweep));
    assert.equal(Object.keys(sketch.points).length, 3, 'P3 is not stored');
  }
});

test('three-point construction retains semicircles and small/near-full branches and rejects near-collinearity', () => {
  for (const sweep of [1e-6, Math.PI/2, Math.PI, 3*Math.PI/2, 2*Math.PI-1e-6]) for (const sign of [1,-1]) {
    const point = t => ({x:5*Math.cos(sign*t),y:5*Math.sin(sign*t)});
    const arc = deriveArcThroughThreePoints(point(0),point(sweep),point(sweep/2)); assert.ok(arc);
    close(arc.signedSweep, sign*sweep, 1e-7);
  }
  for (const offset of [0,1e9,-1e9]) assert.equal(deriveArcThroughThreePoints({x:offset,y:offset},{x:offset+10,y:offset},{x:offset+5,y:offset+1e-10}),null);
});
