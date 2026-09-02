import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createDrawingDocumentV2 } from '../.test-build/drawing-direct-manipulation/drawingTypes.js';
import { applyDrawingPointMoves, pointIdFromHit, solveDrawingDragCandidate, validateDrivingDimensions } from '../.test-build/drawing-direct-manipulation/drawingDirectManipulation.js';
import { transactDrawingDocument, EMPTY_DRAWING_HISTORY, undoDrawingDocument, redoDrawingDocument } from '../.test-build/drawing-direct-manipulation/drawingHistory.js';

const line = (id, startPointId, endPointId) => ({ id, type: 'line', startPointId, endPointId });
const make = () => {
  const base = createDrawingDocumentV2(), sketch = base.sketches[base.activeSketchId];
  return { ...base, sketches: { ...base.sketches, [sketch.id]: { ...sketch,
    points: { p0:{id:'p0',x:0,y:0}, p1:{id:'p1',x:10,y:0}, p2:{id:'p2',x:20,y:0}, p3:{id:'p3',x:10,y:10} },
    entities: { l0:line('l0','p0','p1'), l1:line('l1','p1','p2'), l2:line('l2','p1','p3') }, entityOrder:['l0','l1','l2'] } } };
};
let document = make();
assert.equal(pointIdFromHit(document,'l0','end'),'p1','endpoint hit resolves authoritative shared point');
let candidate = solveDrawingDragCandidate(document,{kind:'point',pointId:'p1'},{x:3,y:4});
assert.ok(candidate); let sketch=candidate.sketches[candidate.activeSketchId];
assert.deepEqual(sketch.points.p1,{id:'p1',x:13,y:4});
assert.equal(sketch.entities.l0.endPointId,'p1'); assert.equal(sketch.entities.l1.startPointId,'p1'); assert.equal(sketch.entities.l2.startPointId,'p1');
assert.deepEqual(sketch.points.p0,{id:'p0',x:0,y:0}); assert.equal(Object.keys(sketch.points).length,4);
candidate=solveDrawingDragCandidate(document,{kind:'line',lineId:'l0'},{x:5,y:-2}); assert.ok(candidate); sketch=candidate.sketches[candidate.activeSketchId];
assert.deepEqual(sketch.points.p0,{id:'p0',x:5,y:-2}); assert.deepEqual(sketch.points.p1,{id:'p1',x:15,y:-2});
assert.equal(Math.hypot(sketch.points.p1.x-sketch.points.p0.x,sketch.points.p1.y-sketch.points.p0.y),10);
assert.deepEqual(sketch.points.p2,{id:'p2',x:20,y:0},'line drag does not recursively move chain');
const active=document.sketches[document.activeSketchId];
const dimension=(id,kind,role,value,entityId='l0')=>({id,kind,role,value,references:[{kind:'point',entityId,point:'start'},{kind:'point',entityId,point:'end'}],placement:{kind:'linear',offset:5}});
document={...document,sketches:{...document.sketches,[active.id]:{...active,dimensions:{a:dimension('a','ALIGNED_DISTANCE','driving',10),r:dimension('r','VERTICAL_DISTANCE','reference',999)},dimensionOrder:['a','r']}}};
assert.equal(validateDrivingDimensions(document),true);
assert.equal(solveDrawingDragCandidate(document,{kind:'point',pointId:'p1'},{x:5,y:0}),null,'aligned violation rejected');
assert.ok(solveDrawingDragCandidate(document,{kind:'line',lineId:'l0'},{x:5,y:3}),'rigid translation preserves driving dimension');
let horizontal={...document,sketches:{...document.sketches,[active.id]:{...document.sketches[active.id],dimensions:{h:dimension('h','HORIZONTAL_DISTANCE','driving',10)},dimensionOrder:['h']}}};
assert.equal(solveDrawingDragCandidate(horizontal,{kind:'point',pointId:'p1'},{x:1,y:5}),null);
assert.ok(solveDrawingDragCandidate(horizontal,{kind:'point',pointId:'p1'},{x:0,y:5}));
let vertical={...make(),sketches:{...make().sketches,[active.id]:{...make().sketches[active.id],dimensions:{v:dimension('v','VERTICAL_DISTANCE','driving',0)},dimensionOrder:['v']}}};
assert.equal(solveDrawingDragCandidate(vertical,{kind:'point',pointId:'p1'},{x:0,y:1}),null);
assert.ok(solveDrawingDragCandidate(vertical,{kind:'point',pointId:'p1'},{x:4,y:0}));
let history=EMPTY_DRAWING_HISTORY; const moved=solveDrawingDragCandidate(make(),{kind:'point',pointId:'p1'},{x:2,y:2});
let tx=transactDrawingDocument(history,make(),()=>moved); assert.equal(tx.history.undo.length,1,'one pointerup transaction');
let undone=undoDrawingDocument(tx.history,tx.document); assert.deepEqual(undone.document.sketches[active.id].points.p1,{id:'p1',x:10,y:0});
let redone=redoDrawingDocument(undone.history,undone.document); assert.deepEqual(redone.document.sketches[active.id].points.p1,{id:'p1',x:12,y:2});
assert.equal(transactDrawingDocument(EMPTY_DRAWING_HISTORY,make(),d=>d).history.undo.length,0,'cancel/no-op has no history');
const workspace=fs.readFileSync('src/app/DrawingWorkspace.tsx','utf8');
assert.match(workspace,/DRAWING_DRAG_THRESHOLD_PX/); assert.match(workspace,/setPointerCapture/); assert.match(workspace,/candidate: candidate \?\? geometryDrag\.candidate/,'invalid preview retains last valid candidate');
assert.match(workspace,/if \(geometryDrag\) \{ setGeometryDrag\(null\); return; \}/,'Escape cancels transient drag');
assert.match(workspace,/onMouseDown=\{handleDrawingMouseDown\}/,'Drawing-local primary preventDefault remains');
console.log('drawing direct manipulation tests passed');
