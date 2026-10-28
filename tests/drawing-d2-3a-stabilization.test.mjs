import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { stripTypeScriptTypes } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = path.resolve('.test-build/d2-3a');
const types = await import(pathToFileURL(path.join(root, 'drawingTypes.js')));
const topology = await import(pathToFileURL(path.join(root, 'drawingTopology.js')));
const line = await import(pathToFileURL(path.join(root, 'drawingProfileTool.js')));
const start = { x: 4.25, y: -7.5 };
const tolerance = 1e-10;

for (const degrees of [0, 22.5, 45, 90]) {
  const radians = (degrees + 1) * Math.PI / 180;
  const preview = line.resolveLinePreviewPoint(start, { x: start.x + 30 * Math.cos(radians), y: start.y + 30 * Math.sin(radians) });
  const acceptedSnapshot = Object.freeze({ ...preview.effectivePreviewPoint });
  const interaction = line.applyResolvedProfileClick(line.EMPTY_PROFILE_INTERACTION, start, () => 'start').interaction;
  const committed = line.applyResolvedProfileClick(interaction, acceptedSnapshot, () => `angle-${degrees}`).entity;
  assert.deepEqual(committed.end, acceptedSnapshot, `${degrees} degree commit is the accepted preview object geometry`);
  const dx = committed.end.x - start.x;
  const dy = committed.end.y - start.y;
  assert.ok(Math.abs(Math.atan2(dy, dx) * 180 / Math.PI - degrees) < tolerance, `${degrees} degree endpoint cannot drift`);
}

const workspace = fs.readFileSync('src/app/DrawingWorkspace.tsx', 'utf8');

// Execute current production functions without coupling this suite to the
// TypeScript compiler API or changing the package script's compile inputs.
const boundarySource = fs.readFileSync('src/app/drawingProfileCommitBoundary.ts', 'utf8');
const boundary = vm.runInNewContext(stripTypeScriptTypes(boundarySource.replace(/^export /gm, ''))
  + '\n({ scheduleDrawingProfileCommit, flushDrawingProfileCommit, cancelDrawingProfileCommit })');
const extracted = (name) => {
  const source = workspace.match(new RegExp(`const ${name} = [\\s\\S]*?\\n  \\};`))?.[0];
  assert.ok(source, `${name} production body is required`);
  return stripTypeScriptTypes(source) + `\n${name}`;
};
const fakeClock = () => {
  let sequence = 0;
  const tasks = new Map(), cancelled = [];
  return { tasks, cancelled, scheduler: {
    setTimeout(callback, delay) { assert.equal(delay, 220); tasks.set(++sequence, callback); return sequence; },
    clearTimeout(handle) { cancelled.push(handle); tasks.delete(handle); },
  }, run() { const callbacks = [...tasks.values()]; tasks.clear(); callbacks.forEach((callback) => callback()); } };
};
const clock = fakeClock(), pending = { current: null };
let interaction = line.initializeProfileSegmentAt(start, 'start'), resolutions = 0, transactions = 0, entities = [];
let accepted = { position: { kind: 'endpoint', point: Object.freeze({ x: 34.25, y: -7.5 }), pointId: 'end' }, interaction };
const context = {
  ...boundary, pendingProfileClickRef: pending, window: clock.scheduler,
  activeTool: 'profile', ctrlSnapOverride: false, CAD_PRIMARY_BUTTON: 0,
  panHandlers: { onPointerDown: () => false, onPointerMove: () => false },
  resolvePlacement: () => { resolutions++; return accepted; },

};
// Use the actual mutation and History transaction bodies, not a mock commit.
const historySource = fs.readFileSync('src/app/drawingHistory.ts', 'utf8');
const history = vm.runInNewContext(stripTypeScriptTypes(historySource.replace(/^import .*\n/gm, '').replace(/^export /gm, ''))
  + '\n({ EMPTY_DRAWING_HISTORY, transactDrawingDocument, undoDrawingDocument })');
const initialDocument = types.createDrawingDocumentV2();
initialDocument.sketches[initialDocument.activeSketchId].points.start = { id: 'start', ...start };
Object.assign(context, {
  historyRef: { current: history.EMPTY_DRAWING_HISTORY }, documentRef: { current: initialDocument },
  transactDrawingDocument: history.transactDrawingDocument,
  setDocument: (document) => { transactions++; entities = [...topology.resolveActiveSketchLines(document)]; },
  setHistoryRevision: () => {},
  pointSequence: { current: 0 }, entitySequence: { current: 0 },
  automaticAxisConstraintKind: line.automaticAxisConstraintKind,
  selectMinimalLineSemanticConstraints: line.selectMinimalLineSemanticConstraints,
  applyResolvedProfileClick: line.applyResolvedProfileClick,
  appendEntityToActiveSketch: line.appendEntityToActiveSketch,
  segmentInteractionRef: { current: interaction }, drawingSnapRef: { current: null },
  setDrawingSnap: () => {}, setSegmentInteraction: (next) => { interaction = next; },
});
context.transactDocument = vm.runInNewContext(extracted('transactDocument'), context);
context.commitSegmentPlacement = vm.runInNewContext(extracted('commitSegmentPlacement'), context);
const down = vm.runInNewContext(extracted('handlePointerDown'), context);
const event = (overrides = {}) => ({ button: 0, detail: 1, pointerId: 1, clientX: 34.25, clientY: -7.5,
  ctrlKey: false, target: { closest: () => null }, ...overrides });
