'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { api, harness, production, sources, observeBoxActions, assertCompleteFrame } = require('./project-owner-harness.cjs');
const {importLockHarness} = require('./svg-import-lock-harness.cjs');

test('one frozen root and one synchronous notification per outer action; a no-op retains the root',()=>{
  const owner=api.createGlobalProjectHistory(api.makeEmptyProjectState()), start=owner.getSnapshot(), seen=[];
  const edits=api.projectDrawingActions(owner);
  const unsubscribe=owner.subscribe(()=>seen.push(owner.getSnapshot()));
  edits.transact('one',doc=>({...doc}));
  assert.deepEqual(seen,[owner.getSnapshot()]); assert.equal(seen[0].box,start.box);
  assert.throws(()=>start.box.svgModel.edges.push({}),TypeError);
  assert.throws(()=>seen[0].drawingDocument.sketchOrder.push('rogue'),TypeError);
  edits.transact('identity',doc=>doc); assert.deepEqual(seen,[owner.getSnapshot()]);
  const snapshot=owner.getSnapshot();
  edits.transact('nested', [doc=>({...doc}),doc=>{assert.equal(owner.getSnapshot(),snapshot);return {...doc};}]);
  assert.equal(seen.length,2);
  unsubscribe(); owner.setBoxContext({selectedEdgeId:'edge'}); assert.equal(seen.length,2);
});

test('a failed nested action rejects the complete outer candidate and retains both modules',()=>{
  const owner=api.createGlobalProjectHistory(api.makeEmptyProjectState()), start=owner.getSnapshot(), tape=owner.getHistory();
  let publications=0; owner.subscribe(()=>publications++);
  const result=api.projectDrawingActions(owner).transact('nested',[doc=>({...doc}),[()=>{throw Error('inner');}]]);
  assert.equal(result.outcome,'rejected'); assert.equal(owner.getSnapshot(),start);
  assert.equal(owner.getHistory(),tape); assert.equal(publications,0);
  const box=api.createBoxTransactionAdapter(owner);
  assert.equal(box.transact('select on acceptance',current=>({...current,assignmentTargetConnectionId:'TB1',displayConnectionId:'TB1'})).outcome,'accepted');
  assert.equal(publications,1); assert.equal(owner.getSnapshot().box.displayConnectionId,'TB1');
});

test('same-event Drawing mutations and global Undo/Redo read the owner and preserve all Sketch identities',()=>{
  const owner=api.createGlobalProjectHistory(api.makePopulatedProjectState()), before=owner.getSnapshot(), box=before.box;
  const adapter=api.projectDrawingActions(owner);
  const transact=action=>adapter.transact('Line',action);
  const undo=()=>owner.traverse('undo'), redo=()=>owner.traverse('redo');
  transact(doc=>api.appendEntityToActiveSketch(doc,{id:'new-a',type:'line',start:{x:30,y:20},end:{x:40,y:20},startPointId:'shared-a',endPointId:'shared-b'}));
  transact(doc=>{assert.ok(doc.sketches.alpha.entities['new-a']);return api.appendEntityToActiveSketch(doc,{id:'new-b',type:'line',start:{x:40,y:20},end:{x:50,y:20},startPointId:'shared-b',endPointId:'shared-c'});});
  const after=owner.getSnapshot(); assert.equal(owner.getHistory().undo.length,2);
  assert.equal(after.box,box); assert.equal(after.drawingDocument.sketches.beta,before.drawingDocument.sketches.beta);
  assert.equal(after.drawingDocument.sketchOrder,before.drawingDocument.sketchOrder);
  assert.equal(after.drawingDocument.sketches.alpha.entities['new-b'].startPointId,'shared-b');
  undo(); assert.equal(owner.getSnapshot().drawingDocument.sketches.alpha.entities['new-b'],undefined);
  redo(); assert.equal(owner.getSnapshot().drawingDocument,after.drawingDocument);
  const count=owner.getHistory().undo.length; transact(doc=>doc); assert.equal(owner.getHistory().undo.length,count);
});

test('production BOX global Undo/Redo retains complete stored authority, draft/applied settings, source and 30-transition cap',()=>{
  const {projectOwner:owner,context:c}=harness(); const before=owner.getSnapshot(), expected=structuredClone(before.box); let count=0;
  owner.subscribe(()=>count++);
  c.updateProjectSettings({kerfMm:.55}); assert.equal(count,1);
  assert.equal(owner.getSnapshot().box.generatedGeometrySnapshot,before.box.generatedGeometrySnapshot);
  assert.equal(owner.getSnapshot().box.lastAppliedManufacturingSettings,before.box.lastAppliedManufacturingSettings);
  c.undoLastEdit(); assert.deepEqual(structuredClone(owner.getSnapshot().box),expected);
  assert.equal(owner.getSnapshot().box.svgModel,before.box.svgModel);
  assert.deepEqual(structuredClone(owner.getSnapshot().box.generatedGeometrySnapshot.metadata),expected.generatedGeometrySnapshot.metadata);
  assert.deepEqual(structuredClone(owner.getSnapshot().box.generatedGeometrySnapshot.operations),expected.generatedGeometrySnapshot.operations);
  c.redoLastEdit(); assert.equal(owner.getSnapshot().box.projectSettings.kerfMm,.55);
  assert.equal(owner.getSnapshot().drawingDocument,before.drawingDocument);
  for(let n=0;n<35;n++) c.updateProjectSettings({kerfMm:n/100});
  assert.equal(c.undoStack.length,30); assert.equal(c.redoStack.length,0);
});

