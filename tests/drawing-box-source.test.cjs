'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {api, harness, production} = require('./project-owner-harness.cjs');
const {drawingPanelModel} = require('../.test-build/project-owner/src/app/drawingPanelSource.js');
const {isSourceApproved,sourceStatus} = require('../.test-build/project-owner/src/app/boxSources.js');
const {createEmptySketch} = require('../.test-build/project-owner/src/app/drawingTypes.js');
const {evaluateDrawingGeometry} = require('../.test-build/project-owner/src/app/drawingGeometryDependencies.js');
const {validateCurrentTBEdgeCompatibility,buildGeneratedTBGeometryItems} = require('../.test-build/project-owner/src/app/tbGeometry.js');

function polygon(sketch, name, coords, close = true) {
  const points = {...sketch.points}, entities = {...sketch.entities};
  const order = [...sketch.entityOrder];
  coords.forEach(([x,y],i) => {
    const id = name+'p'+i;
    points[id] = {id,x,y};
    if (close || i+1 < coords.length) {
      const id = name+'e'+i;
      entities[id] = {id,type:'line',startPointId:name+'p'+i,endPointId:name+'p'+((i+1)%coords.length)};
      order.push(id);
    }
  });
  return {...sketch, points, entities, entityOrder:order};
}
const rectangle = (s, name, x) => polygon(s,name,[[x,0],[x+100,0],[x+100,80],[x,80]]);
const pair = id => rectangle(rectangle(createEmptySketch(id,id),'a',0),'b',130);

test('TB length compatibility is scoped to each connection, even within one group', () => {
  const sketch = rectangle(rectangle(pair('four'),'c',260),'d',390);
  const model = drawingPanelModel(sketch,{id:'four',definitionRevision:'revision'});
  const edges = model.panels.map(panel=>panel.outerEdgeIds[0]);
  const assignments = Object.fromEntries(edges.slice(0,4).map((edgeId,index)=>
    [edgeId,{edgeAssignment:{connectionId:index<2?'TB1':'TB2',edgeRole:index%2?'B':'A'}}]));
  const connections = Object.fromEntries(['TB1','TB2'].map(id=>[id,{id,prefix:'TB',properties:{fingerWidthMm:10,isFingerWidthManual:true}}]));
  assert.doesNotThrow(()=>validateCurrentTBEdgeCompatibility(model,assignments,connections));
  const mismatch = drawingPanelModel(resizeRectangle(sketch,'d',120),{id:'four',definitionRevision:'revision'});
  assert.throws(()=>validateCurrentTBEdgeCompatibility(mismatch,assignments,connections),
    error=>error.code==='TB_EDGE_LENGTH_MISMATCH'&&error.connectionId==='TB2'&&/100\.000 mm, B 120\.000 mm/.test(error.message));
});

test('a complete TB connection cannot silently discard a failed panel contour', () => {
  const model = drawingPanelModel(pair('invalid'),{id:'invalid',definitionRevision:'revision'});
  const assignments = Object.fromEntries(model.panels.map((panel,index)=>
    [panel.outerEdgeIds[0],{edgeAssignment:{connectionId:'TB1',edgeRole:index?'B':'A'}}]));
  const connections = {TB1:{id:'TB1',prefix:'TB',properties:{fingerWidthMm:10,isFingerWidthManual:true}}};
  const panels = Object.fromEntries(model.panels.map(panel=>[panel.id,{panelId:panel.id,thicknessMm:3}]));
  const broken = {...model,panels:[{...model.panels[0],contour:model.panels[0].contour.slice(0,2)},model.panels[1]]};
  assert.throws(()=>buildGeneratedTBGeometryItems(broken,assignments,connections,{panels}),
    error=>error.code==='TB_GEOMETRY_GENERATION_FAILED'&&error.connectionId==='TB1');
});
function initial(sketches) {
  const ids = Object.keys(sketches);
  return api.makeEmptyProjectState({schemaVersion:2,unit:'mm',activeSketchId:ids[0],sketchOrder:ids,sketches});
}

test('semantic closed Line components use stable panel, hole and edge membership', () => {
  const op = {id:'lifetime',definitionRevision:'revision'};
  const model = sketch => drawingPanelModel(sketch,op);
  const base = pair('one');
  const three = rectangle(base,'c',260);
  assert.equal(model(three).panels.length,3);
  const old = model(base).panels;
  assert.deepEqual(model({...three,entityOrder:[...three.entityOrder].reverse()}).panels.slice(0,2),old);
  const triangle = [[0,0],[60,10],[10,70]];
  const single = coords => polygon(createEmptySketch('s','s'),'test',coords);
  assert.equal(model(single(triangle)).panels.length,1);
  assert.equal(model(single([[0,0],[80,80],[0,80],[80,0]])).panels.length,0);
  assert.equal(model(single([[0,0],[10,10],[20,20]])).panels.length,0);
  const open = polygon(createEmptySketch('s','s'),'open',[[0,0],[20,0],[20,40],[0,40],[0,.01]],false);
  assert.equal(model(open).panels.length,0);
  const sameCoordinates = {...open,points:{...open.points,openp4:{id:'openp4',x:0,y:0}}};
  assert.equal(model(sameCoordinates).panels.length,0);
  const branched = polygon(base,'branch',[[0,0],[-20,-20]],false);
  assert.equal(model(branched).panels.length,1);
  const nested = polygon(base,'hole',[[20,20],[40,20],[40,40],[20,40]]);
  assert.equal(model(nested).panels[0].innerContours.length,1);
});

