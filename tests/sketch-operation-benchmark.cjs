// Run after npm run test:project-owner in each checkout. Resolve the measured
// implementation from cwd so the same harness can also measure the parent commit.
const assert = require('node:assert/strict');
const path = require('node:path');
const api = require(path.resolve('.test-build/project-owner/tests/fixtures/project-owner.js'));

function measure() {
  const initial = api.makePopulatedProjectState();
  const output = initial.box.generatedGeometrySnapshot;
  initial.box.svgModel.content += '<!--' + 'x'.repeat(2 * 1024 * 1024) + '-->';
  initial.box.generatedGeometrySnapshot = { ...output, generatedGeometry:
    Array.from({ length: 5000 }, (_, i) => ({ ...output.generatedGeometry[0], id: 'item-' + i })) };
  const owner = api.createGlobalProjectHistory(initial);
  owner.navigate('drawing');
  owner.openSketch?.(owner.getSnapshot().drawingDocument.activeSketchId);
  const adapter = api.createDrawingTransactionAdapter(owner);
  global.gc();
  const heap = process.memoryUsage().heapUsed;
  const start = performance.now();
  for (let i = 0; i < 128; i++) {
    const result = adapter.transact('Line', doc => api.appendEntityToActiveSketch(doc, {
      id: 'L' + i, type: 'line', start: { x: 0, y: i }, end: { x: 10, y: i }, startPointId: 'a' + i, endPointId: 'b' + i,
    }));
    assert.equal(result.outcome, 'accepted');
  }
  const publishMs = performance.now() - start;
  assert.equal(owner.getHistory().undo.length, 30);
  assert.equal(owner.getSnapshot().box, initial.box);
  global.gc();
  const retainedBytes = process.memoryUsage().heapUsed - heap;
  const tip = owner.getSnapshot();
  const traversing = performance.now();
  for (const direction of ['undo', 'redo']) {
    for (let i = 0; i < 30; i++) owner.traverse(direction);
  }
  const traverseMs = performance.now() - traversing;
  assert.equal(owner.getSnapshot(), tip);
  owner.finishSketch?.();
  const navigating = performance.now();
  for (let i = 0; i < 10000; i++) owner.navigate(i % 2 ? 'drawing' : 'construction');
  const navigateMs = performance.now() - navigating;
  assert.equal(owner.getSnapshot(), tip);
  return { publishMs, traverseMs, navigateMs, retainedBytes };
}

measure();
const runs = Array.from({ length: 9 }, measure);
console.table(Object.fromEntries(Object.keys(runs[0]).map(key => {
  const samples = runs.map(run => run[key]).sort((a, b) => a - b);
  return [key, { median: samples[4], min: samples[0], max: samples[8] }];
})));
