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
  assert.equal(api.projectDrawingActions(service).transact('invalid',doc=>({...doc,activeSketchId:'absent'})).outcome,'rejected');
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
    assert.equal(service.getPublication().activeWorkspace, 'drawing');
    assert.equal(service.getPublication().editingSketchId, null);
    assert.equal(project, service.getSnapshot());
    assert.equal(history, service.getHistory());
    assertCompleteFrame(history.current, project);
    assert.deepEqual(project.constructionOperations, []);
    assert.deepEqual(project, expected);
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
  const service=api.createGlobalProjectHistory(initial), drawing=api.projectDrawingActions(service);
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
  const service = api.createGlobalProjectHistory(api.makeEmptyProjectState());
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
  const drawing = api.projectDrawingActions(service);
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
  assert.deepEqual(api.readSketchDefinitions(fresh.getSnapshot()), []);
  assert.equal(fresh.getHistory().undo.length, 0);
  assert.equal(fresh.getSnapshot().drawingDocument.activeSketchId, null);

  const legacy = api.makeEmptyProjectState();
  const retained = api.createGlobalProjectHistory(legacy);
  retained.navigate('drawing');
  assert.equal(retained.getPublication().editingSketchId,null);
  assert.ok(retained.openSketch('sketch-1'));
  retained.finishSketch();
  assert.equal(retained.getSnapshot().constructionOperations[0],legacy.constructionOperations[0]);
  assert.equal(retained.getSnapshot().drawingDocument.sketches['sketch-1'],legacy.drawingDocument.sketches['sketch-1']);

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
  const edit = api.projectDrawingActions(owner);
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
  const adapter = api.projectDrawingActions(owner);
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
  const owner = api.createGlobalProjectHistory(api.makeEmptyProjectState());
  const adapter = api.projectDrawingActions(owner);
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