test('source review, native TB/W, isolated authority, rejected cross-Sketch events and global restoration', () => {
  const {projectOwner: owner, context:c} = harness(initial({one:pair('one'),two:pair('two')}));
  const [first, second] = owner.getSnapshot().constructionOperations.map(op => op.id);
  const current = () => owner.getBoxScope().box;
  const sources = () => owner.getSnapshot().boxSources.sketches;
  const inspect = id => assert.equal(owner.selectBoxSource(id),true);
  for (const id of [first,second]) {
    inspect(id);
    assert.equal(current().svgModel.panels.length,2);
    c.acceptDefaultPanelThickness();
    c.updatePanelThickness(current().svgModel.panels[1].id,6);
    c.applyPanelManager();
    assert.equal(isSourceApproved(current()),true,c.errorMessage);
    assert.equal(owner.getBoxScope().working,true);
    const [a,b] = current().svgModel.panels;
    const foreign = sources()[id === first ? second : first].svgModel.edges[0].id;
    for (const [tool,index1,index2] of [['TB',0,0],['W',1,3]]) {
      c.startGroup(tool);
      const assign = edgeId => api.createBoxTransactionAdapter(owner).transact('Assign '+tool,
        box => api.assignConstructionEdge(box,edgeId,box.assignmentTargetConnectionId));
      assert.equal(assign(a.edgeIds[index1]).outcome,'accepted');
      assert.equal(assign(b.edgeIds[index2]).outcome,'accepted');
      owner.traverse('undo');
      const history = owner.getHistory(), before = owner.getSnapshot();
      const rejected = assign(foreign);
      assert.equal(rejected.outcome,'rejected');
      assert.match(rejected.error.message,/same Sketch/);
      assert.equal(owner.getHistory(),history);
      assert.equal(owner.getSnapshot(),before);
      const direct = owner.transact('box','Foreign assignment',tx=>{
        tx.update(frame=>{
          const boxes = frame.boxSources.sketches, box = boxes[id];
          return {...frame,boxSources:{...frame.boxSources,sketches:{...boxes,[id]:{...box,
            edgeAssignments:{...box.edgeAssignments,[foreign]:{edgeAssignment:{connectionId:tool+'1',edgeRole:'B'}}}}}}};
        });
        return 'accept';
      });
      assert.equal(direct.outcome,'rejected');
      assert.match(direct.error.message,/same Sketch/);
      assert.equal(owner.getHistory(),history);
      owner.traverse('redo');
      c.finishGroup(tool);
    }
    c.applyPanelPaths();
    assert.ok(current().generatedGeometrySnapshot.generatedGeometry.length > 0,c.errorMessage);
  }
  const approved = sources();
  const edit = change => api.projectDrawingActions(owner).transact('Drawing edit',doc=>({...doc,
    sketches:{...doc.sketches,one:change(doc.sketches.one)}}));
  edit(s=>({...s,name:'Renamed'}));
  assert.equal(sources()[first],approved[first]);
  const readmitted = api.createGlobalProjectHistory(owner.getSnapshot());
  assert.equal(isSourceApproved(readmitted.getSnapshot().boxSources.sketches[first]),true);
  const undoLength = owner.getHistory().undo.length;
  edit(s=>polygon(s,'open',[[300,0],[310,20]],false));
  assert.equal(owner.getHistory().undo.length,Math.min(undoLength+1,30));
  assert.equal(sources()[first].panelManager.isApplied,true);
  assert.equal(sources()[first].svgModel.panels.length,2);
  assert.equal(sources()[first].panelManager.needsGeometryApply,false);
  assert.equal(sources()[first].generatedGeometrySnapshot,approved[first].generatedGeometrySnapshot);
  assert.equal(sources()[second],approved[second]);
  const changed = sources()[first];
  owner.traverse('undo');
  assert.equal(sources()[first],approved[first]);
  owner.traverse('redo');
  assert.equal(sources()[first],changed);
  edit(s=>rectangle(s,'third',420));
  assert.deepEqual(Object.values(sources()[first].panelManager.panels).map(p=>p.thicknessMm),[3,6,0]);
  owner.navigate('construction');
  inspect(first);
  c.applyPanelManager();
  assert.equal(isSourceApproved(current()),false);
  c.updatePanelThickness(current().svgModel.panels[2].id,4);
  c.applyPanelManager();
  assert.equal(isSourceApproved(current()),true,c.errorMessage);
  assert.equal(current().panelManager.needsGeometryApply,true);
  assert.equal(api.currentBoxGeometrySnapshot(current()),undefined);
  c.applyPanelPaths();
  assert.equal(current().panelManager.needsGeometryApply,false,c.errorMessage);
  assert.equal(sources()[second],approved[second]);
  const stale = api.createBoxTransactionAdapter(owner,owner.getEpoch());
  owner.clearProject();
  assert.equal(stale.transact('old pointer',b=>({...b})).outcome,'rejected');
  assert.equal(owner.getSnapshot().boxSources,undefined);
  assert.equal(owner.getHistory().undo.length,0);
});

test('SVG replacement preserves independent Drawing work and invalidates old source callbacks', () => {
  const {projectOwner:owner, context:c} = harness(initial({one:pair('one')}));
  c.acceptDefaultPanelThickness(); c.applyPanelManager();
  const drawing = owner.getBoxScope();
  assert.equal(drawing.working,true);
  const stale = api.createBoxTransactionAdapter(owner,owner.getEpoch());
  const svg = api.makePopulatedProjectState().box.svgModel;
  const result = stale.replaceSource(owner.beginBoxImport(),svg,api.createPanelManagerStateFromModel(svg));
  assert.equal(result.outcome,'accepted');
  assert.equal(owner.getSnapshot().boxSources.sketches[drawing.id],drawing.box);
  assert.equal(stale.transact('old source',b=>({...b})).outcome,'rejected');
  c.acceptDefaultPanelThickness(); c.applyPanelManager();
  const imported = owner.getBoxScope();
  assert.ok(imported.working);
  owner.selectBoxSource(drawing.id);
  assert.equal(owner.getBoxScope().box,drawing.box);
  assert.equal(owner.getSnapshot().box,imported.box);
  owner.selectBoxSource(imported.id);
  assert.equal(owner.getBoxScope().box,imported.box);
});