test('Panel Manager pending state retains accepted output and TB/S source properties while existing generators derive automatic sizes',()=>{
  const initial=api.makePopulatedProjectState();
  initial.box.connections.TB1.properties.isFingerWidthManual=false;
  initial.box.connections.S1.properties.isSlotLengthManual=false;
  const {projectOwner:owner,context:c}=harness(initial); const before=owner.getSnapshot(); const seen=[];
  owner.subscribe(()=>seen.push(owner.getSnapshot()));
  c.updatePanelThickness('panel-a',5);
  const box=owner.getSnapshot().box;
  assert.equal(seen.length,1); assert.equal(box.panelManager.isApplied,false); assert.equal(box.panelManager.isDirty,true);
  assert.equal(box.generatedGeometrySnapshot,before.box.generatedGeometrySnapshot);
  const expected=api.recalculateAutomaticTBFingerWidths(box.svgModel,box.edgeAssignments,api.recalculateAutomaticSSlotLengths(box.svgModel,box.edgeAssignments,box.connections,box.panelManager),box.panelManager);
  assert.deepEqual(box.connections,expected);
  assert.equal(box.connections,before.box.connections,'compatibility recalculators are identity functions');
  const tbOperation=api.getPanelEdgeOperations(box.svgModel.panels[0],box.edgeAssignments,box.connections,box.panelManager,box.svgModel)[0];
  assert.equal(tbOperation.fingerWidthMm,3*Math.min(5,box.panelManager.panels['panel-b'].thicknessMm));
  assert.equal(api.resolveSSlotLengthMm(box.connections.S1,api.resolveSThickness(box.svgModel,box.edgeAssignments,box.connections.S1,box.panelManager)),15);
  c.applyPanelManager(); assert.equal(c.errorMessage,''); assert.equal(owner.getSnapshot().box.panelManager.isApplied,true);
  assert.equal(seen.length,2,'Apply publishes output, settings and PM together');
  const applied=owner.getSnapshot();
  const final=api.buildFinalGeometry(applied.box.svgModel,applied.box.generatedGeometrySnapshot);
  assert.ok(final.contours.length>0);
  const settings=applied.box.projectSettings;
  assert.ok(api.processManufacturingGeometry(final,settings.kerfMm,settings.slotClearanceMm,settings.profileOffsetMm,settings.selectedProfileOffsetIds,settings.tapClearanceMm).contours.length>0);
  c.undoLastEdit(); assert.equal(owner.getSnapshot().box.panelManager.isApplied,false);
  c.redoLastEdit(); assert.deepEqual(owner.getSnapshot().box.generatedGeometrySnapshot,applied.box.generatedGeometrySnapshot);
});

test('imported SVG Panel Manager rejects unequal TB edges without publishing and accepts matching edges',()=>{
  const initial=api.makePopulatedProjectState();
  const b=initial.box.svgModel.edges.find(edge=>edge.id==='panel-b-edge-2');
  b.end={...b.end,x:b.end.x+20};
  const {projectOwner:owner,context:c}=harness(initial);
  c.updatePanelThickness('panel-a',5);
  const before=owner.getSnapshot(), history=owner.getHistory();
  let publications=0;
  const unsubscribe=owner.subscribe(()=>publications++);
  c.applyPanelManager();
  assert.match(c.errorMessage,/TB1.*incompatible source edge lengths/);
  assert.equal(owner.getSnapshot(),before);
  assert.equal(owner.getHistory(),history);
  assert.equal(publications,0);
  assert.equal(owner.getSnapshot().box.generatedGeometrySnapshot,before.box.generatedGeometrySnapshot);
  unsubscribe();

  const valid=api.makePopulatedProjectState();
  const {projectOwner:validOwner,context:validContext}=harness(valid);
  validContext.updatePanelThickness('panel-a',5);
  validContext.applyPanelManager();
  assert.equal(validContext.errorMessage,'');
  assert.equal(validOwner.getSnapshot().box.panelManager.isApplied,true);
  assert.equal(validOwner.getSnapshot().box.generatedGeometrySnapshot.generatedGeometry.flatMap(item=>item.generatedProfiles??[])
    .filter(profile=>profile.operationId==='operation:TB:TB1').length,2);
});

