import test from 'node:test';
import assert from 'node:assert/strict';
import { angleIsOnDrawingArc, pointIsOnDrawingArc, distanceToArc, projectPointToArc, finiteArcConstraintResidual, deriveArcThroughThreePoints, drawingArcPath, migrateLegacyArc, resolveDrawingArc } from '../.test-build/drawing-arc/drawingArcGeometry.js';
import { commitArcForm, EMPTY_ARC_INTERACTION, acceptArcEndpoint, updateArcPreview, resolveArcPreview } from '../.test-build/drawing-arc/drawingArcTool.js';
import { appendArcToActiveSketch } from '../.test-build/drawing-arc/drawingDocumentMutation.js';
import { migrateDrawingDocument } from '../.test-build/drawing-arc/drawingTypes.js';
import { analyzeDrawingConstraints } from '../.test-build/drawing-arc/drawingConstraintAnalysis.js';
import { drawingEntityEquations, drawingEntitySolverVariables } from '../.test-build/drawing-arc/drawingEntityDefinition.js';
import { circularRadiusSolverVariable, readDrawingSolverVariable, writeDrawingSolverVariable } from '../.test-build/drawing-arc/drawingSolverVariables.js';
import { solveDrawingDragCandidate } from '../.test-build/drawing-arc/drawingDirectManipulation.js';
import { solveDrawingVariableTargets, verifyDrawingConstraints, DRAWING_CONSTRAINT_TOLERANCE_MM } from '../.test-build/drawing-arc/drawingConstraintSolver.js';
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

test('restore preserves distinct Point-on-Curve identities, deduplicates true duplicates, and retains rank/topology', () => {
  const base = emptyDocument().sketches.s;
  const points = {o:{id:'o',x:0,y:0},a:{id:'a',x:5,y:0},b:{id:'b',x:0,y:5},p:{id:'p',x:3,y:4},c:{id:'c',x:1,y:1}};
  const entities = {arc:{id:'arc',type:'arc',centerPointId:'o',radius:5,startPointId:'a',endPointId:'b',orientation:'CCW'},circle:{id:'circle',type:'circle',centerPointId:'c',radius:Math.sqrt(13)}};
  const relation = (id,curve) => ({id,kind:'COINCIDENT',variant:'point-curve',references:[{kind:'sketchPoint',pointId:'p'},{kind:'entity',entityId:curve}]});
  for (const order of [['arc','circle'],['circle','arc']]) {
    const sketch = {...base,points,entities,entityOrder:['arc','circle'],geometricConstraints:Object.fromEntries(order.map(id=>[id,relation(id,id)])),geometricConstraintOrder:order};
    const document={...emptyDocument(),sketches:{s:sketch}};
    const restored=migrateDrawingDocument(JSON.parse(JSON.stringify(document))).sketches.s;
    assert.deepEqual(restored,sketch); assert.equal(analyzeDrawingConstraints(restored).componentByPointId.get('p').degreesOfFreedom, analyzeDrawingConstraints(sketch).componentByPointId.get('p').degreesOfFreedom);
    const duplicate={...restored,geometricConstraints:{...restored.geometricConstraints,duplicate:relation('duplicate','arc')},geometricConstraintOrder:[...order,'duplicate']};
    const deduplicated=migrateDrawingDocument({...document,sketches:{s:duplicate}});
    assert.equal(Object.keys(deduplicated.sketches.s.geometricConstraints).length,2);
    assert.deepEqual(migrateDrawingDocument(deduplicated),deduplicated);
    assert.deepEqual(validateDrawingTopology(deduplicated),validateDrawingTopology(document));
  }
});