test('chronology survives source context, branching, admission, and eviction of its creation frames', () => {
  const {projectOwner: owner, context: c} = harness(initial({one:pair('one'),two:pair('two')}));
  const [one,two] = owner.getSnapshot().constructionOperations.map(op => op.id);
  const entries = () => owner.getSnapshot().chronology;
  const select = id => {
    const {undo, redo} = owner.getHistory();
    assert.equal(owner.selectBoxSource(id),true);
    assert.equal(owner.getHistory().undo,undo);
    assert.equal(owner.getHistory().redo,redo);
  };
  const start = (id,tool,edge) => {
    select(id);
    const before = entries();
    c.handleToolClick(tool);
    assert.equal(entries(),before, 'opening a group only prepares a draft');
    const box = owner.getBoxScope().box;
    c.assignSelectedLabelToEdge(box.svgModel.panels[0].outerEdgeIds[edge]);
    if (tool === 'TB') {
      assert.equal(entries(),before, 'TB assignments remain transient until Finish');
      c.assignSelectedLabelToEdge(box.svgModel.panels[1].outerEdgeIds[edge]);
      c.finishGroup('TB');
    }
    assert.equal(entries().length,before.length+1,c.errorMessage);
  };
  for (const id of [one,two]) { select(id); c.acceptDefaultPanelThickness(); c.applyPanelManager(); }
  start(one,'TB',0);
  const box = owner.getBoxScope().box;
  start(two,'TB',0);
  start(one,'TB',1); start(two,'W',1);
  const ordered = entries();
  assert.deepEqual(ordered.map(e=>[e.sourceId,e.kind]),[
    [one,'sketch'],[two,'sketch'],[one,'PM'],[two,'PM'],[one,'TB'],[two,'TB'],[one,'TB'],[two,'W']]);
  assert.equal(new Set(ordered.map(e=>e.id)).size, ordered.length);
  owner.traverse('undo'); assert.deepEqual(entries(),ordered.slice(0,-1));
  select(one); select(two); owner.traverse('redo'); assert.equal(entries(),ordered);
  c.openManufacturing();
  assert.equal(entries(),ordered);
  for (let i=0;i<38;i++) c.updateProjectSettings({kerfMm:.21+i/100});
  assert.equal(owner.getHistory().undo.length,30);
  assert.deepEqual(entries().slice(0,-1),ordered);
  assert.equal(entries().at(-1).kind,'manufacturing');
  const admitted = api.createGlobalProjectHistory(owner.getSnapshot());
  assert.deepEqual(admitted.getSnapshot().chronology,entries());
  const {chronology, ...legacy} = owner.getSnapshot();
  const migrated = api.createGlobalProjectHistory(legacy).getSnapshot();
  assert.deepEqual(migrated.boxSources,legacy.boxSources);
  assert.deepEqual(migrated.chronology.slice(0,2),ordered.slice(0,2));
  assert.ok(migrated.chronology.some(e=>e.sourceId===one && e.groupId===box.activeTBGroup.groupId));
  assert.ok(migrated.chronology.some(e=>e.sourceId===two && e.groupId===legacy.boxSources.sketches[two].activeWallGroup.groupId));
  owner.clearProject(); assert.deepEqual(entries(),[]);
});

test('one atomic batch admits completed TB in order and rolls back abandoned child work', () => {
  const {projectOwner:owner,context:c} = harness();
  c.finishGroup('TB'); c.finishGroup('S');
  c.startGroup('S');
  const before=owner.getSnapshot(), groupId='batch-tb', id='TB2';
  const result=owner.transact('box','Batch authoring',tx=>{
    tx.nest(child=>{ child.update(frame=>({...frame,box:{...frame.box,data:{...frame.box.data,
      connections:{...frame.box.data.connections,abandoned:{...frame.box.data.connections.TB1,id:'abandoned'}}}}})); return 'noop'; });
    tx.update(frame=>({...frame,box:{...frame.box,data:{...frame.box.data,
      connections:{...frame.box.data.connections,[id]:{...frame.box.data.connections.TB1,id}},
      edgeAssignments:{...frame.box.data.edgeAssignments,'panel-c-edge-2':{edgeAssignment:{connectionId:id,edgeRole:'A'}},
        'panel-d-edge-2':{edgeAssignment:{connectionId:id,edgeRole:'B'}}},
      completedTBGroups:[...frame.box.data.completedTBGroups,{groupId,connectionIds:[id],isActive:false}],
    }}}));
    return 'accept';
  });
  assert.equal(result.outcome,'accepted',result.error?.message);
  const after=owner.getSnapshot();
  assert.equal(after.box.connections.abandoned,undefined);
  assert.equal(after.chronology.at(-1).groupId,groupId);
  owner.traverse('undo'); assert.equal(owner.getSnapshot(),before);
  owner.traverse('redo'); assert.equal(owner.getSnapshot(),after);
});

test('per-connection admission keeps the earliest group row across other sources and preserves orphan definitions', () => {
  const {projectOwner:owner,context:c} = harness(initial({one:pair('one'),two:pair('two')}));
  const [one,two] = owner.getSnapshot().constructionOperations.map(op=>op.id);
  owner.selectBoxSource(one); c.acceptDefaultPanelThickness(); c.applyPanelManager();
  c.startGroup('TB');
  const [a,b] = owner.getBoxScope().box.svgModel.panels;
  c.assignSelectedLabelToEdge(a.edgeIds[0]); c.assignSelectedLabelToEdge(b.edgeIds[0]);
  c.assignSelectedLabelToEdge(a.edgeIds[1]); c.assignSelectedLabelToEdge(b.edgeIds[1]); c.finishGroup('TB');
  c.createLabel('S'); // Legacy S definitions with no retained session stay separate.
  owner.selectBoxSource(two); c.acceptDefaultPanelThickness(); c.applyPanelManager(); c.startGroup('W');
  const saved = owner.getSnapshot();
  const pm2 = saved.chronology.find(e=>e.sourceId===two && e.kind==='PM');
  const group = saved.chronology.find(e=>e.kind==='TB');
  const slot = saved.chronology.find(e=>e.kind==='S');
  const legacy = (id,connectionId) => ({kind:'TB',sourceId:one,id,connectionId});
  const chronology = [...saved.chronology.slice(0,3),legacy('earliest','TB1'),pm2,legacy('later','TB2'),slot];
  const admitted = api.createGlobalProjectHistory({...saved,chronology}).getSnapshot();
  assert.deepEqual(admitted.chronology,[...chronology.slice(0,3),{...group,id:'earliest'},pm2,slot]);
  assert.deepEqual(admitted.boxSources,saved.boxSources);
  assert.equal(admitted.boxSources.sketches[one].edgeAssignments,saved.boxSources.sketches[one].edgeAssignments);
  assert.equal(admitted.boxSources.sketches[two].activeWallGroup.connectionIds[0],'W1');
  assert.deepEqual(api.createGlobalProjectHistory(admitted).getSnapshot().chronology,admitted.chronology);
});

