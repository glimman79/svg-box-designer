import test from 'node:test';
import assert from 'node:assert/strict';
import { createArcCenterDragTarget, createArcEndpointDragTarget, createArcRadiusDragTarget, resolveArcEndpointOwner, solveDrawingDragCandidate } from '../.test-build/drawing-arc-direct-manipulation/drawingDirectManipulation.js';
import { resolveArc } from '../.test-build/drawing-arc-direct-manipulation/drawingTopology.js';
import { verifyDrawingConstraints } from '../.test-build/drawing-arc-direct-manipulation/drawingConstraintSolver.js';
import { createCircularSizeDimension } from '../.test-build/drawing-arc-direct-manipulation/drawingDimension.js';
import { EMPTY_DRAWING_HISTORY, transactDrawingDocument, undoDrawingDocument, redoDrawingDocument } from '../.test-build/drawing-arc-direct-manipulation/drawingHistory.js';

const make = ({radius=5,orientation='CCW',sweep=Math.PI/2,rotation=0,offset=0}={}) => {
 const sign=orientation==='CCW'?1:-1, c={id:'o',x:offset+2,y:-offset+3};
 const p=(id,t)=>({id,x:c.x+radius*Math.cos(rotation+sign*t),y:c.y+radius*Math.sin(rotation+sign*t)});
 return {schemaVersion:2,unit:'mm',activeSketchId:'s',sketchOrder:['s'],sketches:{s:{id:'s',name:'S',points:{o:c,a:p('a',0),b:p('b',sweep)},entities:{arc:{id:'arc',type:'arc',centerPointId:'o',radius,startPointId:'a',endPointId:'b',orientation}},entityOrder:['arc'],dimensions:{},dimensionOrder:[],geometricConstraints:{},geometricConstraintOrder:[]}}};
};
const sketch=d=>d.sketches.s;
const arc=d=>resolveArc(sketch(d),sketch(d).entities.arc);
const close=(a,b,t=1e-7)=>assert.ok(Math.abs(a-b)<=t,`${a} != ${b} (t=${t})`);
const pointClose=(a,b,t=1e-7)=>{close(a.x,b.x,t);close(a.y,b.y,t);};
const valid=(d,before)=>{
 assert.ok(d);const s=sketch(d),e=s.entities.arc;
 assert.ok(verifyDrawingConstraints(s,s.dimensionOrder,s.geometricConstraintOrder)); assert.ok(arc(d));
 assert.equal(e.orientation,sketch(before).entities.arc.orientation);
 assert.deepEqual([e.centerPointId,e.startPointId,e.endPointId],['o','a','b']);
 assert.deepEqual(Object.keys(s.points),Object.keys(sketch(before).points));
 assert.equal('bulge' in e,false);
 for(const p of [s.points.a,s.points.b]) close(Math.hypot(p.x-s.points.o.x,p.y-s.points.o.y),e.radius);
};
const fixedRadius=d=>{const s=sketch(d);s.dimensions.r=createCircularSizeDimension(s,'arc',{x:15,y:15},'r');s.dimensionOrder.push('r');};
const axis=(d,id,p,coordinate)=>{
 const s=sketch(d);s.dimensions[id]={id,kind:coordinate==='x'?'HORIZONTAL_DISTANCE':'VERTICAL_DISTANCE',references:[{kind:'datum',datum:'ORIGIN'},{kind:'sketchPoint',pointId:p}],value:Math.abs(s.points[p][coordinate]),role:'driving',placement:{kind:'linear',offset:5}};s.dimensionOrder.push(id);
};
const bodyTarget=d=>{const a=arc(d),angle=a.startAngle+a.signedSweep/2,point={x:a.center.x+a.radius*Math.cos(angle),y:a.center.y+a.radius*Math.sin(angle)};return {point,target:createArcRadiusDragTarget(d,'arc',point)};};

