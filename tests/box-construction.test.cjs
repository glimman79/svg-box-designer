'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { api, harness, production, observeBoxActions, assertCompleteFrame } = require('./project-owner-harness.cjs');
const { undoProjectHistory, redoProjectHistory } = require('../.test-build/project-owner/src/app/projectHistory.js');

const edge = (panel, index) => `panel-${panel}-edge-${index}`;
const edit = (context, id, prefix, updates) => context.updateConnectionProperties(id, { prefix, updates });

function acceptedActions(c, owner) {
  const results = observeBoxActions(c);
  return (label, action) => {
    const before = owner.getSnapshot(), previousUndo = c.undoStack;
    const publications = [];
    const unsubscribe = owner.subscribe(() => {
      publications.push(owner.getSnapshot());
      assert.notEqual(c.undoStack, previousUndo);
      assert.equal(c.undoStack.at(-1).frame.box.data.edgeAssignments, before.box.edgeAssignments);
      assert.equal(c.redoStack.length, 0);
    });
    const count = results.length;
    try { action(); } finally { unsubscribe(); }
    assert.equal(results.length, count + 1, label);
    const result = results.at(-1), after = owner.getSnapshot();
    assert.equal(result.outcome, 'accepted', c.errorMessage);
    assert.deepEqual(publications, [after]);
    assert.equal(c.undoStack.length, Math.min(previousUndo.length + 1, 30));
    assert.equal(result.history.undo.length, c.undoStack.length);
    const entry = result.history.undo.at(-1);
    assert.equal(entry.transaction.module, 'box');
    assert.equal(entry.transaction.label, label);
    assertCompleteFrame(entry.frame, before);
    assertCompleteFrame(result.frame, after);
    const undo = undoProjectHistory(result.history);
    assert.equal(undo.frame, entry.frame);
    assert.equal(redoProjectHistory(undo.history).frame, result.frame);
    assert.equal(after.drawingDocument, before.drawingDocument);
    for (const key of ['svgModel','projectSettings','lastAppliedManufacturingSettings','generatedGeometrySnapshot','panelManager']) {
      assert.equal(after.box[key], before.box[key], key);
    }
    return after.box;
  };
}

for (const tool of ['W', 'S']) {
  test(`${tool}: start, assignment with continuation, property and Finish publish complete frames and restore in one global step each`, () => {
    const initial = api.makePopulatedProjectState();
    const { svgModel, panelManager, generatedGeometrySnapshot } = initial.box;
    initial.box = { ...api.createInitialBoxState(), svgModel, panelManager, generatedGeometrySnapshot };
    const { context: c, projectOwner: owner } = harness(initial);
    const accept = acceptedActions(c, owner), frames = [owner.getSnapshot().box];
    const first = tool + '1', next = tool + '2';
    const activeKey = tool === 'W' ? 'activeWallGroup' : tool === 'S' ? 'activeSGroup' : 'activeTBGroup';
    frames.push(accept(`Start ${tool} group`, () => c.handleToolClick(tool)));
    assert.deepEqual(frames.at(-1)[activeKey].connectionIds, [first]);
    assert.equal(frames.at(-1).workflowGroupOrder[frames.at(-1)[activeKey].groupId], 0);
    frames.push(accept(`Assign edge to ${first}`, () => c.assignSelectedLabelToEdge(edge('a',0))));
    frames.push(accept(`Assign edge to ${first}`, () => c.assignSelectedLabelToEdge(edge('b',0))));
    const complete = frames.at(-1);
    assert.equal(complete.displayConnectionId, first);
    assert.equal(complete.assignmentTargetConnectionId, next);
    assert.deepEqual(complete[activeKey].connectionIds, [first, next]);
    const roles = Object.values(complete.edgeAssignments).map(bucket =>
      tool === 'S' ? bucket.slotAssignments[0].slotRole : bucket.edgeAssignment.edgeRole);
    assert.deepEqual(roles, ['A','B']);
    const patch = tool === 'S' ? {slotOffsetMm:-2} : {fingerWidthMm:17};
    frames.push(accept(`Edit ${first} properties`, () => edit(c, first, tool, patch)));
    const updated = frames.at(-1);
    if (tool === 'S') assert.equal(updated.connections[next].properties.slotOffsetMm, -2);
    else assert.equal(updated.connections[next], complete.connections[next]);
    frames.push(accept(`Finish ${tool} group`, () => c.finishGroup(tool)));
    const finished = frames.at(-1);
    assert.equal(finished.connections[next], undefined);
    assert.equal(finished[activeKey].isActive, false);
    assert.deepEqual(finished[activeKey].connectionIds, [first]);
    if (tool !== 'S') assert.equal(finished[tool === 'W' ? 'completedWallGroups':'completedTBGroups'][0], finished[activeKey]);
    assert.equal(finished.displayConnectionId, null);
    assert.equal(finished.assignmentTargetConnectionId, null);
    assert.equal(finished.selectedEdgeId, null);
    for (const frame of frames.slice(0,-1).reverse()) {
      c.undoLastEdit(); assert.deepEqual(owner.getSnapshot().box, frame);
      assert.equal(owner.getSnapshot().box.generatedGeometrySnapshot, generatedGeometrySnapshot);
    }
    for (const frame of frames.slice(1)) {
      c.redoLastEdit(); assert.deepEqual(owner.getSnapshot().box, frame);
    }
  });
}