test('restore omits invalid Arcs and their dependent references without throwing or changing valid geometry', () => {
  const points={o:{id:'o',x:0,y:0},a:{id:'a',x:5,y:0},b:{id:'b',x:0,y:5}};
  const valid={id:'arc',type:'arc',centerPointId:'o',radius:5,startPointId:'a',endPointId:'b',orientation:'CCW'};
  for (const patch of [{orientation:'invalid'},{radius:-5},{centerPointId:'missing'},{endPointId:'a'},{radius:10},{endPointId:'missing'},{bulge:1,endPointId:'missing'}]) {
    const sketch={...emptyDocument().sketches.s,points,entities:{arc:{...valid,...patch}},entityOrder:['arc'],dimensions:{r:{id:'r',kind:'CIRCULAR_SIZE',mode:'radius',value:5,role:'driving',references:[{kind:'entity',entityId:'arc'}],placement:{kind:'radial',anchor:{x:6,y:6}}}},dimensionOrder:['r'],geometricConstraints:{p:{id:'p',kind:'COINCIDENT',variant:'point-curve',references:[{kind:'sketchPoint',pointId:'a'},{kind:'entity',entityId:'arc'}]}},geometricConstraintOrder:['p']};
    const restored=migrateDrawingDocument({...emptyDocument(),sketches:{s:sketch}});
    assert.deepEqual(restored.sketches.s.entities,{});assert.deepEqual(restored.sketches.s.entityOrder,[]);
    assert.deepEqual(restored.sketches.s.dimensions,{});assert.deepEqual(restored.sketches.s.geometricConstraints,{});
    assert.deepEqual(restored.sketches.s.points,points);assert.deepEqual(migrateDrawingDocument(restored),restored);
  }
});

test('legacy center allocation avoids unrelated identities and migrates center references deterministically', () => {
  const base=emptyDocument().sketches.s;
  const points={a:{id:'a',x:5,y:0},b:{id:'b',x:0,y:5},p:{id:'p',x:1,y:1},'legacy:arc:center':{id:'legacy:arc:center',x:100,y:200},'legacy:arc:center:1':{id:'legacy:arc:center:1',x:300,y:400}};
  const legacy={id:'arc',type:'arc',startPointId:'a',endPointId:'b',bulge:1};
  const constraint={id:'center',kind:'COINCIDENT',variant:'point-derived-point',references:[{kind:'sketchPoint',pointId:'p'},{kind:'derivedPoint',entityId:'arc',role:'center'}]};
  for(const order of [['arc','other'],['other','arc']]){
    const sketch={...base,points,entities:Object.fromEntries(order.map(id=>[id,{...legacy,id}])),entityOrder:order,geometricConstraints:{center:constraint},geometricConstraintOrder:['center']};
    const document=migrateDrawingDocument({...emptyDocument(),sketches:{s:sketch}}),restored=document.sketches.s;
    assert.equal(restored.entities.arc.centerPointId,'legacy:arc:center:2');
    assert.deepEqual(restored.points['legacy:arc:center'],points['legacy:arc:center']);
    assert.equal(restored.geometricConstraints.center.variant,'point-point');
    assert.ok(restored.geometricConstraints.center.references.some(r=>r.pointId==='legacy:arc:center:2'));
    assert.ok(resolveArc(restored,restored.entities.arc));assert.ok(resolveArc(restored,restored.entities.other));
    assert.deepEqual(migrateDrawingDocument(document),document);
  }
});

test('generic intrinsic rank remains two across radius scales with free, partial and locked mobility', () => {
  for (const radius of [2e-9,1e-6,2e-6,1,5,1e6]) {
    const sketch={...emptyDocument().sketches.s,points:{o:{id:'o',x:0,y:0},a:{id:'a',x:radius,y:0},b:{id:'b',x:0,y:radius}},entities:{arc:{id:'arc',type:'arc',centerPointId:'o',radius,startPointId:'a',endPointId:'b',orientation:'CCW'}},entityOrder:['arc']};
    const free=analyzeDrawingConstraints(sketch).componentByPointId.get('o');assert.equal(free.constraintRank,2);assert.equal(free.degreesOfFreedom,5);
    const r={id:'r',kind:'CIRCULAR_SIZE',mode:'radius',role:'driving',references:[{kind:'entity',entityId:'arc'}],value:radius,placement:{kind:'radial',anchor:{x:radius,y:radius}}};
    const partial={...sketch,dimensions:{r},dimensionOrder:['r']};assert.equal(analyzeDrawingConstraints(partial).componentByPointId.get('o').degreesOfFreedom,4);
    const axes=Object.fromEntries(['a','b'].flatMap(pointId=>['x','y'].map(axis=>{const id=pointId+axis;return [id,{id,kind:axis==='x'?'HORIZONTAL_DISTANCE':'VERTICAL_DISTANCE',role:'driving',references:[{kind:'datum',datum:'ORIGIN'},{kind:'sketchPoint',pointId}],value:sketch.points[pointId][axis],placement:{kind:'linear',offset:1}}]})));
    const locked={...partial,dimensions:{...axes,r},dimensionOrder:[...Object.keys(axes),'r']};assert.equal(analyzeDrawingConstraints(locked).componentByPointId.get('o').degreesOfFreedom,0);
  }
});

