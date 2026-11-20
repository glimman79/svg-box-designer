'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const api = require('../.test-build/project-history/tests/fixtures/project-history.js');
const {
  PROJECT_HISTORY_LIMIT, createProjectHistory, resetProjectHistory,
  transactProjectHistory, undoProjectHistory, redoProjectHistory,
  captureProjectState, projectProjectState, makeEmptyProjectState, makePopulatedProjectState,
} = api;

const metadata = (id = 'action-1', module = 'drawing') => ({ id, module, label: `Edit ${id}` });
function initial(populated = false) {
  const source = populated ? makePopulatedProjectState() : makeEmptyProjectState();
  source.box.generatedGeometrySnapshot = { ...source.box.generatedGeometrySnapshot,
    metadata: { ...source.box.generatedGeometrySnapshot.metadata, createdTimestamp: '2026-11-18T09:00:00.000Z' } };
  return createProjectHistory(captureProjectState(source));
}
function drawingEdit(frame, name) {
  const id = frame.drawingDocument.activeSketchId;
  return { ...frame, drawingDocument: { ...frame.drawingDocument,
    sketches: { ...frame.drawingDocument.sketches,
      [id]: { ...frame.drawingDocument.sketches[id], name } } } };
}
const boxEdit = (frame, kerfMm) => ({ ...frame, box: { ...frame.box, data: { ...frame.box.data,
  projectSettings: { ...frame.box.data.projectSettings, kerfMm } } } });
const accept = (history, frame, meta = metadata()) => transactProjectHistory(history, meta, tx => {
  tx.update(() => frame); return 'accept';
});
const edit = (history, id) => accept(history, drawingEdit(history.current, String(id)), metadata(String(id))).history;
function assertFrozen(value, seen = new WeakSet()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return;
  seen.add(value); assert.ok(Object.isFrozen(value));
  Object.values(value).forEach(child => assertFrozen(child, seen));
}
function withRoundTrip(before, after, check) {
  const history = accept(createProjectHistory(before), after).history;
  const undone = undoProjectHistory(history);
  assert.equal(undone.frame, before);
  check(projectProjectState(undone.frame));
  const redone = redoProjectHistory(undone.history);
  assert.equal(redone.frame, history.current);
  assert.deepEqual(projectProjectState(redone.frame), projectProjectState(after));
  return redone;
}

test('empty initialization preserves complete capture with zero available transitions', () => {
  const history = initial();
  assert.deepEqual(history.undo, []); assert.deepEqual(history.redo, []);
  assert.equal(history.current.drawingDocument.schemaVersion, 2);
  assert.deepEqual(history.current.box.data.generatedGeometrySnapshot.generatedGeometry, []);
  assertFrozen(history);
});

test('one accepted change preserves the complete before frame and metadata once', () => {
  const before = initial(true); const meta = metadata();
  const result = accept(before, drawingEdit(before.current, 'Edited'), meta);
  assert.equal(result.outcome, 'accepted'); assert.equal(result.frame, result.history.current);
  assert.equal(result.history.undo.length, 1); assert.equal(result.history.redo.length, 0);
  assert.equal(result.history.undo[0].frame, before.current);
  assert.deepEqual(result.history.undo[0].transaction, { ...meta, kind: 'edit' });
  meta.label = 'Later UI change';
  assert.equal(result.history.undo[0].transaction.label, 'Edit action-1');
  assertFrozen(result.history); assert.equal(before.undo.length, 0);
});

test('rejected outer transaction discards all staged data and preserves the exact history', () => {
  const history = initial();
  const result = transactProjectHistory(history, metadata(), tx => {
    tx.update(frame => drawingEdit(frame, 'Rejected')); return 'reject';
  });
  assert.equal(result.outcome, 'rejected'); assert.equal(result.history, history); assert.equal(result.frame, history.current);
});

test('explicit noop discards staged changes; identical-root accept is also noop', () => {
  const history = initial();
  for (const action of [() => 'noop', () => 'accept', tx => { tx.update(frame => frame); return 'accept'; },
    tx => { tx.update(frame => drawingEdit(frame, 'Discard')); return 'noop'; }]) {
    const result = transactProjectHistory(history, metadata(), action);
    assert.equal(result.outcome, 'noop'); assert.equal(result.history, history);
  }
});

