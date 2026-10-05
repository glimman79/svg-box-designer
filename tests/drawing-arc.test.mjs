import test from 'node:test';
import assert from 'node:assert/strict';
import { angleIsOnDrawingArc, deriveArcThroughThreePoints, drawingArcPath, migrateLegacyArc, resolveDrawingArc } from '../.test-build/drawing-arc/drawingArcGeometry.js';
import { commitArcForm, EMPTY_ARC_INTERACTION, acceptArcEndpoint } from '../.test-build/drawing-arc/drawingArcTool.js';
import { appendArcToActiveSketch } from '../.test-build/drawing-arc/drawingDocumentMutation.js';
import { migrateDrawingDocument } from '../.test-build/drawing-arc/drawingTypes.js';
import { analyzeDrawingConstraints } from '../.test-build/drawing-arc/drawingConstraintAnalysis.js';
import { drawingEntityEquations, drawingEntitySolverVariables } from '../.test-build/drawing-arc/drawingEntityDefinition.js';
import { circularRadiusSolverVariable, readDrawingSolverVariable, writeDrawingSolverVariable } from '../.test-build/drawing-arc/drawingSolverVariables.js';
import { resolveArc, validateDrawingTopology } from '../.test-build/drawing-arc/drawingTopology.js';

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
  const moved={...sketch,points:{...sketch.points,o:{...sketch.points.o,x:2,y:3},a:{...sketch.points.a,x:7,y:3},b:{...sketch.points.b,x:2,y:8}}};
  const arc=resolveArc(moved,moved.entities.arc); assert.ok(arc); assert.deepEqual({x:arc.center.x,y:arc.center.y},{x:2,y:3});
  assert.equal(moved.entities.line.endPointId,moved.entities.arc.centerPointId);
  assert.ok(analyzeDrawingConstraints(sketch).componentByPointId.get('o').pointIds.has('a'));
});
