import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const appSource = readFileSync(resolve(root, 'src/App.tsx'), 'utf8');
const compiled = ts.transpileModule(appSource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
}).outputText;
const module = { exports: {} };
const mockRequire = (id) => {
  if (id === 'react') return { useMemo: () => undefined, useRef: () => ({ current: null }), useState: (v) => [typeof v === 'function' ? v() : v, () => undefined] };
  if (id === 'react/jsx-runtime') return { jsx: () => ({}), jsxs: () => ({}), Fragment: Symbol('Fragment') };
  if (id === './svgUtils') return { exportLabeledSvg: () => '', getEdgeAssignmentDisplayLabel: () => '', getEdgeLabelPlacements: () => [], parseSvgDocument: () => ({ viewBox: '0 0 1 1', edges: [], panels: [], rootAttributes: { viewBox: '0 0 1 1', width: null, height: null }, width: 1, height: 1, content: '', innerMarkup: '' }) };
  return require(id);
};
vm.runInNewContext(compiled, { require: mockRequire, module, exports: module.exports, console, structuredClone, URL, Blob }, { filename: 'App.cjs' });

const { buildAppliedEPanelPaths, buildAppliedSGeometry, createTabSegmentPlan, exportAppliedSvg } = module.exports;

const edge = (id, start, end) => ({ id, source: id, start, end });
const panel = (id, x, y, width, height) => {
  const points = [{ x, y }, { x: x + width, y }, { x: x + width, y: y + height }, { x, y: y + height }];
  return {
    id,
    contour: points,
    bounds: { minX: x, maxX: x + width, minY: y, maxY: y + height },
    edgeIds: [`${id}-top`, `${id}-right`, `${id}-bottom`, `${id}-left`],
  };
};
const modelForPanels = (panels, { width = 320, height = 240, viewBox = `0 0 ${width} ${height}` } = {}) => ({
  content: '',
  innerMarkup: '',
  rootAttributes: { width: String(width), height: String(height), viewBox },
  viewBox,
  width,
  height,
  panels,
  edges: panels.flatMap((p) => p.edgeIds.map((id, i) => edge(id, p.contour[i], p.contour[(i + 1) % p.contour.length]))),
});
const connection = (id) => ({ id, prefix: 'E', properties: { materialThicknessMm: 3, fingerWidthMm: 9, isFingerWidthManual: false } });
const pathNumbers = (pathD) => [...pathD.matchAll(/-?\d+(?:\.\d+)?/g)].map((m) => Number(m[0]));
const pathBounds = (pathD) => {
  const nums = pathNumbers(pathD);
  const xs = nums.filter((_, i) => i % 2 === 0);
  const ys = nums.filter((_, i) => i % 2 === 1);
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
};
const pathPoints = (pathD) => {
  const nums = pathNumbers(pathD);
  const pts = [];
  for (let i = 0; i < nums.length; i += 2) pts.push({ x: nums[i], y: nums[i + 1] });
  return pts;
};
const assertNoInteriorSpur = (pathD) => {
  const pts = pathPoints(pathD).map((point) => `${point.x},${point.y}`);
  for (let i = 0; i < pts.length - 2; i += 1) assert.notEqual(pts[i], pts[i + 2], `interior backtrack spur at ${pts[i]}`);
};
const assertClosedPath = (pathD, message) => assert.match(pathD.trim(), /Z$/, message);
const assertNoLabelsOrUiArtifacts = (svg) => {
  assert.doesNotMatch(svg, /<text\b|data-edge-label|label|handle|overlay|button/i, 'export contains no labels or UI artifacts');
};
const segmentDistances = (segments) => JSON.parse(JSON.stringify(segments.map((segment) => [Number(segment.startDistance.toFixed(6)), Number(segment.endDistance.toFixed(6))])));
const runCase = (name, panels, assignments, connections) => {
  const svgModel = modelForPanels(panels);
  const result = buildAppliedEPanelPaths(svgModel, assignments, connections);
  assert.equal(result.length, panels.length, `${name}: panel count preserved`);
  assert.deepEqual(result.map((p) => p.edgeIds), panels.map((p) => p.edgeIds), `${name}: edge ownership preserved`);
  result.forEach((applied, i) => {
    const bounds = pathBounds(applied.pathD);
    assert.equal(bounds.minX, panels[i].bounds.minX, `${name}: minX preserved`);
    assert.equal(bounds.maxX, panels[i].bounds.maxX, `${name}: maxX preserved`);
    assert.equal(bounds.minY, panels[i].bounds.minY, `${name}: minY preserved`);
    assert.equal(bounds.maxY, panels[i].bounds.maxY, `${name}: maxY preserved`);
    assertNoInteriorSpur(applied.pathD);
    assertClosedPath(applied.pathD, `${name}: contour is closed`);
  });
  const exported = exportAppliedSvg(svgModel, result);
  assert.match(exported, /viewBox="0 0 320 240"/, `${name}: exported viewBox preserved`);
  assert.match(exported, /width="320"/, `${name}: exported width preserved`);
  assert.match(exported, /height="240"/, `${name}: exported height preserved`);
  assertNoLabelsOrUiArtifacts(exported);
  return result;
};