test('semantic no-op is the adapter decision, without a deep comparison of new roots', () => {
  const history = initial();
  const sameValues = structuredClone(history.current);
  assert.equal(transactProjectHistory(history, metadata(), tx => {
    tx.update(() => sameValues); return 'noop';
  }).history, history);
  // A caller claiming change for a distinct root is trusted; no CAD policy is invented.
  assert.equal(accept(history, sameValues).outcome, 'accepted');
});

test('accepted nested Drawing and BOX updates produce one complete logical transition', () => {
  const history = initial(true);
  const result = transactProjectHistory(history, metadata('combined'), tx => {
    tx.update(frame => drawingEdit(frame, 'Source edit'));
    assert.equal(tx.nest(child => {
      child.update(frame => boxEdit(frame, .31));
      assert.equal(child.nest(grandchild => {
        grandchild.update(frame => ({ ...frame, box: { ...frame.box,
          context: { ...frame.box.context, displayConnectionId: 'S1' } } }));
        return 'accept';
      }).outcome, 'accepted');
      return 'accept';
    }).outcome, 'accepted');
    assert.equal(tx.getCandidate().box.data.projectSettings.kerfMm, .31);
    assert.equal(history.current.box.data.projectSettings.kerfMm, .17);
    return 'accept';
  });
  assert.equal(result.history.undo.length, 1);
  assert.equal(result.frame.box.context.displayConnectionId, 'S1');
  assert.equal(undoProjectHistory(result.history).frame, history.current);
  assert.equal(redoProjectHistory(undoProjectHistory(result.history).history).frame, result.frame);
});

test('nested rejection poisons the outer action even when its result is ignored', () => {
  const history = initial();
  const result = transactProjectHistory(history, metadata(), tx => {
    tx.update(frame => drawingEdit(frame, 'Outer'));
    tx.nest(child => { child.update(frame => boxEdit(frame, .7)); return 'reject'; });
    return 'accept';
  });
  assert.equal(result.outcome, 'rejected'); assert.equal(result.history, history);
});

test('nested noop rolls back its savepoint while allowing valid outer changes', () => {
  const history = initial();
  const result = transactProjectHistory(history, metadata(), tx => {
    tx.update(frame => drawingEdit(frame, 'Outer'));
    const saved = tx.getCandidate();
    assert.equal(tx.nest(child => { child.update(frame => boxEdit(frame, 99)); return 'noop'; }).outcome, 'noop');
    assert.equal(tx.getCandidate(), saved);
    return 'accept';
  });
  assert.equal(result.outcome, 'accepted');
  assert.equal(result.frame.box, history.current.box);
});

test('outer noop discards accepted children; returning to the original root consumes no step', () => {
  const history = initial();
  for (const restore of [false, true]) {
    const result = transactProjectHistory(history, metadata(), tx => {
      tx.nest(child => { child.update(frame => drawingEdit(frame, 'Child')); return 'accept'; });
      if (restore) tx.update(() => history.current);
      return restore ? 'accept' : 'noop';
    });
    assert.equal(result.outcome, 'noop'); assert.equal(result.history, history);
  }
});

test('outer exception returns its diagnostic and rolls back complete project data', () => {
  const history = initial(); const error = new Error('Failed preparation');
  const result = transactProjectHistory(history, metadata(), tx => {
    tx.update(frame => drawingEdit(frame, 'Candidate')); throw error;
  });
  assert.equal(result.outcome, 'rejected'); assert.equal(result.error, error); assert.equal(result.history, history);
});

test('caught nested exception still rejects the outer action and preserves the first error', () => {
  const history = initial(); const error = new Error('Inner failure');
  const result = transactProjectHistory(history, metadata(), tx => {
    const inner = tx.nest(child => { child.update(frame => boxEdit(frame, 3)); throw error; });
    assert.equal(inner.error, error);
    assert.throws(() => { inner.outcome = 'accepted'; }, TypeError);
    assert.throws(() => tx.update(frame => drawingEdit(frame, 'After failure')), /rejected/);
    return 'accept';
  });
  assert.equal(result.outcome, 'rejected'); assert.equal(result.error, error); assert.equal(result.history, history);
});

test('updater exception and reentrant inner failure cannot partially accept data', () => {
  const history = initial();
  for (const reentrant of [false, true]) {
    const result = transactProjectHistory(history, metadata(), tx => {
      tx.update(frame => {
        if (reentrant) tx.nest(() => 'reject'); else throw new Error('Updater failure');
        return drawingEdit(frame, 'Must not publish');
      });
      return 'accept';
    });
    assert.equal(result.outcome, 'rejected'); assert.equal(result.history, history);
  }
});