test('completed S click creates one additional definition; select, reopen, repeated role and empty removal preserve Redo', () => {
  const {context:c, projectOwner:owner} = harness();
  c.selectConnectionForDisplayAndAssignment('S1');
  const before = owner.getSnapshot().box;
  const accept = acceptedActions(c, owner);
  const after = accept('Continue S1 group', () => c.assignSelectedLabelToEdge(edge('d',3)));
  assert.equal(after.edgeAssignments, before.edgeAssignments);
  assert.deepEqual(after.activeSGroup.connectionIds, ['S1','S2']);
  assert.match(c.errorMessage, /S1 is complete/);
  c.undoLastEdit(); assert.deepEqual(owner.getSnapshot().box, before);
  const redo = c.redoStack, undo = c.undoStack;
  c.selectConnectionForDisplayAndAssignment('S1');
  c.handleToolClick('S'); c.assignSelectedLabelToEdge(edge('a',1));
  c.updateAssignedRole(edge('a',1),'S1','A');
  c.clearEdgeLabel(edge('d',3));
  c.startGroup('S');
  assert.equal(c.undoStack,undo); assert.equal(c.redoStack,redo);
  c.redoLastEdit(); assert.deepEqual(owner.getSnapshot().box,after);
});

test('Remove and role edit address the displayed record within a multi-assignment edge', () => {
  const initial = api.makePopulatedProjectState(), id = edge('b',3);
  initial.box.connections.S2 = { ...initial.box.connections.S1, id:'S2' };
  initial.box.edgeAssignments[id].slotAssignments.push({ connectionId:'S2', slotRole:'B' });
  const { context:c, projectOwner:owner } = harness(initial), accept = acceptedActions(c, owner);
  c.selectConnectionForDisplayAndAssignment('S2');
  const before = owner.getSnapshot().box;
  const changed = accept('Change S2 role', () => c.updateAssignedRole(id,'S2','A'));
  const slots = changed.edgeAssignments[id].slotAssignments;
  assert.equal(slots[0], before.edgeAssignments[id].slotAssignments[0]);
  assert.deepEqual(slots[1], {connectionId:'S2',slotRole:'A'});
  const removed = accept('Remove edge assignment', () => c.clearEdgeLabel(id,'S2'));
  assert.deepEqual(removed.edgeAssignments[id].slotAssignments, [slots[0]]);
  c.undoLastEdit(); assert.deepEqual(owner.getSnapshot().box,changed);
  c.undoLastEdit(); assert.deepEqual(owner.getSnapshot().box,before);
  c.redoLastEdit(); c.redoLastEdit(); assert.deepEqual(owner.getSnapshot().box,removed);
});

test('rejections preserve the exact owner, both global stacks and accepted output on an Undo branch', () => {
  const {context:c, projectOwner:owner} = harness();
  c.updateProjectSettings({kerfMm:.8}); c.undoLastEdit();
  assert.ok(c.redoStack.length);
  function reject(action, message) {
    const before = owner.getSnapshot(), undo = c.undoStack, redo = c.redoStack;
    let count = 0;
    const unsubscribe = owner.subscribe(() => count++);
    try { action(); } finally { unsubscribe(); }
    assert.match(c.errorMessage, message);
    assert.equal(count, 0);
    assert.equal(owner.getSnapshot(), before); assert.equal(c.undoStack, undo); assert.equal(c.redoStack, redo);
  }
  c.selectConnectionForDisplayAndAssignment('W1');
  reject(() => c.assignSelectedLabelToEdge(edge('d',2)), /is complete/);
  reject(() => c.updateAssignedRole(edge('c',0),'W1','B'), /complementary/);
  c.selectConnectionForDisplayAndAssignment('TB1');
  reject(() => edit(c,'TB1','TB',{fingerWidthMm:NaN}), /Invalid fingerWidthMm/);
  reject(() => edit(c,'TB1','TB',{fingerWidthMm:-1}), /Invalid fingerWidthMm/);
  reject(() => edit(c,'TB1','TB',{slotOffsetMm:1}), /Invalid slotOffsetMm/);
  reject(() => edit(c,'S1','S',{slotOffsetMm:1}), /current connection/);
  reject(() => c.assignSelectedLabelToEdge('obsolete-edge'), /current source edge/);
  reject(() => c.assignSelectedLabelToEdge(edge('a',1)), /replacement assignment/);
  c.selectConnectionForDisplayAndAssignment('missing');
  reject(() => c.assignSelectedLabelToEdge(edge('d',1)), /valid connection/);
  c.selectConnectionForDisplayAndAssignment('TB1');
  c.updatePanelThickness('panel-a',7);
  assert.equal(c.redoStack.length,0);
  c.updateProjectSettings({kerfMm:.8}); c.undoLastEdit();
  reject(() => edit(c,'TB1','TB',{fingerWidthMm:7}), /Apply Panel Manager/);
  reject(() => c.finishGroup('TB'), /Apply Panel Manager/);
  c.redoLastEdit(); assert.equal(owner.getSnapshot().box.projectSettings.kerfMm,.8);
});