const single = panel('p1', 20, 20, 100, 80);
const eTabPlan = createTabSegmentPlan(94, 9);
assert.deepEqual(segmentDistances(eTabPlan), [[0, 15.5], [15.5, 24.5], [24.5, 33.5], [33.5, 42.5], [42.5, 51.5], [51.5, 60.5], [60.5, 69.5], [69.5, 78.5], [78.5, 94]], 'E tab spacing baseline remains stable');
runCase('A-B', [single], { 'p1-top': { connectionId: 'E1', edgeRole: 'A' }, 'p1-right': { connectionId: 'E1', edgeRole: 'B' } }, { E1: connection('E1') });
runCase('B-A', [single], { 'p1-top': { connectionId: 'E1', edgeRole: 'B' }, 'p1-right': { connectionId: 'E1', edgeRole: 'A' } }, { E1: connection('E1') });
runCase('A-B B-A alternating box', [single], { 'p1-top': { connectionId: 'E1', edgeRole: 'A' }, 'p1-right': { connectionId: 'E1', edgeRole: 'B' }, 'p1-bottom': { connectionId: 'E1', edgeRole: 'B' }, 'p1-left': { connectionId: 'E1', edgeRole: 'A' } }, { E1: connection('E1') });
runCase('All A', [single], Object.fromEntries(single.edgeIds.map((id) => [id, { connectionId: 'E1', edgeRole: 'A' }])), { E1: connection('E1') });
const allB = runCase('All B', [single], Object.fromEntries(single.edgeIds.map((id) => [id, { connectionId: 'E1', edgeRole: 'B' }])), { E1: connection('E1') });
assert.match(allB[0].pathD, /20 20/, 'B-B corner remains closed at the original corner');
assert.doesNotMatch(allB[0].pathD, /23 23 L 20 20 L 23 23/, 'E B-B corner does not backtrack through the original corner');
const mixed = panel('p2', 140, 30, 120, 90);
runCase('Mixed E1/E2/E3/E4 assignments', [single, mixed], {
  'p1-top': { connectionId: 'E1', edgeRole: 'A' }, 'p1-right': { connectionId: 'E2', edgeRole: 'B' }, 'p1-bottom': { connectionId: 'E3', edgeRole: 'A' }, 'p1-left': { connectionId: 'E4', edgeRole: 'B' },
  'p2-top': { connectionId: 'E1', edgeRole: 'B' }, 'p2-right': { connectionId: 'E2', edgeRole: 'A' }, 'p2-bottom': { connectionId: 'E3', edgeRole: 'B' }, 'p2-left': { connectionId: 'E4', edgeRole: 'A' },
}, { E1: connection('E1'), E2: connection('E2'), E3: connection('E3'), E4: connection('E4') });
console.log('E-system baseline tests passed');

const sConnection = (id) => ({ id, prefix: 'S', properties: { slotOffsetMm: 0, slotWidthMm: 3, slotLengthMm: 9, isSlotLengthManual: false, materialThicknessMm: 3, kerfMm: 0.15, playMm: 0 } });