test('replacing an imported source and readmitting it never promote untouched group drafts', () => {
  const initial = api.makePopulatedProjectState();
  initial.box = {...api.createInitialBoxState(),svgModel:initial.box.svgModel,panelManager:initial.box.panelManager};
  const {projectOwner:owner,context:c} = harness(initial);
  c.startGroup('TB'); c.startGroup('W');
  c.createLabel('W');
  const before = owner.getSnapshot();
  const [standalone] = before.chronology.filter(e => e.kind==='W');
  const adapter = api.createBoxTransactionAdapter(owner);
  const result = adapter.replaceSource(owner.beginBoxImport(),
    {...before.box.svgModel,content:'<svg/>'},api.createInitialBoxState().panelManager);
  assert.equal(result.outcome,'accepted');
  const replaced = owner.getSnapshot();
  assert.equal(replaced.box.connections,before.box.connections);
  assert.deepEqual(replaced.chronology.filter(e => ['W','TB'].includes(e.kind)),[standalone]);
  assert.deepEqual(api.createGlobalProjectHistory(replaced).getSnapshot().chronology,replaced.chronology);
  owner.traverse('undo'); assert.equal(owner.getSnapshot(),before);
});

function drawingBoxProject(one = pair('one')) {
  const {projectOwner:owner,context:c} = harness(initial({one,two:pair('two')}));
  const [first,second] = owner.getSnapshot().constructionOperations.map(op=>op.id);
  owner.selectBoxSource(first);
  c.acceptDefaultPanelThickness(); c.applyPanelManager();
  const current = () => owner.getSnapshot().boxSources.sketches[first];
  const author = (tool, ...lines) => {
    const edges = new Map(current().svgModel.edges.map(edge => [edge.drawingEntityId,edge.id]));
    c.startGroup(tool);
    for (const line of lines) {
      assert.ok(edges.has(line),line);
      c.assignSelectedLabelToEdge(edges.get(line));
      assert.equal(c.errorMessage,'');
    }
    c.finishGroup(tool);
    assert.equal(c.errorMessage,'');
  };
  const apply = () => {
    c.applyPanelPaths();
    assert.equal(c.errorMessage,'');
    assert.ok(current().generatedGeometrySnapshot.generatedGeometry.length);
  };
  const edit = change => api.projectDrawingActions(owner).transact('Drawing resize',doc=>({...doc,
    sketches:{...doc.sketches,one:change(doc.sketches.one)}}));
  return {owner,c,first,second,edit,current,author,apply};
}

function appliedTBProject() {
  const project = drawingBoxProject();
  project.author('TB','ae0','be0');
  project.apply();
  return project;
}

function resizeRectangle(sketch,name,width) {
  const points = {...sketch.points};
  for (const i of [1,2]) points[name+'p'+i] = {...points[name+'p'+i],x:points[name+'p0'].x+width};
  return {...sketch,points};
}

const generatedProfiles = box => box.generatedGeometrySnapshot.generatedGeometry.flatMap(item => item.generatedProfiles ?? []);
const profileConnections = box => [...new Set(generatedProfiles(box).map(profile => profile.operationId.split(':').at(-1)))].sort();