test('closed transaction handles cannot be reused, including nested scopes', () => {
  const history = initial(); const handles = [];
  const result = transactProjectHistory(history, metadata(), tx => {
    handles.push(tx);
    tx.nest(child => { handles.push(child); return 'accept'; });
    assert.throws(() => handles[1].update(frame => frame), /closed/);
    tx.update(frame => drawingEdit(frame, 'Accepted')); return 'accept';
  });
  for (const tx of handles) {
    assert.throws(() => tx.update(frame => frame), /closed/);
    assert.throws(() => tx.nest(() => 'reject'), /closed/);
    assert.throws(() => tx.getCandidate(), /closed/);
  }
  assert.equal(result.history.undo.length, 1);
});

test('caught updater exceptions and unsupported async updates still reject the complete action', () => {
  const history = undoProjectHistory(edit(initial(), 1)).history;
  for (const update of [() => { throw Error('Caught updater failure'); }, async frame => frame]) {
    const result = transactProjectHistory(history, metadata(), tx => {
      tx.update(frame => drawingEdit(frame, 'Prepared first'));
      assert.throws(() => tx.update(update));
      return 'accept';
    });
    assert.equal(result.outcome, 'rejected'); assert.equal(result.history, history);
    assert.equal(result.history.redo, history.redo);
  }
});

test('invalid and async decisions are rejected without opening an asynchronous session', async () => {
  const history = initial();
  for (const decision of [undefined, 'maybe', Promise.resolve('accept')]) {
    const result = transactProjectHistory(history, metadata(), () => decision);
    assert.equal(result.outcome, 'rejected'); assert.ok(result.error instanceof TypeError);
    assert.equal(result.history, history);
  }
  let leaked;
  const result = transactProjectHistory(history, metadata(), async tx => { leaked = tx; return 'accept'; });
  await Promise.resolve();
  assert.equal(result.outcome, 'rejected'); assert.throws(() => leaked.getCandidate(), /closed/);
});

test('unavailable Undo and Redo preserve exact history identity', () => {
  const history = initial();
  for (const restore of [undoProjectHistory, redoProjectHistory]) {
    assert.deepEqual(restore(history), { history, frame: history.current, changed: false, transaction: null });
    assert.equal(restore(history).history, history);
  }
});

test('Undo and Redo return stored frames and the associated edit metadata without transactions', () => {
  const before = initial(true); const history = edit(before, 1);
  const undone = undoProjectHistory(history);
  assert.equal(undone.frame, before.current); assert.equal(undone.changed, true);
  assert.equal(undone.history.undo.length, 0); assert.equal(undone.history.redo.length, 1);
  assert.equal(undone.history.redo[0].frame, history.current);
  assert.deepEqual(undone.transaction, { ...metadata('1'), kind: 'edit' });
  const redone = redoProjectHistory(undone.history);
  assert.equal(redone.frame, history.current);
  assert.deepEqual(redone.history, history);
  assert.equal(redone.transaction, history.undo[0].transaction);
});

test('new accepted edit after Undo discards the old Redo branch', () => {
  const a = initial(); const b = edit(a, 'b'); const c = edit(b, 'c');
  const undone = undoProjectHistory(c).history;
  const branch = edit(undone, 'd');
  assert.equal(branch.redo.length, 0); assert.equal(branch.undo.length, 2);
  assert.equal(redoProjectHistory(branch).history, branch);
  assert.equal(undoProjectHistory(branch).frame, b.current);
});

test('rejected, failed and noop changes after Undo preserve Redo and capacity', () => {
  const history = undoProjectHistory(edit(initial(), 1)).history;
  for (const decision of ['reject', 'noop', 'exception', 'same']) {
    const result = transactProjectHistory(history, metadata(), tx => {
      if (decision === 'same') return 'accept';
      tx.update(frame => drawingEdit(frame, 'Discard'));
      if (decision === 'exception') throw Error('Failure');
      return decision;
    });
    assert.equal(result.history, history);
    assert.equal(redoProjectHistory(result.history).frame, history.redo[0].frame);
  }
});

