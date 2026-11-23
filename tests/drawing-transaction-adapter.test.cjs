'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const api = require('../.test-build/drawing-transaction-adapter/tests/fixtures/project-owner.js');
const {applyDrawingConstraint, getDrawingConstraintApplicability} = require('../.test-build/drawing-transaction-adapter/src/app/drawingConstraintsTool.js');
const {createCircleRadiusDragTarget, createArcCenterDragTarget, solveDrawingDragCandidate} = require('../.test-build/drawing-transaction-adapter/src/app/drawingDirectManipulation.js');
const {acceptArcEndpoint, commitArcForm, EMPTY_ARC_INTERACTION} = require('../.test-build/drawing-transaction-adapter/src/app/drawingArcTool.js');
const {applyResolvedCircleClick, EMPTY_CIRCLE_INTERACTION} = require('../.test-build/drawing-transaction-adapter/src/app/drawingCircleTool.js');
const {deleteEntityWithDependentDimensions} = require('../.test-build/drawing-transaction-adapter/src/app/drawingDimension.js');
const {captureProjectState} = require('../.test-build/drawing-transaction-adapter/src/app/projectState.js');

function setup(initial = api.makeEmptyProjectState()) {
  const owner = api.createGlobalProjectHistory(initial);
  owner.navigate('drawing');
  owner.openSketch(owner.getSnapshot().drawingDocument.activeSketchId);

  const run = (action, label = 'Drawing edit') => api.createDrawingTransactionAdapter(owner).transact(label, action);
  return {owner, run};
}
const line = id => doc => api.appendEntityToActiveSketch(doc, {
  id, type: 'line', start: {x: 0, y: 0}, end: {x: 10, y: 2},
  startPointId: id + '-a', endPointId: id + '-b',
});
const sketch = document => document.sketches[document.activeSketchId];

test('nested accepted edits publish exactly one complete transition and one global step', () => {
  const {owner, run} = setup(api.makePopulatedProjectState());
  const before = owner.getSnapshot();
  let publications = 0;
  owner.subscribe(() => {
    publications++;
    assert.equal(owner.getHistory().undo.at(-1).frame.drawingDocument, before.drawingDocument);
    assert.ok(sketch(owner.drawingDocumentRef.current).entities.second);
  });
  const result = run([line('first'), [current => {
    assert.ok(sketch(current).entities.first);
    assert.equal(owner.getSnapshot(), before);
    return line('second')(current);
  }]], 'Two linked edits');
  assert.equal(result.outcome, 'accepted');
  const after = owner.getSnapshot();
  const entry = result.history.undo.at(-1);
  assert.equal(result.history.undo.length, 2);
  assert.deepEqual(entry.frame, captureProjectState(before));
  assert.deepEqual(result.frame, captureProjectState(after));
  assert.equal(entry.transaction.label, 'Two linked edits');
  assert.equal(entry.transaction.module, 'drawing');
  assert.equal(entry.frame.drawingDocument, before.drawingDocument);
  assert.equal(result.frame.drawingDocument, after.drawingDocument);
  assert.equal(after.drawingDocument.sketches.beta, before.drawingDocument.sketches.beta);
  assert.equal(after.drawingDocument.sketchOrder, before.drawingDocument.sketchOrder);
  assert.equal(after.box, before.box);
  assert.equal(result.frame.box, entry.frame.box);
  assert.equal(result.frame.box.data.generatedGeometrySnapshot, before.box.generatedGeometrySnapshot);
  assert.equal(publications, 1);
});

test('identity, explicit rejection, nested exceptions and net return to the baseline publish nothing', () => {
  const {owner, run} = setup();
  const before = owner.getSnapshot();
  let publications = 0;
  owner.subscribe(() => publications++);
  assert.equal(run(doc => doc).outcome, 'noop');
  assert.equal(run([line('a'), () => before.drawingDocument]).outcome, 'noop');
  assert.equal(run([line('a'), [() => null, line('ignored')]]).outcome, 'rejected');
  const error = new Error('mutation failed');
  assert.equal(run([line('a'), [() => { throw error; }]]).error, error);
  assert.equal(run(doc => {
    assert.equal(run(line('inner')).outcome, 'rejected');
    return line('outer')(doc);
  }).outcome, 'rejected');
  assert.equal(publications, 0);
  assert.equal(owner.getSnapshot(), before);
  assert.equal(owner.getHistory().undo.length, 1);
});

