'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {api, harness} = require('./project-owner-harness.cjs');
const {drawingPanelModel} = require('../.test-build/project-owner/src/app/drawingPanelSource.js');
const {isSourceApproved} = require('../.test-build/project-owner/src/app/boxSources.js');
const {createEmptySketch} = require('../.test-build/project-owner/src/app/drawingTypes.js');

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
  assert.equal(sources()[first].panelManager.isApplied,false);
  assert.equal(sources()[first].svgModel.panels.length,2);
  assert.equal(sources()[first].panelManager.needsGeometryApply,true);
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
    assert.equal(entries().length,before.length+1,c.errorMessage);
  };
  for (const id of [one,two]) { select(id); c.acceptDefaultPanelThickness(); c.applyPanelManager(); }
  start(one,'TB',0);
  const box = owner.getBoxScope().box;
  c.assignSelectedLabelToEdge(box.svgModel.panels[1].outerEdgeIds[0]);
  start(two,'TB',0); start(one,'TB',2); start(two,'W',1);
  const ordered = entries();
  assert.deepEqual(ordered.map(e=>[e.sourceId,e.connectionId ?? e.kind]),[
    [one,'sketch'],[two,'sketch'],[one,'PM'],[two,'PM'],[one,'TB1'],[two,'TB1'],[one,'TB2'],[two,'W1']]);
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
  assert.ok(migrated.chronology.some(e=>e.sourceId===one && e.connectionId==='TB2'));
  assert.ok(migrated.chronology.some(e=>e.sourceId===two && e.connectionId==='W1'));
  owner.clearProject(); assert.deepEqual(entries(),[]);
});

test('one atomic batch records its authored connection order and rolls back abandoned child work', () => {
  const {projectOwner: owner, context: c} = harness();
  c.finishGroup('TB'); c.finishGroup('S');
  c.startGroup('TB'); c.startGroup('S');
  const [tb, slot] = [owner.getSnapshot().box.activeTBGroup,owner.getSnapshot().box.activeSGroup].map(g=>g.connectionIds[0]);
  const before = owner.getSnapshot().chronology;
  const author = (tx,id,edgeId) => tx.update(frame=>{
    const box = {...frame.box.data,...frame.box.context,assignmentTargetConnectionId:id};
    const authored = api.assignConstructionEdge(box,edgeId,id);
    return {...frame,box:{...frame.box,data:{...frame.box.data,edgeAssignments:authored.edgeAssignments}}};
  });
  const [first, second] = owner.getSnapshot().box.svgModel.panels.slice(2,4).map(p=>p.edgeIds[2]);
  const result = owner.transact('box','Batch authoring',tx=>{
    tx.nest(child=>{ author(child,tb,second); return 'noop'; });
    author(tx,slot,second); author(tx,tb,first);
    return 'accept';
  });
  assert.equal(result.outcome,'accepted',result.error?.message);
  const after = owner.getSnapshot().chronology;
  assert.deepEqual(after.slice(before.length).map(e=>e.connectionId),[slot,tb]);
  owner.traverse('undo'); assert.equal(owner.getSnapshot().chronology,before);
  owner.traverse('redo'); assert.equal(owner.getSnapshot().chronology,after);
});