test('exactly 30 transitions retain 31 reachable frames; traversal never grows the budget', () => {
  let history = initial(); const frames = [history.current];
  assert.equal(PROJECT_HISTORY_LIMIT, 30);
  for (let i = 1; i <= 30; i++) { history = edit(history, i); frames.push(history.current); }
  assert.equal(history.undo.length, 30);
  for (let i = 29; i >= 0; i--) {
    history = undoProjectHistory(history).history;
    assert.equal(history.current, frames[i]); assert.equal(history.undo.length + history.redo.length, 30);
  }
  assert.equal(undoProjectHistory(history).history, history);
  for (let i = 1; i <= 30; i++) {
    history = redoProjectHistory(history).history;
    assert.equal(history.current, frames[i]); assert.equal(history.undo.length + history.redo.length, 30);
  }
});

test('overflow deterministically evicts the oldest transition, preserving the oldest retained endpoint', () => {
  let history = initial(); const frames = [history.current];
  for (let i = 1; i <= 47; i++) { history = edit(history, i); frames.push(history.current); }
  assert.equal(history.undo.length, 30);
  assert.equal(history.undo[0].frame, frames[17]);
  assert.equal(history.undo[0].transaction.id, '18');
  for (let i = 0; i < 30; i++) history = undoProjectHistory(history).history;
  assert.equal(history.current, frames[17]); assert.equal(undoProjectHistory(history).changed, false);
  for (let i = 0; i < 30; i++) history = redoProjectHistory(history).history;
  assert.equal(history.current, frames[47]);
});

test('capacity after partial Undo and branching counts retained transitions, not lifetime edits', () => {
  let history = initial();
  for (let i = 1; i <= 40; i++) history = edit(history, i);
  for (let i = 0; i < 12; i++) history = undoProjectHistory(history).history;
  const fork = history.current;
  history = edit(history, 'branch');
  assert.equal(history.undo.length, 19); assert.equal(history.redo.length, 0);
  assert.equal(history.undo.at(-1).frame, fork);
  for (let i = 0; i < 20; i++) history = edit(history, `new-${i}`);
  assert.equal(history.undo.length, 30); assert.equal(history.redo.length, 0);
  for (let i = 0; i < 30; i++) history = undoProjectHistory(history).history;
  assert.equal(history.current.drawingDocument.sketches['sketch-1'].name, '19');
});

test('multiple Drawing and BOX edits traverse one coherent project sequence', () => {
  const a = initial(true); const b = edit(a, 'drawing-1');
  const c = accept(b, boxEdit(b.current, .4), metadata('box-1', 'box')).history;
  const d = edit(c, 'drawing-2');
  let history = d;
  for (const expected of [c, b, a]) { const result = undoProjectHistory(history); assert.equal(result.frame, expected.current); history = result.history; }
  for (const expected of [b, c, d]) { const result = redoProjectHistory(history); assert.equal(result.frame, expected.current); history = result.history; }
  assert.equal(d.current.box.data.projectSettings.kerfMm, .4);
});

test('navigation moves the cursor over identical frames and branches only on a switch', () => {
  const baseline = initial(true);
  const switchToBox = history => api.recordWorkspaceNavigation(history, 'drawing', 'construction');
  const switched = switchToBox(baseline);
  const entry = switched.undo[0];
  assert.deepEqual(entry, { transaction: { kind: 'navigation', source: 'drawing', destination: 'construction' } });
  assertFrozen(entry);
  const undone = undoProjectHistory(switched);
  assert.equal(undone.changed, true);
  assert.equal(undone.frame, baseline.current);
  assert.equal(undone.history.redo[0], entry);
  assert.equal(api.recordWorkspaceNavigation(undone.history, 'drawing', 'drawing'), undone.history);
  assert.equal(transactProjectHistory(undone.history, metadata(), () => 'noop').history, undone.history);
  assert.equal(redoProjectHistory(undone.history).history.undo[0], entry);
  assert.equal(switchToBox(undone.history).redo.length, 0);
  assert.equal('activeWorkspace' in baseline.current, false);
});

test('initialization/reset starts a fresh timeline for native Open or explicit project reset', () => {
  const previous = undoProjectHistory(edit(edit(initial(true), 1), 2)).history;
  for (const factory of [createProjectHistory, resetProjectHistory]) {
    for (const baseline of [previous.current, initial().current]) {
      const fresh = factory(baseline);
      assert.equal(fresh.current, baseline); assert.deepEqual(fresh.undo, []); assert.deepEqual(fresh.redo, []);
      assert.equal(undoProjectHistory(fresh).changed, false); assert.equal(redoProjectHistory(fresh).changed, false);
    }
  }
  assert.equal(previous.redo.length, 1, 'older immutable input is unaffected');
});