test('world translation does not reject exact feasible shared-center targets with driving radius and partial DOF', () => {
  for (const offset of [0,1e6,1e9,-1e9]) for (const orientation of ['CW','CCW']) for (const constrained of [false,true]) {
    const points={o:{id:'o',x:offset,y:offset},a:{id:'a',x:offset+5,y:offset},b:{id:'b',x:offset,y:offset+5},q:{id:'q',x:offset-4,y:offset}};
    const entities={arc:{id:'arc',type:'arc',centerPointId:'o',radius:5,startPointId:'a',endPointId:'b',orientation},line:{id:'line',type:'line',startPointId:'q',endPointId:'o'}};
    let sketch={...emptyDocument().sketches.s,points,entities,entityOrder:['arc','line']};
    if(constrained)sketch={...sketch,dimensions:{r:{id:'r',kind:'CIRCULAR_SIZE',mode:'radius',role:'driving',references:[{kind:'entity',entityId:'arc'}],value:5,placement:{kind:'radial',anchor:{x:offset+6,y:offset+6}}}},dimensionOrder:['r'],geometricConstraints:{h:{id:'h',kind:'HORIZONTAL',references:[{kind:'entity',entityId:'line'}]}},geometricConstraintOrder:['h']};
    const targets=['x','y'].map((axis,i)=>({variable:{kind:'point-axis',pointId:'o',axis},value:offset+[2,3][i]}));
    const solved=solveDrawingVariableTargets(sketch,targets);assert.ok(solved);assert.equal(solved.points.o.x,offset+2);assert.equal(solved.points.o.y,offset+3);assert.ok(resolveArc(solved,solved.entities.arc));
    const moved=solveDrawingDragCandidate({...emptyDocument(),sketches:{s:sketch}},{kind:'point',pointId:'o'},{x:2,y:3});assert.ok(moved);
    const result=moved.sketches.s;assert.equal(result.points.o.x,offset+2);assert.equal(result.points.o.y,offset+3);
    assert.ok(resolveArc(result,result.entities.arc));assert.equal(result.entities.line.endPointId,result.entities.arc.centerPointId);
    for(const e of drawingEntityEquations(result,result.entities.arc))assert.ok(Math.abs(e.residual(result))<=DRAWING_CONSTRAINT_TOLERANCE_MM);
    if(constrained){close(result.entities.arc.radius,5,DRAWING_CONSTRAINT_TOLERANCE_MM);close(result.points.q.y,result.points.o.y,DRAWING_CONSTRAINT_TOLERANCE_MM);}
    const all=drawingEntitySolverVariables(entities.arc).map(variable=>({variable,value:readDrawingSolverVariable(result,variable)}));assert.ok(solveDrawingVariableTargets(sketch,all),'already feasible exact pose is preserved');
  }
});

test('numerical derivative handles positive-domain boundaries and refuses missing equation rows', async () => {
  const {drawingNumericalDerivative}=await import('../.test-build/drawing-arc/drawingNumericalDerivative.js');
  const value=1.0000000001e-9;
  const derivative=drawingNumericalDerivative(value,1,[value],next=>next>1e-9?[next]:null);
  assert.ok(derivative);close(derivative[0],1,1e-12);
  assert.equal(drawingNumericalDerivative(1,1,[0,0],()=>[0]),null);
  assert.equal(drawingNumericalDerivative(1,1,[0],()=>null),null);
  const large=1e9;const result=drawingNumericalDerivative(large,5,[0],next=>[next-large]);close(result[0],1,1e-12);
});