test('TB rejects a third authored edge; malformed persisted counts fail Apply while one-edge drafts remain valid', () => {
  const initial=api.makePopulatedProjectState();
  const extra='panel-c-edge-1';
  const {context:c,projectOwner:owner}=harness(initial);
  c.selectConnectionForDisplayAndAssignment('TB1');
  const before=owner.getSnapshot(), history=owner.getHistory();
  c.assignSelectedLabelToEdge(extra);
  assert.match(c.errorMessage,/TB_INVALID_EDGE_ASSIGNMENT_COUNT.*TB1/);
  assert.equal(owner.getSnapshot(),before);
  assert.equal(owner.getHistory(),history);

  const malformed=api.makePopulatedProjectState();
  malformed.box.edgeAssignments[extra]={edgeAssignment:{connectionId:'TB1',edgeRole:'A'}};
  assert.throws(()=>api.validateCurrentTBEdgeCompatibility(malformed.box.svgModel,
    malformed.box.edgeAssignments,malformed.box.connections),error=>
    error.code==='TB_INVALID_EDGE_ASSIGNMENT_COUNT'&&error.connectionId==='TB1');
  const {context:badContext,projectOwner:badOwner}=harness(malformed);
  const badBefore=badOwner.getSnapshot();
  badContext.applyPanelPaths();
  assert.match(badContext.errorMessage,/TB_INVALID_EDGE_ASSIGNMENT_COUNT/);
  assert.equal(badOwner.getSnapshot(),badBefore);
  const draft=api.makePopulatedProjectState();
  delete draft.box.edgeAssignments['panel-b-edge-2'];
  assert.doesNotThrow(()=>api.validateCurrentTBEdgeCompatibility(draft.box.svgModel,
    draft.box.edgeAssignments,draft.box.connections));
});

test('Wall second-edge and failed helper roll back complete candidates including automatic W continuation', () => {
  const initial = api.makePopulatedProjectState();
  delete initial.box.edgeAssignments[edge('d',0)];
  const {context:c, projectOwner:owner} = harness(initial);
  c.selectConnectionForDisplayAndAssignment('W1');
  edit(c,'W1','W',{fingerWidthMm:8}); c.undoLastEdit();
  const before = owner.getSnapshot(), redo = c.redoStack, undo = c.undoStack;
  c.assignSelectedLabelToEdge(edge('c',1));
  assert.match(c.errorMessage, /two panels/);
  assert.equal(owner.getSnapshot(),before); assert.equal(c.undoStack,undo); assert.equal(c.redoStack,redo);
  const prepare = c.assignConstructionEdge;
  c.assignConstructionEdge = (...args) => {
    const candidate = prepare(...args);
    assert.ok(candidate.connections.W2);
    throw new Error('late Wall preparation failure');
  };
  c.assignSelectedLabelToEdge(edge('d',0));
  assert.match(c.errorMessage,/late Wall preparation failure/);
  assert.equal(owner.getSnapshot(),before); assert.equal(c.undoStack,undo); assert.equal(c.redoStack,redo);
});