test('a failed TB relationship regenerates the valid neighbor on the current shared panel', () => {
  const {owner,c,first,second,edit,current,author,apply} = drawingBoxProject(rectangle(pair('one'),'c',260));
  author('TB','ae0','be2');
  author('TB','be0','ce0');
  apply();
  const original = owner.getSnapshot();
  const prior = current();
  const group = original.chronology.filter(entry=>entry.kind==='TB'&&entry.sourceId===first);
  const shared = generatedProfiles(prior).find(profile=>profile.operationId==='operation:TB:TB2'&&
    generatedProfiles(prior).some(other=>other.operationId==='operation:TB:TB1'&&other.panelId===profile.panelId)).panelId;
  const priorSharedPath = prior.generatedGeometrySnapshot.generatedGeometry.find(item=>item.behaviour.replacesPanelId===shared).pathD;
  assert.deepEqual(profileConnections(prior),['TB1','TB2']);
  const undoCount = owner.getHistory().undo.length;
  assert.equal(edit(s=>{
    const resized = resizeRectangle(s,'c',120);
    for (const id of ['bp2','bp3']) resized.points[id] = {...resized.points[id], y:95};
    return resized;
  }).outcome,'accepted');
  const partial = owner.getSnapshot(), box = current();
  assert.equal(owner.getHistory().undo.length,undoCount+1);
  assert.equal(isSourceApproved(box),true);
  assert.equal(box.panelManager.needsGeometryApply,false);
  assert.deepEqual(box.panelManager.panels,prior.panelManager.panels);
  assert.equal(box.edgeAssignments,prior.edgeAssignments);
  assert.equal(box.connections,prior.connections);
  assert.equal(box.appliedGeometryInputs,prior.appliedGeometryInputs);
  assert.deepEqual(partial.chronology,original.chronology);
  assert.equal(partial.box,original.box);
  assert.equal(partial.boxSources.sketches[second],original.boxSources.sketches[second]);
  assert.equal(box.dependencyDiagnostics.length,1);
  assert.deepEqual(box.dependencyDiagnostics[0],{
    code:'TB_EDGE_LENGTH_MISMATCH',severity:'error',sourceId:first,groupId:group[1].groupId,connectionId:'TB2',
    edgeIds:Object.keys(prior.edgeAssignments).filter(id=>prior.edgeAssignments[id].edgeAssignment?.connectionId==='TB2'),
    panelIds:generatedProfiles(prior).filter(profile=>profile.operationId==='operation:TB:TB2').map(profile=>profile.panelId),
    message:box.dependencyDiagnostics[0].message,
  });
  assert.match(box.dependencyDiagnostics[0].message,/TB2.*A 100\.000 mm, B 120\.000 mm/);
  const expected = api.evaluateAppliedGeometry({...box,
    edgeAssignments:Object.fromEntries(Object.entries(box.edgeAssignments).filter(([,bucket])=>bucket.edgeAssignment?.connectionId==='TB1')),
    connections:{TB1:box.connections.TB1},
  },'mixed').snapshot;
  assert.equal(api.currentBoxGeometrySnapshot(box),box.generatedGeometrySnapshot);
  assert.deepEqual(box.generatedGeometrySnapshot.generatedGeometry,expected.generatedGeometry);
  assert.deepEqual(api.buildFinalGeometry(box.svgModel,box.generatedGeometrySnapshot),api.buildFinalGeometry(box.svgModel,expected));
  assert.equal(generatedProfiles(box).filter(profile=>profile.operationId==='operation:TB:TB1').length,2);
  assert.notEqual(box.generatedGeometrySnapshot.generatedGeometry.find(item=>item.behaviour.replacesPanelId===shared).pathD,priorSharedPath);
  c.applyPanelPaths();
  assert.match(c.errorMessage,/TB2 has incompatible source edge lengths/);
  assert.equal(owner.getSnapshot(),partial);
  assert.equal(edit(s=>resizeRectangle(s,'c',100)).outcome,'accepted');
  const repaired = owner.getSnapshot();
  assert.equal(owner.getHistory().undo.length,undoCount+2);
  assert.deepEqual(current().dependencyDiagnostics,[]);
  assert.deepEqual(profileConnections(current()),['TB1','TB2']);
  owner.traverse('undo'); assert.equal(owner.getSnapshot(),partial);
  owner.traverse('undo'); assert.equal(owner.getSnapshot(),original);
  owner.traverse('redo'); assert.equal(owner.getSnapshot(),partial);
  owner.traverse('redo'); assert.equal(owner.getSnapshot(),repaired);
});

test('independent TB failures in one History group preserve a valid sibling on separate panels', () => {
  let sketch = pair('one');
  for (const [name,x] of [['c',260],['d',390],['e',520],['f',650]]) sketch = rectangle(sketch,name,x);
  const {edit,current,author,apply} = drawingBoxProject(sketch);
  author('TB','ae0','be0','ce0','de0','ee0','fe0');
  apply();
  const prior = current();
  assert.deepEqual(profileConnections(prior),['TB1','TB2','TB3']);
  assert.equal(edit(s=>resizeRectangle(resizeRectangle(s,'b',120),'d',90)).outcome,'accepted');
  const partial = current();
  assert.deepEqual(partial.dependencyDiagnostics.map(d=>[d.connectionId,d.code,d.groupId]),
    ['TB1','TB2'].map(id=>[id,'TB_EDGE_LENGTH_MISMATCH',prior.completedTBGroups[0].groupId]));
  assert.deepEqual(profileConnections(partial),['TB3']);
  assert.deepEqual(partial.generatedGeometrySnapshot.generatedGeometry,
    prior.generatedGeometrySnapshot.generatedGeometry.filter(item=>item.source.connectionIds.includes('TB3')));
  assert.equal(edit(s=>resizeRectangle(s,'b',100)).outcome,'accepted');
  assert.deepEqual(current().dependencyDiagnostics.map(d=>d.connectionId),['TB2']);
  assert.deepEqual(profileConnections(current()),['TB1','TB3']);
});

test('Drawing continuation honors Wall TB-role inheritance and S original-edge references', () => {
  let sketch = pair('one');
  for (const [name,x] of [['c',260],['d',390],['e',520],['f',650],['g',780]]) sketch = rectangle(sketch,name,x);
  const {edit,current,author,apply} = drawingBoxProject(sketch);
  author('TB','ae0','be0');
  author('TB','ce0','be2');
  author('W','ce1','ee3');
  author('W','de1','ee1');
  author('S','de0','ce0');
  author('S','fe0','ge0');
  apply();
  const prior = current();
  assert.deepEqual(profileConnections(prior),['S1','S2','TB1','TB2','W1','W2']);
  assert.equal(edit(s=>resizeRectangle(resizeRectangle(s,'c',120),'g',40)).outcome,'accepted');
  const partial = current();
  assert.deepEqual(profileConnections(partial),['S1','TB1','W2']);
  const diagnostics = Object.fromEntries(partial.dependencyDiagnostics.map(d=>[d.connectionId,d]));
  assert.deepEqual(Object.keys(diagnostics).sort(),['S2','TB2','W1']);
  assert.match(diagnostics.W1.message,/authored Wall roles while TB2 is blocked/);
  assert.match(diagnostics.S2.message,/extends outside the S-B edge/);
  assert.equal(diagnostics.W1.groupId,prior.completedWallGroups[0].groupId);
  const slotGroup = api.connectionGroups(prior,'S').find(group=>group.connectionIds.includes('S2'));
  assert.equal(diagnostics.S2.groupId,slotGroup.groupId);
  const slot = partial.generatedGeometrySnapshot.generatedGeometry.find(item=>item.kind==='SLOT_PATH'&&item.source.connectionIds.includes('S1'));
  assert.equal(slot.sourceRelationships[0].kind,'references');
  assert.ok(diagnostics.TB2.edgeIds.includes(slot.sourceRelationships[0].sourceEdgeId));
  assert.equal(edit(s=>resizeRectangle(s,'c',100)).outcome,'accepted');
  assert.deepEqual(profileConnections(current()),['S1','TB1','TB2','W1','W2']);
  assert.deepEqual(current().dependencyDiagnostics.map(d=>d.connectionId),['S2']);
});

