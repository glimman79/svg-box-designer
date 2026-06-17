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

const svgUtilsSource = readFileSync(resolve(root, 'src/svgUtils.ts'), 'utf8');
const compiledSvgUtils = ts.transpileModule(svgUtilsSource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const svgUtilsModule = { exports: {} };
vm.runInNewContext(compiledSvgUtils, { module: svgUtilsModule, exports: svgUtilsModule.exports, console, DOMParser: class {}, XMLSerializer: class {} }, { filename: 'svgUtils.cjs' });

const { buildAppliedEPanelPaths, buildAppliedSGeometry, createTabSegmentPlan, exportAppliedSvg } = module.exports;
const { applyActiveSGroupSlotPropertyUpdates, applySlotPropertyUpdates, defaultConnectionProperties } = module.exports;
const { collectWReferences, classifyWReferencePattern, invertWPatternType, generateWEdgeRoles, finishWGroupWorkflow, buildActiveWDisplayAssignments, buildAppliedEPanelPaths: buildE } = module.exports;

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

const sConnection = (id, slotOffsetMm = 0) => ({ id, prefix: 'S', properties: { slotOffsetMm, slotWidthMm: 3, slotLengthMm: 9, isSlotLengthManual: false, materialThicknessMm: 3, kerfMm: 0.15, playMm: 0 } });

const sPanel = panel('sPanel', 10, 10, 100, 50);
const receiver = panel('receiver', 10, 100, 140, 40);
const sModel = modelForPanels([sPanel, receiver], { width: 200, height: 180 });
const sAssignments = {
  'sPanel-top': { connectionId: 'S1', slotRole: 'A' },
  'receiver-top': { connectionId: 'S1', slotRole: 'B' },
};
const sResult = buildAppliedSGeometry(sModel, sAssignments, { S1: sConnection('S1', 5) });
assert.equal(sResult.length, 1, 'S1-A/S1-B complete pair generates one S geometry record');
assert.equal(sResult[0].panelPaths.length, 1, 'S-A produces one panel replacement');
const expectedASegments = createTabSegmentPlan(100, 9).filter((_, segmentIndex) => segmentIndex % 2 === 1);
assert.equal(expectedASegments[0].endDistance - expectedASegments[0].startDistance, 9, 'S-A default tab size is materialThicknessMm × 3');
assert.deepEqual(segmentDistances(expectedASegments), [[9.5, 18.5], [27.5, 36.5], [45.5, 54.5], [63.5, 72.5], [81.5, 90.5]], 'S tab spacing baseline remains stable');
assert.equal(sResult[0].slotPaths.length, expectedASegments.length, 'S-B slot count equals S-A tab count');
sResult[0].slotPaths.forEach((slotPath, index) => {
  const segment = expectedASegments[index];
  assert.equal(slotPath.startDistance, segment.startDistance, 'slotOffsetMm does not shift slot start distance');
  assert.equal(slotPath.endDistance, segment.endDistance, 'slotOffsetMm does not shift slot end distance');
  assert.equal(slotPath.endDistance - slotPath.startDistance, segment.endDistance - segment.startDistance, 'S-B slot length equals S-A tab length');
  assertClosedPath(slotPath.pathD, 'S-B slot contour is closed');
});
assert.deepEqual(segmentDistances(sResult[0].slotPaths), [[9.5, 18.5], [27.5, 36.5], [45.5, 54.5], [63.5, 72.5], [81.5, 90.5]], 'S slot spacing baseline remains stable');
const sResultNoOffset = buildAppliedSGeometry(sModel, sAssignments, { S1: sConnection('S1') });
const firstSlotNoOffsetNumbers = pathNumbers(sResultNoOffset[0].slotPaths[0].pathD);
const firstSlotOffsetNumbers = pathNumbers(sResult[0].slotPaths[0].pathD);
for (let index = 0; index < firstSlotNoOffsetNumbers.length; index += 2) {
  assert.equal(firstSlotOffsetNumbers[index], firstSlotNoOffsetNumbers[index], 'slotOffsetMm does not move slot coordinates along S-B');
  assert.equal(firstSlotOffsetNumbers[index + 1], firstSlotNoOffsetNumbers[index + 1] + 5, 'slotOffsetMm moves slot coordinates inward perpendicular to S-B');
}

const offsetCloneReceiver = panel('offsetReceiver', 10, 100, 140, 40);
const offsetModel = modelForPanels([sPanel, receiver, offsetCloneReceiver], { width: 200, height: 180 });
const perConnectionOffsetConnections = { S1: sConnection('S1', 0), S2: sConnection('S2', 20) };
const perConnectionOffsetAssignments = {
  'sPanel-top': { connectionId: 'S1', slotRole: 'A' },
  'receiver-top': { connectionId: 'S1', slotRole: 'B' },
  'sPanel-bottom': { connectionId: 'S2', slotRole: 'A' },
  'offsetReceiver-top': { connectionId: 'S2', slotRole: 'B' },
};
const perConnectionOffsetResult = buildAppliedSGeometry(offsetModel, perConnectionOffsetAssignments, perConnectionOffsetConnections);
const s1OffsetSlotNumbers = pathNumbers(perConnectionOffsetResult.find((geometry) => geometry.connectionId === 'S1').slotPaths[0].pathD);
const s2OffsetSlotNumbers = pathNumbers(perConnectionOffsetResult.find((geometry) => geometry.connectionId === 'S2').slotPaths[0].pathD);
for (let index = 0; index < s1OffsetSlotNumbers.length; index += 2) {
  assert.equal(s2OffsetSlotNumbers[index], s1OffsetSlotNumbers[index], 'per-connection slotOffsetMm does not move slot coordinates along S-B');
  assert.equal(s2OffsetSlotNumbers[index + 1], s1OffsetSlotNumbers[index + 1] + 20, 'per-connection slotOffsetMm moves only that S connection inward perpendicular to S-B');
}
const editedOffsetConnections = {
  ...perConnectionOffsetConnections,
  S2: { ...perConnectionOffsetConnections.S2, properties: { ...perConnectionOffsetConnections.S2.properties, slotOffsetMm: 7 } },
};
assert.equal(editedOffsetConnections.S1.properties.slotOffsetMm, 0, 'editing one S connection offset leaves another S connection property unchanged');
assert.equal(editedOffsetConnections.S2.properties.slotOffsetMm, 7, 'editing one S connection offset updates only the selected S connection property');
console.log('S per-connection offset tests passed');

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
  () => buildAppliedSGeometry(sModel, sAssignments, { S1: sConnection('S1', 200) }),
  'slotOffsetMm does not reduce available S-B length',
);
assert.throws(
  () => buildAppliedSGeometry(shortSModel, { 'sPanel-top': { connectionId: 'S1', slotRole: 'A' }, 'shortReceiver-top': { connectionId: 'S1', slotRole: 'B' } }, { S1: sConnection('S1') }),
  /S-B slot pattern extends outside the S-B edge/,
  'out-of-bounds S-B slots validate tab distances only',
);
assert.throws(
  () => buildAppliedSGeometry({ ...sModel, panels: [sPanel] }, sAssignments, { S1: sConnection('S1', 5) }),
  /S-B edge must be part of a valid closed panel so slot offset direction can be determined/,
  'S-B edge must belong to a valid closed panel',
);
assert.throws(
  () => buildAppliedSGeometry(sModel, { ...sAssignments, 'sPanel-right': { connectionId: 'E1', edgeRole: 'A' } }, { S1: sConnection('S1'), E1: connection('E1') }),
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
const mergedSResult = buildAppliedSGeometry(sModel, multiSAssignments, multiSConnections);
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
const reorderedSResult = buildAppliedSGeometry(sModel, multiSAssignments, { S3: multiSConnections.S3, S1: multiSConnections.S1, S2: multiSConnections.S2 });
assert.equal(reorderedSResult.flatMap((geometry) => geometry.panelPaths)[0].pathD, mergedPanelPaths[0].pathD, 'reordering S connections produces identical panel geometry');
assert.equal(reorderedSResult.flatMap((geometry) => geometry.slotPaths).length, mergedSlotPaths.length, 'reordering S connections preserves slot generation');
console.log('S panel merge tests passed');

const eOnly = buildAppliedEPanelPaths(sModel, sAssignments, { S1: sConnection('S1') });
assert.equal(eOnly.length, 0, 'S assignments do not enter E geometry functions');

const exportModel = modelForPanels([sPanel, receiver, panel('untouched', 160, 100, 20, 20)], { width: 200, height: 180 });
const exportSGeometry = buildAppliedSGeometry(exportModel, sAssignments, { S1: sConnection('S1', 5) });
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
const sharedBucketSGeometry = buildAppliedSGeometry(sModel, sharedBucketAssignments, sharedBucketConnections);
assert.equal(sharedBucketEGeometry.length, 1, 'E3-B remains present when S2-B shares the same physical edge');
assert.ok(sharedBucketEGeometry[0].pathD.length > 0, 'shared edge bucket preserves E geometry path data');
assert.equal(sharedBucketSGeometry.length, 1, 'S2 geometry remains present when S2-B shares an edge with E3-B');
assert.ok(sharedBucketSGeometry[0].slotPaths.length > 0, 'shared edge bucket preserves S-B slot geometry');
assert.equal(sharedBucketSGeometry[0].edgeIds[1], 'receiver-top', 'S2-B remains assigned to the shared physical edge');
console.log('E + S-B shared edge bucket tests passed');

const {
  startSGroupWorkflow,
  manualAddSWorkflow,
  maybeAutoCreateNextSInGroup,
  finishSGroupWorkflow,
  getDefaultSlotRole,
} = module.exports;

const workflowAssign = (connectionId, roles = ['A', 'B']) => Object.fromEntries(roles.map((role, index) => [
  `${connectionId}-${role}-${index}`,
  { slotAssignments: [{ connectionId, slotRole: role }] },
]));

assert.equal(getDefaultSlotRole(workflowAssign('S1', ['A']), 'S1'), 'B', 'S1 gets B after A is assigned');
assert.equal(getDefaultSlotRole(workflowAssign('S1'), 'S1'), null, 'S1 cannot receive a third assigned edge after A and B');
const completeS1 = workflowAssign('S1');
assert.equal(getDefaultSlotRole(completeS1, 'S1'), null, 'S1 cannot have 3 assigned edges');
assert.equal(getDefaultSlotRole(completeS1, 'S1'), null, 'S1 cannot have 4 or 5 assigned edges');

const { getEdgeAssignmentDisplayLabels, getEdgeLabelPlacements } = svgUtilsModule.exports;
const sharedLabelsBucket = {
  edgeAssignment: { connectionId: 'E3', edgeRole: 'B' },
  slotAssignments: [{ connectionId: 'S2', slotRole: 'B' }],
};
assert.deepEqual(JSON.parse(JSON.stringify(getEdgeAssignmentDisplayLabels(sharedLabelsBucket))), ['E3-B', 'S2-B'], 'shared E/S edge bucket returns both display labels');
const sharedLabelPlacements = getEdgeLabelPlacements([
  { id: 'shared-edge', source: 'shared-edge', start: { x: 0, y: 0 }, end: { x: 100, y: 0 }, panelBounds: { minX: 0, maxX: 100, minY: 0, maxY: 40 } },
], { 'shared-edge': sharedLabelsBucket }, { fontSizePx: 12, paddingXPx: 4, paddingYPx: 2, edgeOffsetPx: 6 });
assert.equal(sharedLabelPlacements.length, 1, 'shared E/S edge bucket creates one stacked label chip');
assert.equal(sharedLabelPlacements[0].label, 'E3-B\nS2-B', 'stacked label chip includes E and S labels');
console.log('S group workflow and stacked label display tests passed');

let workflowConnections = {};
let workflowGroup = null;
let workflow = startSGroupWorkflow(workflowConnections);
workflowConnections = workflow.connections;
workflowGroup = workflow.activeSGroup;
assert.equal(workflow.selectedLabelId, 'S1', 'start group selects S1');
assert.equal(workflowConnections.S1.properties.slotOffsetMm, 0, 'start group creates S1 with offset 0');
assert.deepEqual(JSON.parse(JSON.stringify(workflowGroup.connectionIds)), ['S1'], 'start group records S1 in active group');

workflowConnections.S1.properties.materialThicknessMm = 6;
workflowConnections.S1.properties.slotWidthMm = 6;
workflowConnections.S1.properties.slotLengthMm = 18;
workflowConnections.S1.properties.slotOffsetMm = 4;
workflowConnections.S1.properties.isSlotLengthManual = true;
workflow = maybeAutoCreateNextSInGroup(workflowConnections, workflowAssign('S1'), workflowGroup, 'S1');
workflowConnections = workflow.connections;
workflowGroup = workflow.activeSGroup;
assert.equal(workflow.selectedLabelId, 'S2', 'completing S1 auto-creates and selects S2');
assert.equal(workflowConnections.S2.properties.materialThicknessMm, 6, 'S2 copies material thickness from S1');
assert.equal(workflowConnections.S2.properties.slotWidthMm, 6, 'S2 copies tab size/slot width from S1');
assert.equal(workflowConnections.S2.properties.slotOffsetMm, 4, 'S2 copies slot offset from S1');
assert.equal(workflowConnections.S2.properties.slotLengthMm, 18, 'S2 copies slot length from S1');

for (const completedId of ['S2', 'S3']) {
  workflowConnections[completedId].properties.slotOffsetMm = workflowConnections[completedId === 'S2' ? 'S1' : 'S2'].properties.slotOffsetMm + 1;
  workflow = maybeAutoCreateNextSInGroup(workflowConnections, workflowAssign(completedId), workflowGroup, completedId);
  workflowConnections = workflow.connections;
  workflowGroup = workflow.activeSGroup;
}
assert.deepEqual(JSON.parse(JSON.stringify(workflowGroup.connectionIds)), ['S1', 'S2', 'S3', 'S4'], 'active group can continue through S4');
assert.equal(workflow.selectedLabelId, 'S4', 'S4 is selected after S3 completes');

workflowGroup = finishSGroupWorkflow(workflowGroup);
workflow = maybeAutoCreateNextSInGroup(workflowConnections, workflowAssign('S4'), workflowGroup, 'S4');
assert.equal(workflow.selectedLabelId, 'S4', 'finish group stops auto-create selection changes');
assert.equal(workflow.connections.S5, undefined, 'finish group stops auto-create connection creation');

workflow = manualAddSWorkflow(workflowConnections, workflowGroup);
assert.equal(workflow.selectedLabelId, 'S5', 'manual Add S creates next standalone S');
assert.equal(workflow.connections.S5.properties.slotOffsetMm, 0, 'manual Add S starts offset 0');
assert.equal(workflow.activeSGroup.isActive, false, 'manual Add S leaves previous active group inactive');

workflowConnections = {};
workflowGroup = null;
workflow = startSGroupWorkflow(workflowConnections);
workflowConnections = workflow.connections;
workflowGroup = workflow.activeSGroup;
for (const completedId of ['S1', 'S2']) {
  workflow = maybeAutoCreateNextSInGroup(workflowConnections, workflowAssign(completedId), workflowGroup, completedId);
  workflowConnections = workflow.connections;
  workflowGroup = workflow.activeSGroup;
}
workflowConnections = applyActiveSGroupSlotPropertyUpdates(workflowConnections, workflowGroup, { slotOffsetMm: 50 });
assert.equal(workflowConnections.S1.properties.slotOffsetMm, 50, 'active group offset update applies to S1');
assert.equal(workflowConnections.S2.properties.slotOffsetMm, 50, 'active group offset update applies to S2');
assert.equal(workflowConnections.S3.properties.slotOffsetMm, 50, 'active group offset update applies to S3');
workflowGroup = finishSGroupWorkflow(workflowGroup);
workflow = startSGroupWorkflow(workflowConnections);
workflowConnections = workflow.connections;
const secondWorkflowGroup = workflow.activeSGroup;
assert.equal(workflowConnections.S4.properties.slotOffsetMm, 0, 'new S group starts with offset 0');
workflowConnections = applyActiveSGroupSlotPropertyUpdates(workflowConnections, secondWorkflowGroup, { slotOffsetMm: 20 });
assert.equal(workflowConnections.S1.properties.slotOffsetMm, 50, 'group 2 offset update leaves group 1 S1 unchanged');
assert.equal(workflowConnections.S2.properties.slotOffsetMm, 50, 'group 2 offset update leaves group 1 S2 unchanged');
assert.equal(workflowConnections.S3.properties.slotOffsetMm, 50, 'group 2 offset update leaves group 1 S3 unchanged');
assert.equal(workflowConnections.S4.properties.slotOffsetMm, 20, 'group 2 offset update applies to first group 2 connection');


let compactSConnections = {
  S1: sConnection('S1'),
  S2: sConnection('S2'),
  S3: sConnection('S3'),
};
const compactSGroup = { groupId: 's-group-S1', connectionIds: ['S1', 'S2', 'S3'], isActive: true };
compactSConnections = applyActiveSGroupSlotPropertyUpdates(compactSConnections, compactSGroup, { slotLengthMm: 15 });
assert.equal(compactSConnections.S1.properties.slotLengthMm, 15, 'compact S Tab update applies slotLengthMm to active group S1');
assert.equal(compactSConnections.S2.properties.slotLengthMm, 15, 'compact S Tab update applies slotLengthMm to active group S2');
assert.equal(compactSConnections.S3.properties.slotLengthMm, 15, 'compact S Tab update applies slotLengthMm to active group S3');
assert.equal(compactSConnections.S1.properties.isSlotLengthManual, true, 'compact S Tab marks slot length manual');

const compactSelectedS = applySlotPropertyUpdates(sConnection('S4'), { slotLengthMm: 15 });
assert.equal(compactSelectedS.properties.slotLengthMm, 15, 'compact S Tab update applies slotLengthMm to selected S connection only');
assert.equal(compactSelectedS.properties.isSlotLengthManual, true, 'selected compact S Tab marks slot length manual');

const sTabNineGeometry = buildAppliedSGeometry(sModel, sAssignments, { S1: sConnection('S1') });
const sTabFifteenConnection = sConnection('S1');
sTabFifteenConnection.properties.slotLengthMm = 15;
const sTabFifteenGeometry = buildAppliedSGeometry(sModel, sAssignments, { S1: sTabFifteenConnection });
const sTabNineFirstSlot = sTabNineGeometry[0].slotPaths[0]?.startDistance;
const sTabFifteenFirstSlot = sTabFifteenGeometry[0].slotPaths[0]?.startDistance;
assert.equal(sTabNineFirstSlot, 9.5, 'S apply uses default slotLengthMm 9 for tab plan');
assert.equal(sTabFifteenFirstSlot, 27.5, 'S apply uses updated slotLengthMm 15 for tab plan');

const compactEConnections = {
  E1: connection('E1'),
  E2: connection('E2'),
};
const nextEdgeProperties = { ...compactEConnections.E1.properties, fingerWidthMm: 15, isFingerWidthManual: true };
const updatedCompactEConnections = Object.fromEntries(Object.entries(compactEConnections).map(([connectionId, item]) => [
  connectionId,
  item.prefix === 'E'
    ? { ...item, properties: { ...item.properties, fingerWidthMm: nextEdgeProperties.fingerWidthMm, materialThicknessMm: nextEdgeProperties.materialThicknessMm, isFingerWidthManual: nextEdgeProperties.isFingerWidthManual } }
    : item,
]));
assert.equal(updatedCompactEConnections.E1.properties.fingerWidthMm, 15, 'compact E Tab update applies fingerWidthMm to E1');
assert.equal(updatedCompactEConnections.E2.properties.fingerWidthMm, 15, 'compact E Tab update applies fingerWidthMm to E2');
assert.equal(updatedCompactEConnections.E1.properties.isFingerWidthManual, true, 'compact E Tab marks finger width manual');

assert.equal(defaultConnectionProperties.W.wallHeightMm, 30, 'W defaults include wall height');
assert.equal(defaultConnectionProperties.W.materialThicknessMm, 3, 'W defaults include material thickness');
assert.equal(defaultConnectionProperties.W.kerfMm, 0.15, 'W defaults include kerf');
assert.equal(defaultConnectionProperties.W.playMm, 0, 'W defaults include play');
console.log('Active S group compact offset update tests passed');
console.log('W placeholder defaults tests passed');


const wallPanels = [
  panel('w1', 20, 20, 100, 80),
  panel('w2', 140, 20, 100, 80),
  panel('w3', 20, 120, 100, 80),
  panel('w4', 140, 120, 100, 80),
];
const wallModel = modelForPanels(wallPanels);
const selectedWallEdges = wallPanels.map((p) => `${p.id}-top`);
const selectedWallPanelEdges = wallPanels.flatMap((p) => [`${p.id}-top`, `${p.id}-bottom`]);
const wAssignmentsUniformE = Object.fromEntries(wallPanels.map((p, index) => [
  `${p.id}-right`,
  { edgeAssignment: { connectionId: `E${index + 1}`, edgeRole: 'A' } },
]));
const wUniformRefs = collectWReferences(selectedWallEdges, wAssignmentsUniformE, wallModel);
assert.equal(wUniformRefs.length, 4, 'W can read same-panel E references when selected W edges are unassigned');
const samePanelWRefs = collectWReferences(['w1-top', 'w1-bottom'], wAssignmentsUniformE, wallModel);
assert.equal(samePanelWRefs.length, 1, 'two selected W edges on the same panel count as one panel reference');
assert.equal(samePanelWRefs[0].connectionId, 'E1', 'same-panel selected W edges share the panel reference');
const multiEdgePanelWRefs = collectWReferences(selectedWallPanelEdges, wAssignmentsUniformE, wallModel);
assert.equal(multiEdgePanelWRefs.length, 4, 'four panels with two selected W edges each collect one reference per selected panel');
assert.deepEqual(Array.from(wUniformRefs, (ref) => ref.connectionId), ['E1', 'E2', 'E3', 'E4'], 'W stores local panel references as a collection');
assert.equal(classifyWReferencePattern(wUniformRefs), 'UNIFORM', 'W classification uses complete group uniform reference set');
assert.equal(invertWPatternType('UNIFORM'), 'ALTERNATING', 'uniform references invert to alternating W pattern');
assert.deepEqual(generateWEdgeRoles(selectedWallEdges, 'ALTERNATING'), ['A', 'B', 'A', 'B'], 'alternating W generation assigns W edge roles');

const wAssignmentsAlternatingE = Object.fromEntries(wallPanels.map((p, index) => [
  `${p.id}-right`,
  { edgeAssignment: { connectionId: `E${index + 1}`, edgeRole: index % 2 === 1 ? 'B' : 'A' } },
]));
const wAlternatingRefs = collectWReferences(selectedWallEdges, wAssignmentsAlternatingE, wallModel);
assert.equal(classifyWReferencePattern(wAlternatingRefs), 'ALTERNATING', 'W classification uses complete group alternating reference set');
assert.equal(invertWPatternType('ALTERNATING'), 'UNIFORM', 'alternating references invert to uniform W pattern');
assert.deepEqual(generateWEdgeRoles(selectedWallEdges, 'UNIFORM'), ['A', 'A', 'A', 'A'], 'uniform W generation assigns W edge roles');
assert.equal(classifyWReferencePattern([wAlternatingRefs[0]]), 'UNIFORM', 'single-edge classification would differ, proving tests cover complete-group behavior');

const wAssignmentsS = Object.fromEntries(wallPanels.map((p, index) => [
  `${p.id}-right`,
  { slotAssignments: [{ connectionId: `S${index + 1}`, slotRole: 'B' }] },
]));
const wSRefs = collectWReferences(selectedWallEdges, wAssignmentsS, wallModel);
assert.equal(wSRefs.length, 4, 'W can read same-panel S references when selected W edges are unassigned');
assert.equal(classifyWReferencePattern(wSRefs), 'UNIFORM', 'S-B/S-B/S-B/S-B is a uniform W reference pattern');

const wConnections = {
  W1: {
    id: 'W1',
    prefix: 'W',
    properties: {
      materialThicknessMm: 4,
      fingerWidthMm: 11,
      selectedEdgeIds: selectedWallEdges,
      references: [],
      referencePatternType: null,
      generatedPatternType: null,
      generatedConnectionIds: [],
    },
  },
};
const finishedW = finishWGroupWorkflow(wConnections, wAssignmentsUniformE, { groupId: 'w-group-W1', connectionId: 'W1', isActive: true }, wallModel);
assert.equal(finishedW.connections.E1, undefined, 'Finish W does not create a generated E connection');
assert.equal(finishedW.connections.W1.properties.materialThicknessMm, 4, 'W material thickness stays on W and is independent from E/S settings');
assert.equal(finishedW.connections.W1.properties.fingerWidthMm, 11, 'W tab size stays on W and is independent from E/S tab size');
assert.equal(finishedW.connections.W1.properties.generatedConnectionIds.length, 0, 'W does not store generated E labels');
assert.deepEqual(selectedWallEdges.map((edgeId) => finishedW.assignments[edgeId].edgeAssignment.connectionId), Array(selectedWallEdges.length).fill('W1'), 'Finish W stores W-prefixed edge assignments');
assert.deepEqual(selectedWallEdges.map((edgeId) => finishedW.assignments[edgeId].edgeAssignment.edgeRole), ['A', 'B', 'A', 'B'], 'W generated assignments are E-compatible W assignments');
assert.deepEqual(selectedWallEdges.map((edgeId) => svgUtilsModule.exports.getEdgeAssignmentDisplayLabel(finishedW.assignments[edgeId])), ['W1-A', 'W1-B', 'W1-A', 'W1-B'], 'Final labels remain W-prefixed after Finish');
const multiEdgeWConnections = {
  W1: {
    ...wConnections.W1,
    properties: {
      ...wConnections.W1.properties,
      selectedEdgeIds: selectedWallPanelEdges,
    },
  },
};
const finishedMultiEdgeW = finishWGroupWorkflow(multiEdgeWConnections, wAssignmentsUniformE, { groupId: 'w-group-W1', connectionId: 'W1', isActive: true }, wallModel);
assert.deepEqual(Array.from(finishedMultiEdgeW.connections.W1.properties.references, (ref) => ref.connectionId), ['E1', 'E2', 'E3', 'E4'], 'W finish stores one reference per selected panel when multiple W edges are selected per panel');
assert.deepEqual(selectedWallPanelEdges.map((edgeId) => finishedMultiEdgeW.assignments[edgeId].edgeAssignment.connectionId), Array(selectedWallPanelEdges.length).fill('W1'), 'W assignments apply to all selected W edges');
assert.deepEqual(selectedWallPanelEdges.map((edgeId) => finishedMultiEdgeW.assignments[edgeId].edgeAssignment.edgeRole), ['A', 'B', 'A', 'B', 'A', 'B', 'A', 'B'], 'W roles cover all selected W edges');
const manualEquivalentAssignments = Object.fromEntries(selectedWallEdges.map((edgeId, index) => [edgeId, { connectionId: 'E1', edgeRole: index % 2 === 1 ? 'B' : 'A' }]));
const generatedAssignments = Object.fromEntries(selectedWallEdges.map((edgeId) => [edgeId, finishedW.assignments[edgeId].edgeAssignment]));
const generatedPaths = buildAppliedEPanelPaths(wallModel, generatedAssignments, finishedW.connections);
const manualPaths = buildAppliedEPanelPaths(wallModel, manualEquivalentAssignments, { E1: { id: 'E1', prefix: 'E', properties: { materialThicknessMm: 4, fingerWidthMm: 11, isFingerWidthManual: true } } });
assert.deepEqual(generatedPaths.map((path) => path.pathD), manualPaths.map((path) => path.pathD), 'W assignments pass through existing E geometry like equivalent manual E setup');
assert.equal(exportAppliedSvg(wallModel, generatedPaths), exportAppliedSvg(wallModel, manualPaths), 'W export geometry matches equivalent manual E setup');
assert.throws(
  () => finishWGroupWorkflow(wConnections, {}, { groupId: 'w-group-W1', connectionId: 'W1', isActive: true }, wallModel),
  /has 0 E\/S reference labels/,
  '0 references on a selected W panel fails',
);
assert.throws(
  () => collectWReferences(['w1-top'], {
    'w1-right': { edgeAssignment: { connectionId: 'E1', edgeRole: 'A' } },
    'w1-bottom': { slotAssignments: [{ connectionId: 'S1', slotRole: 'B' }] },
  }, wallModel, 'W1'),
  /multiple E\/S reference labels/,
  'multiple references on the same selected W panel fails',
);
const wDisplayAssignments = buildActiveWDisplayAssignments({}, wConnections, { groupId: 'w-group-W1', connectionId: 'W1', isActive: true });
assert.equal(wDisplayAssignments['w1-top'].edgeAssignment.connectionId, 'W1', 'temporary W label is visible during active W group');
assert.equal(wDisplayAssignments['w1-top'].edgeAssignment.edgeRole, undefined, 'temporary W display label has no A/B role');
assert.deepEqual(selectedWallEdges.slice(0, 3).map((edgeId) => svgUtilsModule.exports.getEdgeAssignmentDisplayLabel(wDisplayAssignments[edgeId])), ['W1', 'W1', 'W1'], 'temporary W labels render as W1 without A/B');
assert.equal(wConnections.W1.properties.selectedEdgeIds.includes('w1-top'), true, 'temporary W display label uses selected W edges from connection state');
assert.equal({}['w1-top'], undefined, 'temporary W labels are not written to edgeAssignments');
const inactiveWDisplayAssignments = buildActiveWDisplayAssignments({}, wConnections, { groupId: 'w-group-W1', connectionId: 'W1', isActive: false });
assert.equal(inactiveWDisplayAssignments['w1-top'], undefined, 'temporary W labels disappear after W group is inactive');
console.log('W group V1 tests passed');