test('finite Arc membership never converts fixed angular slack into spatial endpoint overshoot', () => {
  for(const radius of [2e-9,1e-6,1,5,1e6,1e12]) for(const orientation of ['CW','CCW']) {
    const sign=orientation==='CCW'?1:-1, center={x:0,y:0},start={x:radius,y:0},end={x:0,y:sign*radius};
    const entity={id:'arc',type:'arc',centerPointId:'o',radius,startPointId:'a',endPointId:'b',orientation};
    const arc=resolveDrawingArc(entity,center,start,end);assert.ok(arc);
    for(const endpoint of [start,end]){assert.equal(pointIsOnDrawingArc(endpoint,arc),true);assert.equal(distanceToArc(endpoint,arc),0);}
    for(const theta of [-sign*5e-11, sign*(Math.PI/2+5e-11)]){
      const p={x:radius*Math.cos(theta),y:radius*Math.sin(theta)};
      assert.equal(angleIsOnDrawingArc(theta,arc.startAngle,arc.signedSweep),false);
      assert.equal(pointIsOnDrawingArc(p,arc),false);
      const endpoint=theta*sign<0?start:end;
      assert.deepEqual(projectPointToArc(p,arc),endpoint);
      const expected=Math.hypot(p.x-endpoint.x,p.y-endpoint.y);
      close(distanceToArc(p,arc),expected,Math.max(1e-20,expected*1e-12));
      assert.equal(finiteArcConstraintResidual(p,entity,center,start,end),expected);
      if(radius===1e12){assert.ok(expected>49);const sketch={...emptyDocument().sketches.s,points:{o:{id:'o',...center},a:{id:'a',...start},b:{id:'b',...end},p:{id:'p',...p}},entities:{arc:entity},entityOrder:['arc'],geometricConstraints:{on:{id:'on',kind:'COINCIDENT',variant:'point-curve',references:[{kind:'sketchPoint',pointId:'p'},{kind:'entity',entityId:'arc'}]}},geometricConstraintOrder:['on']};assert.equal(verifyDrawingConstraints(sketch,[],['on']),null);}
    }
  }
});

test('membership preserves both endpoints and interior on rotated small and near-full directed Arcs', () => {
  for(const orientation of ['CW','CCW'])for(const sweep of [1e-14,1e-8,Math.PI,2*Math.PI-1e-8])for(const rotation of [0,.7,2.3]){
    const sign=orientation==='CCW'?1:-1,point=t=>({x:5*Math.cos(rotation+sign*t),y:5*Math.sin(rotation+sign*t)});
    const start=point(0),end=point(sweep),arc=resolveDrawingArc({id:'arc',type:'arc',centerPointId:'o',radius:5,startPointId:'a',endPointId:'b',orientation},{x:0,y:0},start,end);assert.ok(arc);
    assert.equal(pointIsOnDrawingArc(start,arc),true);assert.equal(pointIsOnDrawingArc(end,arc),true);assert.equal(pointIsOnDrawingArc(point(sweep/2),arc),true);
  }
});

test('Circle restore and Circular Support reject nonfinite center coordinates consistently with entity domains', async () => {
  const {resolveCircularSupport}=await import('../.test-build/drawing-arc/drawingCircularSupport.js');
  for(const coordinate of [NaN,Infinity,-Infinity]){
    const sketch={...emptyDocument().sketches.s,points:{o:{id:'o',x:coordinate,y:0}},entities:{circle:{id:'circle',type:'circle',centerPointId:'o',radius:5}},entityOrder:['circle']};
    assert.equal(resolveCircularSupport(sketch,sketch.entities.circle),null);
    assert.deepEqual(migrateDrawingDocument({...emptyDocument(),sketches:{s:sketch}}).sketches.s.entities,{});
  }
});