test('ambiguous replacement ownership blocks both claims and retains independent TB output', () => {
  let sketch = pair('one');
  for (const [name,x] of [['c',260],['d',390],['e',520]]) sketch = rectangle(sketch,name,x);
  const {first,current,author,apply} = drawingBoxProject(sketch);
  author('TB','ae0','be0');
  author('TB','ce0','de0');
  author('S','ae2','ee0');
  apply();
  const prior = current();
  const byLine = new Map(prior.svgModel.edges.map(edge=>[edge.drawingEntityId,edge.id]));
  const contested = byLine.get('ae0'), oldSlotEdge = byLine.get('ae2');
  const assignments = {...prior.edgeAssignments,
    [contested]:{...prior.edgeAssignments[contested],slotAssignments:prior.edgeAssignments[oldSlotEdge].slotAssignments}};
  delete assignments[oldSlotEdge];
  const malformed = {...prior,edgeAssignments:assignments};
  assert.throws(()=>api.evaluateAppliedGeometry(malformed,'mixed'),/already has replacement operations/);
  const {snapshot,diagnostics} = evaluateDrawingGeometry(malformed,first,'mixed');
  assert.deepEqual(diagnostics.map(d=>d.connectionId).sort(),['S1','TB1']);
  assert.ok(diagnostics.every(d=>d.edgeIds.includes(contested)&&d.message.includes('already has replacement operations')));
  assert.deepEqual(profileConnections({...prior,generatedGeometrySnapshot:snapshot}),['TB2']);
  assert.ok(snapshot.generatedGeometry.every(item=>item.kind!=='SLOT_PATH'));
});

test('ordinary unequal TB edges block automatic and manual Apply, then recover atomically', () => {
  const {owner,c,first,second,edit} = appliedTBProject();
  const before = owner.getSnapshot();
  const prior = before.boxSources.sketches[first];
  const profiles = prior.generatedGeometrySnapshot.generatedGeometry.flatMap(item=>item.generatedProfiles??[]);
  assert.equal(profiles.filter(profile=>profile.operationId==='operation:TB:TB1').length,2);
  const result = edit(s=>resizeRectangle(s,'b',120));
  assert.equal(result.outcome,'accepted',result.error?.message);
  const blocked = owner.getSnapshot();
  const box = blocked.boxSources.sketches[first];
  assert.equal(box.dependencyDiagnostics?.[0]?.code,'TB_EDGE_LENGTH_MISMATCH');
  assert.match(box.dependencyDiagnostics[0].message,/TB1.*A 100\.000 mm, B 120\.000 mm/);
  assert.equal(box.dependencyDiagnostics[0].groupId,blocked.chronology.find(e=>e.kind==='TB'&&e.sourceId===first).groupId);
  assert.deepEqual(box.generatedGeometrySnapshot.generatedGeometry,[]);
  assert.equal(api.currentBoxGeometrySnapshot(box),box.generatedGeometrySnapshot);
  assert.equal(box.appliedGeometryInputs,prior.appliedGeometryInputs);
  assert.equal(box.edgeAssignments,prior.edgeAssignments);
  assert.equal(box.connections,prior.connections);
  assert.equal(blocked.boxSources.sketches[second],before.boxSources.sketches[second]);
  assert.equal(box.panelManager.needsGeometryApply,false);
  const beforeApply = owner.getSnapshot();
  c.applyPanelPaths();
  assert.match(c.errorMessage,/TB_EDGE_LENGTH_MISMATCH|incompatible source edge lengths/);
  assert.equal(owner.getSnapshot(),beforeApply);
  const repaired = edit(s=>resizeRectangle(s,'b',100));
  assert.equal(repaired.outcome,'accepted',repaired.error?.message);
  const restored = owner.getSnapshot();
  assert.deepEqual(restored.boxSources.sketches[first].dependencyDiagnostics,[]);
  assert.equal(restored.boxSources.sketches[first].panelManager.needsGeometryApply,false);
  assert.deepEqual(restored.boxSources.sketches[first].generatedGeometrySnapshot.generatedGeometry,prior.generatedGeometrySnapshot.generatedGeometry);
  owner.traverse('undo'); assert.equal(owner.getSnapshot(),blocked);
  owner.traverse('redo'); assert.equal(owner.getSnapshot(),restored);
});

test('compatible Drawing resize regenerates applied TB in its single global history step', () => {
  const {owner,first,second,edit} = appliedTBProject();
  const before = owner.getSnapshot();
  const prior = before.boxSources.sketches[first];
  const ids = before.chronology.filter(e=>e.sourceId===first).map(e=>e.id);
  const oldEdges = prior.svgModel.edges.map(e=>e.id);
  const result = edit(s=>resizeRectangle(resizeRectangle(s,'a',120),'b',120));
  assert.equal(result.outcome,'accepted',result.error?.message);
  const after = owner.getSnapshot();
  const current = after.boxSources.sketches[first];
  assert.equal(isSourceApproved(current),true);
  assert.equal(current.panelManager.needsGeometryApply,false);
  assert.deepEqual(current.svgModel.panels.map(p=>p.id),prior.svgModel.panels.map(p=>p.id));
  assert.deepEqual(current.svgModel.edges.map(e=>e.id),oldEdges);
  assert.deepEqual(Object.values(current.panelManager.panels).map(p=>p.thicknessMm),Object.values(prior.panelManager.panels).map(p=>p.thicknessMm));
  assert.equal(current.edgeAssignments,prior.edgeAssignments);
  assert.deepEqual(after.chronology.filter(e=>e.sourceId===first).map(e=>e.id),ids);
  assert.notDeepEqual(current.generatedGeometrySnapshot.generatedGeometry,prior.generatedGeometrySnapshot.generatedGeometry);
  assert.equal(after.boxSources.sketches[second],before.boxSources.sketches[second]);
  owner.traverse('undo'); assert.equal(owner.getSnapshot(),before);
  owner.traverse('redo'); assert.equal(owner.getSnapshot(),after);
});

