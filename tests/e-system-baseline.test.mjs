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

const { buildAppliedEPanelPaths, exportAppliedSvg } = module.exports;

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
const assertNoInteriorSpur = (pathD) => {
  const nums = pathNumbers(pathD);
  const pts = [];
  for (let i = 0; i < nums.length; i += 2) pts.push(`${nums[i]},${nums[i + 1]}`);
  for (let i = 0; i < pts.length - 2; i += 1) assert.notEqual(pts[i], pts[i + 2], `interior backtrack spur at ${pts[i]}`);
};
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
  });
  const exported = exportAppliedSvg(svgModel, result);
  assert.match(exported, /viewBox="0 0 320 240"/, `${name}: exported viewBox preserved`);
  assert.match(exported, /width="320"/, `${name}: exported width preserved`);
  assert.match(exported, /height="240"/, `${name}: exported height preserved`);
  return result;
};

const single = panel('p1', 20, 20, 100, 80);
runCase('A-B', [single], { 'p1-top': { connectionId: 'E1', edgeRole: 'A' }, 'p1-right': { connectionId: 'E1', edgeRole: 'B' } }, { E1: connection('E1') });
runCase('B-A', [single], { 'p1-top': { connectionId: 'E1', edgeRole: 'B' }, 'p1-right': { connectionId: 'E1', edgeRole: 'A' } }, { E1: connection('E1') });
runCase('A-B B-A alternating box', [single], { 'p1-top': { connectionId: 'E1', edgeRole: 'A' }, 'p1-right': { connectionId: 'E1', edgeRole: 'B' }, 'p1-bottom': { connectionId: 'E1', edgeRole: 'B' }, 'p1-left': { connectionId: 'E1', edgeRole: 'A' } }, { E1: connection('E1') });
runCase('All A', [single], Object.fromEntries(single.edgeIds.map((id) => [id, { connectionId: 'E1', edgeRole: 'A' }])), { E1: connection('E1') });
const allB = runCase('All B', [single], Object.fromEntries(single.edgeIds.map((id) => [id, { connectionId: 'E1', edgeRole: 'B' }])), { E1: connection('E1') });
assert.match(allB[0].pathD, /20 20/, 'B-B corner remains closed at the original corner');
const mixed = panel('p2', 140, 30, 120, 90);
runCase('Mixed E1/E2/E3/E4 assignments', [single, mixed], {
  'p1-top': { connectionId: 'E1', edgeRole: 'A' }, 'p1-right': { connectionId: 'E2', edgeRole: 'B' }, 'p1-bottom': { connectionId: 'E3', edgeRole: 'A' }, 'p1-left': { connectionId: 'E4', edgeRole: 'B' },
  'p2-top': { connectionId: 'E1', edgeRole: 'B' }, 'p2-right': { connectionId: 'E2', edgeRole: 'A' }, 'p2-bottom': { connectionId: 'E3', edgeRole: 'B' }, 'p2-left': { connectionId: 'E4', edgeRole: 'A' },
}, { E1: connection('E1'), E2: connection('E2'), E3: connection('E3'), E4: connection('E4') });
console.log('E-system baseline tests passed');

const { buildAppliedSGeometry, createTabSegmentPlan } = module.exports;
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
assert.equal(sResult[0].slotPaths.length, expectedASegments.length, 'S-B slot count equals S-A tab count');
sResult[0].slotPaths.forEach((slotPath, index) => {
  const segment = expectedASegments[index];
  assert.equal(slotPath.startDistance, 5 + segment.startDistance, 'sharedSlotOffsetMm shifts slot start');
  assert.equal(slotPath.endDistance, 5 + segment.endDistance, 'sharedSlotOffsetMm shifts slot end');
  assert.equal(slotPath.endDistance - slotPath.startDistance, segment.endDistance - segment.startDistance, 'S-B slot length equals S-A tab length');
});
const sBounds = pathBounds(sResult[0].panelPaths[0].pathD);
assert.equal(sBounds.minX, sPanel.bounds.minX, 'S-A does not protrude outside minX panel bounds');
assert.equal(sBounds.maxX, sPanel.bounds.maxX, 'S-A does not protrude outside maxX panel bounds');
assert.equal(sBounds.minY, sPanel.bounds.minY, 'S-A outer tab faces remain on original edge line');
assert.equal(sBounds.maxY, sPanel.bounds.maxY, 'S-A does not protrude outside maxY panel bounds');
assert.throws(
  () => buildAppliedSGeometry(sModel, sAssignments, { S1: sConnection('S1') }, 200),
  /S-B slot pattern extends outside the S-B edge/,
  'out-of-bounds S-B slots throw a clear error',
);
assert.throws(
  () => buildAppliedSGeometry(sModel, { ...sAssignments, 'sPanel-right': { connectionId: 'E1', edgeRole: 'A' } }, { S1: sConnection('S1'), E1: connection('E1') }, 0),
  /S-A panel conflicts/,
  'S-A panel conflicts with E-applied geometry on same panel',
);
const eOnly = buildAppliedEPanelPaths(sModel, sAssignments, { S1: sConnection('S1') });
assert.equal(eOnly.length, 0, 'S assignments do not enter E geometry functions');
console.log('S geometry v1 tests passed');