test('an existing assignment is inspectable; a different target cannot take its replacement or append duplicate S', () => {
  const initial = api.makePopulatedProjectState(), id = edge('a',0);
  initial.box.connections.S2 = {...initial.box.connections.S1,id:'S2'};
  initial.box.edgeAssignments[id].slotAssignments = [{connectionId:'S1',slotRole:'B'},{connectionId:'S2',slotRole:'B'}];
  const {context:c,projectOwner:owner} = harness(initial);
  c.updateProjectSettings({kerfMm:.7}); c.undoLastEdit();
  const undo=c.undoStack,redo=c.redoStack;
  c.handleToolClick('TB');
  c.assignSelectedLabelToEdge(id);
  assert.equal(c.errorMessage,'');
  const assigned = owner.getSnapshot().box.edgeAssignments;
  c.handleToolClick('S'); c.selectConnectionForDisplayAndAssignment('S2');
  c.assignSelectedLabelToEdge(id);
  assert.match(c.errorMessage,/already has this S assignment/);
  c.updateAssignedRole(id,'S2','A');
  assert.match(c.errorMessage,/replacement assignment/);
  assert.equal(owner.getSnapshot().box.edgeAssignments,assigned);
  c.clearEdgeLabel(id,'S2');
  const bucket = owner.getSnapshot().box.edgeAssignments[id];
  assert.equal(bucket.edgeAssignment,assigned[id].edgeAssignment);
  assert.equal(bucket.slotAssignments[0],assigned[id].slotAssignments[0]);
  assert.equal(c.undoStack.length,undo.length+1); assert.equal(redo.length,1); assert.equal(c.redoStack.length,0);
});

test('manual creation and model-only C/P edits preserve defaults, types and history', () => {
  const {context:c, projectOwner:owner} = harness();
  const accept=acceptedActions(c,owner);
  for (const [prefix,id] of [['TB','TB2'],['W','W2'],['S','S2'],['C','C1'],['P','P1']]) {
    const next=accept(`Add ${prefix} connection`,()=>c.createLabel(prefix));
    assert.equal(next.displayConnectionId,id); assert.equal(next.assignmentTargetConnectionId,id);
    if(prefix==='S') assert.equal(next.activeSGroup.isActive,false);
    if(prefix==='TB') assert.deepEqual(next.connections[id].properties,next.connections.TB1.properties);
    if(prefix==='W') assert.deepEqual(next.activeWallGroup.connectionIds,['W1']);
  }
  c.selectConnectionForDisplayAndAssignment('C1');
  let next=accept('Edit C1 properties',()=>edit(c,'C1','C',{materialThicknessMm:4}));
  assert.equal(next.connections.C1.properties.cornerDepthMm,12);
  next=accept('Edit C1 properties',()=>edit(c,'C1','C',{cornerDepthMm:6}));
  assert.equal(next.connections.C1.properties.isCornerDepthManual,true);
  next=accept('Edit C1 properties',()=>edit(c,'C1','C',{materialThicknessMm:3}));
  assert.equal(next.connections.C1.properties.cornerDepthMm,6);
  c.selectConnectionForDisplayAndAssignment('P1');
  next=accept('Edit P1 properties',()=>edit(c,'P1','P',{rowOffsetMm:-2}));
  assert.equal(next.connections.P1.properties.rowOffsetMm,-2);
  assert.equal(next.connections.P1.properties.patternType,'line-fill');
  c.undoLastEdit();
  const redo=c.redoStack;
  edit(c,'P1','P',{rowOffsetMm:0});
  assert.equal(c.redoStack,redo);
});

test('36 sequential mixed-project construction edits share untouched records, perform no full clones or generation, and bound global history', () => {
  const {context:c, projectOwner:owner}=harness(), initial=owner.getSnapshot();
  let clones=0,snapshots=0,generators=0,parses=0;
  const clone=global.structuredClone;
  global.structuredClone=c.structuredClone=(...args)=>{clones++;return clone(...args);};
  c.createGeneratedGeometrySnapshot=()=>{snapshots++;throw Error('unexpected Apply');};
  for(const key of ['buildGeneratedTBGeometryItems','buildGeneratedWGeometryItems','buildGeneratedSGeometryItems']) {
    c[key]=()=>{generators++;throw Error('unexpected generator');};
  }
  c.parseSvgDocument=()=>{parses++;throw Error('unexpected parse');};
  const accept=acceptedActions(c,owner);
  try {
    for(let index=0;index<36;index++) {
      const prefix=['TB','W','S'][index%3], id=prefix+'1';
      c.selectConnectionForDisplayAndAssignment(id);
      const before=owner.getSnapshot().box;
      const after=accept(`Edit ${id} properties`,()=>edit(c,id,prefix,prefix==='S' ? {slotOffsetMm:index+1} : {fingerWidthMm:index+1}));
      assert.notEqual(after.connections[id],before.connections[id]);
      for(const other of Object.keys(before.connections).filter(key=>key!==id)) assert.equal(after.connections[other],before.connections[other]);
      for(const key of Object.keys(before).filter(key=>key!=='connections')) assert.equal(after[key],before[key],key);
      assert.equal(after.generatedGeometrySnapshot,initial.box.generatedGeometrySnapshot);
    }
  } finally {global.structuredClone=c.structuredClone=clone;}
  assert.deepEqual({clones,snapshots,generators,parses},{clones:0,snapshots:0,generators:0,parses:0});
  assert.equal(c.undoStack.length,30);
});