for(const orientation of ['CW','CCW']) for(const sweep of [Math.PI/2,Math.PI,Math.PI*1.7]) {
 test(`body and center grips preserve ${orientation} sweep ${sweep}`,()=>{
  const d=make({orientation,sweep}),s=sketch(d),a=arc(d),{point,target}=bodyTarget(d);
  assert.ok(target);assert.equal(solveDrawingDragCandidate(d,target,{x:0,y:0},point),d);
  for(const amount of [-2,3]){
   const delta={x:target.radialDirection.x*amount-target.radialDirection.y*4,y:target.radialDirection.y*amount+target.radialDirection.x*4};
   const result=solveDrawingDragCandidate(d,target,delta,point);valid(result,d);
   assert.deepEqual(sketch(result).points.o,s.points.o);close(arc(result).radius,a.radius+amount);close(arc(result).signedSweep,a.signedSweep);
   for(const id of ['a','b'])pointClose(sketch(result).points[id],{x:a.center.x+(s.points[id].x-a.center.x)*(a.radius+amount)/a.radius,y:a.center.y+(s.points[id].y-a.center.y)*(a.radius+amount)/a.radius});
  }
  const moved=solveDrawingDragCandidate(d,createArcCenterDragTarget(d,'arc'),{x:4,y:-2});valid(moved,d);
  for(const id of ['o','a','b'])pointClose(sketch(moved).points[id],{x:s.points[id].x+4,y:s.points[id].y-2});
  assert.equal(arc(moved).radius,a.radius);close(arc(moved).signedSweep,a.signedSweep);
 });
}

for(const orientation of ['CW','CCW']) for(const id of ['a','b']) test(`${orientation} ${id} drag keeps exact opposite pivot`,()=>{
 const d=make({orientation}),pivot=id==='a'?'b':'a',target=createArcEndpointDragTarget(d,'arc',id);
 const result=solveDrawingDragCandidate(d,target,{x:2,y:1});valid(result,d);
 assert.deepEqual(sketch(result).points[pivot],sketch(d).points[pivot]);pointClose(sketch(result).points[id],{x:sketch(d).points[id].x+2,y:sketch(d).points[id].y+1});
});

for(const orientation of ['CW','CCW']) for(const sweep of [Math.PI/2,Math.PI*1.6]) test(`fixed radius ${orientation} sweep ${sweep}: both roots and 2R boundary`,()=>{
 const d=make({orientation,sweep});fixedRadius(d);
 for(const id of ['a','b']) {
  const pivot=id==='a'?'b':'a',p=sketch(d).points[pivot],q=sketch(d).points[id],target=createArcEndpointDragTarget(d,'arc',id);
  for(const distance of [4,10,14]){
   const requested={x:p.x+distance*.8,y:p.y+distance*.6},result=solveDrawingDragCandidate(d,target,{x:requested.x-q.x,y:requested.y-q.y});valid(result,d);
   assert.deepEqual(sketch(result).points[pivot],p);close(arc(result).radius,5);
   pointClose(sketch(result).points[id],{x:p.x+Math.min(distance,10)*.8,y:p.y+Math.min(distance,10)*.6},2e-6);
   if(distance>=10){close(Math.abs(arc(result).signedSweep),Math.PI,2e-6);pointClose(arc(result).center,{x:(sketch(result).points[id].x+p.x)/2,y:(sketch(result).points[id].y+p.y)/2},2e-6);}
  }
 }
});

test('driving Radius makes body an identity, while center translation remains available',()=>{
 const d=make();fixedRadius(d);const {point,target}=bodyTarget(d);
 const result=solveDrawingDragCandidate(d,target,{x:8,y:8},point);assert.equal(result,d);
 assert.equal(transactDrawingDocument(EMPTY_DRAWING_HISTORY,d,()=>result).history.undo.length,0);
 const moved=solveDrawingDragCandidate(d,createArcCenterDragTarget(d,'arc'),{x:4,y:2});valid(moved,d);close(arc(moved).radius,5);
});

