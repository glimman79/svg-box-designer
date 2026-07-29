import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
const require = createRequire(import.meta.url);
const ts = require('typescript');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const cache = new Map();
const load = (relativePath) => {
  const absolutePath = resolve(root, relativePath);
  if (cache.has(absolutePath)) return cache.get(absolutePath).exports;
  const output = ts.transpileModule(readFileSync(absolutePath, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const loaded = { exports: {} }; cache.set(absolutePath, loaded);
  const localRequire = (id) => id.startsWith('.') ? load(`${resolve(dirname(absolutePath), id).slice(root.length + 1)}.ts`) : require(id);
  vm.runInNewContext(output, { require: localRequire, module: loaded, exports: loaded.exports, console, structuredClone }, { filename: relativePath });
  return loaded.exports;
};

const { applyTapClearance, processManufacturingGeometry } = load('src/app/manufacturingCompensation.ts');
const { createManufacturingGeometry } = load('src/app/manufacturingGeometry.ts');

const points = [
  { x: 0, y: 0 }, { x: 2, y: 0 }, { x: 2, y: -2 }, { x: 4, y: -2 }, { x: 4, y: 0 },
  { x: 6, y: 0 }, { x: 6, y: -2 }, { x: 8, y: -2 }, { x: 8, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 },
];
const tapOne = 'generated-tap:TB:operation:panel:edge:0';
const tapTwo = 'generated-tap:TB:operation:panel:edge:1';
const contour = {
  id: 'generated-panel', source: 'final-contour', finalSource: 'applied-panel', kind: 'OUTER', geometryType: 'GENERATED_OUTER',
  points, pathD: `M ${points.map(({ x, y }) => `${x} ${y}`).join(' L ')} Z`, profileMaterialSide: 'GENERATED_MATING',
  compensationProfile: points.map(() => false),
  segmentTapIds: [null, tapOne, tapOne, tapOne, null, tapTwo, tapTwo, tapTwo, null, null, null, null],
  segmentTapRoles: [null, 'tap-side-start', 'tap-tip', 'tap-side-end', null, 'tap-side-start', 'tap-tip', 'tap-side-end', null, null, null, null],
};
const geometry = () => createManufacturingGeometry({ contours: [contour], diagnostics: [] });

const allTaps = applyTapClearance(geometry(), -0.10).finalContourList[0];
assert.notEqual(allTaps.pathD, contour.pathD, 'Tap Clearance changes generated male taps automatically');
assert.notEqual(allTaps.points[3].x, 4, 'the first GeneratedTapId receives Tap Clearance');
assert.notEqual(allTaps.points[7].x, 8, 'the second GeneratedTapId receives Tap Clearance without selection');
assert.deepEqual(Array.from(allTaps.segmentTapIds), contour.segmentTapIds, 'GeneratedTapId provenance survives manufacturing');
assert.deepEqual(Array.from(allTaps.segmentTapRoles), contour.segmentTapRoles, 'generator-authored segment roles survive manufacturing');
assert.notEqual(applyTapClearance(geometry(), 0.10).finalContourList[0].pathD, allTaps.pathD, 'positive Tap Clearance uses the opposite signed offset');
assert.equal(applyTapClearance(geometry(), 0).finalContourList[0].pathD, contour.pathD, 'zero Tap Clearance is identical to disabling the Tap stage');

for (const label of ['imported geometry', 'manually created geometry', 'tab-like geometry', 'slot geometry', 'straight edge', 'copied geometry without GeneratedTapId']) {
  const ineligible = createManufacturingGeometry({ contours: [{ ...contour, id: label, geometryType: label === 'slot geometry' ? 'GENERATED_SLOT' : contour.geometryType, segmentTapIds: undefined, segmentTapRoles: undefined }], diagnostics: [] });
  const before = JSON.stringify(ineligible.finalContourList);
  assert.equal(JSON.stringify(applyTapClearance(ineligible, -0.10).finalContourList), before, `${label} is ignored without generator-authored provenance`);
}

const slot = { ...contour, id: 'slot', kind: 'INNER', geometryType: 'GENERATED_SLOT', segmentTapIds: undefined, compensationProfile: points.map(() => true) };
const finalGeometry = { contours: [contour, slot], diagnostics: [] };
const zeroTapPipeline = processManufacturingGeometry(finalGeometry, 0.15, -0.10, 0, [], 0);
const activeTapPipeline = processManufacturingGeometry(finalGeometry, 0.15, -0.10, 0, [], -0.10);
assert.notEqual(activeTapPipeline.finalContourList[0].pathD, zeroTapPipeline.finalContourList[0].pathD, '-0.10 affects every generated tap in the complete pipeline');
assert.equal(activeTapPipeline.finalContourList[1].pathD, zeroTapPipeline.finalContourList[1].pathD, 'Slot Clearance output remains unchanged by Tap Clearance');
assert.equal(activeTapPipeline.contours[1].pathD, zeroTapPipeline.contours[1].pathD, 'Kerf output for slot geometry remains unchanged by Tap Clearance');

const bounds = (values) => ({
  minX: Math.min(...values.map(({ x }) => x)), maxX: Math.max(...values.map(({ x }) => x)),
  minY: Math.min(...values.map(({ y }) => y)), maxY: Math.max(...values.map(({ y }) => y)),
});
const transform = (values, quarterTurns, reverse) => {
  const rotated = values.map((point) => {
    let { x, y } = point;
    for (let turn = 0; turn < quarterTurns; turn += 1) [x, y] = [-y, x];
    return { x, y };
  });
  return reverse ? [rotated[0], ...rotated.slice(1).reverse()] : rotated;
};
const intersects = (a, b, c, d) => {
  const cross = (p, q, r) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  return cross(a, b, c) * cross(a, b, d) < 0 && cross(c, d, a) * cross(c, d, b) < 0;
};
const assertSimpleClosed = (values, label) => {
  assert.ok(values.length >= 3, `${label}: contour remains closed by its implicit final segment`);
  values.forEach((point, index) => assert.notDeepEqual(point, values[(index + 1) % values.length], `${label}: no contour gap/zero segment`));
  for (let first = 0; first < values.length; first += 1) for (let second = first + 2; second < values.length; second += 1) {
    if (first === 0 && second === values.length - 1) continue;
    assert.equal(intersects(values[first], values[(first + 1) % values.length], values[second], values[(second + 1) % values.length]), false, `${label}: no self-intersection`);
  }
};

const cornerBase = [{ x: 0, y: 0 }, { x: 0, y: -2 }, { x: 2, y: -2 }, { x: 2, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];
for (const quarterTurns of [0, 1, 2, 3]) for (const reverse of [false, true]) for (const clearance of [-0.1, 0, 0.1]) {
  const fixturePoints = transform(cornerBase, quarterTurns, reverse);
  const cornerTapId = `corner:${quarterTurns}:${reverse}`;
  const forwardRoles = ['source-boundary-start', 'tap-tip', 'tap-side-end', null, null, null, null];
  const reverseRoles = [null, null, null, null, 'tap-side-start', 'tap-tip', 'source-boundary-end'];
  const roleList = reverse ? reverseRoles : forwardRoles;
  const idList = roleList.map((role) => role ? cornerTapId : null);
  const fixture = { ...contour, id: cornerTapId, points: fixturePoints, pathD: `M ${fixturePoints.map(({ x, y }) => `${x} ${y}`).join(' L ')} Z`, compensationProfile: fixturePoints.map(() => false), segmentTapIds: idList, segmentTapRoles: roleList };
  const result = applyTapClearance(createManufacturingGeometry({ contours: [fixture], diagnostics: [] }), clearance).finalContourList[0];
  const label = `corner ${quarterTurns}, ${reverse ? 'clockwise/reversed' : 'counterclockwise'}, ${clearance}`;
  assert.deepEqual(bounds(result.points), bounds(fixturePoints), `${label}: exact bounding box invariant`);
  assert.ok(result.points.some((point) => point.x === fixturePoints[0].x && point.y === fixturePoints[0].y), `${label}: original corner coordinate is fixed`);
  assertSimpleClosed(result.points, label);
  if (clearance !== 0) assert.notEqual(result.pathD, fixture.pathD, `${label}: eligible internal tap wall is compensated`);
}

const terminalRoles = ['source-boundary-start', 'tap-tip', 'source-boundary-end', null, null, null, null];
const terminalFixture = { ...contour, id: 'terminal-roles', points: cornerBase, pathD: `M ${cornerBase.map(({ x, y }) => `${x} ${y}`).join(' L ')} Z`, segmentTapIds: terminalRoles.map((role) => role ? tapOne : null), segmentTapRoles: terminalRoles };
assert.equal(applyTapClearance(createManufacturingGeometry({ contours: [terminalFixture], diagnostics: [] }), -0.1).finalContourList[0].pathD, terminalFixture.pathD, 'explicit source-boundary roles are excluded even when they have GeneratedTapId ownership');
console.log('Tap Clearance regression tests passed.');
