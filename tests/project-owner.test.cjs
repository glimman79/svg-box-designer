'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const api = require('../.test-build/project-owner/tests/fixtures/project-owner.js');

// Execute the actual production adapters as well as the store. AST extraction
// excludes rendering/import.meta, and retains every handler's real control flow.
const sources = ['src/App.tsx','src/app/DrawingWorkspace.tsx'].map(path => ts.createSourceFile(path, fs.readFileSync(path,'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX));
function production(name, context, source=sources[0]) {
  let declaration;
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(source)===name) declaration=node;
    ts.forEachChild(node, visit);
  }
  visit(source);
  assert.ok(declaration, `production declaration ${name}`);
  const code=ts.transpile(`const result = ${declaration.initializer.getText(source).replaceAll('import.meta.env.DEV','false')}; result;`, {target:ts.ScriptTarget.ES2022});
  return vm.runInContext(code.replace('const result =','var result ='), context);
}
function harness(initial=api.makePopulatedProjectState()) {
  const projectOwner=api.createProjectOwner(initial);
  const state={undoStack:[],redoStack:[],errorMessage:'',activeTool:'select'};
  const deferredHistory=[];
  const context=vm.createContext({...api, projectOwner, structuredClone, Error,
    defaultConnectionProperties:{TB:{fingerWidthMm:9,isFingerWidthManual:false}},
    defaultProjectSettings:{...api.DEFAULT_PROJECT_SETTINGS,selectedProfileOffsetIds:[]},
    maxHistoryEntries:10, panelCompositionAuthorityMode:'mixed',
    reportAuthorityDownstreamDiagnostics:()=>{},
    formatAuthorityBlockingDecision:(_,d)=>d.reason,
  });
  for(const key of Object.keys(initial.box)) {
    Object.defineProperty(context,key,{get:()=>projectOwner.getSnapshot().box[key],configurable:true});
    context[`set${key[0].toUpperCase()+key.slice(1)}`]=change=>projectOwner.setBoxField(key,change);
  }
  Object.defineProperty(context,'isProjectLocked',{get:()=>!context.panelManager.isApplied});
  Object.defineProperty(context,'generatedGeometryItems',{get:()=>context.generatedGeometrySnapshot.generatedGeometry});
  Object.defineProperty(context,'generatedGeometryCompositionModel',{get:()=>context.generatedGeometrySnapshot.metadata.panelCompositionModel??'legacy'});
  for(const key of ['undoStack','redoStack','errorMessage','activeTool','canvasViewBox','activePanelId','activeHoleId','isPanelManagerModalOpen','expandedTBGroups','expandedSGroups','isClearDialogOpen']) {
    Object.defineProperty(context,key,{get:()=>state[key],configurable:true});
    context[`set${key[0].toUpperCase()+key.slice(1)}`]=change=>{
      const apply=()=>{state[key]=typeof change==='function'?change(state[key]):change;};
      if(state.deferHistory && ['undoStack','redoStack'].includes(key)) deferredHistory.push(apply); else apply();
    };
  }
  context.parseViewBox=()=>({x:0,y:0,width:100,height:100});
  for(const name of ['getNextWorkflowGroupOrderIndex','cloneHistoryState','haveProjectSettingsChanged','getCurrentHistoryState','restoreHistoryState','pushUndoState','undoLastEdit','redoLastEdit','updateProjectSettings','updatePanelThickness','applyPanelManager','applyPanelPaths','selectConnectionForDisplayAndAssignment','startTBGroup','startSGroup','finishTBGroup','finishSGroup','finishWallGroup','clearProject','handleImport']) context[name]=production(name,context);
  return {projectOwner,context,state,flushHistory:()=>{while(deferredHistory.length)deferredHistory.shift()();}};
}

test('one frozen root, synchronous functional updates and subscriptions; no-op retains root without publication',()=>{
  const owner=api.createProjectOwner(); const start=owner.getSnapshot(); const seen=[];
  const unsubscribe=owner.subscribe(()=>seen.push(owner.getSnapshot()));
  owner.setDrawingDocument(current=>({...current,unit:'mm'}));
  assert.equal(seen.length,1); assert.equal(seen[0],owner.getSnapshot());
  assert.equal(owner.getSnapshot().box,start.box);
  assert.throws(()=>{start.box.svgModel.edges.push({});},TypeError);
  assert.throws(()=>{owner.getSnapshot().drawingDocument.sketchOrder.push('rogue');},TypeError);
  const current=owner.getSnapshot(); owner.update(value=>value); assert.equal(owner.getSnapshot(),current);
  owner.batch(()=>{
    owner.setBoxField('projectSettings',s=>({...s,kerfMm:s.kerfMm+1}));
    owner.setBoxField('projectSettings',s=>({...s,kerfMm:s.kerfMm+1}));
    assert.equal(owner.getSnapshot(),current,'unpublished candidate is never exposed');
  });
  assert.equal(seen.length,2); assert.equal(owner.getSnapshot().box.projectSettings.kerfMm,2.15);
  unsubscribe(); owner.setBoxField('selectedEdgeId','edge'); assert.equal(seen.length,2);
});

test('coherent nested batches publish once and exceptions roll back; exact restore survives outer batch',()=>{
  const owner=api.createProjectOwner(); const start=owner.getSnapshot(); let publications=0;
  owner.subscribe(()=>{ publications++; assert.equal(owner.getSnapshot().box.displayConnectionId,'TB1'); });
  assert.throws(()=>owner.batch(()=>{owner.setBoxField('selectedEdgeId','bad');throw Error('rejected');}),/rejected/);
  assert.equal(owner.getSnapshot(),start); assert.equal(publications,0);
  owner.batch(()=>{
    owner.setBoxField('assignmentTargetConnectionId','TB1');
    assert.throws(()=>owner.batch(()=>{owner.setBoxField('selectedEdgeId','rejected');throw Error('inner rejection');}),/inner rejection/);
    owner.batch(()=>owner.setBoxField('displayConnectionId','TB1'));
  });
  assert.equal(owner.getSnapshot().box.selectedEdgeId,null);
  assert.equal(publications,1);
  const connection={id:'TB1',prefix:'TB',properties:{fingerWidthMm:123,isFingerWidthManual:false}};
  owner.batch(()=>owner.batch(()=>owner.setBoxField('connections',{TB1:connection})));
  assert.equal(owner.getSnapshot().box.connections.TB1.properties.fingerWidthMm,123);
});

test('same-event Drawing mutations and production local Undo/Redo read the owner and preserve all Sketch identities',()=>{
  const owner=api.createProjectOwner(api.makePopulatedProjectState()), before=owner.getSnapshot(), box=before.box;
  const c=vm.createContext({...api, documentRef:owner.drawingDocumentRef, historyRef:{current:api.EMPTY_DRAWING_HISTORY},
    setDocument:owner.setDrawingDocument, setHistoryRevision:()=>{},setEditingDimensionId:()=>{},setDimensionEditError:()=>{},setSelectedDimensionId:()=>{},setSelectedGeometry:()=>{},setSelectedGeometricConstraintId:()=>{}});
  const transact=production('transactDocument',c,sources[1]), undo=production('undo',c,sources[1]), redo=production('redo',c,sources[1]);
  transact(doc=>api.appendEntityToActiveSketch(doc,{id:'new-a',type:'line',start:{x:30,y:20},end:{x:40,y:20},startPointId:'shared-a',endPointId:'shared-b'}));
  transact(doc=>{assert.ok(doc.sketches.alpha.entities['new-a']);return api.appendEntityToActiveSketch(doc,{id:'new-b',type:'line',start:{x:40,y:20},end:{x:50,y:20},startPointId:'shared-b',endPointId:'shared-c'});});
  const after=owner.getSnapshot(); assert.equal(c.historyRef.current.undo.length,2);
  assert.equal(after.box,box); assert.equal(after.drawingDocument.sketches.beta,before.drawingDocument.sketches.beta);
  assert.equal(after.drawingDocument.sketchOrder,before.drawingDocument.sketchOrder);
  assert.equal(after.drawingDocument.sketches.alpha.entities['new-b'].startPointId,'shared-b');
  undo(); assert.equal(owner.getSnapshot().drawingDocument.sketches.alpha.entities['new-b'],undefined);
  redo(); assert.equal(owner.getSnapshot().drawingDocument,after.drawingDocument);
  const count=c.historyRef.current.undo.length; transact(doc=>doc); assert.equal(c.historyRef.current.undo.length,count);
});

test('production BOX local Undo/Redo retains complete stored authority, draft/applied settings, source and 10-entry cap',()=>{
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
  for(let n=0;n<15;n++) c.updateProjectSettings({kerfMm:n/100});
  assert.equal(c.undoStack.length,10); assert.equal(c.redoStack.length,0);
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

test('production TB/W/S completion, workflow creation and restoration retain authoring/order without implicit geometry Apply',()=>{
  const {projectOwner:owner,context:c}=harness(); const before=owner.getSnapshot(), generated=before.box.generatedGeometrySnapshot;
  c.finishTBGroup(); assert.equal(owner.getSnapshot().box.activeTBGroup.isActive,false);
  c.finishSGroup(); assert.equal(owner.getSnapshot().box.activeSGroup.isActive,false);
  c.finishWallGroup(); assert.equal(owner.getSnapshot().box.activeWallGroup.isActive,false);
  assert.equal(owner.getSnapshot().box.completedWallGroups.at(-1).groupId,'w-current');
  c.startTBGroup(); assert.equal(owner.getSnapshot().box.activeTBGroup.isActive,true);
  const group=owner.getSnapshot().box.activeTBGroup; assert.ok(owner.getSnapshot().box.connections[group.connectionIds[0]]);
  assert.ok(Number.isFinite(owner.getSnapshot().box.workflowGroupOrder[group.groupId]));
  c.startSGroup(); assert.equal(owner.getSnapshot().box.activeSGroup.isActive,true);
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
test('actual asynchronous import publishes once, preserves Drawing and legacy connections, rejects older/stale results',async()=>{
  const {projectOwner:owner,context:c}=importHarness(); const before=owner.getSnapshot();let count=0;owner.subscribe(()=>count++);
  const older=deferred(),newer=deferred();const oldJob=c.handleImport(eventFor(older.promise)),job=c.handleImport(eventFor(newer.promise));
  owner.setDrawingDocument(doc=>({...doc,sketchOrder:[...doc.sketchOrder]})); const drawing=owner.getSnapshot().drawingDocument;
  newer.resolve('new SVG');await job; assert.equal(count,2);
  assert.equal(owner.getSnapshot().box.svgModel.content,'new SVG');assert.equal(owner.getSnapshot().drawingDocument,drawing);
  assert.deepEqual(owner.getSnapshot().box.connections,before.box.connections);
  assert.equal(owner.getSnapshot().box.generatedGeometrySnapshot.generatedGeometry.length,0);
  older.resolve('old SVG');await oldJob;assert.equal(count,2);assert.equal(owner.getSnapshot().box.svgModel.content,'new SVG');
  const stale=deferred(),staleJob=c.handleImport(eventFor(stale.promise));c.updatePanelThickness('panel-a',7);const accepted=owner.getSnapshot();
  stale.resolve('must not replace edit');await staleJob;assert.equal(owner.getSnapshot(),accepted);
});

test('failed imports and callbacks after Clear/unmount invalidation cannot repopulate state or errors',async()=>{
  const {projectOwner:owner,context:c}=importHarness(); const before=owner.getSnapshot();
  await c.handleImport(eventFor(Promise.resolve('invalid')));assert.equal(owner.getSnapshot(),before);assert.equal(c.errorMessage,'invalid SVG');
  const late=deferred(),job=c.handleImport(eventFor(late.promise)); c.clearProject();const cleared=owner.getSnapshot();
  late.resolve('late');await job;assert.equal(owner.getSnapshot(),cleared);assert.equal(c.errorMessage,'');
  const unmounted=deferred(),unmountedJob=c.handleImport(eventFor(unmounted.promise));owner.invalidateBoxImports();
  unmounted.reject(Error('late failure'));await unmountedJob;assert.equal(owner.getSnapshot(),cleared);assert.equal(c.errorMessage,'');
});

test('ordinary edits structurally share source/output; no capture/projection/full-project clone in the production hot path',()=>{
  const owner=api.createProjectOwner(api.makePopulatedProjectState()),before=owner.getSnapshot();
  const nativeClone=global.structuredClone; let clones=0;global.structuredClone=(...args)=>{clones++;return nativeClone(...args);};
  try {for(let n=0;n<50;n++) owner.setDrawingDocument(doc=>({...doc}));owner.setBoxField('selectedEdgeId','other');}
  finally {global.structuredClone=nativeClone;}
  assert.equal(clones,0); assert.equal(owner.getSnapshot().box.svgModel,before.box.svgModel);assert.equal(owner.getSnapshot().box.generatedGeometrySnapshot,before.box.generatedGeometrySnapshot);
});

test('App subscriptions and all compatibility setters use the owner; no second writable authoritative React field or sizing effect',()=>{
  const source=fs.readFileSync('src/App.tsx','utf8');
  for(const key of ['drawingDocument',...Object.keys(api.createInitialBoxState()),'generatedGeometryItems','generatedGeometryCompositionModel']) assert.doesNotMatch(source,new RegExp(`const \\[${key},[^\\n]*useState`));
  assert.match(source,/useSyncExternalStore\(projectOwner.subscribe, projectOwner.getSnapshot/);
  assert.match(source,/ownedDocumentRef=\{projectOwner.drawingDocumentRef\}/);
  assert.doesNotMatch(source,/useEffect\(\(\) => \{\s*setConnections/);
  assert.doesNotMatch(source,/const generatedGeometrySnapshot = useMemo/);
});


test('BOX snapshots are captured before deferred React stack updaters run',()=>{
  const {projectOwner:owner,context:c,state,flushHistory}=harness();
  c.updateProjectSettings({kerfMm:.5});
  state.deferHistory=true;
  c.undoLastEdit(); flushHistory();
  assert.equal(owner.getSnapshot().box.projectSettings.kerfMm,.17);
  assert.equal(c.redoStack.at(-1).projectSettings.kerfMm,.5);
  c.redoLastEdit(); flushHistory();
  assert.equal(owner.getSnapshot().box.projectSettings.kerfMm,.5);
  assert.equal(c.undoStack.at(-1).projectSettings.kerfMm,.17);
});

test('an import remains stale even after restoring the identical old BOX object',()=>{
  const owner=api.createProjectOwner(); const before=owner.getSnapshot(); const token=owner.beginBoxImport();
  owner.setBoxField('selectedEdgeId','intervening');owner.update(()=>before);
  assert.equal(owner.isCurrentBoxImport(token),false);
  assert.equal(owner.publishBoxImport(token,api.createInitialBoxState()),false);
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

test('PM authority rejection retains its legacy history boundary without partial output',()=>{
  const initial=api.makePopulatedProjectState();initial.box.connections.TB1.properties.isFingerWidthManual=false;
  const {projectOwner:owner,context:c}=harness(initial);const before=owner.getSnapshot();let count=0;owner.subscribe(()=>count++);
  c.selectGeneratedGeometryAuthority=()=>({ok:false,blockingDecisions:[{reason:'blocked'}]});
  c.applyPanelManager();
  assert.match(c.errorMessage,/blocked/);assert.equal(c.undoStack.length,1);
  assert.equal(count,0);assert.equal(owner.getSnapshot(),before);
  assert.equal(owner.getSnapshot().box.panelManager,before.box.panelManager);
  assert.equal(owner.getSnapshot().box.generatedGeometrySnapshot,before.box.generatedGeometrySnapshot);
  c.undoLastEdit();assert.deepEqual(structuredClone(owner.getSnapshot().box.connections),before.box.connections);
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


test('BOX local capture preserves legacy selected-label fallback for assignment context',()=>{
  const initial=api.makePopulatedProjectState();initial.box.assignmentTargetConnectionId=null;
  const {projectOwner:owner,context:c}=harness(initial);
  const frame=c.getCurrentHistoryState();assert.equal(frame.assignmentTargetConnectionId,initial.box.displayConnectionId);
  c.updateProjectSettings({kerfMm:.8});c.undoLastEdit();
  assert.equal(owner.getSnapshot().box.assignmentTargetConnectionId,initial.box.displayConnectionId);
  assert.equal(owner.getSnapshot().box.displayConnectionId,initial.box.displayConnectionId);
});
