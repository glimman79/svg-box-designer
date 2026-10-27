import test from 'node:test';
import assert from 'node:assert/strict';
import { createLineBodyDragTarget, solveDrawingDragCandidate } from '../.test-build/drawing-coincidence-drag/drawingDirectManipulation.js';
import { solveDrawingGeometricIntent, verifyDrawingConstraints } from '../.test-build/drawing-coincidence-drag/drawingConstraintSolver.js';
import { analyzeDrawingConstraints } from '../.test-build/drawing-coincidence-drag/drawingConstraintAnalysis.js';
import { applyDrawingConstraint, getDrawingConstraintApplicability } from '../.test-build/drawing-coincidence-drag/drawingConstraintsTool.js';
import { EMPTY_DRAWING_HISTORY, transactDrawingDocument, undoDrawingDocument, redoDrawingDocument } from '../.test-build/drawing-coincidence-drag/drawingHistory.js';

const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-4,`${a} != ${b}`);
const make=(type,variant,attachedEnd='end')=>{
 const points=Object.fromEntries(Object.entries({o:[0,0],a:[100,0],b:[0,100],p:[0,100],q:[120,140],z:[-60,170]}).map(([id,[x,y]])=>[id,{id,x,y}]));
 const support=type==='arc'?{id:'support',type,centerPointId:'o',radius:100,startPointId:'a',endPointId:'b',orientation:'CCW'}:type==='circle'?{id:'support',type,centerPointId:'b',radius:30}:{id:'support',type,startPointId:'b',endPointId:'z'};
 if(variant==='point-curve'&&type==='arc')points.p={id:'p',x:Math.SQRT1_2*100,y:Math.SQRT1_2*100};
 if(variant==='point-curve'&&type==='circle')points.p={id:'p',x:30,y:100};
 if(variant==='shared')delete points.p;
 const attached=variant==='shared'?'b':'p';
 const line={id:'line',type:'line',startPointId:attachedEnd==='start'?attached:'q',endPointId:attachedEnd==='end'?attached:'q'};
 let d={schemaVersion:2,unit:'mm',activeSketchId:'s',sketchOrder:['s'],sketches:{s:{id:'s',name:'S',points,entities:{support,line},entityOrder:['support','line'],dimensions:{},dimensionOrder:[],geometricConstraints:{},geometricConstraintOrder:[]}}};
 if(variant==='point-curve'&&type!=='line'){
  const s=d.sketches.s;s.geometricConstraints.on={id:'on',kind:'COINCIDENT',variant:'point-curve',references:[{kind:'sketchPoint',pointId:'p'},{kind:'entity',entityId:'support'}]};s.geometricConstraintOrder=['on'];
 }else if(variant!=='shared'){
  const selection=[{kind:'point',pointId:'p'},variant==='point-point'?{kind:'point',pointId:'b'}:type==='line'?{kind:'line',lineId:'support'}:{kind:type,[type+'Id']:'support'}];
  const choice=getDrawingConstraintApplicability(selection,d).find(c=>c.kind==='coincidence');
  assert.ok(choice?.enabled);d=applyDrawingConstraint(d,choice);
  assert.equal(Object.values(d.sketches.s.geometricConstraints)[0].variant,variant==='point-curve'&&type==='line'?'point-linear-support':variant);
 }
 return d;
};
const valid=d=>{assert.ok(d,'candidate exists');const s=d.sketches.s;assert.ok(verifyDrawingConstraints(s,s.dimensionOrder,s.geometricConstraintOrder),'ALL hard equations hold in this preview');};
const body=(d)=>{const s=d.sketches.s,l=s.entities.line,a=s.points[l.startPointId],b=s.points[l.endPointId];return{x:(a.x+b.x)/2,y:(a.y+b.y)/2};};
for(const type of ['arc','circle','line'])for(const variant of ['point-point','point-curve','shared'])for(const end of ['start','end'])test(`${type} ${variant} attached at Line ${end}: first/repeated/reversed previews and History`,()=>{
 const d=make(type,variant,end),snapshot=structuredClone(d),s=d.sketches.s,start=body(d),target=createLineBodyDragTarget(d,'line',start);
 const originalDOF=analyzeDrawingConstraints(s).components.reduce((n,c)=>n+c.degreesOfFreedom,0);
 for(const delta of [{x:12,y:9},{x:-8,y:15},{x:1,y:-3}]){
  const preview=solveDrawingDragCandidate(d,target,delta,start);valid(preview);
  const p=body(preview);close(p.x,start.x+delta.x);close(p.y,start.y+delta.y);
  if(variant!=='point-curve'){
   const moved=preview.sketches.s,attached=moved.points[variant==='shared'?'b':'p'];
   close(moved.points.b.x,attached.x);close(moved.points.b.y,attached.y);
  }
  assert.equal(analyzeDrawingConstraints(preview.sketches.s).components.reduce((n,c)=>n+c.degreesOfFreedom,0),originalDOF);
  assert.deepEqual(preview.sketches.s.geometricConstraints,s.geometricConstraints);
  assert.deepEqual(Object.keys(preview.sketches.s.points),Object.keys(s.points));
  const tx=transactDrawingDocument(EMPTY_DRAWING_HISTORY,d,()=>preview);assert.equal(tx.history.undo.length,1);valid(tx.document);
  const undo=undoDrawingDocument(tx.history,tx.document);assert.deepEqual(undo.document,d);
  const redo=redoDrawingDocument(undo.history,undo.document);assert.deepEqual(redo.document,preview);
  const againStart=body(preview),again=solveDrawingDragCandidate(preview,createLineBodyDragTarget(preview,'line',againStart),{x:-delta.x,y:-delta.y},againStart);valid(again);
 }
 assert.equal(solveDrawingDragCandidate(d,target,{x:0,y:0},start),d);assert.deepEqual(d,snapshot);
});