down(event({ button: 1 })); down(event({ button: 2 }));
assert.equal(resolutions, 0, 'only primary input reaches Profile placement');
context.panHandlers.onPointerDown = () => true;
down(event());
assert.equal(resolutions, 0, 'pan ownership prevents placement');
context.panHandlers.onPointerDown = () => false;
down(event());
assert.equal(transactions, 0, 'accepted click does not commit prematurely');
assert.equal(resolutions, 1);
const staleCallback = [...clock.tasks.values()][0];
assert.throws(() => boundary.scheduleDrawingProfileCommit(pending, clock.scheduler, () => {}),
  /already owns the pending commit/, 'a pending transaction rejects competing ownership');
// Hover changes after acceptance cannot replace position or topology.
accepted = { position: { kind: 'endpoint', point: { x: -999, y: 1234 }, pointId: 'wrong' }, interaction };
clock.run(); staleCallback();
assert.equal(transactions, 1, 'timer and stale callback commit exactly once');
assert.equal(resolutions, 1, 'delayed commit never resolves again');
assert.deepEqual(entities[0].end, { x: 34.25, y: -7.5 });
assert.equal(entities[0].endPointId, 'end');

// Rapid accepted clicks flush the prior segment before resolving continuation.
accepted = { position: { kind: 'endpoint', point: { x: 44.25, y: -7.5 }, pointId: 'next' }, interaction };
down(event());
context.resolvePlacement = () => {
  assert.equal(transactions, 2, 'prior click is committed before next placement resolution');
  return { position: { kind: 'endpoint', point: { x: 54.25, y: -7.5 }, pointId: 'last' }, interaction };
};
down(event()); clock.run();
assert.equal(transactions, 3);
assert.equal(context.historyRef.current.undo.length, 3, 'each committed segment owns exactly one Undo entry');
const undone = history.undoDrawingDocument(context.historyRef.current, context.documentRef.current);
assert.equal(topology.resolveActiveSketchLines(undone.document).length, 2, 'one Undo removes exactly one segment');
assert.equal(entities[1].startPointId, 'end');
assert.equal(entities[2].startPointId, 'next');

// Native double-click ignores the second down, then cancels its pending work.
context.resolvePlacement = () => accepted;
down(event());
const cancelledCallback = [...clock.tasks.values()][0];
const beforeDouble = resolutions;
down(event({ detail: 2 }));
assert.equal(resolutions, beforeDouble);
assert.equal(boundary.cancelDrawingProfileCommit(pending, clock.scheduler), true);
clock.run(); cancelledCallback();
assert.equal(transactions, 3, 'cancelled accepted work cannot revive');
assert.equal(boundary.cancelDrawingProfileCommit(pending, clock.scheduler), false);

// A callback from an earlier transaction cannot consume a replacement session.
boundary.scheduleDrawingProfileCommit(pending, clock.scheduler, () => transactions++);
const old = [...clock.tasks.values()][0];
boundary.cancelDrawingProfileCommit(pending, clock.scheduler);
boundary.scheduleDrawingProfileCommit(pending, clock.scheduler, () => transactions++);
old(); assert.equal(transactions, 3); clock.run(); assert.equal(transactions, 4);
assert.equal(boundary.flushDrawingProfileCommit(pending, clock.scheduler), false);