test('an explicit first Wall role chooses its complement; TB role edits and row removal restore all sibling relationships', () => {
  const initial = api.makePopulatedProjectState();
  delete initial.box.edgeAssignments[edge('d',0)];
  initial.box.edgeAssignments[edge('a',0)].slotAssignments = [{ connectionId:'S2',slotRole:'B' }];
  initial.box.connections.S2 = {...initial.box.connections.S1,id:'S2'};
  const {context:c, projectOwner:owner} = harness(initial), accept = acceptedActions(c,owner);
  c.selectConnectionForDisplayAndAssignment('W1');
  accept('Change W1 role', () => c.updateAssignedRole(edge('c',0),'W1','B'));
  const complete = accept('Assign edge to W1', () => c.assignSelectedLabelToEdge(edge('d',0)));
  assert.equal(complete.edgeAssignments[edge('d',0)].edgeAssignment.edgeRole,'A');
  c.selectConnectionForDisplayAndAssignment('TB1');
  const prior = owner.getSnapshot().box;
  const changed = accept('Change TB1 role', () => c.updateAssignedRole(edge('a',0),'TB1','B'));
  assert.equal(changed.edgeAssignments[edge('a',0)].slotAssignments,prior.edgeAssignments[edge('a',0)].slotAssignments);
  const removed = accept('Remove edge assignment', () => c.clearEdgeLabel(edge('a',0),'TB1'));
  assert.deepEqual(removed.edgeAssignments[edge('a',0)], {slotAssignments:prior.edgeAssignments[edge('a',0)].slotAssignments});
  c.undoLastEdit(); c.undoLastEdit(); assert.deepEqual(owner.getSnapshot().box,prior);
});

test('nested owner batch, changed owner during preparation, subscriber reentry and stale source callbacks cannot publish construction candidates', () => {
  const {context:c,projectOwner:owner} = harness();
  c.selectConnectionForDisplayAndAssignment('W1');
  c.updateProjectSettings({kerfMm:.7}); c.undoLastEdit();
  const before=owner.getSnapshot(), undo=c.undoStack, redo=c.redoStack;
  const action=()=>edit(c,'W1','W',{fingerWidthMm:15});
  assert.equal(owner.transact('drawing', 'outer', () => { action(); return 'accept'; }).outcome,'rejected');
  assert.match(c.errorMessage,/Unable to complete/);
  assert.equal(owner.getSnapshot(),before); assert.equal(c.undoStack,undo); assert.equal(c.redoStack,redo);
  const prepare=c.editConstructionProperties;
  c.editConstructionProperties=(...args)=>{
    const candidate=prepare(...args);
    owner.setBoxContext({selectedEdgeId:edge('d',2)});
    return candidate;
  };
  action();
  assert.match(c.errorMessage,/Unable to complete/);
  assert.equal(owner.getSnapshot().box.connections,before.box.connections);
  assert.equal(owner.getSnapshot().box.selectedEdgeId,edge('d',2));
  assert.equal(c.undoStack,undo); assert.equal(c.redoStack,redo);
  c.editConstructionProperties=prepare;
  let seen=0;
  const unsubscribe=owner.subscribe(()=>{
    seen++; assert.equal(c.undoStack.length,undo.length+seen);
    if (seen === 1) assert.equal(edit(c,'W1','W',{fingerWidthMm:7}),true);
  });
  try { action(); } finally { unsubscribe(); }
  assert.equal(seen,2); assert.equal(c.undoStack.length,undo.length+2);
  assert.equal(owner.getSnapshot().box.connections.W1.properties.fingerWidthMm,7);
  Object.defineProperty(c,'svgModel',{value:before.box.svgModel});
  c.boxTransactions.replaceSource(owner.beginBoxImport(), {...before.box.svgModel}, before.box.panelManager);
  const otherSource=owner.getSnapshot(), steps=c.undoStack;
  action(); assert.match(c.errorMessage,/current SVG source/);
  c.assignSelectedLabelToEdge(edge('d',2)); assert.match(c.errorMessage,/current source edge/);
  assert.equal(owner.getSnapshot(),otherSource); assert.equal(c.undoStack,steps);
});

test('duplicate TB owner and redundant Finish do not consume a global step or discard the undone property', () => {
  const {context:c,projectOwner:owner}=harness();
  c.finishGroup('TB');
  c.createLabel('TB');
  edit(c,'TB2','TB',{fingerWidthMm:8}); c.undoLastEdit();
  const before=owner.getSnapshot(),undo=c.undoStack,redo=c.redoStack;
  c.assignSelectedLabelToEdge(edge('a',0));
  assert.match(c.errorMessage,/replacement assignment/);
  assert.equal(owner.getSnapshot(),before); assert.equal(c.undoStack,undo); assert.equal(c.redoStack,redo);
  c.finishGroup('TB');
  assert.equal(owner.getSnapshot(),before); assert.equal(c.undoStack,undo); assert.equal(c.redoStack,redo);
  c.redoLastEdit(); assert.equal(owner.getSnapshot().box.connections.TB2.properties.fingerWidthMm,8);
});