test('center-axis Dimensions restrict rigid translation rather than deforming the Arc',()=>{
 const d=make();axis(d,'cx','o','x');const target=createArcCenterDragTarget(d,'arc');
 const moved=solveDrawingDragCandidate(d,target,{x:4,y:3});valid(moved,d);
 close(sketch(moved).points.o.x,sketch(d).points.o.x);close(sketch(moved).points.o.y,sketch(d).points.o.y+3);
 for(const id of ['a','b'])pointClose(sketch(moved).points[id],{x:sketch(d).points[id].x,y:sketch(d).points[id].y+3});
 axis(d,'cy','o','y');assert.equal(solveDrawingDragCandidate(d,target,{x:4,y:3}),d);
});

test('fixed-radius endpoint continuation reaches the far center-axis branch',()=>{
 const d=make();fixedRadius(d);axis(d,'cx','o','x');
 const target=createArcEndpointDragTarget(d,'arc','a'),p=sketch(d).points.a;
 for(const requested of [{x:7,y:13},{x:-3,y:13},{x:5,y:7}]) {
  const result=solveDrawingDragCandidate(d,target,{x:requested.x-p.x,y:requested.y-p.y});valid(result,d);
  assert.deepEqual(sketch(result).points.b,sketch(d).points.b);close(arc(result).radius,5);close(Math.abs(arc(result).center.x),2);
  assert.ok(Math.hypot(sketch(result).points.a.x-requested.x,sketch(result).points.a.y-requested.y)<Math.hypot(p.x-requested.x,p.y-requested.y));
 }
});

test('driving endpoint position restricts endpoint pointer intent without releasing the pivot',()=>{
 const d=make();axis(d,'ax','a','x');axis(d,'ay','a','y');const target=createArcEndpointDragTarget(d,'arc','a');
 assert.equal(solveDrawingDragCandidate(d,target,{x:2,y:2}),d);
});

const shared=(d)=>{
 const s=sketch(d);s.points.q={id:'q',x:s.points.a.x+3,y:s.points.a.y};
 s.entities.line={id:'line',type:'line',startPointId:'a',endPointId:'q'};
 s.entities.circle={id:'circle',type:'circle',centerPointId:'b',radius:3};s.entityOrder.push('line','circle');
 s.geometricConstraints.h={id:'h',kind:'HORIZONTAL',references:[{kind:'entity',entityId:'line'}]};s.geometricConstraintOrder=['h'];
};
for(const grip of ['center','body','endpoint'])test(`${grip} preserves shared Line/Circle topology and hard Horizontal`,()=>{
 const d=make();shared(d);const {point,target:body}=bodyTarget(d);
 const target=grip==='center'?createArcCenterDragTarget(d,'arc'):grip==='body'?body:createArcEndpointDragTarget(d,'arc','a');
 const result=solveDrawingDragCandidate(d,target,{x:2,y:1},point);valid(result,d);
 assert.equal(sketch(result).entities.line.startPointId,'a');assert.equal(sketch(result).entities.circle.centerPointId,'b');
 close(sketch(result).points.a.y,sketch(result).points.q.y);assert.equal(sketch(result).entities.circle.radius,3);
 if(grip==='endpoint')assert.deepEqual(sketch(result).points.b,sketch(d).points.b);
});

for(const grip of ['center','body','P1','P2'])test(`${grip} previews are absolute, reversible and History round-trips once`,()=>{
 const d=make(),snapshot=structuredClone(d),{point,target:body}=bodyTarget(d);
 const target=grip==='center'?createArcCenterDragTarget(d,'arc'):grip==='body'?body:createArcEndpointDragTarget(d,'arc',grip==='P2'?'b':'a');
 const direct=solveDrawingDragCandidate(d,target,{x:2,y:1},point);valid(direct,d);
 for(const delta of [{x:1,y:0},{x:3,y:2},{x:-1,y:1}])valid(solveDrawingDragCandidate(d,target,delta,point),d);
 assert.deepEqual(solveDrawingDragCandidate(d,target,{x:2,y:1},point),direct);
 assert.equal(solveDrawingDragCandidate(d,target,{x:0,y:0},point),d);assert.deepEqual(d,snapshot);
 const tx=transactDrawingDocument(EMPTY_DRAWING_HISTORY,d,()=>direct);assert.equal(tx.history.undo.length,1);
 const undone=undoDrawingDocument(tx.history,tx.document);assert.deepEqual(undone.document,d);
 const redone=redoDrawingDocument(undone.history,undone.document);assert.deepEqual(redone.document,direct);
});