const sPanel = panel('sPanel', 10, 10, 100, 50);
const receiver = panel('receiver', 10, 100, 140, 40);
const sModel = modelForPanels([sPanel, receiver], { width: 200, height: 180 });
const sAssignments = {
  'sPanel-top': { connectionId: 'S1', slotRole: 'A' },
  'receiver-top': { connectionId: 'S1', slotRole: 'B' },
};
const sResult = buildAppliedSGeometry(sModel, sAssignments, { S1: sConnection('S1') }, 5);
assert.equal(sResult.length, 1, 'S1-A/S1-B complete pair generates one S geometry record');
assert.equal(sResult[0].panelPaths.length, 1, 'S-A produces one panel replacement');
const expectedASegments = createTabSegmentPlan(100, 9).filter((_, segmentIndex) => segmentIndex % 2 === 1);
assert.equal(expectedASegments[0].endDistance - expectedASegments[0].startDistance, 9, 'S-A default tab size is materialThicknessMm × 3');
assert.deepEqual(segmentDistances(expectedASegments), [[9.5, 18.5], [27.5, 36.5], [45.5, 54.5], [63.5, 72.5], [81.5, 90.5]], 'S tab spacing baseline remains stable');
assert.equal(sResult[0].slotPaths.length, expectedASegments.length, 'S-B slot count equals S-A tab count');
sResult[0].slotPaths.forEach((slotPath, index) => {
  const segment = expectedASegments[index];
  assert.equal(slotPath.startDistance, segment.startDistance, 'sharedSlotOffsetMm does not shift slot start distance');
  assert.equal(slotPath.endDistance, segment.endDistance, 'sharedSlotOffsetMm does not shift slot end distance');
  assert.equal(slotPath.endDistance - slotPath.startDistance, segment.endDistance - segment.startDistance, 'S-B slot length equals S-A tab length');
  assertClosedPath(slotPath.pathD, 'S-B slot contour is closed');
});
assert.deepEqual(segmentDistances(sResult[0].slotPaths), [[9.5, 18.5], [27.5, 36.5], [45.5, 54.5], [63.5, 72.5], [81.5, 90.5]], 'S slot spacing baseline remains stable');
const sResultNoOffset = buildAppliedSGeometry(sModel, sAssignments, { S1: sConnection('S1') }, 0);
const firstSlotNoOffsetNumbers = pathNumbers(sResultNoOffset[0].slotPaths[0].pathD);
const firstSlotOffsetNumbers = pathNumbers(sResult[0].slotPaths[0].pathD);
for (let index = 0; index < firstSlotNoOffsetNumbers.length; index += 2) {
  assert.equal(firstSlotOffsetNumbers[index], firstSlotNoOffsetNumbers[index], 'sharedSlotOffsetMm does not move slot coordinates along S-B');
  assert.equal(firstSlotOffsetNumbers[index + 1], firstSlotNoOffsetNumbers[index + 1] + 5, 'sharedSlotOffsetMm moves slot coordinates inward perpendicular to S-B');
}
const sBounds = pathBounds(sResult[0].panelPaths[0].pathD);
assert.equal(sBounds.minX, sPanel.bounds.minX, 'S-A does not protrude outside minX panel bounds');
assert.equal(sBounds.maxX, sPanel.bounds.maxX, 'S-A does not protrude outside maxX panel bounds');
assert.equal(sBounds.minY, sPanel.bounds.minY, 'S-A outer tab faces remain on original edge line');
assert.equal(sBounds.maxY, sPanel.bounds.maxY, 'S-A does not protrude outside maxY panel bounds');
assertClosedPath(sResult[0].panelPaths[0].pathD, 'S-A replacement contour is closed');
assertNoInteriorSpur(sResult[0].panelPaths[0].pathD);
const shortReceiver = panel('shortReceiver', 10, 100, 10, 40);
const shortSModel = modelForPanels([sPanel, shortReceiver], { width: 200, height: 180 });
assert.doesNotThrow(
  () => buildAppliedSGeometry(sModel, sAssignments, { S1: sConnection('S1') }, 200),
  'sharedSlotOffsetMm does not reduce available S-B length',
);
assert.throws(
  () => buildAppliedSGeometry(shortSModel, { 'sPanel-top': { connectionId: 'S1', slotRole: 'A' }, 'shortReceiver-top': { connectionId: 'S1', slotRole: 'B' } }, { S1: sConnection('S1') }, 0),
  /S-B slot pattern extends outside the S-B edge/,
  'out-of-bounds S-B slots validate tab distances only',
);
assert.throws(
  () => buildAppliedSGeometry({ ...sModel, panels: [sPanel] }, sAssignments, { S1: sConnection('S1') }, 5),
  /S-B edge must be part of a valid closed panel so slot offset direction can be determined/,
  'S-B edge must belong to a valid closed panel',
);
assert.throws(
  () => buildAppliedSGeometry(sModel, { ...sAssignments, 'sPanel-right': { connectionId: 'E1', edgeRole: 'A' } }, { S1: sConnection('S1'), E1: connection('E1') }, 0),
  /S-A panel conflicts/,
  'S-A panel conflicts with E-applied geometry on same panel',
);