test('an intervening BOX publication and an open project transaction each prevent stale publication', () => {
  const {owner, run} = setup();
  const before = owner.getSnapshot();
  const result = run(doc => {
    owner.setBoxContext({selectedEdgeId:'new selection'});
    return line('stale')(doc);
  });
  assert.equal(result.outcome, 'rejected');
  assert.equal(owner.drawingDocumentRef.current, before.drawingDocument);
  assert.equal(owner.getHistory().undo.length, 1);
  const outer = owner.transact('box', 'outer', () => {
    assert.equal(run(line('in batch')).outcome, 'rejected');
    return 'accept';
  });
  assert.equal(outer.outcome, 'rejected');
  owner.setBoxContext({displayConnectionId:'new connection'});
  const accepted = run(line('fresh'));
  assert.equal(accepted.frame.box.context.selectedEdgeId, 'new selection');
  assert.equal(accepted.frame.box.context.displayConnectionId, 'new connection');
  assert.deepEqual(sketch(accepted.frame.drawingDocument).entityOrder, ['fresh']);
});

test('subscribers can read the committed edit and immediately start a new action', () => {
  const {owner, run} = setup();
  owner.subscribe(() => {
    if (owner.getHistory().undo.length === 2) {
      assert.ok(sketch(owner.drawingDocumentRef.current).entities.first);
      assert.equal(run(line('second')).outcome, 'accepted');
    }
  });
  const first = run(line('first'));
  assert.equal(first.outcome, 'accepted');
  assert.deepEqual(sketch(owner.drawingDocumentRef.current).entityOrder, ['first', 'second']);
  assert.equal(owner.getHistory().undo.at(-1).frame.drawingDocument, first.frame.drawingDocument);
  assert.deepEqual(owner.getHistory().undo.map(entry => entry.transaction.kind), ['navigation','edit','edit']);
});

test('global restore, branching and the 30-step limit use the current owner as the next baseline', () => {
  const {owner, run} = setup();
  for (let i = 0; i < 102; i++) assert.equal(run(line('L' + i)).history.undo.length, Math.min(i+2,30));
  const tip = owner.drawingDocumentRef.current;
  owner.traverse('undo'); owner.traverse('redo');
  assert.equal(owner.drawingDocumentRef.current, tip);
  owner.traverse('undo');
  const branch = owner.drawingDocumentRef.current;
  const redo = owner.getHistory().redo;
  assert.equal(run(doc => doc).outcome, 'noop');
  assert.equal(run(() => null).outcome, 'rejected');
  assert.equal(owner.getHistory().redo, redo);
  const result = run(line('branch'));
  assert.equal(result.history.undo.at(-1).frame.drawingDocument, branch);
  assert.equal(result.history.undo.length, 30);
  assert.equal(owner.getHistory().redo.length, 0);
  assert.equal(sketch(owner.drawingDocumentRef.current).entities.L101, undefined);
});