test('radius and offset scales preserve finite directed geometry',()=>{
 for(const radius of [.001,5,10000])for(const offset of [0,1e6])for(const orientation of ['CW','CCW']){
  const d=make({radius,offset,orientation,rotation:.7,sweep:Math.PI*1.6}),{point,target}=bodyTarget(d);
  const body=solveDrawingDragCandidate(d,target,{x:target.radialDirection.x*radius*.2,y:target.radialDirection.y*radius*.2},point);valid(body,d);
  assert.deepEqual(sketch(body).points.o,sketch(d).points.o);close(arc(body).radius,radius*1.2);
  valid(solveDrawingDragCandidate(d,createArcCenterDragTarget(d,'arc'),{x:radius*.2,y:-radius*.1}),d);
  const free=solveDrawingDragCandidate(d,createArcEndpointDragTarget(d,'arc','a'),{x:radius*.2,y:radius*.1});valid(free,d);
  assert.deepEqual(sketch(free).points.b,sketch(d).points.b);pointClose(sketch(free).points.a,{x:sketch(d).points.a.x+radius*.2,y:sketch(d).points.a.y+radius*.1});
  fixedRadius(d);const a=sketch(d).points.a,b=sketch(d).points.b;
  const end=solveDrawingDragCandidate(d,createArcEndpointDragTarget(d,'arc','a'),{x:b.x+radius*1.5-a.x,y:b.y-a.y});valid(end,d);
  assert.deepEqual(sketch(end).points.b,b);pointClose(sketch(end).points.a,{x:b.x+radius*1.5,y:b.y},1e-6);
 }
});

test('invalid endpoints and non-finite pointer input fail closed',()=>{
 const d=make();assert.equal(createArcEndpointDragTarget(d,'arc','o'),null);assert.equal(createArcCenterDragTarget(d,'missing'),null);
 const target=createArcCenterDragTarget(d,'arc');for(const delta of [{x:NaN,y:0},{x:0,y:Infinity}])assert.equal(solveDrawingDragCandidate(d,target,delta),null);
});

test('shared endpoints remain ordinary SketchPoints when ownership is ambiguous or a Line is selected',()=>{
 const d=make();shared(d);assert.equal(resolveArcEndpointOwner(d,'a',[]),'arc');assert.equal(resolveArcEndpointOwner(d,'a',['line']),null);
 sketch(d).entities.other={...sketch(d).entities.arc,id:'other'};sketch(d).entityOrder.push('other');
 assert.equal(resolveArcEndpointOwner(d,'a',[]),null);assert.equal(resolveArcEndpointOwner(d,'a',['arc']),'arc');
 const result=solveDrawingDragCandidate(d,{kind:'point',pointId:'a'},{x:1,y:1});valid(result,d);
});