for(const type of ['arc','circle'])test(`${type} point-curve preserves sliding DOF on a fixed support`,()=>{
 const d=make(type,'point-curve'),s=d.sketches.s,e=s.entities.support;
 for(const id of type==='arc'?['o','a','b']:['b'])for(const axis of ['x','y']){
  const idd=id+axis;s.dimensions[idd]={id:idd,kind:axis==='x'?'HORIZONTAL_DISTANCE':'VERTICAL_DISTANCE',role:'driving',references:[{kind:'datum',datum:'ORIGIN'},{kind:'sketchPoint',pointId:id}],value:Math.abs(s.points[id][axis]),placement:{kind:'linear',offset:10}};s.dimensionOrder.push(idd);
 }
 s.dimensions.r={id:'r',kind:'CIRCULAR_SIZE',role:'driving',mode:type==='arc'?'radius':'diameter',references:[{kind:'entity',entityId:'support'}],value:e.radius*(type==='arc'?1:2),placement:{kind:'radial',anchor:{x:150,y:150}}};s.dimensionOrder.push('r');
 valid(d);const start=body(d),preview=solveDrawingDragCandidate(d,createLineBodyDragTarget(d,'line',start),{x:5,y:-5},start);valid(preview);
 const after=preview.sketches.s;assert.ok(Math.hypot(after.points.p.x-s.points.p.x,after.points.p.y-s.points.p.y)>1,'point slides along support');
 close(after.entities.support.radius,e.radius);
 for(const id of type==='arc'?['o','a','b']:['b'])assert.deepEqual(after.points[id],s.points[id]);
});

test('a Line intent includes different hard components at BOTH endpoints',()=>{
 const d=make('circle','point-point'),s=d.sketches.s;
 s.geometricConstraints.other={id:'other',kind:'COINCIDENT',variant:'point-point',references:[{kind:'sketchPoint',pointId:'q'},{kind:'sketchPoint',pointId:'z'}]};s.geometricConstraintOrder.push('other');
 s.points.z={...s.points.q,id:'z'};
 const start=body(d),preview=solveDrawingDragCandidate(d,createLineBodyDragTarget(d,'line',start),{x:8,y:7},start);valid(preview);
 close(preview.sketches.s.points.q.x,preview.sketches.s.points.z.x);close(preview.sketches.s.points.p.y,preview.sketches.s.points.b.y);
});

for(const type of ['arc','circle','line'])test(`${type} point-curve has one more DOF than point-point Coincidence`,()=>{
 const freedom=d=>analyzeDrawingConstraints(d.sketches.s).components.reduce((n,c)=>n+c.degreesOfFreedom,0);
 assert.equal(freedom(make(type,'point-curve')),freedom(make(type,'point-point'))+1);
});