const multiSConnections = {
  S1: sConnection('S1'),
  S2: sConnection('S2'),
  S3: sConnection('S3'),
};
const multiSAssignments = {
  'sPanel-left': { connectionId: 'S1', slotRole: 'A' },
  'receiver-left': { connectionId: 'S1', slotRole: 'B' },
  'sPanel-top': { connectionId: 'S2', slotRole: 'A' },
  'receiver-top': { connectionId: 'S2', slotRole: 'B' },
  'sPanel-right': { connectionId: 'S3', slotRole: 'A' },
  'receiver-right': { connectionId: 'S3', slotRole: 'B' },
};
const mergedSResult = buildAppliedSGeometry(sModel, multiSAssignments, multiSConnections, 5);
const mergedPanelPaths = mergedSResult.flatMap((geometry) => geometry.panelPaths);
const mergedSlotPaths = mergedSResult.flatMap((geometry) => geometry.slotPaths);
assert.equal(mergedPanelPaths.length, 1, 'three S-A edges on same panel produce one replacement contour');
assert.equal(new Set(mergedPanelPaths.map((panelPath) => panelPath.panelId)).size, 1, 'one panel replacement path per panelId');
assert.equal(mergedPanelPaths[0].panelId, 'sPanel', 'merged S replacement belongs to the S-A panel');
const mergedNumbers = pathNumbers(mergedPanelPaths[0].pathD);
assert.ok(mergedNumbers.includes(13), 'merged contour contains left/top inset sides');
assert.ok(mergedNumbers.includes(107), 'merged contour contains right inset side');
assert.deepEqual(pathBounds(mergedPanelPaths[0].pathD), { minX: 10, maxX: 110, minY: 10, maxY: 60 }, 'merged S contour preserves original panel bounds and removes original-corner artifacts');
const expectedMultiSlotCount = ['sPanel-left', 'sPanel-top', 'sPanel-right'].reduce((count, edgeId) => {
  const sideIndex = sPanel.edgeIds.indexOf(edgeId);
  const sideStart = sPanel.contour[sideIndex];
  const sideEnd = sPanel.contour[(sideIndex + 1) % sPanel.contour.length];
  const sideLength = Math.hypot(sideEnd.x - sideStart.x, sideEnd.y - sideStart.y);
  return count + createTabSegmentPlan(sideLength, 9).filter((_, segmentIndex) => segmentIndex % 2 === 1).length;
}, 0);
assert.equal(mergedSlotPaths.length, expectedMultiSlotCount, 'slot paths are still generated per S connection');
const reorderedSResult = buildAppliedSGeometry(sModel, multiSAssignments, { S3: multiSConnections.S3, S1: multiSConnections.S1, S2: multiSConnections.S2 }, 5);
assert.equal(reorderedSResult.flatMap((geometry) => geometry.panelPaths)[0].pathD, mergedPanelPaths[0].pathD, 'reordering S connections produces identical panel geometry');
assert.equal(reorderedSResult.flatMap((geometry) => geometry.slotPaths).length, mergedSlotPaths.length, 'reordering S connections preserves slot generation');
console.log('S panel merge tests passed');

const eOnly = buildAppliedEPanelPaths(sModel, sAssignments, { S1: sConnection('S1') });
assert.equal(eOnly.length, 0, 'S assignments do not enter E geometry functions');

const exportModel = modelForPanels([sPanel, receiver, panel('untouched', 160, 100, 20, 20)], { width: 200, height: 180 });
const exportSGeometry = buildAppliedSGeometry(exportModel, sAssignments, { S1: sConnection('S1') }, 5);
const exportedS = exportAppliedSvg(exportModel, [], exportSGeometry);
assert.match(exportedS, /viewBox="0 0 200 180"/, 'S export viewBox equals source dimensions');
assert.match(exportedS, /width="200"/, 'S export width equals source dimensions');
assert.match(exportedS, /height="180"/, 'S export height equals source dimensions');
assert.equal([...exportedS.matchAll(/<path/g)].length, exportModel.panels.length + exportSGeometry.flatMap((geometry) => geometry.slotPaths).length, 'export contains all modified panels, unmodified panels, and S slots');
assert.match(exportedS, /M 160 100 L 180 100 L 180 120 L 160 120 Z/, 'export contains unmodified panel contour');
assertNoLabelsOrUiArtifacts(exportedS);
console.log('S geometry and export baseline tests passed');

const sharedBucketAssignments = {
  'receiver-right': { connectionId: 'E3', edgeRole: 'A' },
  'sPanel-top': { connectionId: 'S2', slotRole: 'A' },
  'receiver-top': {
    edgeAssignment: { connectionId: 'E3', edgeRole: 'B' },
    slotAssignments: [{ connectionId: 'S2', slotRole: 'B' }],
  },
};
const sharedBucketConnections = { E3: connection('E3'), S2: sConnection('S2') };
const sharedBucketEGeometry = buildAppliedEPanelPaths(sModel, sharedBucketAssignments, sharedBucketConnections);
const sharedBucketSGeometry = buildAppliedSGeometry(sModel, sharedBucketAssignments, sharedBucketConnections, 5);
assert.equal(sharedBucketEGeometry.length, 1, 'E3-B remains present when S2-B shares the same physical edge');
assert.ok(sharedBucketEGeometry[0].pathD.length > 0, 'shared edge bucket preserves E geometry path data');
assert.equal(sharedBucketSGeometry.length, 1, 'S2 geometry remains present when S2-B shares an edge with E3-B');
assert.ok(sharedBucketSGeometry[0].slotPaths.length > 0, 'shared edge bucket preserves S-B slot geometry');
assert.equal(sharedBucketSGeometry[0].edgeIds[1], 'receiver-top', 'S2-B remains assigned to the shared physical edge');
console.log('E + S-B shared edge bucket tests passed');