test('real Circle/Arc creation, solved modification and deletion preserve the accepted geometry', () => {
  const {owner, run} = setup();
  const [initial] = owner.getSnapshot().constructionOperations;
  owner.subscribe(() => {
    const definitions = api.readSketchDefinitions(owner.getSnapshot());
    assert.equal(definitions.length, 1);
    assert.equal(definitions[0].operation.id, initial.id);
    assert.equal(definitions[0].sketch, sketch(owner.drawingDocumentRef.current));
  });
  const center = applyResolvedCircleClick(EMPTY_CIRCLE_INTERACTION, {x: 0, y: 0}, () => 'circle');
  assert.equal(center.entity, null);
  const circle = applyResolvedCircleClick(center.interaction, {x: 10, y: 0}, () => 'circle').entity;
  run(doc => api.appendCircleToActiveSketch(doc, circle));
  const before = owner.drawingDocumentRef.current;
  const pointer = {x: 10, y: 0};
  const target = createCircleRadiusDragTarget(before, 'circle', pointer);
  const candidate = solveDrawingDragCandidate(before, target, {x: 5, y: 0}, pointer);
  const resized = run(() => candidate);
  assert.equal(resized.outcome, 'accepted');
  assert.deepEqual(resized.frame.drawingDocument, candidate);
  assert.ok(Math.abs(sketch(candidate).entities.circle.radius - 15) < 1e-7);

  const endpoint = point => ({point, pointId: null, midpointLineId: null, lineBodyId: null, curveId: null});
  const first = acceptArcEndpoint(EMPTY_ARC_INTERACTION, endpoint({x: 20, y: 0}));
  const second = acceptArcEndpoint(first, endpoint({x: 40, y: 0}));
  assert.equal(commitArcForm(second, {x: 30, y: 0}, 'arc').entity, null);
  const arc = commitArcForm(second, {x: 30, y: 10}, 'arc').entity;
  assert.equal(owner.getHistory().undo.length, 3);
  run(doc => api.appendArcToActiveSketch(doc, arc));
  const arcStart = owner.drawingDocumentRef.current;
  const moved = solveDrawingDragCandidate(arcStart, createArcCenterDragTarget(arcStart, 'arc'), {x: 3, y: 2});
  assert.equal(run(() => moved).outcome, 'accepted');
  assert.deepEqual(owner.drawingDocumentRef.current, moved);
  assert.equal(run(doc => deleteEntityWithDependentDimensions(doc, 'arc')).outcome, 'accepted');
  assert.equal(run(doc => deleteEntityWithDependentDimensions(doc, 'arc')).outcome, 'noop');
  assert.equal(owner.getHistory().undo.length, 6);
});

test('actual Constraint command rejection rolls back earlier siblings', () => {
  const {owner, run} = setup();
  run(line('line'));
  const selection = [{kind: 'line', lineId: 'line'}];
  const horizontal = api.requireDrawingChange(doc => {
    const item = getDrawingConstraintApplicability(selection, doc).find(item => item.kind === 'horizontal');
    return applyDrawingConstraint(doc, item);
  });
  const accepted = run(horizontal);
  assert.equal(accepted.outcome, 'accepted');
  assert.equal(sketch(accepted.frame.drawingDocument).geometricConstraintOrder.length, 1);
  const before = owner.getSnapshot();
  assert.equal(run([line('discarded'), [horizontal]]).outcome, 'rejected');
  assert.equal(owner.getSnapshot(), before);
});

test('repeated production edits share BOX source and applied geometry without revisiting their records', () => {
  const initial = api.makePopulatedProjectState();
  let visits = 0;
  const probe = {ownKeys(target) { visits++; return Reflect.ownKeys(target); }};
  initial.box.svgModel = new Proxy(initial.box.svgModel, probe);
  initial.box.generatedGeometrySnapshot = new Proxy(initial.box.generatedGeometrySnapshot, probe);
  const {run} = setup(initial);
  // Count actual snapshot writes as well as record traversal. A temporary full
  // copy followed by returning the original would pass identity/clone assertions.
  const define = Object.defineProperty;
  let boxFieldCopies = 0;
  Object.defineProperty = (target, key, descriptor) => {
    if (key === 'innerMarkup' || key === 'generatedGeometry') boxFieldCopies++;
    return define(target, key, descriptor);
  };
  let first;
  try { first = run(line('first')); }
  finally { Object.defineProperty = define; }
  assert.equal(boxFieldCopies, 0);
  assert.equal(first.outcome, 'accepted');
  visits = 0;
  for (let i = 0; i < 45; i++) {
    const result = run(line('line-' + i));
    assert.equal(result.outcome, 'accepted');
    assert.equal(result.frame.box, first.frame.box);
    assert.equal(result.frame.box.data.svgModel, initial.box.svgModel);
    assert.equal(result.frame.box.data.generatedGeometrySnapshot, initial.box.generatedGeometrySnapshot);
  }
  assert.equal(visits, 0);
});

