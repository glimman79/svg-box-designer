const {test} = require('node:test');
const assert = require('node:assert/strict');
const {performance} = require('node:perf_hooks');
const {api, assertCompleteFrame} = require('./project-owner-harness.cjs');

test('runtime guard distinguishes sessions and publications even when a stored root returns', () => {
  const service = api.createGlobalProjectHistory(), other = api.createGlobalProjectHistory();
  const original = service.getSnapshot(), attempt = service.getAttempt(), originalPosition=service.getPublication();
  const importToken = service.beginBoxImport(), otherToken = other.beginBoxImport();
  assert.equal(service.isCurrent(other.getAttempt()),false);
  assert.equal(service.isCurrentBoxImport(otherToken),false);
  const staleUI = api.createBoxTransactionAdapter(service,service.getEpoch());
  const edit = box => ({...box,projectSettings:{...box.projectSettings,kerfMm:1}});
  assert.equal(staleUI.transact('Kerf',edit).outcome,'accepted');
  assert.equal(service.traverse('undo'),'construction');
  assert.equal(service.getSnapshot(),original);
  assert.equal(service.getPublication().project,original);
  assert.notEqual(service.getPublication(),originalPosition);
  assert.equal(service.getPublication().history,service.getHistory());
  assert.equal(service.isCurrent(attempt),false); assert.equal(service.isCurrentBoxImport(importToken),false);
  assert.equal(staleUI.transact('old blur',edit).outcome,'rejected');
  const redo = service.getHistory();
  assert.equal(api.createDrawingTransactionAdapter(service).transact('invalid',doc=>({...doc,activeSketchId:'absent'})).outcome,'rejected');
  assert.equal(service.getHistory(),redo); assert.equal(service.getSnapshot(),original);
  const resetAttempt=service.getAttempt();
  service.clearBox(); assert.equal(service.isCurrent(resetAttempt),false);
  assert.notEqual(service.getAttempt().session,resetAttempt.session);
  assert.equal(service.traverse('redo'),null);
});

test('unchanged import and Apply keep an existing Redo branch and stored timestamp', () => {
  const service=api.createGlobalProjectHistory(), box=api.createBoxTransactionAdapter(service);
  const source=api.makePopulatedProjectState().box.svgModel, pm=api.createPanelManagerStateFromModel(source);
  const replace=()=>box.replaceSource(service.beginBoxImport(),source,pm);
  assert.equal(replace().outcome,'accepted');
  const imported=service.getSnapshot();
  box.transact('Thickness',b=>({...b,panelManager:{...b.panelManager,defaultThicknessMm:7}}));
  service.traverse('undo'); const tape=service.getHistory();
  assert.equal(replace().outcome,'noop'); assert.equal(service.getSnapshot(),imported);
  assert.equal(service.getHistory(),tape);
  const stored=imported.box.generatedGeometrySnapshot;
  const equivalent={...stored,metadata:{...stored.metadata,createdTimestamp:'a later time'}};
  assert.equal(api.retainEquivalentSnapshot(stored,equivalent),stored);
  const changed={...equivalent,metadata:{...equivalent.metadata,assignmentRevision:8}};
  assert.equal(api.retainEquivalentSnapshot(stored,changed),changed);
});

test('alternating real adapter edits retain 30 transitions with exact shared source and output', t => {
  const initial=api.makePopulatedProjectState();
  // A synthetic large source and many distinct stored output records; no parsing/generation during traversal.
  const baseItem=initial.box.generatedGeometrySnapshot.generatedGeometry[0];
  initial.box.svgModel.content += '<!--' + 'x'.repeat(2*1024*1024) + '-->';
  initial.box.generatedGeometrySnapshot={...initial.box.generatedGeometrySnapshot,
    generatedGeometry:Array.from({length:5000},(_,index)=>({...baseItem,id:'item-'+index}))};
  const service=api.createGlobalProjectHistory(initial), drawing=api.createDrawingTransactionAdapter(service);
  const box=api.createBoxTransactionAdapter(service);
  const {svgModel,generatedGeometrySnapshot}=service.getSnapshot().box;
  const ids=new WeakMap(); let serial=0;
  function id(frame) { if (!ids.has(frame)) ids.set(frame,++serial); return ids.get(frame); }
  const frames=[id(service.getHistory().current)];
  service.subscribe(()=>assertCompleteFrame(service.getHistory().current,service.getSnapshot()));
  assert.equal(service.traverse('undo'),null); assert.equal(service.traverse('redo'),null);
  global.gc?.(); const heapStart=process.memoryUsage().heapUsed, start=performance.now();
  for(let i=1;i<=64;i++) {
    const before=service.getSnapshot();
    const result=i%2 ? drawing.transact('Line',doc=>api.appendEntityToActiveSketch(doc,{
      type:'line',id:'L'+i,start:{x:i,y:1},end:{x:i+2,y:3},startPointId:'A'+i,endPointId:'B'+i}))
      : box.transact('Kerf',b=>({...b,projectSettings:{...b.projectSettings,kerfMm:i}}));
    assert.equal(result.outcome,'accepted');
    const after=service.getSnapshot();
    assert.equal(i%2 ? after.box : after.drawingDocument,i%2 ? before.box : before.drawingDocument);
    assert.equal(after.box.svgModel,svgModel); assert.equal(after.box.generatedGeometrySnapshot,generatedGeometrySnapshot);
    assert.equal(result.history.undo.length,Math.min(i,30)); assert.equal(result.history.redo.length,0);
    frames.push(id(result.frame));
  }
  const editsMs=performance.now()-start;
  global.gc?.(); const heapDelta=process.memoryUsage().heapUsed-heapStart;
  const traverseStart=performance.now();
  for(let i=64;i>34;i--) {
    assert.equal(service.traverse('undo'),i%2 ? 'drawing' : 'construction');
    assert.equal(id(service.getHistory().current),frames[i-1]);
    assert.equal(service.getHistory().undo.length+service.getHistory().redo.length,30);
  }
  assert.equal(service.traverse('undo'),null);
  for(let i=35;i<=64;i++) {
    assert.equal(service.traverse('redo'),i%2 ? 'drawing' : 'construction');
    assert.equal(id(service.getHistory().current),frames[i]);
  }
  assert.equal(service.traverse('redo'),null);
  const traverseMs=performance.now()-traverseStart;
  t.diagnostic(`64 edits ${editsMs.toFixed(2)} ms, 60 restores ${traverseMs.toFixed(2)} ms, heap delta ${heapDelta} bytes (explicit GC ${!!global.gc})`);
});
