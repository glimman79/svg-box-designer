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
  service.clearProject(); assert.equal(service.isCurrent(resetAttempt),false);
  assert.notEqual(service.getAttempt().session,resetAttempt.session);
  assert.equal(service.traverse('redo'),null);
});

test('Clear publishes the canonical empty project, empty stacks and fresh session together', t => {
  // The generated-snapshot factory stamps each new baseline with the current time.
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-11-20T12:00:00Z') });
  const service = api.createGlobalProjectHistory(api.makePopulatedProjectState());
  const box = api.createBoxTransactionAdapter(service);
  for (const kerfMm of [1, 2]) {
    box.transact('Kerf', current => ({ ...current, projectSettings: { ...current.projectSettings, kerfMm } }));
  }
  service.navigate('drawing');
  service.navigate('construction');
  service.traverse('undo');
  const before = service.getPublication(), token = service.beginBoxImport();
  assert.equal(before.activeWorkspace, 'drawing');
  assert.equal(before.history.undo.length, 3);
  assert.equal(before.history.redo.length, 1);
  const expected = api.createInitialProjectState();
  let notifications = 0;
  service.subscribe(() => {
    notifications++;
    const { project, history, session, epoch, revision } = service.getPublication();
    assert.equal(service.getPublication().activeWorkspace, 'construction');
    assert.equal(project, service.getSnapshot());
    assert.equal(history, service.getHistory());
    assertCompleteFrame(history.current, project);
    const [fresh] = project.constructionOperations;
    assert.ok(fresh.id && fresh.definitionRevision);
    assert.ok(before.project.constructionOperations.every(op => op.id !== fresh.id));
    assert.deepEqual(project, { ...expected, constructionOperations: [
      { ...expected.constructionOperations[0], id: fresh.id, definitionRevision: fresh.definitionRevision },
    ] });
    assert.deepEqual(history.undo, []);
    assert.deepEqual(history.redo, []);
    assert.notEqual(session, before.session);
    assert.equal(epoch, before.epoch + 1);
    assert.equal(revision, before.revision + 1);
    assert.equal(service.isCurrentBoxImport(token), false);
  });
  assert.equal(service.clearProject(before.session), true);
  assert.equal(service.clearProject(before.session), false, 'late confirmation cannot clear the next session');
  assert.equal(service.traverse('undo'), null);
  assert.equal(service.traverse('redo'), null);
  assert.equal(notifications, 1);
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

test('rapid navigation, context changes and edits use the latest published position', () => {
  const service = api.createGlobalProjectHistory();
  const positions = [];
  service.subscribe(() => positions.push(service.getPublication()));
  const root = service.getSnapshot(), frame = service.getHistory().current;
  for (const destination of ['drawing', 'construction', 'drawing']) assert.ok(service.navigate(destination));
  const undo = () => service.traverse('undo'), redo = () => service.traverse('redo');
  assert.equal(undo(), 'construction');
  const before = service.getPublication();
  const fail = () => assert.fail('same/unsupported workspace settled an interaction');
  assert.equal(service.navigate('construction', fail), false);
  assert.equal(service.navigate('puzzle', fail), false);
  assert.equal(service.getPublication(), before);
  assert.equal(undo(), 'drawing');
  assert.equal(redo(), 'construction');
  assert.equal(redo(), 'drawing');
  assert.deepEqual(positions.map(p => p.activeWorkspace),
    ['drawing','construction','drawing','construction','drawing','construction','drawing']);
  positions.forEach((p, i) => {
    assert.equal(p.project, root); assert.equal(p.history.current, frame); assert.equal(p.revision, i + 1);
  });
  service.setBoxContext({ displayConnectionId: 'TB1' });
  const context = service.getPublication();
  assert.equal(undo(), 'construction');
  assert.equal(service.getSnapshot(), context.project);
  assert.equal(service.getHistory().current, context.history.current);
  assert.equal(redo(), 'drawing');
  assert.equal(service.getSnapshot(), context.project);
  assert.equal(undo(), 'construction');
  assert.ok(service.navigate('drawing'));
  assert.equal(redo(), null);
  const drawing = api.createDrawingTransactionAdapter(service);
  assert.equal(drawing.transact('Line', doc => api.appendEntityToActiveSketch(doc, {
    type:'line', id:'L', start:{x:0,y:0}, end:{x:1,y:1}, startPointId:'A', endPointId:'B',
  })).outcome, 'accepted');
  assert.equal(undo(), 'drawing');
  assert.equal(service.getSnapshot(), context.project);
  assert.equal(undo(), 'construction');
});

test('navigation and traversal share large project data at full capacity', t => {
  const initial = api.makePopulatedProjectState();
  initial.box.svgModel.content += '<!--' + 'x'.repeat(2 * 1024 * 1024) + '-->';
  const sample = initial.box.generatedGeometrySnapshot;
  initial.box.generatedGeometrySnapshot = { ...sample, generatedGeometry:
    Array.from({length:5000}, (_,i) => ({...sample.generatedGeometry[0], id:String(i)})) };
  const measured = api.createGlobalProjectHistory(initial);
  const { project, history } = measured.getPublication();
  global.gc?.();
  const heap = process.memoryUsage().heapUsed, start = performance.now();
  for (let i = 0; i < 10000; i++) measured.navigate(i % 2 ? 'construction' : 'drawing');
  const navigationMs = performance.now() - start;
  global.gc?.();
  const retained = process.memoryUsage().heapUsed - heap;
  assert.equal(measured.getHistory().undo.length, 30);
  const frame = measured.getHistory().current;
  assert.equal(frame, history.current);
  const traversing = performance.now();
  for (const direction of ['undo', 'redo']) {
    for (let i = 0; i < 30; i++) {
      assert.equal(measured.traverse(direction), i % 2 === 0 ? 'drawing' : 'construction');
      assert.equal(measured.getSnapshot(), project);
      assert.equal(measured.getHistory().current, frame);
      assert.equal(measured.getHistory().undo.length + measured.getHistory().redo.length, 30);
    }
    assert.equal(measured.traverse(direction), null);
  }
  t.diagnostic(`10000 switches ${navigationMs.toFixed(2)} ms, 60 traversals ${(performance.now()-traversing).toFixed(2)} ms, retained heap delta ${retained} bytes (explicit GC ${!!global.gc})`);
});

test('default bootstrap and pre-C.2 populated Drawing bind complete current Sketches in stored order', () => {
  const fresh = api.createGlobalProjectHistory();
  const [initial] = api.readSketchDefinitions(fresh.getSnapshot());
  assert.equal(fresh.getHistory().undo.length, 0);
  assert.equal(fresh.getSnapshot().constructionOperations.length, 1);
  assert.equal(initial.operation.sketchId, 'sketch-1');
  assert.ok(initial.operation.id && initial.operation.definitionRevision);
  assert.equal(initial.sketch, fresh.getSnapshot().drawingDocument.sketches['sketch-1']);

  const { drawingDocument, box } = api.makePopulatedProjectState();
  const before = structuredClone(drawingDocument);
  const service = api.createGlobalProjectHistory({ drawingDocument, box });
  const project = service.getSnapshot();
  assert.deepEqual(project.drawingDocument, before);
  assert.equal(project.drawingDocument, drawingDocument);
  assert.deepEqual(service.getHistory().undo, []);
  const definitions = api.readSketchDefinitions(project);
  assert.deepEqual(definitions.map(d => d.operation.sketchId), ['beta', 'alpha']);
  assert.equal(new Set(definitions.map(d => d.operation.id)).size, 2);
  for (const { operation, sketch } of definitions) {
    assert.equal(sketch, drawingDocument.sketches[operation.sketchId]);
    assert.equal(operation.kind, 'sketch');
    assert.equal(operation.module, 'drawing');
    assert.equal(operation.kindVersion, 1);
  }
  const existing = JSON.parse(JSON.stringify(project));
  assert.deepEqual(api.createGlobalProjectHistory(existing).getSnapshot().constructionOperations, project.constructionOperations);
});

test('bootstrap refuses incomplete indexing and unknown or inconsistent supplied operations', () => {
  assert.throws(() => api.createGlobalProjectHistory(null), TypeError);
  const { drawingDocument, box, constructionOperations } = api.makePopulatedProjectState();
  for (const order of [['alpha'], ['alpha', 'alpha'], ['alpha', 'other']]) {
    assert.throws(() => api.createGlobalProjectHistory({ drawingDocument: { ...drawingDocument, sketchOrder: order }, box }));
  }
  for (const patch of [{ kind: 'future' }, { kindVersion: 2 }, { id: constructionOperations[1].id }, { sketchId: 'missing' }]) {
    assert.throws(() => api.createGlobalProjectHistory({ drawingDocument, box,
      constructionOperations: [{ ...constructionOperations[0], ...patch }, constructionOperations[1]] }));
  }
  assert.throws(() => api.createGlobalProjectHistory({ drawingDocument, box, constructionOperations: [] }));
  assert.throws(() => api.createGlobalProjectHistory({ drawingDocument: { ...drawingDocument, schemaVersion: 1 }, box }));
});

test('Undo restores a removed lifetime and recreating the same local Sketch ID allocates a new one', () => {
  const owner = api.createGlobalProjectHistory(api.makePopulatedProjectState());
  const edit = api.createDrawingTransactionAdapter(owner);
  const start = owner.getSnapshot(), [beta, alpha] = start.constructionOperations;
  const remove = doc => {
    const { beta: removed, ...sketches } = doc.sketches;
    return { ...doc, sketches, sketchOrder: ['alpha'] };
  };
  assert.equal(edit.transact('Remove Sketch', remove).outcome, 'accepted');
  assert.deepEqual(owner.getSnapshot().constructionOperations, [alpha]);
  owner.traverse('undo');
  assert.equal(owner.getSnapshot(), start);
  owner.traverse('redo');
  const recreate = doc => ({ ...doc, sketches: { ...doc.sketches, beta: start.drawingDocument.sketches.beta },
    sketchOrder: [...doc.sketchOrder, 'beta'] });
  assert.equal(edit.transact('Create Sketch', recreate).outcome, 'accepted');
  const [survivor, replacement] = owner.getSnapshot().constructionOperations;
  assert.equal(survivor, alpha);
  assert.equal(replacement.sketchId, beta.sketchId);
  assert.notEqual(replacement.id, beta.id);
  owner.traverse('undo');
  assert.equal(edit.transact('Create Sketch on new branch', recreate).outcome, 'accepted');
  assert.notEqual(owner.getSnapshot().constructionOperations[1].id, replacement.id);
});

test('current definitions have no tape quota and untouched Sketches retain their operation objects', () => {
  const { drawingDocument: doc, box } = api.makePopulatedProjectState();
  const order = Array.from({ length: 260 }, (_, i) => 'sketch-' + i);
  const sketches = Object.fromEntries(order.map(id => [id, { ...doc.sketches.alpha, id }]));
  const owner = api.createGlobalProjectHistory({ drawingDocument: { ...doc, sketches, sketchOrder: order, activeSketchId: order[0] }, box });
  const initial = owner.getSnapshot().constructionOperations;
  const adapter = api.createDrawingTransactionAdapter(owner);
  for (let i = 0; i < 36; i++) {
    const result = adapter.transact('Line', doc => api.appendEntityToActiveSketch(doc, {
      id: 'L' + i, type: 'line', start: { x: 0, y: i }, end: { x: 10, y: i }, startPointId: 'a' + i, endPointId: 'b' + i,
    }));
    assert.equal(result.outcome, 'accepted');
  }
  assert.equal(owner.getHistory().undo.length, 30);
  const final = owner.getSnapshot().constructionOperations;
  assert.deepEqual(final.map(op => op.id), initial.map(op => op.id));
  assert.notEqual(final[0].definitionRevision, initial[0].definitionRevision);
  for (let i = 1; i < final.length; i++) assert.equal(final[i], initial[i]);
  for (const workspace of ['drawing', 'construction', 'drawing']) assert.ok(owner.navigate(workspace));
  for (const direction of ['undo', 'undo', 'redo', 'redo']) {
    owner.traverse(direction);
    assert.equal(owner.getSnapshot().constructionOperations, final);
  }
});

test('rejected publication, invalid Sketch changes and direct operation writes preserve the Redo branch', () => {
  const owner = api.createGlobalProjectHistory();
  const adapter = api.createDrawingTransactionAdapter(owner);
  const rename = doc => ({ ...doc, sketches: { ...doc.sketches,
    [doc.activeSketchId]: { ...doc.sketches[doc.activeSketchId], name: 'Edited' } } });
  assert.equal(adapter.transact('Rename', rename).outcome, 'accepted');
  owner.traverse('undo');
  const position = owner.getPublication();
  let notifications = 0;
  owner.subscribe(() => notifications++);
  assert.equal(adapter.transact('Same document', doc => doc).outcome, 'noop');
  assert.equal(adapter.transact('Missing order', doc => ({ ...doc, sketchOrder: [] })).outcome, 'rejected');
  assert.equal(owner.transact('drawing', 'Expired attempt', tx => {
    tx.update(frame => ({ ...frame, drawingDocument: rename(frame.drawingDocument) }));
    return 'accept';
  }, () => false).outcome, 'rejected');
  assert.equal(owner.transact('drawing', 'Replace lifetime', tx => {
    tx.update(frame => ({ ...frame, constructionOperations: [] }));
    return 'accept';
  }).outcome, 'rejected');
  assert.equal(owner.getPublication(), position);
  assert.equal(notifications, 0);
  assert.equal(owner.getHistory().redo.length, 1);
});