for (const tool of ['W','S']) {
  test(`${tool} groups retain two accepted children, restore their operation, and leave standalone Add independent`, () => {
    const initial = api.makePopulatedProjectState();
    const {svgModel,panelManager} = initial.box;
    initial.box = {...api.createInitialBoxState(),svgModel,panelManager};
    const {context:c, projectOwner:owner} = harness(initial);
    const root = () => owner.getSnapshot();
    const entries = () => root().chronology.filter(e => e.kind === tool);
    c.handleToolClick(tool);
    assert.deepEqual(entries(), []);
    const field = api.constructionGroupField[tool];
    const groupId = root().box[field].groupId;
    c.assignSelectedLabelToEdge(edge('a',0));
    const [operation] = entries();
    assert.equal(operation.groupId,groupId);
    c.assignSelectedLabelToEdge(edge('b',0));
    c.assignSelectedLabelToEdge(edge('c',0));
    const partial = root();
    c.assignSelectedLabelToEdge(edge('d',0));
    assert.deepEqual(entries(),[operation]);
    const complete = root();
    assert.deepEqual(complete.box[field].connectionIds,[tool+'1',tool+'2',tool+'3']);
    c.finishGroup(tool);
    const finished = root();
    assert.deepEqual(finished.box[field].connectionIds,[tool+'1',tool+'2']);
    assert.equal(finished.box.edgeAssignments,complete.box.edgeAssignments);
    owner.traverse('undo'); assert.equal(root(),complete);
    owner.traverse('undo'); assert.equal(root(),partial);
    owner.traverse('redo'); owner.traverse('redo'); assert.equal(root(),finished);
    c.startGroup(tool);
    assert.notEqual(root().box[field].groupId,groupId);
    assert.equal(root().box[field].connectionIds[0],tool+'3');
    c.assignSelectedLabelToEdge(edge('a',1));
    const later = entries()[1];
    assert.notEqual(later.id,operation.id);
    c.selectConnectionForDisplayAndAssignment(tool+'1');
    edit(c,tool+'1',tool, tool==='S' ? {slotOffsetMm:4} : {fingerWidthMm:4});
    assert.deepEqual(entries(),[operation,later]);
    c.createLabel(tool);
    const standalone = entries()[2];
    assert.equal(standalone.connectionId,tool+'4');
    assert.equal(standalone.groupId,undefined);
    if (tool !== 'S') {
      c.selectConnectionForDisplayAndAssignment(tool+'3');
      c.assignSelectedLabelToEdge(edge('b',1));
      assert.deepEqual(root().box[field].connectionIds,[tool+'3',tool+'5']);
      assert.deepEqual(entries(),[operation,later,standalone]);
    }
  });
}

test('parameter-only S work survives Finish and an abandoned lifetime can reuse its label', () => {
  const initial = api.makePopulatedProjectState();
  initial.box = {...api.createInitialBoxState(),svgModel:initial.box.svgModel,panelManager:initial.box.panelManager};
  const {context:c,projectOwner:owner} = harness(initial);
  const source = () => owner.getSnapshot();
  const rows = () => source().chronology.filter(e => e.kind==='S');
  c.startGroup('S'); c.finishGroup('S');
  assert.deepEqual(rows(),[]);
  c.startGroup('S');
  c.updateConnectionProperties('S1',{prefix:'S',updates:{slotOffsetMm:3}});
  const [first] = rows();
  c.finishGroup('S');
  assert.deepEqual(source().box.activeSGroup.connectionIds,['S1']);
  assert.equal(source().box.connections.S1.properties.slotOffsetMm,3);
  owner.traverse('undo'); owner.traverse('undo'); owner.traverse('undo');
  assert.deepEqual(rows(),[]);
  assert.equal(source().box.connections.S1,undefined);
  c.startGroup('S'); c.assignSelectedLabelToEdge(edge('a',0));
  const [replacement] = rows();
  assert.deepEqual(source().box.activeSGroup.connectionIds,['S1']);
  assert.notEqual(first.id,replacement.id);
  assert.notEqual(first.groupId,replacement.groupId);
  assert.equal(owner.getHistory().redo.length,0);
});

function newTBHarness() {
  const initial = api.makePopulatedProjectState();
  const {svgModel,panelManager,generatedGeometrySnapshot} = initial.box;
  initial.box = {...api.createInitialBoxState(),svgModel,panelManager,generatedGeometrySnapshot};
  return harness(initial);
}