test('undefined support-circle projection direction never returns a point outside a rotated finite Arc', () => {
  for(const orientation of ['CW','CCW']){
    const sign=orientation==='CCW'?1:-1, point=t=>({x:5*Math.cos(t),y:5*Math.sin(t)});
    const arc=resolveDrawingArc({id:'arc',type:'arc',centerPointId:'o',radius:5,startPointId:'a',endPointId:'b',orientation},{x:0,y:0},point(Math.PI),point(Math.PI+sign*Math.PI/2));assert.ok(arc);
    for(const query of [{x:0,y:0}, {x:-1e-12,y:sign*-1e-12}]){
      const projected=projectPointToArc(query,arc);
      assert.equal(pointIsOnDrawingArc(projected,arc),true);assert.ok(Number.isFinite(distanceToArc(query,arc)));
    }
  }
});

// Keep finite interval membership, endpoint distance and solver tolerance separate.
const endpointConstraintSketch = (radius, orientation, center, start, end, query) => ({
  ...emptyDocument().sketches.s,
  points: Object.fromEntries(Object.entries({ o: center, a: start, b: end, p: query }).map(([id, point]) => [id, { id, ...point }])),
  entities: { arc: { id: 'arc', type: 'arc', centerPointId: 'o', radius, startPointId: 'a', endPointId: 'b', orientation } },
  entityOrder: ['arc'],
  geometricConstraints: { on: { id: 'on', kind: 'COINCIDENT', variant: 'point-curve', references: [{ kind: 'sketchPoint', pointId: 'p' }, { kind: 'entity', entityId: 'arc' }] } },
  geometricConstraintOrder: ['on'],
});

for (const orientation of ['CCW', 'CW']) for (const endpointName of ['start', 'end']) {
  test(`Point-on-Arc honors spatial tolerance at ${orientation} ${endpointName} endpoint`, () => {
    const sign = orientation === 'CCW' ? 1 : -1, radius = 5;
    const center = { x: 0, y: 0 }, start = { x: radius, y: 0 }, end = { x: 0, y: sign * radius };
    const endpoint = endpointName === 'start' ? start : end;
    const make = query => endpointConstraintSketch(radius, orientation, center, start, end, query);
    const exact = make(endpoint), arc = resolveArc(exact, exact.entities.arc);
    assert.ok(arc);
    assert.equal(pointIsOnDrawingArc(endpoint, arc), true);
    assert.equal(finiteArcConstraintResidual(endpoint, exact.entities.arc, center, start, end), 0);
    assert.deepEqual(verifyDrawingConstraints(exact, [], ['on']), [0]);

    for (const delta of [1e-10, 1e-8, 4e-8]) {
      const theta = endpointName === 'start' ? -sign * delta : sign * (Math.PI / 2 + delta);
      const query = { x: radius * Math.cos(theta), y: radius * Math.sin(theta) }, sketch = make(query);
      const residual = finiteArcConstraintResidual(query, sketch.entities.arc, center, start, end);
      // Independent circle chord length, not an expectation from the projection helper.
      const expected = 2 * radius * Math.sin(delta / 2);
      assert.equal(pointIsOnDrawingArc(query, arc), false);
      assert.ok(Number.isFinite(residual) && residual > 0);
      close(residual, expected, 2e-15);
      close(distanceToArc(query, arc), expected, 2e-15);
      assert.deepEqual(projectPointToArc(query, arc), arc[endpointName]);
      if (expected < DRAWING_CONSTRAINT_TOLERANCE_MM) {
        const verified = verifyDrawingConstraints(sketch, [], ['on']);
        assert.ok(verified, `endpoint distance ${expected} mm must pass the existing spatial tolerance`);
        close(verified[0], expected, 2e-15);
        // Freeze the complete candidate: acceptance cannot be explained by moving the Arc.
        const variables = [...drawingEntitySolverVariables(sketch.entities.arc), ...['x', 'y'].map(axis => ({ kind: 'point-axis', pointId: 'p', axis }))];
        const solved = solveDrawingVariableTargets(sketch, variables.map(variable => ({ variable, value: readDrawingSolverVariable(sketch, variable) })));
        assert.deepEqual(solved, sketch);
        assert.equal(resolveArc(solved, solved.entities.arc).signedSweep, arc.signedSweep);
      } else {
        assert.equal(verifyDrawingConstraints(sketch, [], ['on']), null);
      }
    }
  });
}