test('production TB/W/S completion, workflow creation and restoration retain authoring/order without implicit geometry Apply',()=>{
  const {projectOwner:owner,context:c}=harness(); const before=owner.getSnapshot(), generated=before.box.generatedGeometrySnapshot;
  c.finishGroup('TB'); assert.equal(owner.getSnapshot().box.activeTBGroup.isActive,false);
  c.finishGroup('S'); assert.equal(owner.getSnapshot().box.activeSGroup.isActive,false);
  c.finishGroup('W'); assert.equal(owner.getSnapshot().box.activeWallGroup.isActive,false);
  assert.equal(owner.getSnapshot().box.completedWallGroups.at(-1).groupId,'w-current');
  c.startGroup('TB'); assert.equal(owner.getBoxScope().box.activeTBGroup.isActive,true);
  const group=owner.getBoxScope().box.activeTBGroup; assert.ok(owner.getBoxScope().box.connections[group.connectionIds[0]]);
  assert.ok(Number.isFinite(owner.getBoxScope().box.workflowGroupOrder[group.groupId]));
  c.startGroup('S'); assert.equal(owner.getSnapshot().box.activeSGroup.isActive,true);
  assert.equal(owner.getSnapshot().box.generatedGeometrySnapshot,generated);
  c.undoLastEdit(); c.redoLastEdit(); assert.equal(owner.getSnapshot().box.activeSGroup.isActive,true);
});

test('invalid Panel Manager Apply publishes no project change',()=>{
  const initial=api.makePopulatedProjectState(); initial.box.panelManager.panels['panel-a'].thicknessMm=-1;
  const {projectOwner:owner,context:c}=harness(initial); const before=owner.getSnapshot(); let count=0;owner.subscribe(()=>count++);
  c.applyPanelManager(); assert.equal(owner.getSnapshot(),before);assert.equal(count,0);assert.ok(c.errorMessage);assert.equal(c.undoStack.length,0);
});

const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
const eventFor=promise=>({target:{files:[{text:()=>promise}],value:'chosen.svg'}});
function importHarness() {
  const h=harness(); h.context.parseSvgDocument=text=>{if(text==='invalid')throw Error('invalid SVG');return {...api.createInitialBoxState().svgModel,content:text};};
  h.context.formatImportDiagnosticMessage=()=>'';
  return h;
}
test('actual asynchronous import locks synchronously, rejects a second read and preserves Drawing/connections',async()=>{
  const {projectOwner:owner,context:c}=importHarness(); const before=owner.getSnapshot();let count=0;owner.subscribe(()=>count++);
  const pending=deferred();const event=eventFor(pending.promise),job=c.handleImport(event);
  assert.equal(event.target.value,'','input resets before the read settles');
  assert.equal(c.importLock.acquire(),null,'same-turn admission is exclusive before React commits');
  let secondReads=0;
  await c.handleImport({target:{files:[{text:()=>{secondReads++;return Promise.resolve('second');}}],value:'second.svg'}});
  assert.equal(secondReads,0);
  api.projectDrawingActions(owner).transact('Drawing edit',doc=>({...doc,sketchOrder:[...doc.sketchOrder]})); const drawing=owner.getSnapshot().drawingDocument;
  pending.resolve('new SVG');await job; assert.equal(count,2);
  assert.equal(owner.getSnapshot().box.svgModel.content,'new SVG');assert.equal(owner.getSnapshot().drawingDocument,drawing);
  assert.deepEqual(owner.getSnapshot().box.connections,before.box.connections);
  assert.equal(owner.getSnapshot().box.generatedGeometrySnapshot.generatedGeometry.length,0);
  const next=c.importLock.acquire();assert.ok(next,'success releases lock');c.importLock.release(next);
  const stale=deferred(),staleJob=c.handleImport(eventFor(stale.promise));c.updateProjectSettings({kerfMm:0.7});const accepted=owner.getSnapshot();
  stale.resolve('must not replace edit');await staleJob;assert.equal(owner.getSnapshot(),accepted);
});

test('failed imports and callbacks after external Clear/unmount invalidation cannot repopulate state or errors',async()=>{
  const {projectOwner:owner,context:c,lockHarness}=importHarness();
  const late=deferred(),job=c.handleImport(eventFor(late.promise));
  assert.equal(owner.clearProject(),true);
  const cleared=owner.getSnapshot();
  late.resolve('late');await job;assert.equal(owner.getSnapshot(),cleared);assert.equal(c.errorMessage,'');
  assert.ok(owner.navigate('construction'));
  const unmounted=deferred(),unmountedJob=c.handleImport(eventFor(unmounted.promise));lockHarness.unmount();
  const setterCount=lockHarness.setters.length;
  unmounted.reject(Error('late failure'));await unmountedJob;assert.equal(owner.getSnapshot(),cleared);assert.equal(c.errorMessage,'');
  assert.equal(lockHarness.setters.length,setterCount,'no late lock state update');
});