test('incompatible TB resize accepts Drawing and blocks stale output with group diagnostic', () => {
  const {owner,first,edit} = appliedTBProject();
  const before = owner.getSnapshot();
  const prior = before.boxSources.sketches[first];
  const result = edit(s=>resizeRectangle(s,'b',0.5));
  assert.equal(result.outcome,'accepted',result.error?.message);
  const after = owner.getSnapshot();
  const current = after.boxSources.sketches[first];
  assert.equal(current.edgeAssignments,prior.edgeAssignments);
  assert.equal(current.panelManager.isApplied,true);
  assert.equal(current.panelManager.needsGeometryApply,false);
  assert.equal(current.dependencyDiagnostics?.[0]?.code,'TB_EDGE_LENGTH_MISMATCH');
  assert.equal(current.dependencyDiagnostics?.[0]?.severity,'error');
  assert.equal(current.dependencyDiagnostics?.[0]?.sourceId,first);
  assert.equal(current.dependencyDiagnostics?.[0]?.groupId,after.chronology.find(e=>e.sourceId===first&&e.kind==='TB').groupId);
  assert.deepEqual(current.generatedGeometrySnapshot.generatedGeometry,[]);
  assert.equal(current.appliedGeometryInputs,prior.appliedGeometryInputs);
  owner.traverse('undo'); assert.equal(owner.getSnapshot(),before);
  owner.traverse('redo'); assert.equal(owner.getSnapshot(),after);
});

test('new panel requires Panel Manager review without changing independent source', () => {
  const {owner,first,second,edit} = appliedTBProject();
  const before = owner.getSnapshot();
  const result = edit(s=>rectangle(s,'c',300));
  assert.equal(result.outcome,'accepted',result.error?.message);
  const next = owner.getSnapshot();
  assert.equal(next.boxSources.sketches[first].panelManager.isApplied,false);
  assert.equal(next.boxSources.sketches[first].panelManager.needsGeometryApply,true);
  assert.equal(next.boxSources.sketches[first].panelManager.panels[before.boxSources.sketches[first].svgModel.panels[0].id].thicknessMm,3);
  assert.equal(next.boxSources.sketches[second],before.boxSources.sketches[second]);
  owner.traverse('undo'); assert.equal(owner.getSnapshot(),before);
});

test('pending BOX authoring is not silently included in Drawing regeneration', () => {
  const {owner,c,first,edit} = appliedTBProject();
  c.selectConnectionForDisplayAndAssignment('TB1');
  c.updateConnectionProperties('TB1',{prefix:'TB',updates:{fingerWidthMm:10}});
  const pending = owner.getSnapshot().boxSources.sketches[first];
  const result = edit(s=>resizeRectangle(resizeRectangle(s,'a',120),'b',120));
  assert.equal(result.outcome,'accepted',result.error?.message);
  const next = owner.getSnapshot().boxSources.sketches[first];
  assert.equal(next.panelManager.isApplied,true);
  assert.equal(next.panelManager.needsGeometryApply,true);
  assert.equal(next.appliedGeometryInputs,pending.appliedGeometryInputs);
  assert.equal(next.connections.TB1.properties.fingerWidthMm,10);
  assert.notDeepEqual(next.generatedGeometrySnapshot.generatedGeometry,pending.generatedGeometrySnapshot.generatedGeometry);
  const accepted = api.evaluateAppliedGeometry({...next,connections:next.appliedGeometryInputs.connections},'mixed');
  assert.deepEqual(next.generatedGeometrySnapshot.generatedGeometry,accepted.snapshot.generatedGeometry);
  assert.deepEqual(next.dependencyDiagnostics,[]);
});

test('a later compatible edit can restore a blocked TB batch without another Apply', () => {
  const {owner,first,edit} = appliedTBProject();
  edit(s=>resizeRectangle(s,'b',0.5));
  assert.equal(owner.getSnapshot().boxSources.sketches[first].dependencyDiagnostics?.[0]?.code,'TB_EDGE_LENGTH_MISMATCH');
  const result = edit(s=>resizeRectangle(s,'b',100));
  assert.equal(result.outcome,'accepted',result.error?.message);
  const restored = owner.getSnapshot().boxSources.sketches[first];
  assert.equal(restored.panelManager.needsGeometryApply,false);
  assert.deepEqual(restored.dependencyDiagnostics,[]);
  assert.equal(isSourceApproved(restored),true);
});

test('an equivalent legacy snapshot establishes approved inputs before an empty blocked result', () => {
  const {owner,first} = appliedTBProject();
  const project = owner.getSnapshot();
  const {appliedGeometryInputs,generatedGeometryDrawingRevision,...legacyBox} = project.boxSources.sketches[first];
  const legacy = api.createGlobalProjectHistory({...project,
    boxSources:{...project.boxSources,sketches:{...project.boxSources.sketches,[first]:legacyBox}}});
  const resize = width => api.projectDrawingActions(legacy).transact('Drawing resize',doc=>({...doc,
    sketches:{...doc.sketches,one:resizeRectangle(doc.sketches.one,'b',width)}}));
  assert.equal(resize(120).outcome,'accepted');
  const blocked = legacy.getSnapshot().boxSources.sketches[first];
  assert.deepEqual(blocked.appliedGeometryInputs,appliedGeometryInputs);
  assert.notEqual(blocked.generatedGeometryDrawingRevision,generatedGeometryDrawingRevision);
  assert.deepEqual(blocked.generatedGeometrySnapshot.generatedGeometry,[]);
  assert.equal(blocked.dependencyDiagnostics[0].code,'TB_EDGE_LENGTH_MISMATCH');
  assert.equal(resize(100).outcome,'accepted');
  const recovered = legacy.getSnapshot().boxSources.sketches[first];
  assert.deepEqual(recovered.generatedGeometrySnapshot.generatedGeometry,legacyBox.generatedGeometrySnapshot.generatedGeometry);
  assert.deepEqual(recovered.dependencyDiagnostics,[]);
});