test('TB empty and one-edge Escape cancellation preserve accepted definitions, chronology and both stacks exactly', () => {
  const {context:c,projectOwner:owner} = newTBHarness();
  c.updateProjectSettings({kerfMm:.8}); c.undoLastEdit();
  const accepted=owner.getSnapshot(), tape=owner.getHistory();
  for (let attempt=0;attempt<4;attempt++) {
    c.handleToolClick('TB');
    assert.equal(c.activeTool,'TB');
    assert.ok(Object.isFrozen(owner.getBoxScope().box));
    assert.deepEqual(owner.getBoxScope().box.activeTBGroup.connectionIds,['TB1']);
    if (attempt%2) {
      c.assignSelectedLabelToEdge(edge('a',0));
      edit(c,'TB1','TB',{fingerWidthMm:12});
      assert.equal(Object.keys(owner.getBoxScope().box.edgeAssignments).length,1);
    }
    assert.equal(owner.getSnapshot(),accepted);
    assert.equal(owner.getHistory(),tape);
    c.closeBoxTool(); c.closeBoxTool();
    assert.equal(c.activeTool,'select');
    assert.equal(owner.getPublication().tbDraft,null);
    assert.equal(owner.getSnapshot(),accepted);
    assert.equal(owner.getBoxScope().box,accepted.box);
    assert.equal(owner.getHistory(),tape);
  }
  c.redoLastEdit(); assert.equal(owner.getSnapshot().box.projectSettings.kerfMm,.8);
  c.undoLastEdit(); assert.equal(owner.getSnapshot(),accepted);
});

test('TB Finish rejects empty, one-edge, duplicate-role and incompatible pairs atomically; correction commits one stable group', () => {
  const {context:c,projectOwner:owner} = newTBHarness();
  const accepted=owner.getSnapshot(), tape=owner.getHistory();
  c.startGroup('TB');
  c.finishGroup('TB'); assert.match(c.errorMessage,/one A edge and one B edge/);
  c.assignSelectedLabelToEdge(edge('a',0));
  let draft=owner.getPublication().tbDraft;
  c.finishGroup('TB'); assert.match(c.errorMessage,/TB1 is incomplete/);
  assert.equal(owner.getPublication().tbDraft,draft);
  c.applyPanelPaths(); assert.match(c.errorMessage,/TB1 is incomplete/);
  assert.equal(owner.getSnapshot(),accepted); assert.equal(owner.getHistory(),tape);
  c.assignSelectedLabelToEdge(edge('b',0));
  c.selectConnectionForDisplayAndAssignment('TB1');
  c.updateAssignedRole(edge('b',0),'TB1','A');
  draft=owner.getPublication().tbDraft;
  c.finishGroup('TB'); assert.match(c.errorMessage,/TB1 is incomplete/);
  assert.equal(owner.getPublication().tbDraft,draft);
  c.updateAssignedRole(edge('b',0),'TB1','B');
  const complete=owner.getBoxScope().box, groupId=complete.activeTBGroup.groupId;
  edit(c,'TB1','TB',{fingerWidthMm:12});
  c.finishGroup('TB'); assert.equal(c.errorMessage,'');
  const finished=owner.getSnapshot();
  assert.equal(owner.getPublication().tbDraft,null);
  assert.deepEqual(finished.box.activeTBGroup.connectionIds,['TB1']);
  assert.equal(finished.box.activeTBGroup.groupId,groupId);
  assert.equal(finished.box.activeTBGroup.isActive,false);
  assert.deepEqual(finished.box.edgeAssignments,complete.edgeAssignments);
  assert.equal(finished.box.connections.TB1.properties.fingerWidthMm,12);
  assert.equal(finished.box.connections.TB2,undefined);
  assert.equal(finished.box.generatedGeometrySnapshot,accepted.box.generatedGeometrySnapshot);
  const rows=finished.chronology.filter(e=>e.kind==='TB');
  assert.equal(rows.length,1); assert.equal(rows[0].groupId,groupId);
  assert.equal(owner.getHistory().undo.length,tape.undo.length+1);
  c.undoLastEdit(); assert.equal(owner.getSnapshot(),accepted);
  assert.equal(owner.getPublication().tbDraft,null);
  c.redoLastEdit(); assert.equal(owner.getSnapshot(),finished);
  assert.equal(owner.getSnapshot().chronology.find(e=>e.kind==='TB'),rows[0]);
});