for (const failure of ['read rejection','synchronous read','parse','Panel Manager initialization','diagnostics','publication']) {
  test(`import ${failure} failure preserves the project and both histories, resets input and unlocks`,async()=>{
    const {projectOwner:owner,context:c,lockHarness}=importHarness();
    c.updateProjectSettings({kerfMm:.31});c.updateProjectSettings({kerfMm:.52});c.undoLastEdit();
    const before=owner.getSnapshot(),undo=c.undoStack,redo=c.redoStack;
    const error=Error(`${failure} failed`);
    const event=eventFor(Promise.resolve('valid'));
    if(failure==='read rejection')event.target.files[0].text=()=>Promise.reject(error);
    if(failure==='synchronous read')event.target.files[0].text=()=>{throw error;};
    if(failure==='parse')c.parseSvgDocument=()=>{throw error;};
    if(failure==='Panel Manager initialization')c.createPanelManagerStateFromModel=()=>{throw error;};
    if(failure==='diagnostics')c.formatImportDiagnosticMessage=()=>{throw error;};
    if(failure==='publication')owner.transact=()=>{throw error;};
    await c.handleImport(event);
    assert.equal(owner.getSnapshot(),before);
    assert.equal(c.undoStack,undo);assert.equal(c.redoStack,redo);
    assert.equal(c.errorMessage,error.message);assert.equal(event.target.value,'');
    lockHarness.render();assert.equal(lockHarness.lock.isImporting,false);
    const retry=c.importLock.acquire();assert.ok(retry);c.importLock.release(retry);
  });
}

test('native interaction capture blocks keyboard, pointer, navigation and input before the modal commit; normal events resume',()=>{
  const owner=api.createProjectOwner(),h=importLockHarness(owner),token=h.lock.acquire();
  assert.equal(h.dialog.open,false,'React commit is deliberately deferred');
  let deliveries=0;
  for(const type of ['keydown','keyup','pointerdown','pointerup','pointermove','mousedown','mouseup','mousemove',
    'click','dblclick','contextmenu','wheel','touchstart','touchmove','touchend','beforeinput','input','change','submit',
    'dragstart','dragover','drop','focusin','focusout','drawing:activate-dimension']) {
    const listener=()=>deliveries++;
    h.window.addEventListener(type,listener);
    const event=new Event(type,{cancelable:true});
    assert.equal(h.window.dispatchEvent(event),false,type);
    assert.equal(deliveries,0,type);
    h.window.removeEventListener(type,listener);
  }
  assert.equal(h.lock.acquire(),null);
  h.render();assert.equal(h.lock.isImporting,true);assert.equal(h.dialog.open,true);
  h.lock.release(token);h.render();assert.equal(h.dialog.open,false);assert.equal(h.lock.isImporting,false);
  h.window.addEventListener('keydown',()=>deliveries++);
  assert.equal(h.window.dispatchEvent(new Event('keydown',{cancelable:true})),true);assert.equal(deliveries,1);
  h.unmount();assert.equal(h.lock.acquire(),null);
});

test('stale/rejected import resets input and permits the exact same File to be selected again',async()=>{
  const {projectOwner:owner,context:c,lockHarness}=importHarness();
  const read=deferred(),event=eventFor(read.promise),file=event.target.files[0];
  const job=c.handleImport(event);lockHarness.render();
  owner.setBoxContext({selectedEdgeId:'newer data'});const committed=owner.getSnapshot();
  read.resolve('stale');await job;
  assert.equal(owner.getSnapshot(),committed);assert.equal(event.target.value,'');
  lockHarness.render();assert.equal(lockHarness.lock.isImporting,false);
  file.text=()=>Promise.resolve('retry');event.target.value='chosen.svg';
  await c.handleImport(event);
  assert.equal(owner.getSnapshot().box.svgModel.content,'retry');assert.equal(event.target.value,'');
});

test('publication refusal leaves history/project unchanged and releases the lock',async()=>{
  const {projectOwner:owner,context:c}=importHarness();const before=owner.getSnapshot();
  owner.transact=()=>({outcome:'rejected'});
  const event=eventFor(Promise.resolve('rejected'));
  await c.handleImport(event);assert.equal(owner.getSnapshot(),before);assert.equal(event.target.value,'');
  const retry=c.importLock.acquire();assert.ok(retry);c.importLock.release(retry);
});

test('lock stays active through coherent publication and Panel Manager/history transitions',async()=>{
  const {projectOwner:owner,context:c}=importHarness();
  c.parseSvgDocument=()=>({...api.createInitialBoxState().svgModel,panels:[{...owner.getSnapshot().box.svgModel.panels[0],id:'imported-panel'}]});
  const original=c.createPanelManagerStateFromModel;
  c.createPanelManagerStateFromModel=model=>{assert.equal(c.importLock.acquire(),null);return original(model);};
  owner.subscribe(()=>assert.equal(c.importLock.acquire(),null,'publication is locked'));
  for(const name of ['setCanvasViewBox','setActivePanelId','setActiveHoleId','setIsPanelManagerModalOpen',
    'setActiveTool','setUndoStack','setRedoStack','setExpandedTBGroups','setExpandedSGroups','setErrorMessage']) {
    const setter=c[name];c[name]=value=>{assert.equal(c.importLock.acquire(),null,name);setter(value);};
  }
  await c.handleImport(eventFor(Promise.resolve('panel')));
  assert.equal(c.isPanelManagerModalOpen,true);assert.ok(owner.getSnapshot().box.panelManager.panels['imported-panel']);
  assert.equal(c.undoStack.length,1);assert.equal(c.redoStack.length,0);
  const next=c.importLock.acquire();assert.ok(next);c.importLock.release(next);
});