test('unrelated open Line preserves blocked TB until repaired, with one history step per Drawing edit', () => {
  const {owner,first,second,edit} = appliedTBProject();
  const original = owner.getSnapshot();
  const ids = original.chronology.map(entry=>[entry.id,entry.groupId]);
  edit(s=>resizeRectangle(s,'b',0.5));
  const blocked = owner.getSnapshot();
  const failure = blocked.boxSources.sketches[first].dependencyDiagnostics;
  assert.equal(failure?.[0]?.code,'TB_EDGE_LENGTH_MISMATCH');
  assert.equal(sourceStatus(blocked.boxSources.sketches[first]),'Blocked · needs repair');
  const count = owner.getHistory().undo.length;
  edit(s=>polygon(s,'open',[[300,0],[320,10]],false));
  const unrelated = owner.getSnapshot();
  const box = unrelated.boxSources.sketches[first];
  assert.equal(owner.getHistory().undo.length,Math.min(count+1,30));
  assert.equal(box.generatedGeometrySnapshot,blocked.boxSources.sketches[first].generatedGeometrySnapshot);
  assert.deepEqual(box.dependencyDiagnostics,failure);
  assert.equal(box.panelManager.needsGeometryApply,false);
  assert.equal(sourceStatus(box),'Blocked · needs repair');
  assert.equal(unrelated.boxSources.sketches[second],original.boxSources.sketches[second]);
  assert.deepEqual(unrelated.chronology.map(entry=>[entry.id,entry.groupId]),ids);
  owner.traverse('undo'); assert.equal(owner.getSnapshot(),blocked);
  owner.traverse('redo'); assert.equal(owner.getSnapshot(),unrelated);
  edit(s=>resizeRectangle(s,'b',100));
  const repaired = owner.getSnapshot();
  assert.deepEqual(repaired.boxSources.sketches[first].dependencyDiagnostics,[]);
  assert.equal(repaired.boxSources.sketches[first].panelManager.needsGeometryApply,false);
  assert.equal(sourceStatus(repaired.boxSources.sketches[first]),'Approved');
  assert.deepEqual(repaired.chronology.map(entry=>[entry.id,entry.groupId]),ids);
  owner.traverse('undo'); assert.equal(owner.getSnapshot(),unrelated);
  owner.traverse('redo'); assert.equal(owner.getSnapshot(),repaired);
});

test('blocked recovery keeps pending BOX width behind explicit Apply', () => {
  const {owner,c,first,second,edit} = appliedTBProject();
  const original = owner.getSnapshot();
  edit(s=>resizeRectangle(s,'b',0.5));
  const blocked = owner.getSnapshot();
  c.selectConnectionForDisplayAndAssignment('TB1');
  c.updateConnectionProperties('TB1',{prefix:'TB',updates:{fingerWidthMm:10}});
  const pending = owner.getSnapshot();
  assert.equal(c.errorMessage,'');
  assert.equal(pending.boxSources.sketches[first].connections.TB1.properties.fingerWidthMm,10);
  edit(s=>resizeRectangle(s,'b',100));
  const repaired = owner.getSnapshot();
  const box = repaired.boxSources.sketches[first];
  assert.equal(box.connections.TB1.properties.fingerWidthMm,10);
  assert.equal(box.panelManager.needsGeometryApply,true);
  assert.equal(sourceStatus(box),'BOX changes · needs Apply');
  assert.deepEqual(box.generatedGeometrySnapshot.generatedGeometry,original.boxSources.sketches[first].generatedGeometrySnapshot.generatedGeometry);
  assert.equal(box.appliedGeometryInputs,blocked.boxSources.sketches[first].appliedGeometryInputs);
  assert.deepEqual(box.dependencyDiagnostics,[]);
  assert.equal(repaired.boxSources.sketches[second],original.boxSources.sketches[second]);
  assert.deepEqual(repaired.chronology,original.chronology);
  owner.traverse('undo'); assert.equal(owner.getSnapshot(),pending);
  owner.traverse('redo'); assert.equal(owner.getSnapshot(),repaired);
  Object.defineProperty(c,'box',{get:()=>owner.getBoxScope().box});
  c.URL={createObjectURL:()=>assert.fail('Pending geometry was serialized')};
  production('exportSvg',c)();
  assert.match(c.errorMessage,/Apply geometry for the current Sketch before exporting/);
  c.applyPanelPaths();
  assert.equal(c.errorMessage,'');
  const applied = owner.getSnapshot().boxSources.sketches[first];
  assert.equal(applied.connections.TB1.properties.fingerWidthMm,10);
  assert.equal(applied.panelManager.needsGeometryApply,false);
  assert.deepEqual(applied.dependencyDiagnostics,[]);
  assert.notDeepEqual(applied.generatedGeometrySnapshot.generatedGeometry,
    original.boxSources.sketches[first].generatedGeometrySnapshot.generatedGeometry);
});

test('export command rejects a diagnostic even if Apply state alone would permit export', () => {
  const {owner,first,edit} = appliedTBProject();
  edit(s=>resizeRectangle(s,'b',0.5));
  const blocked = owner.getSnapshot();
  assert.equal(blocked.boxSources.sketches[first].panelManager.needsGeometryApply,false);
  const {projectOwner:exportOwner,context:c} = harness(blocked);
  Object.defineProperty(c,'box',{get:()=>exportOwner.getBoxScope().box});
  c.downloadRef={current:{click:()=>assert.fail('Blocked geometry was downloaded')}};
  c.URL={createObjectURL:()=>assert.fail('Blocked geometry was serialized')};
  production('exportSvg',c)();
  assert.match(c.errorMessage,/Repair blocked BOX geometry/);
  assert.equal(sourceStatus(exportOwner.getBoxScope().box),'Blocked · needs repair');
});