test('TB multiple connections and unused authored trailing definition finish as one group; partial next connection blocks Finish', () => {
  const {context:c,projectOwner:owner} = newTBHarness();
  const accepted=owner.getSnapshot();
  c.startGroup('TB'); c.assignSelectedLabelToEdge(edge('a',0)); c.assignSelectedLabelToEdge(edge('b',0));
  c.assignSelectedLabelToEdge(edge('c',0));
  const partial=owner.getPublication().tbDraft;
  c.finishGroup('TB'); assert.match(c.errorMessage,/TB2 is incomplete/);
  assert.equal(owner.getPublication().tbDraft,partial);
  assert.equal(owner.getSnapshot(),accepted);
  c.assignSelectedLabelToEdge(edge('d',0));
  c.selectConnectionForDisplayAndAssignment('TB3'); edit(c,'TB3','TB',{fingerWidthMm:14});
  c.finishGroup('TB'); assert.equal(c.errorMessage,'');
  assert.deepEqual(owner.getSnapshot().box.activeTBGroup.connectionIds,['TB1','TB2']);
  assert.equal(owner.getSnapshot().box.connections.TB3,undefined);
  assert.equal(owner.getSnapshot().chronology.filter(e=>e.kind==='TB').length,1);
});

test('TB Apply before OK is staged and cancellable; OK accepts staged output; older accepted groups and History reopening survive Escape', () => {
  const {context:c,projectOwner:owner} = newTBHarness();
  const accepted=owner.getSnapshot(), tape=owner.getHistory();
  c.startGroup('TB'); c.assignSelectedLabelToEdge(edge('a',0)); c.assignSelectedLabelToEdge(edge('b',0));
  c.applyPanelPaths(); assert.equal(c.errorMessage,'');
  assert.notEqual(owner.getBoxScope().box.generatedGeometrySnapshot,accepted.box.generatedGeometrySnapshot);
  assert.equal(owner.getSnapshot(),accepted); assert.equal(owner.getHistory(),tape);
  c.closeBoxTool(); assert.equal(owner.getSnapshot(),accepted);
  c.startGroup('TB'); c.assignSelectedLabelToEdge(edge('a',0)); c.assignSelectedLabelToEdge(edge('b',0));
  c.applyPanelPaths(); assert.equal(c.errorMessage,'');
  const output=owner.getBoxScope().box.generatedGeometrySnapshot;
  c.finishGroup('TB'); assert.equal(c.errorMessage,'');
  assert.equal(owner.getSnapshot().box.generatedGeometrySnapshot,output);
  assert.deepEqual(owner.getSnapshot().box.appliedGeometryInputs,api.appliedGeometryInputs(owner.getSnapshot().box));
  const finished=owner.getSnapshot(), row=finished.chronology.find(e=>e.kind==='TB');
  const finishedTape=owner.getHistory();
  c.startGroup('TB'); c.assignSelectedLabelToEdge(edge('c',0));
  c.closeBoxTool();
  assert.equal(owner.getSnapshot(),finished); assert.equal(owner.getHistory(),finishedTape);
  owner.selectBoxSource('imported-svg');
  c.selectConnectionForDisplayAndAssignment('TB1');
  c.setActiveTool('TB'); c.closeBoxTool();
  assert.equal(owner.getSnapshot().box.connections,finished.box.connections);
  assert.equal(owner.getSnapshot().box.edgeAssignments,finished.box.edgeAssignments);
  assert.equal(owner.getSnapshot().box.completedTBGroups,finished.box.completedTBGroups);
  assert.equal(owner.getSnapshot().box.generatedGeometrySnapshot,output);
  assert.equal(owner.getSnapshot().chronology.find(e=>e.kind==='TB'),row);
});

test('TB incompatible edge lengths reject Finish without accepting the temporary definitions', () => {
  const {context:c,projectOwner:owner}=newTBHarness();
  const before=owner.getSnapshot(), tape=owner.getHistory();
  c.startGroup('TB'); c.assignSelectedLabelToEdge(edge('a',0)); c.assignSelectedLabelToEdge(edge('b',1));
  const draft=owner.getPublication().tbDraft;
  c.finishGroup('TB'); assert.match(c.errorMessage,/incompatible source edge lengths/);
  assert.equal(owner.getPublication().tbDraft,draft);
  assert.equal(owner.getSnapshot(),before); assert.equal(owner.getHistory(),tape);
  c.closeBoxTool(); assert.equal(owner.getSnapshot(),before);
});

test('TB cancelled inspector callbacks cannot leave dangling draft targets', () => {
  const {context:c,projectOwner:owner}=newTBHarness();
  c.startGroup('TB');
  const stale=production('selectConnectionForDisplayAndAssignment',{projectOwner:owner,renderEpoch:owner.getEpoch()});
  c.closeBoxTool();
  const accepted=owner.getSnapshot(), tape=owner.getHistory();
  stale('TB1');
  assert.equal(owner.getSnapshot(),accepted); assert.equal(owner.getHistory(),tape);
  assert.equal(owner.getSnapshot().box.assignmentTargetConnectionId,null);
});