test('old release cannot unlock a newer import; unmounted successful read cannot publish or set UI state',async()=>{
  const {projectOwner:owner,context:c,lockHarness}=importHarness();
  const old=c.importLock.acquire();c.importLock.release(old);
  const next=c.importLock.acquire();c.importLock.release(old);assert.equal(c.importLock.acquire(),null);
  c.importLock.release(next);
  const read=deferred(),job=c.handleImport(eventFor(read.promise)),before=owner.getSnapshot();
  lockHarness.unmount();const calls=lockHarness.setters.length;
  for(const name of ['setErrorMessage','setUndoStack','setRedoStack','setCanvasViewBox','setIsPanelManagerModalOpen'])
    c[name]=()=>assert.fail(`${name} after unmount`);
  read.resolve('late success');await job;
  assert.equal(owner.getSnapshot(),before);assert.equal(lockHarness.setters.length,calls);
});

test('owner sequence guard still rejects superseded publication, and stale cleanup never clears a later selection',async()=>{
  const {projectOwner:owner,context:c}=importHarness();
  const read=deferred(),event=eventFor(read.promise),job=c.handleImport(event);
  assert.equal(event.target.value,'');
  const newer=owner.beginBoxImport(),before=owner.getSnapshot();
  event.target.value='later selection.svg';
  read.resolve('superseded');await job;
  assert.equal(owner.getSnapshot(),before);assert.equal(event.target.value,'later selection.svg');
  assert.equal(c.boxTransactions.replaceSource(newer,before.box.svgModel,before.box.panelManager).outcome,'accepted','UI cleanup does not invalidate a newer owner token');
  const olderToken=owner.beginBoxImport(),newerToken=owner.beginBoxImport();
  assert.equal(c.boxTransactions.replaceSource(olderToken,before.box.svgModel,before.box.panelManager).outcome,'rejected');
  assert.equal(c.boxTransactions.replaceSource(newerToken,{...before.box.svgModel,content:'replacement'},before.box.panelManager).outcome,'accepted');
});

test('ordinary edits structurally share source/output; no capture/projection/full-project clone in the production hot path',()=>{
  const owner=api.createGlobalProjectHistory(api.makePopulatedProjectState()),before=owner.getSnapshot();
  const nativeClone=global.structuredClone; let clones=0;global.structuredClone=(...args)=>{clones++;return nativeClone(...args);};
  try {const edits=api.projectDrawingActions(owner); for(let n=0;n<50;n++) edits.transact('edit',doc=>({...doc}));owner.setBoxContext({selectedEdgeId:'other'});}
  finally {global.structuredClone=nativeClone;}
  assert.equal(clones,0); assert.equal(owner.getSnapshot().box.svgModel,before.box.svgModel);assert.equal(owner.getSnapshot().box.generatedGeometrySnapshot,before.box.generatedGeometrySnapshot);
});