test('complete DrawingDocumentV2, Sketch identities and all explicit orders restore exactly', () => {
  const before = initial(true).current;
  const source = projectProjectState(before);
  source.drawingDocument.activeSketchId = 'beta'; source.drawingDocument.sketchOrder.reverse();
  source.drawingDocument.sketches.alpha.points.center.x = 3.125;
  withRoundTrip(before, captureProjectState(source), restored => {
    assert.deepEqual(restored.drawingDocument, projectProjectState(before).drawingDocument);
    assert.deepEqual(restored.drawingDocument.sketchOrder, ['beta', 'alpha']);
    assert.equal(restored.drawingDocument.sketches.alpha.id, 'alpha');
    assert.notEqual(restored.drawingDocument.sketches.alpha, restored.drawingDocument.sketches.beta);
  });
});

test('canonical Circle/Arc, shared points and both stored Arc orientations survive traversal', () => {
  for (const orientation of ['CW', 'CCW']) {
    const source = makePopulatedProjectState();
    source.drawingDocument.sketches.alpha.entities.arc.orientation = orientation;
    const before = captureProjectState(source);
    withRoundTrip(before, drawingEdit(before, 'Changed'), restored => {
      const sketch = restored.drawingDocument.sketches.alpha;
      assert.deepEqual(sketch.entities.arc, source.drawingDocument.sketches.alpha.entities.arc);
      assert.deepEqual(sketch.entities.circle, source.drawingDocument.sketches.alpha.entities.circle);
      assert.equal(sketch.entities.arc.startPointId, sketch.entities.line.endPointId);
      assert.equal(sketch.entities.circle.centerPointId, sketch.entities.line.startPointId);
      assert.notEqual(sketch.points.center.id, sketch.points.independent.id);
    });
  }
});

test('Dimensions, Constraints, references, roles, placements and solved coordinates restore verbatim', () => {
  const before = initial(true).current;
  const source = projectProjectState(before);
  source.drawingDocument.sketches.alpha.dimensions.length.value = 15;
  source.drawingDocument.sketches.alpha.points.p1.x = 15;
  delete source.drawingDocument.sketches.alpha.geometricConstraints.curve;
  source.drawingDocument.sketches.alpha.geometricConstraintOrder = ['axis'];
  withRoundTrip(before, captureProjectState(source), restored => {
    const sketch = restored.drawingDocument.sketches.alpha;
    assert.deepEqual(sketch.dimensions, before.drawingDocument.sketches.alpha.dimensions);
    assert.deepEqual(sketch.geometricConstraints, before.drawingDocument.sketches.alpha.geometricConstraints);
    assert.equal(sketch.points.p1.x, 10);
  });
});

test('original SVG, parsed source and source identities survive exact Undo/Redo without import', () => {
  const before = initial(true).current; const next = initial().current;
  withRoundTrip(before, next, restored => {
    assert.deepEqual(restored.box.svgModel, before.box.data.svgModel);
    assert.ok(restored.box.svgModel.content.includes('<!-- original source -->'));
    assert.equal(restored.box.svgModel.edges[0].id, 'panel-a-edge-0');
    assert.equal(restored.box.svgModel.panels[0].outerContour, restored.box.svgModel.panels[0].contour);
  });
});

test('Panel Manager pending/applied state and TB/W/S definitions, assignments and order restore', () => {
  const before = initial(true).current;
  withRoundTrip(before, initial().current, restored => {
    for (const key of ['panelManager', 'connections', 'edgeAssignments', 'activeTBGroup', 'completedTBGroups',
      'activeWallGroup', 'completedWallGroups', 'activeSGroup', 'workflowGroupOrder']) {
      assert.deepEqual(restored.box[key], before.box.data[key], key);
    }
    assert.equal(restored.box.panelManager.isApplied, true); assert.equal(restored.box.panelManager.isDirty, true);
  });
});