test('D7: radius-1e12 quarter Arc rejects the independently expected 50 mm overshoot', () => {
  const radius = 1e12, theta = Math.PI / 2 + 5e-11;
  const center = { x: 0, y: 0 }, start = { x: radius, y: 0 }, end = { x: 0, y: radius };
  const query = { x: radius * Math.cos(theta), y: radius * Math.sin(theta) };
  const sketch = endpointConstraintSketch(radius, 'CCW', center, start, end, query), arc = resolveArc(sketch, sketch.entities.arc);
  assert.ok(arc);
  assert.equal(pointIsOnDrawingArc(query, arc), false);
  close(distanceToArc(query, arc), 50, 1e-3);
  close(finiteArcConstraintResidual(query, sketch.entities.arc, center, start, end), 50, 1e-3);
  assert.deepEqual(projectPointToArc(query, arc), arc.end);
  assert.equal(verifyDrawingConstraints(sketch, [], ['on']), null);
});

test('endpoint residual tolerance covers small radii, small/near-full sweeps, offsets and roundoff', () => {
  for (const radius of [2e-9, 1e-6, 5, 1e6]) for (const orientation of ['CCW', 'CW'])
    for (const sweep of [1e-8, Math.PI / 2, 2 * Math.PI - 1e-8]) for (const offset of [0, -10, 10]) for (const rotation of [0, .7]) {
      const sign = orientation === 'CCW' ? 1 : -1, center = { x: offset * radius, y: -offset * radius };
      const point = t => ({ x: center.x + radius * Math.cos(rotation + sign * t), y: center.y + radius * Math.sin(rotation + sign * t) });
      const start = point(0), end = point(sweep);
      // Stay in the actual gap even for a near-full Arc, and below the spatial tolerance.
      const delta = Math.min(5e-10 / radius, sweep / 4, (2 * Math.PI - sweep) / 4);
      const roundoff = 16 * Number.EPSILON * Math.max(radius, Math.abs(center.x), Math.abs(center.y));
      for (const [t, endpoint] of [[0, start], [sweep, end], [-delta, start], [sweep + delta, end]]) {
        const query = t === 0 ? start : t === sweep ? end : point(t);
        const sketch = endpointConstraintSketch(radius, orientation, center, start, end, query), arc = resolveArc(sketch, sketch.entities.arc);
        assert.ok(arc, `${radius}, ${orientation}, ${sweep}, ${offset}, ${rotation}`);
        const residual = finiteArcConstraintResidual(query, sketch.entities.arc, center, start, end);
        assert.ok(Number.isFinite(residual));
        const expected = t === 0 || t === sweep ? 0 : 2 * radius * Math.sin(delta / 2);
        close(Math.abs(residual), expected, Math.max(1e-25, roundoff));
        close(distanceToArc(query, arc), expected, Math.max(1e-25, roundoff));
        assert.ok(verifyDrawingConstraints(sketch, [], ['on']), `valid domain and residual within tolerance: R=${radius}, sweep=${sweep}, t=${t}`);
        if (t === 0 || t === sweep) assert.equal(pointIsOnDrawingArc(endpoint, arc), true);
      }
    }
});

test('endpoint tolerance cannot admit invalid canonical Arc domains or radial defining equations', () => {
  const center = { x: 0, y: 0 }, start = { x: 5, y: 0 }, end = { x: 0, y: 5 };
  const valid = endpointConstraintSketch(5, 'CCW', center, start, end, { x: -5e-10, y: 5 });
  for (const patch of [{ orientation: 'invalid' }, { radius: 0 }, { endPointId: 'a' }, { radius: 5 + 2e-7 }]) {
    const sketch = { ...valid, entities: { arc: { ...valid.entities.arc, ...patch } } };
    assert.equal(verifyDrawingConstraints(sketch, [], ['on']), null);
  }
  const collapsed = { ...valid, points: { ...valid.points, b: { ...valid.points.a, id: 'b' } } };
  const targets = drawingEntitySolverVariables(collapsed.entities.arc).map(variable => ({ variable, value: readDrawingSolverVariable(collapsed, variable) }));
  assert.equal(solveDrawingVariableTargets(collapsed, targets), null);
});