test('App subscriptions and all compatibility setters use the owner; no second writable authoritative React field or sizing effect',()=>{
  const source=fs.readFileSync('src/App.tsx','utf8');
  for(const key of ['drawingDocument',...Object.keys(api.createInitialBoxState()),'generatedGeometryItems','generatedGeometryCompositionModel']) assert.doesNotMatch(source,new RegExp(`const \\[${key},[^\\n]*useState`));
  assert.match(source,/useSyncExternalStore\(projectOwner.subscribe,\s*projectOwner.getPublication/);
  assert.match(source,/ownedDocumentRef=\{drawingTransactions.documentRef\}/);
  assert.doesNotMatch(source,/useEffect\(\(\) => \{\s*setConnections/);
  assert.doesNotMatch(source,/const generatedGeometrySnapshot = useMemo/);
});


test('BOX snapshots and global stack changes are synchronous before another action or render',()=>{
  const {projectOwner:owner,context:c}=harness();
  c.updateProjectSettings({kerfMm:.5});
  c.undoLastEdit();
  assert.equal(owner.getSnapshot().box.projectSettings.kerfMm,.17);
  assert.equal(c.redoStack.at(-1).frame.box.data.projectSettings.kerfMm,.5);
  c.redoLastEdit();
  assert.equal(owner.getSnapshot().box.projectSettings.kerfMm,.5);
  assert.equal(c.undoStack.at(-1).frame.box.data.projectSettings.kerfMm,.17);
});

test('an import remains stale even after restoring the identical old BOX object',()=>{
  const owner=api.createGlobalProjectHistory(); const before=owner.getSnapshot(); const token=owner.beginBoxImport();
  const box=api.createBoxTransactionAdapter(owner); box.transact('change',b=>({...b,projectSettings:{...b.projectSettings,kerfMm:1}})); owner.traverse('undo');
  assert.equal(owner.isCurrentBoxImport(token),false);
  assert.equal(box.replaceSource(token,before.box.svgModel,before.box.panelManager).outcome,'rejected');
  assert.equal(owner.getSnapshot(),before);
});


test('Geometry Apply uses existing generators/authority and retains draft-versus-applied manufacturing stamps',()=>{
  const {projectOwner:owner,context:c}=harness(); const before=owner.getSnapshot();const seen=[];owner.subscribe(()=>seen.push(owner.getSnapshot()));
  c.applyPanelPaths();assert.equal(c.errorMessage,'');assert.equal(seen.length,1);
  const applied=owner.getSnapshot().box;
  assert.deepEqual(structuredClone(applied.lastAppliedManufacturingSettings),before.box.projectSettings);
  assert.equal(applied.generatedGeometrySnapshot.metadata.panelCompositionModel,'relationship-composed-mixed-v1');
  const final=api.buildFinalGeometry(applied.svgModel,applied.generatedGeometrySnapshot);
  assert.ok(final.contours.length>0);
  const snapshot=owner.getSnapshot();
  c.selectGeneratedGeometryAuthority=()=>({ok:false,blockingDecisions:[{reason:'rejected'}]});
  c.applyPanelPaths();assert.equal(owner.getSnapshot(),snapshot);assert.match(c.errorMessage,/rejected/);assert.equal(seen.length,1);
});

test('PM authority rejection preserves both global stacks, connections, flags and accepted output',()=>{
  const {projectOwner:owner,context:c}=harness();
  c.updateProjectSettings({kerfMm:.24});c.updateProjectSettings({kerfMm:.31});c.undoLastEdit();
  c.updatePanelThickness('panel-a',4);
  c.updateProjectSettings({kerfMm:.31});c.undoLastEdit();
  const before=owner.getSnapshot(),undo=c.undoStack,redo=c.redoStack;
  let count=0;owner.subscribe(()=>count++);
  // Exercise the previous write-before-authority defect even if today's sizing
  // compatibility helper returns its input. All geometry builders still run.
  c.recalculateAutomaticTBFingerWidths=(model,assignments,connections)=>({...connections});
  c.selectGeneratedGeometryAuthority=()=>({ok:false,blockingDecisions:[{reason:'blocked'}]});
  c.applyPanelManager();
  assert.match(c.errorMessage,/blocked/);assert.equal(c.undoStack,undo);assert.equal(c.redoStack,redo);
  assert.equal(count,0);assert.equal(owner.getSnapshot(),before);
  assert.equal(owner.getSnapshot().box.panelManager,before.box.panelManager);
  assert.equal(owner.getSnapshot().box.generatedGeometrySnapshot,before.box.generatedGeometrySnapshot);
  c.redoLastEdit();assert.equal(owner.getSnapshot().box.projectSettings.kerfMm,.31);
});

test('production BOX restore preserves every composition marker, including an absent legacy marker, and snapshot metadata verbatim',()=>{
  for(const marker of [undefined,'legacy','relationship-composed-single-tool-v1','relationship-composed-mixed-v1']){
    const initial=api.makePopulatedProjectState();
    if(marker===undefined) delete initial.box.generatedGeometrySnapshot.metadata.panelCompositionModel;
    else initial.box.generatedGeometrySnapshot.metadata.panelCompositionModel=marker;
    const {projectOwner:owner,context:c}=harness(initial);
    const snapshot=structuredClone(owner.getSnapshot().box.generatedGeometrySnapshot);
    c.updateProjectSettings({kerfMm:.9});c.undoLastEdit();
    assert.deepEqual(structuredClone(owner.getSnapshot().box.generatedGeometrySnapshot),snapshot);
    assert.equal(Object.hasOwn(owner.getSnapshot().box.generatedGeometrySnapshot.metadata,'panelCompositionModel'),marker!==undefined);
  }
});


test('BOX global capture preserves an explicit empty assignment target for assignment context',()=>{
  const initial=api.makePopulatedProjectState();initial.box.assignmentTargetConnectionId=null;
  const {projectOwner:owner,context:c}=harness(initial);
  assert.equal(owner.getHistory().current.box.context.assignmentTargetConnectionId,null);
  c.updateProjectSettings({kerfMm:.8});c.undoLastEdit();
  assert.equal(owner.getSnapshot().box.assignmentTargetConnectionId,null);
  assert.equal(owner.getSnapshot().box.displayConnectionId,initial.box.displayConnectionId);
});

test('source replacement frames retain complete parsed source, reset dependent data, and traverse without replay', async () => {
  const {projectOwner: owner, context: c} = importHarness();
  c.updateProjectSettings({kerfMm:.28}); c.updateProjectSettings({kerfMm:.39}); c.undoLastEdit();
  assert.ok(c.undoStack.length && c.redoStack.length);
  const before = owner.getSnapshot();
  const imported = structuredClone(before.box.svgModel);
  imported.content = imported.content.replace('original source', 'replacement source');
  imported.innerMarkup = imported.innerMarkup.replace('original source', 'replacement source');
  c.parseSvgDocument = text => { assert.equal(text, imported.content); return imported; };
  const results = observeBoxActions(c);
  await c.handleImport(eventFor(Promise.resolve(imported.content)));
  assert.equal(results.length, 1);
  const result = results[0], after = owner.getSnapshot();
  assert.equal(result.outcome, 'accepted'); assert.equal(result.history.undo.length, 2);
  assertCompleteFrame(result.history.undo.at(-1).frame, before); assertCompleteFrame(result.frame, after);
  assert.equal(after.drawingDocument, before.drawingDocument);
  assert.equal(after.box.connections, before.box.connections);
  assert.deepEqual(after.box.svgModel, imported);
  assert.deepEqual(after.box.panelManager, api.createPanelManagerStateFromModel(imported));
  const empty = api.createInitialBoxState();
  for (const key of Object.keys(empty)) {
    if (!['connections','svgModel','panelManager','generatedGeometrySnapshot'].includes(key)) assert.deepEqual(after.box[key], empty[key], key);
  }
  assert.deepEqual(after.box.generatedGeometrySnapshot.generatedGeometry, []);
  assert.equal(c.undoStack.length, 2); assert.equal(c.redoStack.length, 0);

  c.undoLastEdit();
  assertCompleteFrame(owner.getHistory().current, before);
  assert.ok(owner.getSnapshot().box.generatedGeometrySnapshot.operations.length);
  c.redoLastEdit();
  assertCompleteFrame(owner.getHistory().current, after);
  assert.equal(owner.getSnapshot(), after);
});

test('pending edits use frozen subtrees through global Undo; normalized no-ops keep Redo and original frames', () => {
  const {projectOwner: owner, context: c} = harness();
  const results = observeBoxActions(c), before = owner.getSnapshot();
  let clones = 0, snapshotCalls = 0;
  const nativeClone = global.structuredClone;
  const countClone = value => { clones++; return nativeClone(value); };
  global.structuredClone = c.structuredClone = countClone;
  c.createGeneratedGeometrySnapshot = () => { snapshotCalls++; throw Error('unexpected regeneration'); };
  try {
    c.updatePanelThickness('panel-a', before.box.panelManager.panels['panel-a'].thicknessMm);
    assert.equal(results.at(-1).outcome, 'noop'); assert.equal(owner.getSnapshot(), before);
    c.acceptDefaultPanelThickness();
    const pending = owner.getSnapshot();
    assert.equal(pending.box.panelManager.isApplied, false); assert.equal(pending.box.panelManager.isDirty, true);
    assert.ok(Object.values(pending.box.panelManager.panels).every(panel => panel.thicknessMm === 3.2));
    c.acceptDefaultPanelThickness();
    assert.equal(results.at(-1).outcome, 'noop'); assert.equal(owner.getSnapshot(), pending);
    assert.equal(c.undoStack.length, 1);
    for (let n = 1; n <= 50; n++) {
      const baseline = owner.getSnapshot();
      c.updateProjectSettings({kerfMm:n});
      const result = results.at(-1), next = owner.getSnapshot();
      assert.equal(result.history.undo.length, Math.min(n+1,30)); assert.equal(result.history.redo.length, 0);
      assertCompleteFrame(result.history.undo.at(-1).frame, baseline); assertCompleteFrame(result.frame, next);
      assert.equal(next.box.svgModel, before.box.svgModel); assert.equal(next.drawingDocument, before.drawingDocument);
      assert.equal(next.box.generatedGeometrySnapshot, before.box.generatedGeometrySnapshot);
      assert.equal(next.box.lastAppliedManufacturingSettings, before.box.lastAppliedManufacturingSettings);
      assert.equal(c.undoStack.at(-1).frame.box.data.generatedGeometrySnapshot, before.box.generatedGeometrySnapshot);
      assert.equal(c.undoStack.at(-1).frame.box.data.svgModel, before.box.svgModel);
    }
    assert.equal(c.undoStack.length, 30);
    assert.equal(clones, 0); assert.equal(snapshotCalls, 0);
  } finally { global.structuredClone = c.structuredClone = nativeClone; }
  c.undoLastEdit();
  const restored = owner.getSnapshot(), ids = restored.box.projectSettings.selectedProfileOffsetIds;
  const undo = c.undoStack, redo = c.redoStack;
  c.updateProjectSettings({ selectedProfileOffsetIds:[...ids,...ids,'ordinary-source-edge:invalid'] });
  assert.equal(results.at(-1).outcome,'noop'); assert.equal(owner.getSnapshot(), restored);
  assert.equal(c.undoStack,undo); assert.equal(c.redoStack,redo);
  c.updateProjectSettings({ selectedProfileOffsetIds:[] });
  assertCompleteFrame(results.at(-1).history.undo.at(-1).frame, restored);
  assert.deepEqual(owner.getSnapshot().box.projectSettings.selectedProfileOffsetIds, []);
  c.toggleProfileOffsetProfile(ids[0]); c.toggleProfileOffsetProfile('second-generated-profile');
  assert.deepEqual(owner.getSnapshot().box.projectSettings.selectedProfileOffsetIds, [ids[0], 'second-generated-profile']);
  c.toggleProfileOffsetProfile(ids[0]);
  assert.deepEqual(owner.getSnapshot().box.projectSettings.selectedProfileOffsetIds, ['second-generated-profile']);
});

test('manufacturing navigation preserves Redo and records workflow order with an accepted edit', () => {
  const initial = api.makePopulatedProjectState(); delete initial.box.workflowGroupOrder.manufacturing;
  const {context:c, projectOwner:owner} = harness(initial);
  c.updateProjectSettings({kerfMm:0.7}); c.undoLastEdit();
  const before = owner.getSnapshot(), tape=owner.getHistory();
  c.openManufacturing(); c.openManufacturing();
  assert.equal(c.activeTool,'manufacturing'); assert.ok(!owner.getSnapshot().chronology.some(e => e.kind === 'manufacturing'));
  assert.equal(owner.getHistory(),tape); assert.equal(owner.getSnapshot(),before);
  c.updateProjectSettings({kerfMm:0.8});
  assert.equal(owner.getSnapshot().box.workflowGroupOrder.manufacturing,5);
  assert.equal(c.undoStack.length,1); assert.equal(c.redoStack.length,0);
});

test('Apply stages one selected snapshot; late snapshot failure keeps both histories and the prior settings stamp', () => {
  const {context:c, projectOwner:owner} = harness();
  const results = observeBoxActions(c);
  const factory = c.createGeneratedGeometrySnapshot;
  let snapshots = 0;
  c.createGeneratedGeometrySnapshot = input => { snapshots++; return factory(input); };
  c.updatePanelThickness('panel-a', 4);
  let before = owner.getSnapshot();
  c.applyPanelManager();
  assert.equal(snapshots, 1); assert.equal(results.at(-1).history.undo.length,2);
  assertCompleteFrame(results.at(-1).history.undo.at(-1).frame, before);
  assertCompleteFrame(results.at(-1).frame, owner.getSnapshot());
  c.applyPanelPaths(); assert.equal(snapshots, 2);
  assertCompleteFrame(results.at(-1).frame, owner.getSnapshot());
  assert.equal(owner.getSnapshot().box.generatedGeometrySnapshot.metadata.panelCompositionModel,'relationship-composed-mixed-v1');

  c.updateProjectSettings({kerfMm:.41}); c.updateProjectSettings({kerfMm:.52}); c.undoLastEdit();
  before = owner.getSnapshot();
  const undo = c.undoStack, redo = c.redoStack;
  c.createGeneratedGeometrySnapshot = () => { throw Error('snapshot creation failed'); };
  c.applyPanelPaths();
  assert.match(c.errorMessage,/snapshot creation failed/); assert.equal(results.at(-1).outcome,'rejected');
  assert.equal(owner.getSnapshot(), before); assert.equal(c.undoStack,undo); assert.equal(c.redoStack,redo);
});

test('BOX adapter rejects nested, asynchronous, incomplete and stale edits atomically', () => {
  const owner = api.createGlobalProjectHistory(), adapter = api.createBoxTransactionAdapter(owner);
  const before=owner.getSnapshot(), tape=owner.getHistory();
  const edit=box=>({...box,projectSettings:{...box.projectSettings,kerfMm:.75}});
  assert.equal(adapter.transact('outer',box=>{
    assert.equal(adapter.transact('inner',edit).outcome,'rejected'); return edit(box);
  }).outcome,'rejected');
  for(const invalid of [async box=>edit(box),()=>({selectedEdgeId:'incomplete'}),box=>({...box,panelManager:null}),box=>({...box,svgModel:{...box.svgModel,panels:[null]}})]) {
    assert.equal(adapter.transact('invalid',invalid).outcome,'rejected');
    assert.equal(owner.getSnapshot(),before); assert.equal(owner.getHistory(),tape);
  }
  assert.equal(adapter.transact('stale',box=>{
    owner.setBoxContext({displayConnectionId:'intervening'});return edit(box);
  }).outcome,'rejected');
  assert.equal(owner.getSnapshot().box.projectSettings,before.box.projectSettings);
  assert.equal(owner.getHistory().undo,tape.undo);
});
