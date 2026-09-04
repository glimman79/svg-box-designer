import assert from 'node:assert/strict';
import { createDrawingDocumentV2 } from '../.test-build/drawing-constraint-scoped-drag/drawingTypes.js';
import { solveDrawingDimensionEdit } from '../.test-build/drawing-constraint-scoped-drag/drawingConstraintSolver.js';
import { collectAffectedDrivingDimensions, solveDrawingDragCandidate, validateDrivingDimensions } from '../.test-build/drawing-constraint-scoped-drag/drawingDirectManipulation.js';
import { DRAWING_HISTORY_LIMIT, EMPTY_DRAWING_HISTORY, redoDrawingDocument, transactDrawingDocument, undoDrawingDocument } from '../.test-build/drawing-constraint-scoped-drag/drawingHistory.js';

const line = (id, startPointId, endPointId) => ({ id, type: 'line', startPointId, endPointId });
const dimension = (id, kind, value, lineId, role = 'driving') => ({ id, kind, value, role, references: [{ kind: 'point', entityId: lineId, point: 'start' }, { kind: 'point', entityId: lineId, point: 'end' }], placement: { kind: 'linear', offset: 5 } });
const make = (dimensions = [dimension('ab-a', 'ALIGNED_DISTANCE', 100, 'ab')]) => {
  const base = createDrawingDocumentV2(), sketch = base.sketches[base.activeSketchId];
  const entities = { ab: line('ab', 'a', 'b'), cd: line('cd', 'c', 'd'), ef: line('ef', 'e', 'f'), left: line('left', 'p1', 'p2'), right: line('right', 'p2', 'p3') };
  const points = { a:{id:'a',x:0,y:0}, b:{id:'b',x:100,y:0}, c:{id:'c',x:200,y:0}, d:{id:'d',x:240,y:0}, e:{id:'e',x:300,y:0}, f:{id:'f',x:330,y:10}, p1:{id:'p1',x:0,y:100}, p2:{id:'p2',x:50,y:100}, p3:{id:'p3',x:100,y:100} };
  return { ...base, sketches: { ...base.sketches, [sketch.id]: { ...sketch, points, entities, entityOrder:Object.keys(entities), dimensions:Object.fromEntries(dimensions.map(d => [d.id,d])), dimensionOrder:dimensions.map(d => d.id) } } };
};
const sketch = document => document.sketches[document.activeSketchId];
const length = (document, first, second) => Math.hypot(sketch(document).points[second].x-sketch(document).points[first].x, sketch(document).points[second].y-sketch(document).points[first].y);
const edit = (document, id = 'ab-a', value = 120) => { const result = solveDrawingDimensionEdit({ document, dimensionId:id, targetValue:value }); assert.equal(result.ok,true); return result.document; };
const datumDimension=(id,kind,value,pointId)=>({id,kind,value,role:'driving',references:[{kind:'datum',datum:'ORIGIN'},{kind:'sketchPoint',pointId}],placement:{kind:'linear',offset:5}});

// Exact primary edit boundary: target and solved geometry commit together; unrelated geometry is untouched and draggable.
{
  const before = make(), solved = edit(before);
  assert.equal(sketch(solved).dimensions['ab-a'].value,120); assert.ok(Math.abs(length(solved,'a','b')-120)<1e-7);
  assert.strictEqual(sketch(solved).points.c,sketch(before).points.c); assert.strictEqual(sketch(solved).points.d,sketch(before).points.d);
  const dragged = solveDrawingDragCandidate(solved,{kind:'line',lineId:'cd'},{x:17,y:-9}); assert.ok(dragged);
  assert.deepEqual(sketch(dragged).points.c,{id:'c',x:217,y:-9}); assert.deepEqual(sketch(dragged).points.d,{id:'d',x:257,y:-9});
}

// The transient orientation seed yields to real constraints. With both datum
// coordinates fixed A is an exact pivot; with only X fixed its remaining Y
// freedom participates in the best valid solution.
{
  const base=make([
    dimension('ab-length','ALIGNED_DISTANCE',50,'left'),
    datumDimension('a-x','HORIZONTAL_DISTANCE',0,'p1'),
    datumDimension('a-y','VERTICAL_DISTANCE',100,'p1'),
  ]);
  const anchored=solveDrawingDragCandidate(base,{kind:'line',lineId:'right'},{x:10,y:20}); assert.ok(anchored);
  assert.ok(Math.hypot(sketch(anchored).points.p1.x-sketch(base).points.p1.x,sketch(anchored).points.p1.y-sketch(base).points.p1.y)<1e-7,'hard datum constraints override the orientation stay');
  assert.ok(Math.abs(length(anchored,'p1','p2')-50)<1e-7);
  assert.notEqual(sketch(anchored).points.p2.y,sketch(base).points.p2.y,'AB rotates when its opposite endpoint is anchored');

  const partial=make([
    dimension('ab-length','ALIGNED_DISTANCE',50,'left'),
    datumDimension('a-x','HORIZONTAL_DISTANCE',0,'p1'),
  ]);
  const partialDrag=solveDrawingDragCandidate(partial,{kind:'line',lineId:'right'},{x:10,y:20}); assert.ok(partialDrag);
  assert.ok(Math.abs(sketch(partialDrag).points.p1.x)<1e-7);
  assert.notEqual(sketch(partialDrag).points.p1.y,sketch(partial).points.p1.y,'legal Y motion is used before treating A as a fixed pivot');
  assert.ok(Math.abs(length(partialDrag,'p1','p2')-50)<1e-7);
}