test('fixed-radius pointer-equivalent roots choose the whole-directed-Arc continuation minimum',()=>{
 const metric=(before,after)=>{
  const scale=Math.max(before.radius,Math.hypot(before.end.x-before.start.x,before.end.y-before.start.y));
  const p=(a,t)=>({x:a.center.x+a.radius*Math.cos(a.startAngle+a.signedSweep*t),y:a.center.y+a.radius*Math.sin(a.startAngle+a.signedSweep*t)});
  let score=((after.center.x-before.center.x)/scale)**2+((after.center.y-before.center.y)/scale)**2+Math.log(after.radius/before.radius)**2;
  for(const t of [1/8,1/4,3/8,1/2,5/8,3/4,7/8]){const a=p(before,t),b=p(after,t);score+=((a.x-b.x)**2+(a.y-b.y)**2)/(7*scale**2);}return score;
 };
 for(const orientation of ['CW','CCW'])for(const sweep of [Math.PI*.4,Math.PI*1.6]){
  const d=make({orientation,sweep});fixedRadius(d);const before=arc(d),pivot=sketch(d).points.b,point={x:pivot.x+3.2,y:pivot.y+2.4};
  const result=solveDrawingDragCandidate(d,createArcEndpointDragTarget(d,'arc','a'),{x:point.x-before.start.x,y:point.y-before.start.y});valid(result,d);
  const roots=[-1,1].map(side=>{const candidate=structuredClone(d),h=Math.sqrt(25-4);sketch(candidate).points.a={id:'a',...point};sketch(candidate).points.o={id:'o',x:pivot.x+1.6-side*.6*h,y:pivot.y+1.2+side*.8*h};return arc(candidate);});
  close(metric(before,arc(result)),Math.min(...roots.map(root=>metric(before,root))),1e-6);
 }
});

test('driving endpoint coordinate blocks radial change while preserving body grip semantics',()=>{
 const d=make();axis(d,'ax','a','x');const {point,target}=bodyTarget(d);
 assert.equal(solveDrawingDragCandidate(d,target,{x:3,y:3},point),d);
});

test('Point-on-Line center constraint allows only rigid translation along its support',()=>{
 const d=make(),s=sketch(d);s.points.l={id:'l',x:-10,y:3};s.points.r={id:'r',x:20,y:3};
 s.entities.support={id:'support',type:'line',startPointId:'l',endPointId:'r'};s.entityOrder.push('support');
 for(const p of ['l','r'])for(const a of ['x','y'])axis(d,p+a,p,a);
 s.geometricConstraints.on={id:'on',kind:'COINCIDENT',variant:'point-linear-support',references:[{kind:'sketchPoint',pointId:'o'},{kind:'entity',entityId:'support'}]};s.geometricConstraintOrder=['on'];
 const result=solveDrawingDragCandidate(d,createArcCenterDragTarget(d,'arc'),{x:4,y:2});valid(result,d);
 for(const id of ['o','a','b'])pointClose(sketch(result).points[id],{x:s.points[id].x+4,y:s.points[id].y});
});

test('body radius solve propagates Point-on-Circle without bypassing intrinsic Arc equations',()=>{
 const d=make(),s=sketch(d);s.points.q={id:'q',x:2,y:3};s.entities.circle={id:'circle',type:'circle',centerPointId:'q',radius:5};s.entityOrder.push('circle');
 s.geometricConstraints.on={id:'on',kind:'COINCIDENT',variant:'point-curve',references:[{kind:'sketchPoint',pointId:'a'},{kind:'entity',entityId:'circle'}]};s.geometricConstraintOrder=['on'];
 const {point,target}=bodyTarget(d),result=solveDrawingDragCandidate(d,target,{x:2,y:2},point);valid(result,d);assert.deepEqual(sketch(result).points.o,s.points.o);
});

test('near-full directed Arcs preserve their finite extent during body and center motion',()=>{
 for(const orientation of ['CW','CCW']){
  const d=make({orientation,sweep:2*Math.PI-1e-4,radius:100}),{point,target}=bodyTarget(d);
  const result=solveDrawingDragCandidate(d,target,{x:target.radialDirection.x*20,y:target.radialDirection.y*20},point);valid(result,d);close(arc(result).signedSweep,arc(d).signedSweep);
  const moved=solveDrawingDragCandidate(d,createArcCenterDragTarget(d,'arc'),{x:2,y:3});valid(moved,d);close(arc(moved).signedSweep,arc(d).signedSweep);
 }
});