for (const name of ['exitActiveTool', 'selectTool', 'finishProfile']) {
  assert.match(extracted(name), /cancelDrawingProfileCommit\(pendingProfileClickRef, window\)/,
    `${name} explicitly discards pending accepted work`);
}
assert.match(workspace, /useEffect\(\(\) => \(\) => \{\s*cancelDrawingProfileCommit\(pendingProfileClickRef, window\)/,
  'workspace cleanup also cancels pending work');

// Profile acceptance is on primary down; the 4px drag threshold belongs to
// Select geometry/box sessions, not a retired delayed Profile drag gesture.
assert.match(workspace, /onPointerDown=\{handlePointerDown\}/);
assert.match(workspace, /onPointerMove=\{handlePointerMove\}/);
assert.match(workspace, /onPointerUp=\{\(event\) => \{ if \(boxSelectionRef.current\) finishBoxSelection\(event\); else if \(geometryDragRef.current\) finishGeometryDrag\(event\); else if \(dimensionDragRef.current\) finishDimensionDrag\(event\); else panHandlers.onPointerUp\(event\); \}\}/);
const move = vm.runInNewContext(extracted('handlePointerMove'), {
  panHandlers: { onPointerMove: () => false }, boxSelectionRef: { current: null },
  geometryDragRef: { current: null }, dimensionDragRef: { current: null }, activeTool: 'select', isSegmentTool: false,
  resolveDimensionCandidate: () => null, svgRef: { current: null },
  setGeometryPreselection: () => {},
});
move(event()); // no captured session: a stale move must not invoke a solver or commit
const finish = vm.runInNewContext(extracted('finishGeometryDrag'), {
  geometryDragRef: { current: null },
});
finish(event()); // stale release must not transact or attempt capture release
// Exercise threshold, capture cancellation/loss, and release against the same
// live session refs used by production. Geometry solving is a controlled boundary.
assert.match(fs.readFileSync('src/app/drawingDirectManipulation.ts', 'utf8'), /export const DRAWING_DRAG_THRESHOLD_PX = 4;/);
let solved = 0, dragTransactions = 0, captureReleases = 0;
const original = {}, candidate = {};
const dragContext = {
  panHandlers: { onPointerMove: () => false, onPointerCancel: () => {} },
  geometryDragRef: { current: null }, boxSelectionRef: { current: null }, dimensionDragRef: { current: null },
  activeTool: 'select', isSegmentTool: false,
  svgRef: { current: { getScreenCTM: () => ({}) } },
  clientToModelPoint: (point) => point, DRAWING_DRAG_THRESHOLD_PX: 4,
  solveDrawingDragCandidate: () => { solved++; return candidate; },
  setGeometryDrag: () => {}, setGeometryPreselection: () => {}, resolveDimensionCandidate: () => null,
  resolveDrawingPointerOwner: () => ({ kind: 'empty' }), documentRef: { current: original },
  transactDocument: (update) => { assert.equal(update(original), candidate); dragTransactions++; },
  cancelDimensionDrag: () => false,
};
const dragMove = vm.runInNewContext(extracted('handlePointerMove'), dragContext);
const dragFinish = vm.runInNewContext(extracted('finishGeometryDrag'), dragContext);
dragContext.cancelGeometryDrag = vm.runInNewContext(extracted('cancelGeometryDrag'), dragContext);
const newDrag = () => ({ pointerId: 7, startClient: { x: 0, y: 0 }, startModel: { x: 0, y: 0 },
  startDocument: original, candidate: original, exceeded: false, target: { kind: 'point', pointId: 'start' } });
const dragEvent = (x, pointerId = 7) => event({ clientX: x, clientY: 0, pointerId,
  currentTarget: { hasPointerCapture: () => true, releasePointerCapture: () => captureReleases++ } });
dragContext.geometryDragRef.current = newDrag();
dragMove(dragEvent(3.999));
assert.equal(solved, 0, 'below four CSS pixels remains a click');
assert.equal(dragTransactions, 0, 'moving does not commit a document');
dragMove(dragEvent(4));
assert.equal(solved, 1, 'inclusive four CSS pixels starts drag solving');
assert.equal(dragTransactions, 0);
dragFinish(dragEvent(4, 8));
assert.equal(dragTransactions, 0, 'foreign release cannot commit');
dragFinish(dragEvent(4)); dragFinish(dragEvent(4));
assert.equal(dragTransactions, 1, 'matching release transacts the drag exactly once');
assert.equal(captureReleases, 1);
for (const attribute of ['onPointerCancel', 'onLostPointerCapture']) {
  const callback = workspace.match(new RegExp(`${attribute}=\\{(\\(event\\) => \\{[^\\n]*cancelGeometryDrag[^\\n]*?\\})\\}`))?.[1];
  assert.ok(callback, `the root ${attribute} callback is required`);
  const cancel = vm.runInNewContext(`(${callback})`, dragContext);
  dragContext.geometryDragRef.current = newDrag();
  dragMove(dragEvent(4));
  const count = solved;
  cancel(dragEvent(4, 8));
  assert.ok(dragContext.geometryDragRef.current, 'foreign cancellation preserves owned session');
  cancel(dragEvent(4));
  assert.equal(dragContext.geometryDragRef.current, null);
  dragMove(dragEvent(10)); dragFinish(dragEvent(10));
  assert.equal(solved, count, `${attribute}: stale move cannot revive cancelled drag`);
  assert.equal(dragTransactions, 1, `${attribute}: cancellation and stale release never commit`);
}
assert.match(workspace, /if \(panHandlers\.onPointerMove\(event\)\) return;/, 'right-pan skips candidate scanning and preview updates');

console.log('D2.3a Profile stabilization tests passed');