// Several indirectly affected length Lines inherit a coherent displacement;
// the preference follows connectivity rather than entity creation order.
{
  const chain=make([
    dimension('ab-length','ALIGNED_DISTANCE',50,'left'),
    dimension('prior-length','ALIGNED_DISTANCE',40,'prior'),
  ]), s=sketch(chain);
  chain.sketches[chain.activeSketchId]={...s,
    points:{...s.points,p0:{id:'p0',x:-40,y:100}},
    entities:{prior:line('prior','p0','p1'),...s.entities},
    entityOrder:['right','prior','left','ab','cd','ef'],
  };
  const moved=solveDrawingDragCandidate(chain,{kind:'line',lineId:'right'},{x:7,y:-11}); assert.ok(moved);
  for (const id of ['p0','p1','p2']) assert.deepEqual(sketch(moved).points[id],{...sketch(chain).points[id],x:sketch(chain).points[id].x+7,y:sketch(chain).points[id].y-11});
  assert.ok(Math.abs(length(moved,'p0','p1')-40)<1e-7 && Math.abs(length(moved,'p1','p2')-50)<1e-7);
}

// Reproduce the old document-wide poison path: one stale, unrelated equation made global validation fail.
{
  const poisoned = make([dimension('ab-a','ALIGNED_DISTANCE',100,'ab'),dimension('cd-h','HORIZONTAL_DISTANCE',999,'cd')]);
  const solved = edit(poisoned);
  assert.equal(validateDrivingDimensions(solved),false,'legacy all-document validation reproduces the freeze precondition');
  assert.deepEqual(collectAffectedDrivingDimensions(solved,new Set(['e','f'])),[]);
  assert.ok(solveDrawingDragCandidate(solved,{kind:'line',lineId:'ef'},{x:7,y:3}),'unrelated stale equation cannot poison free geometry');
  assert.ok(solveDrawingDragCandidate(solved,{kind:'line',lineId:'ab'},{x:2,y:4}),'whole constrained Line translates after edit');
  const endpoint=solveDrawingDragCandidate(solved,{kind:'point',pointId:'b'},{x:5,y:20}); assert.ok(endpoint,'endpoint violation is solver-projected');
  assert.ok(Math.abs(length(endpoint,'a','b')-120)<1e-7); assert.deepEqual(sketch(endpoint).points.a,sketch(solved).points.a);
}

// Stable shared point identity pulls in a neighboring Line's equation; references never do.
{
  const document = make([dimension('left-h','HORIZONTAL_DISTANCE',50,'left'),dimension('display','ALIGNED_DISTANCE',1,'right','reference')]);
  assert.deepEqual(collectAffectedDrivingDimensions(document,new Set(['p2'])).map(d=>d.id),['left-h']);
  const projected=solveDrawingDragCandidate(document,{kind:'point',pointId:'p2'},{x:1,y:7}); assert.ok(projected);
  assert.ok(Math.abs(sketch(projected).points.p2.x-50)<1e-7); assert.equal(sketch(projected).points.p2.y,107);
  assert.ok(solveDrawingDragCandidate(document,{kind:'line',lineId:'ef'},{x:1,y:1}));
}

// Horizontal, vertical, and supported same-pair combinations retain local protection after edits.
for (const [dimensions, end, target] of [
  [[dimension('edit','HORIZONTAL_DISTANCE',100,'ab')], {x:100,y:0}, 120],
  [[dimension('edit','VERTICAL_DISTANCE',10,'ab')], {x:100,y:10}, 20],
  [[dimension('edit','HORIZONTAL_DISTANCE',80,'ab'),dimension('other','VERTICAL_DISTANCE',60,'ab')], {x:80,y:60}, 120],
  [[dimension('edit','ALIGNED_DISTANCE',100,'ab'),dimension('other','HORIZONTAL_DISTANCE',80,'ab')], {x:80,y:60}, 130],
  [[dimension('edit','ALIGNED_DISTANCE',100,'ab'),dimension('other','VERTICAL_DISTANCE',60,'ab')], {x:80,y:60}, 130],
]) {
  const source=make(dimensions); source.sketches[source.activeSketchId].points.b={id:'b',...end};
  const solved = edit(source,'edit',target);
  assert.ok(solveDrawingDragCandidate(solved,{kind:'line',lineId:'ab'},{x:3,y:4}));
  assert.ok(solveDrawingDragCandidate(solved,{kind:'line',lineId:'ef'},{x:-3,y:2}));
}