test('manufacturing settings and profile targets remain separate from last-applied settings', () => {
  const before = initial(true).current;
  withRoundTrip(before, boxEdit(before, .99), restored => {
    assert.deepEqual(restored.box.projectSettings, before.box.data.projectSettings);
    assert.deepEqual(restored.box.lastAppliedManufacturingSettings, before.box.data.lastAppliedManufacturingSettings);
    assert.notDeepEqual(restored.box.projectSettings, restored.box.lastAppliedManufacturingSettings);
    assert.ok(restored.box.projectSettings.selectedProfileOffsetIds.length > 0);
  });
});

test('complete generated output, operations, timestamps and all composition markers survive', () => {
  for (const marker of [undefined, 'legacy', 'single-tool', 'mixed']) {
    const source = makePopulatedProjectState();
    const metadata = source.box.generatedGeometrySnapshot.metadata;
    metadata.createdTimestamp = '2026-01-02T03:04:05.678Z';
    if (marker === undefined) delete metadata.panelCompositionModel; else metadata.panelCompositionModel = marker;
    const before = captureProjectState(source);
    const result = withRoundTrip(before, drawingEdit(before, 'Changed'), restored => {
      assert.deepEqual(restored.box.generatedGeometrySnapshot, source.box.generatedGeometrySnapshot);
      assert.ok(restored.box.generatedGeometrySnapshot.operations.length > 0);
    });
    assert.equal(result.frame.box.data.generatedGeometrySnapshot, before.box.data.generatedGeometrySnapshot);
    assert.equal(Object.hasOwn(result.frame.box.data.generatedGeometrySnapshot.metadata, 'panelCompositionModel'), marker !== undefined);
  }
});

test('BOX assignment/display/selected-edge restoration context is preserved without fallback', () => {
  const before = initial(true).current;
  withRoundTrip(before, { ...before, box: { ...before.box,
    context: { assignmentTargetConnectionId: null, displayConnectionId: null, selectedEdgeId: null } } }, restored => {
    assert.equal(restored.box.assignmentTargetConnectionId, 'S1');
    assert.equal(restored.box.displayConnectionId, 'W1'); assert.equal(restored.box.selectedEdgeId, 'panel-a-edge-1');
  });
});