// Count objective evaluations instead of wall time: this guards against the
// nonlinear projection/rejection explosion independently of the test hardware.
for (const variant of ['shared', 'point-point', 'point-curve']) for (const end of ['start', 'end']) {
 test(`nonlinear retraction retains completed Line tiers: ${variant}, ${end}`, () => {
  const d = make('arc', variant, end), snapshot = structuredClone(d), s = d.sketches.s;
  const line = s.entities.line, a = s.points[line.startPointId], b = s.points[line.endPointId], start = body(d);
  let evaluations = 0;
  const axis = (pointId, axis) => ({ kind: 'point-axis', pointId, axis });
  const solved = solveDrawingGeometricIntent(s, {
   seedVariable: axis(line.startPointId, 'x'),
   variables: [axis(line.startPointId, 'y'), axis(line.endPointId, 'x'), axis(line.endPointId, 'y')],
   modelScale: Math.hypot(b.x - a.x, b.y - a.y),
   primaryResiduals: candidate => {
    evaluations += 1;
    const p = candidate.points[line.startPointId], q = candidate.points[line.endPointId];
    // The final constant residual cannot reach zero. Retraction must preserve
    // an attained residual, rather than turn every completed objective into zero.
    return [(p.x + q.x) / 2 - start.x - 12, (p.y + q.y) / 2 - start.y - 9, 1];
   },
   secondaryResiduals: candidate => {
    const p = candidate.points[line.startPointId], q = candidate.points[line.endPointId];
    return [q.x - p.x - (b.x - a.x), q.y - p.y - (b.y - a.y)];
   },
   geometricResiduals: candidate => [candidate.entities.support.radius - 120],
  });
  assert.ok(solved);
  assert.ok(verifyDrawingConstraints(solved, s.dimensionOrder, s.geometricConstraintOrder));
  const p = solved.points[line.startPointId], q = solved.points[line.endPointId];
  close((p.x + q.x) / 2, start.x + 12); close((p.y + q.y) / 2, start.y + 9);
  close(q.x - p.x, b.x - a.x); close(q.y - p.y, b.y - a.y);
  close(solved.entities.support.radius, 120); // geometric tier outranks canonical stay
  assert.ok(evaluations < 5000, `bounded solver work: ${evaluations} objective evaluations`);
  assert.deepEqual(d, snapshot);
 });
}

for (const end of ['start', 'end']) for (const driving of ['radius', 'length', 'second Arc']) {
 test(`Line ${end} nonlinear hierarchy with ${driving}`, () => {
  const d = make('arc', 'shared', end), s = d.sketches.s, l = s.entities.line;
  const a = s.points[l.startPointId], b = s.points[l.endPointId];
  if (driving === 'second Arc') {
   s.points.t = { id: 't', x: 120, y: 40 }; s.points.u = { id: 'u', x: 220, y: 40 };
   s.entities.support2 = { id: 'support2', type: 'arc', centerPointId: 't', radius: 100, startPointId: 'u', endPointId: 'q', orientation: 'CCW' };
   s.entityOrder.push('support2');
  } else {
   s.dimensions.d = driving === 'radius'
    ? { id: 'd', kind: 'CIRCULAR_SIZE', role: 'driving', mode: 'radius', references: [{ kind: 'entity', entityId: 'support' }], value: 100, placement: { kind: 'radial', anchor: { x: 150, y: 150 } } }
    : { id: 'd', kind: 'ALIGNED_DISTANCE', role: 'driving', references: [{ kind: 'sketchPoint', pointId: l.startPointId }, { kind: 'sketchPoint', pointId: l.endPointId }], value: Math.hypot(b.x - a.x, b.y - a.y), placement: { kind: 'linear', offset: 10 } };
   s.dimensionOrder.push('d');
  }
  const snapshot = structuredClone(d), start = body(d), target = createLineBodyDragTarget(d, 'line', start);
  for (const delta of [{ x: 12, y: 9 }, { x: -8, y: 15 }, { x: 1, y: -3 }]) {
   const preview = solveDrawingDragCandidate(d, target, delta, start); valid(preview);
   const moved = preview.sketches.s, p = moved.points[l.startPointId], q = moved.points[l.endPointId];
   close((p.x + q.x) / 2, start.x + delta.x); close((p.y + q.y) / 2, start.y + delta.y);
   close(q.x - p.x, b.x - a.x); close(q.y - p.y, b.y - a.y);
   if (driving === 'radius') close(moved.entities.support.radius, 100);
  }
  assert.deepEqual(d, snapshot);
 });
}