test('Sketch creation, edits and navigation restore exact frames while session changes preserve history', () => {
  const owner = api.createGlobalProjectHistory();
  const position = owner.getPublication;
  const project = owner.getSnapshot;
  const line = doc => api.appendEntityToActiveSketch(doc, {
    id:'member', type:'line', start:{x:0,y:0}, end:{x:12,y:3}, startPointId:'a', endPointId:'b',
  });
  const circle = doc => api.appendCircleToActiveSketch(doc, {id:'member', type:'circle', center:{x:4,y:6},radius:3});
  const initial = project();
  assert.equal(owner.newSketch(), false);
  assert.ok(owner.navigate('drawing'));
  const neutral = api.createDrawingTransactionAdapter(owner);
  assert.equal(neutral.transact('Line',line).outcome,'rejected');
  const published = [];
  owner.subscribe(() => published.push(position()));
  assert.ok(owner.newSketch());
  const a = position().editingSketchId;
  const first = project();
  assert.equal(published.length,1);
  assert.equal(published[0].editingSketchId,a);
  assert.equal(owner.getHistory().undo.length,2);
  const editA = api.createDrawingTransactionAdapter(owner);
  assert.equal(editA.transact('Line',line).outcome,'accepted');
  const withLine = project();
  assert.ok(owner.finishSketch());
  assert.equal(project(),withLine);
  assert.ok(owner.newSketch());
  const b = position().editingSketchId;
  const second = project();
  assert.notEqual(a,b);
  assert.notEqual(second.constructionOperations[0].id,second.constructionOperations[1].id);
  assert.deepEqual(second.drawingDocument.sketchOrder,[a,b]);
  assert.deepEqual(second.drawingDocument.sketches[b].entities,{});
  assert.equal(second.drawingDocument.sketches[a],withLine.drawingDocument.sketches[a]);
  assert.equal(editA.transact('stale',line).outcome,'rejected');
  const editB = api.createDrawingTransactionAdapter(owner);
  assert.equal(editB.transact('foreign member',doc => ({...doc,sketches:{...doc.sketches,
    [a]:{...doc.sketches[a],name:'Wrong target'}}})).outcome,'noop');
  assert.equal(project(),second);
  assert.equal(editB.transact('Circle',circle).outcome,'accepted');
  const complete = project();
  assert.equal(complete.constructionOperations[0],withLine.constructionOperations[0]);
  owner.traverse('undo');
  const redoPosition = position();
  assert.equal(owner.navigate('construction',() => assert.fail('settled blocked navigation')),false);
  assert.equal(owner.openSketch(a),false);
  assert.equal(owner.newSketch(),false);
  assert.equal(owner.isCurrentBoxImport(owner.beginBoxImport()),false);
  assert.equal(position(),redoPosition);
  owner.traverse('redo');
  assert.ok(owner.finishSketch());
  const history = owner.getHistory();
  assert.equal(owner.openSketch('missing'),false);
  assert.ok(owner.openSketch(a));
  assert.equal(project(),complete);
  assert.equal(owner.getHistory(),history);
  const reopened = api.createDrawingTransactionAdapter(owner);
  assert.equal(reopened.documentRef.current.activeSketchId,a);
  assert.equal(editA.transact('expired session',line).outcome,'rejected');
  assert.equal(reopened.transact('Edit Sketch 1',doc => ({...doc, sketches:{...doc.sketches,
    [a]:{...doc.sketches[a], name:'Renamed'}}})).outcome,'accepted');
  const renamed = project();
  assert.equal(renamed.constructionOperations[0].id,first.constructionOperations[0].id);
  assert.notEqual(renamed.constructionOperations[0].definitionRevision,complete.constructionOperations[0].definitionRevision);
  assert.equal(renamed.constructionOperations[1],complete.constructionOperations[1]);
  assert.ok(owner.finishSketch());
  assert.ok(owner.navigate('construction'));
  const frames = [initial, initial, first, withLine, second, complete, renamed, renamed];
  for (let i=frames.length-2;i>=0;i--) {
    assert.ok(owner.traverse('undo'));
    assert.equal(project(),frames[i]);
    assert.equal(owner.getHistory().current.drawingDocument,frames[i].drawingDocument);
    assert.equal(position().editingSketchId,null);
  }
  for (const frame of frames.slice(1)) {
    assert.ok(owner.traverse('redo'));
    assert.equal(project(),frame);
    assert.equal(owner.getHistory().current.constructionOperations,frame.constructionOperations);
  }
  assert.equal(owner.traverse('undo'),'drawing');
  assert.ok(owner.openSketch(b));
  assert.equal(owner.traverse('redo'),'construction');
  assert.equal(position().editingSketchId,null);
});

test('Undo creation invalidates editing, a branch gets new identities, and V2 reopen preserves legacy definitions', () => {
  const seed = api.makePopulatedProjectState();
  const owner = api.createGlobalProjectHistory(seed);
  const original = owner.getSnapshot();
  owner.navigate('drawing');
  for (const id of original.drawingDocument.sketchOrder) {
    assert.ok(owner.openSketch(id));
    assert.equal(api.createDrawingTransactionAdapter(owner).documentRef.current.sketches[id],original.drawingDocument.sketches[id]);
    assert.ok(owner.finishSketch());
    assert.equal(owner.getSnapshot(),original);
    assert.equal(owner.getHistory().undo.length,1);
  }
  owner.newSketch();
  const beforeUndo = owner.getSnapshot();
  const oldId = owner.getPublication().editingSketchId;
  owner.traverse('undo');
  assert.equal(owner.getSnapshot(),original);
  assert.equal(owner.getPublication().editingSketchId,null);
  assert.ok(owner.newSketch());
  const branched = owner.getSnapshot();
  assert.notEqual(owner.getPublication().editingSketchId,oldId);
  assert.notEqual(branched.constructionOperations.at(-1).id,beforeUndo.constructionOperations.at(-1).id);
  assert.equal(owner.traverse('redo'),null);
  assert.ok(owner.clearProject());
  assert.deepEqual(owner.getSnapshot().drawingDocument.sketchOrder,[]);
  assert.deepEqual(owner.getSnapshot().constructionOperations,[]);
  assert.equal(owner.getPublication().editingSketchId,null);
  assert.equal(owner.getPublication().activeWorkspace,'drawing');
});
