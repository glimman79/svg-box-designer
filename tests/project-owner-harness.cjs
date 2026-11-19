'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const api = require('../.test-build/project-owner/tests/fixtures/project-owner.js');
const {importLockHarness} = require('./svg-import-lock-harness.cjs');

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
  // Run handlers in the same JS realm as their owner and history data, as in App.
  const code=ts.transpile(`return (${declaration.initializer.getText(source).replaceAll('import.meta.env.DEV','false')});`, {target:ts.ScriptTarget.ES2022});
  return vm.compileFunction(code, [], {contextExtensions:[context]})();
}
function harness(initial=api.makePopulatedProjectState()) {
  const projectOwner=api.createProjectOwner(initial);
  const lockHarness=importLockHarness(projectOwner);
  const state={errorMessage:'',activeTool:'select'};
  const boxHistory={current:{undo:[],redo:[]}};
  const context=vm.createContext({...api, projectOwner, boxHistory, boxTransactions:api.createBoxTransactionAdapter(projectOwner), importLock:lockHarness.lock, structuredClone, Error,
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
  Object.defineProperty(context,'undoStack',{get:()=>boxHistory.current.undo});
  Object.defineProperty(context,'redoStack',{get:()=>boxHistory.current.redo});
  for(const key of ['errorMessage','activeTool','canvasViewBox','activePanelId','activeHoleId','isPanelManagerModalOpen','expandedTBGroups','expandedSGroups','isClearDialogOpen']) {
    Object.defineProperty(context,key,{get:()=>state[key],configurable:true});
    context[`set${key[0].toUpperCase()+key.slice(1)}`]=change=>{
      state[key]=typeof change==='function'?change(state[key]):change;
    };
  }
  context.parseViewBox=()=>({x:0,y:0,width:100,height:100});
  for(const name of ['constructionGroupField','getNextWorkflowGroupOrderIndex','reportBoxResult','recalculateBoxConnections','selectAppliedSnapshot','acceptDefaultPanelThickness','openManufacturing','toggleProfileOffsetProfile','haveProjectSettingsChanged','getCurrentHistoryState','restoreHistoryState','pushUndoState','undoLastEdit','redoLastEdit','updateProjectSettings','updatePanelThickness','applyPanelManager','applyPanelPaths','selectConnectionForDisplayAndAssignment','commitConstruction','startGroup','finishGroup','handleToolClick','getNextLabel',
    'cloneDefaultProperties','createConnectionDefinition','createLabel','assignSelectedLabelToEdge','clearEdgeLabel','updateAssignedRole','updateConnectionProperties','clearProject','handleImport']) context[name]=production(name,context);
  return {projectOwner,context,state,lockHarness};
}

function observeBoxActions(context) {
  const results = [];
  const adapter = context.boxTransactions;
  context.boxTransactions = Object.fromEntries(Object.entries(adapter).map(([key, method]) => [
    key, (...args) => {
      const result = method(...args);
      results.push(result);
      return result;
    },
  ]));
  return results;
}

function assertCompleteFrame(frame, root) {
  assert.equal(frame.drawingDocument, root.drawingDocument);
  const fields = { ...frame.box.data, ...frame.box.context };
  assert.deepEqual(Object.keys(fields).sort(), Object.keys(root.box).sort());
  for (const key of Object.keys(root.box)) assert.equal(fields[key], root.box[key], key);
}

module.exports = { api, harness, production, sources, observeBoxActions, assertCompleteFrame };