test('pure compiled core runs with imports, clock, clone and all runtime services forbidden', () => {
  const corePath = '.test-build/project-history/src/app/projectHistory.js';
  const code = fs.readFileSync(corePath, 'utf8'); const exposed = {};
  const forbidden = () => { throw Error('Unexpected runtime service'); };
  vm.runInNewContext(code, { exports: exposed, Object, Array, require: forbidden,
    Date: forbidden, structuredClone: forbidden, crypto: new Proxy({}, { get: forbidden }) });
  const before = initial(true).current;
  const history = exposed.createProjectHistory(before);
  const next = exposed.transactProjectHistory(history, metadata(), tx => {
    tx.update(frame => drawingEdit(frame, 'Prepared externally')); return 'accept';
  });
  assert.equal(exposed.undoProjectHistory(next.history).frame, before);
  assert.equal(exposed.redoProjectHistory(exposed.undoProjectHistory(next.history).history).frame, next.frame);
  assert.equal(exposed.resetProjectHistory(before).current, before);
  assert.doesNotMatch(code, /require\s*\(|import\s|Date\s*\(|structuredClone\s*\(/);
});

test('unchanged large immutable SVG/generated subtrees are shared across 30 accepted edits', () => {
  const source = makePopulatedProjectState();
  source.box.svgModel.content += '<!--' + 'large-original-svg'.repeat(100000) + '-->';
  const item = source.box.generatedGeometrySnapshot.generatedGeometry[0];
  source.box.generatedGeometrySnapshot.generatedGeometry = Array.from({ length: 5000 }, (_, i) => ({ ...item, id: `stored-${i}` }));
  let history = createProjectHistory(captureProjectState(source));
  const first = history.current; const clone = global.structuredClone;
  let clones = 0;
  global.structuredClone = (...args) => { clones++; return clone(...args); };
  try {
    for (let i = 1; i <= 30; i++) {
      history = edit(history, i);
      assert.equal(history.current.box, first.box);
      assert.equal(history.current.box.data.svgModel, first.box.data.svgModel);
      assert.equal(history.current.box.data.generatedGeometrySnapshot, first.box.data.generatedGeometrySnapshot);
    }
    history = accept(history, boxEdit(history.current, .4)).history;
    assert.equal(history.current.box.data.svgModel, first.box.data.svgModel);
    assert.equal(history.current.box.data.generatedGeometrySnapshot, first.box.data.generatedGeometrySnapshot);
    assert.equal(clones, 0);
  } finally { global.structuredClone = clone; }
  assert.equal(new Set(history.undo.map(entry => entry.frame.box.data.generatedGeometrySnapshot)).size, 1);
});

test('accepted mutable candidates are detached before later nested and external mutations', () => {
  const history = initial(true); const candidate = structuredClone(history.current);
  const expected = structuredClone(candidate);
  const result = transactProjectHistory(history, metadata(), tx => {
    tx.update(() => candidate);
    candidate.drawingDocument.sketches.alpha.points.center.x = 400;
    candidate.box.data.svgModel.edges[0].start.x = 700;
    candidate.box.data.generatedGeometrySnapshot.generatedGeometry[0].geometry.pathD = 'corrupted';
    assert.deepEqual(tx.getCandidate(), expected);
    return 'accept';
  });
  candidate.box.data.activeTBGroup.connectionIds.push('Later');
  assert.deepEqual(result.frame, expected); assertFrozen(result.history);
  assert.equal(history.current.drawingDocument.sketches.alpha.points.center.x, 0);
  assert.throws(() => { result.frame.drawingDocument.sketches.alpha.points.center.x = 999; }, TypeError);
  assert.throws(() => { result.frame.box.data.generatedGeometrySnapshot.generatedGeometry[0].geometry.pathD = ''; }, TypeError);
});

test('shallow-frozen inputs with mutable descendants cannot bypass snapshot isolation', () => {
  const mutable = structuredClone(initial(true).current);
  Object.freeze(mutable); Object.freeze(mutable.box.data.generatedGeometrySnapshot);
  const expected = structuredClone(mutable); const history = createProjectHistory(mutable);
  mutable.box.data.svgModel.panels[0].outerContour[0].x = 999;
  mutable.box.data.generatedGeometrySnapshot.generatedGeometry[0].geometry.pathD = 'later';
  assert.deepEqual(history.current, expected); assert.notEqual(history.current, mutable); assertFrozen(history);
});

test('projection creates independent working data without changing accepted frames or Redo', () => {
  const history = undoProjectHistory(edit(initial(true), 'changed')).history;
  const candidate = projectProjectState(history.current);
  candidate.box.connections.TB1.properties.fingerWidthMm = 44;
  candidate.drawingDocument.sketchOrder.reverse();
  assert.equal(history.current.box.data.connections.TB1.properties.fingerWidthMm, 12.75);
  assert.deepEqual(history.current.drawingDocument.sketchOrder, ['beta', 'alpha']);
  assert.equal(history.redo.length, 1);
});

test('reusing a mutable source identity captures its new data without changing an earlier frame', () => {
  const baseline = initial(true);
  const mutable = structuredClone(baseline.current);
  const first = accept(baseline, mutable).history;
  mutable.drawingDocument.sketches.alpha.points.center.x = 42;
  const second = accept(first, mutable).history;
  mutable.drawingDocument.sketches.alpha.points.center.x = 77;
  assert.equal(first.current.drawingDocument.sketches.alpha.points.center.x, 0);
  assert.equal(second.current.drawingDocument.sketches.alpha.points.center.x, 42);
  assert.equal(undoProjectHistory(second).frame, first.current);
});

test('deterministic mixed action sequence obeys reference timeline and capacity laws', () => {
  let history = initial(); let frames = [history.current]; let cursor = 0;
  let seed = 638;
  for (let i = 0; i < 500; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const action = seed % 5;
    if (action <= 1) {
      history = edit(history, i);
      frames = frames.slice(0, cursor + 1); frames.push(history.current);
      if (frames.length > 31) frames.shift();
      cursor = frames.length - 1;
    } else if (action === 2) { history = undoProjectHistory(history).history; cursor = Math.max(0, cursor - 1); }
    else if (action === 3) { history = redoProjectHistory(history).history; cursor = Math.min(frames.length - 1, cursor + 1); }
    else assert.equal(transactProjectHistory(history, metadata(), () => 'reject').history, history);
    assert.equal(history.current, frames[cursor]);
    assert.equal(history.undo.length, cursor); assert.equal(history.redo.length, frames.length - 1 - cursor);
    assert.ok(history.undo.length + history.redo.length <= 30);
  }
});