test('Line, driving Dimension and Constraint commands publish and restore the same Sketch lifetime', () => {
  const { appendDimension, createLineDimension } = require('../.test-build/drawing-transaction-adapter/src/app/drawingDimension.js');
  const { solveDrawingDimensionEdit } = require('../.test-build/drawing-transaction-adapter/src/app/drawingConstraintSolver.js');
  const { resolveLine } = require('../.test-build/drawing-transaction-adapter/src/app/drawingTopology.js');
  const { deleteGeometricConstraint } = require('../.test-build/drawing-transaction-adapter/src/app/drawingParallelMarker.js');
  const { owner, run } = setup();
  const baseline = owner.getSnapshot(), states = [baseline];
  const operationId = baseline.constructionOperations[0].id;
  let notifications = 0;
  owner.subscribe(() => {
    const root = owner.getSnapshot(), frame = owner.getHistory().current;
    assert.equal(frame.constructionOperations, root.constructionOperations);
    assert.equal(frame.drawingDocument, root.drawingDocument);
    assert.equal(root.box, baseline.box);
    assert.equal(frame.box.data.generatedGeometrySnapshot, baseline.box.generatedGeometrySnapshot);
    const definitions = api.readSketchDefinitions(root);
    assert.equal(definitions.length, 1);
    assert.equal(definitions[0].operation.id, operationId);
    assert.equal(definitions[0].sketch, sketch(frame.drawingDocument));
    notifications++;
  });
  function accept(action) {
    assert.equal(run(action).outcome, 'accepted');
    const root = owner.getSnapshot();
    assert.notEqual(root.constructionOperations[0].definitionRevision, states.at(-1).constructionOperations[0].definitionRevision);
    states.push(root);
    assert.equal(owner.getHistory().undo.length, states.length);
  }
  accept(line('L'));
  accept(doc => {
    const s = sketch(doc);
    return appendDimension(doc, createLineDimension(resolveLine(s, s.entities.L), 'ALIGNED_DISTANCE', { x: 5, y: 12 }, 'length'));
  });
  for (const targetValue of [30, 50, 70]) {
    accept(document => {
      const result = solveDrawingDimensionEdit({ document, dimensionId: 'length', targetValue });
      assert.ok(result.ok);
      return result.document;
    });
    const s = api.readSketchDefinitions(owner.getSnapshot())[0].sketch;
    assert.equal(s.dimensions.length.value, targetValue);
    const { start, end } = resolveLine(s, s.entities.L);
    assert.ok(Math.abs(Math.hypot(end.x - start.x, end.y - start.y) - targetValue) < 1e-6);
  }
  accept(doc => applyDrawingConstraint(doc,
    getDrawingConstraintApplicability([{ kind: 'line', lineId: 'L' }], doc).find(item => item.kind === 'horizontal')));
  const [constraintId] = sketch(owner.drawingDocumentRef.current).geometricConstraintOrder;
  assert.equal(sketch(owner.drawingDocumentRef.current).geometricConstraints[constraintId].kind, 'HORIZONTAL');
  accept(doc => deleteGeometricConstraint(doc, constraintId));
  assert.deepEqual(sketch(owner.drawingDocumentRef.current).geometricConstraintOrder, []);
  for (let iteration = 0; iteration < 2; iteration++) {
    for (const expected of states.slice(0, -1).reverse()) {
      owner.traverse('undo');
      assert.equal(owner.getSnapshot(), expected);
    }
    for (const expected of states.slice(1)) {
      owner.traverse('redo');
      assert.equal(owner.getSnapshot(), expected);
    }
  }
  assert.equal(notifications, 5 * (states.length - 1));
});