// A--B--C: a direct B drag uses AB's rotational DOF with A held, while a BC
// Line drag transiently prefers translating the indirectly affected AB.
{
  const chain=make([dimension('ab-length','ALIGNED_DISTANCE',50,'left')]);
  const cDrag=solveDrawingDragCandidate(chain,{kind:'point',pointId:'p3'},{x:13,y:-8}); assert.ok(cDrag);
  assert.deepEqual(sketch(cDrag).points.p3,{id:'p3',x:113,y:92});
  assert.deepEqual(sketch(cDrag).points.p1,sketch(chain).points.p1); assert.deepEqual(sketch(cDrag).points.p2,sketch(chain).points.p2);
  const bDrag=solveDrawingDragCandidate(chain,{kind:'point',pointId:'p2'},{x:-10,y:20}); assert.ok(bDrag);
  assert.ok(Math.abs(length(bDrag,'p1','p2')-50)<1e-7); assert.deepEqual(sketch(bDrag).points.p1,sketch(chain).points.p1);
  const bcDrag=solveDrawingDragCandidate(chain,{kind:'line',lineId:'right'},{x:10,y:20}); assert.ok(bcDrag);
  assert.ok(Math.abs(length(bcDrag,'p1','p2')-50)<1e-7);
  assert.deepEqual(sketch(bcDrag).points.p1,{id:'p1',x:10,y:120});
  assert.deepEqual(sketch(bcDrag).points.p2,{id:'p2',x:60,y:120});
  assert.deepEqual(sketch(bcDrag).points.p3,{id:'p3',x:110,y:120});
  const transaction=transactDrawingDocument(EMPTY_DRAWING_HISTORY,chain,()=>bcDrag);
  assert.equal(transaction.history.undo.length,1,'one propagated pointer-up is one History step');
  assert.deepEqual(sketch(undoDrawingDocument(transaction.history,transaction.document).document).points,sketch(chain).points);
}

// Reference equations never restrict motion, while a datum-anchored zero-DOF
// point rejects a drag as an exact no-op (and therefore cannot create history).
{
  const referenceOnly=make([dimension('display','ALIGNED_DISTANCE',999,'ab','reference')]);
  const free=solveDrawingDragCandidate(referenceOnly,{kind:'point',pointId:'b'},{x:25,y:30}); assert.ok(free);
  assert.deepEqual(sketch(free).points.b,{id:'b',x:125,y:30});
  const anchored=make([]), s=sketch(anchored);
  anchored.sketches[anchored.activeSketchId]={...s,dimensions:{ax:datumDimension('ax','HORIZONTAL_DISTANCE',0,'a'),ay:datumDimension('ay','VERTICAL_DISTANCE',0,'a')},dimensionOrder:['ax','ay']};
  assert.strictEqual(solveDrawingDragCandidate(anchored,{kind:'point',pointId:'a'},{x:9,y:7}),anchored);
  assert.equal(transactDrawingDocument(EMPTY_DRAWING_HISTORY,anchored,()=>solveDrawingDragCandidate(anchored,{kind:'point',pointId:'a'},{x:9,y:7})).history.undo.length,0);
}

// The edit and later unrelated drag are each one atomic history action with symmetric undo/redo.
{
  const original=make(); let history=EMPTY_DRAWING_HISTORY;
  const editTx=transactDrawingDocument(history,original,current=>edit(current)); history=editTx.history;
  assert.equal(history.undo.length,1); assert.equal(sketch(editTx.document).dimensions['ab-a'].value,120); assert.equal(length(editTx.document,'a','b'),120);
  const candidate=solveDrawingDragCandidate(editTx.document,{kind:'line',lineId:'cd'},{x:10,y:5});
  const dragTx=transactDrawingDocument(history,editTx.document,()=>candidate); assert.equal(dragTx.history.undo.length,2);
  const undoDrag=undoDrawingDocument(dragTx.history,dragTx.document); assert.deepEqual(sketch(undoDrag.document).points.c,sketch(editTx.document).points.c);
  const undoEdit=undoDrawingDocument(undoDrag.history,undoDrag.document); assert.equal(sketch(undoEdit.document).dimensions['ab-a'].value,100); assert.equal(length(undoEdit.document,'a','b'),100);
  const redoEdit=redoDrawingDocument(undoEdit.history,undoEdit.document), redoDrag=redoDrawingDocument(redoEdit.history,redoEdit.document);
  assert.equal(sketch(redoEdit.document).dimensions['ab-a'].value,120); assert.deepEqual(sketch(redoDrag.document).points.c,sketch(dragTx.document).points.c);
  assert.equal(DRAWING_HISTORY_LIMIT,100);
}

console.log('drawing constraint-scoped drag tests passed');
