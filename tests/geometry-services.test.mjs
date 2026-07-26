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
  const output = ts.transpileModule(readFileSync(absolutePath, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const loadedModule = { exports: {} };
  cache.set(absolutePath, loadedModule);
  const localRequire = (id) => id.startsWith('.')
    ? load(`${resolve(dirname(absolutePath), id).slice(root.length + 1)}.ts`)
    : require(id);
  vm.runInNewContext(output, { require: localRequire, module: loadedModule, exports: loadedModule.exports, console, structuredClone }, { filename: relativePath });
  return loadedModule.exports;
};

const { geometryServices } = load('src/app/geometryServices.ts');
const { applyClearance, applySlotClearance, compensateClassifiedContours } = load('src/app/manufacturingCompensation.ts');
const { createManufacturingGeometry } = load('src/app/manufacturingGeometry.ts');
const { DEFAULT_PROJECT_SETTINGS } = load('src/app/projectDefaults.ts');

const outer = {
  id: 'outer', source: 'final-contour', finalSource: 'applied-panel', kind: 'OUTER',
  geometryType: 'GENERATED_OUTER', pathD: 'M 0 0 L 10 0 L 10 10 L 0 10 Z',
};
const slot = {
  id: 'slot', source: 'final-contour', finalSource: 's-slot', kind: 'INNER',
  geometryType: 'GENERATED_SLOT', pathD: 'M 2 2 L 4 2 L 4 4 L 2 4 Z',
};

const calls = [];
const spyServices = {
  compensateProfile(profile, distance, direction) {
    calls.push(['compensateProfile', profile.id, distance, direction]);
    return geometryServices.compensateProfile(profile, distance, direction);
  },
  parallelProfile(profile, distance, direction) {
    calls.push(['parallelProfile', profile.id, distance, direction]);
    return geometryServices.parallelProfile(profile, distance, direction);
  },
  offset: (...args) => geometryServices.offset(...args),
  orientation: (...args) => geometryServices.orientation(...args),
  signedArea(profile) { calls.push(['signedArea', profile.id]); return geometryServices.signedArea(profile); },
  clone: (...args) => geometryServices.clone(...args),
  replace(target, replacement) { calls.push(['replace', target.id]); geometryServices.replace(target, replacement); },
};

applyClearance(createManufacturingGeometry({ contours: [outer], diagnostics: [] }), 0.1, spyServices);
assert.deepEqual(calls, [['signedArea', 'outer'], ['compensateProfile', 'outer', 0.1, 'INWARD'], ['replace', 'outer']], 'clearance delegates explicit material-removal semantics to Geometry Services');

calls.length = 0;
applySlotClearance([slot], 0.1, spyServices);
assert.deepEqual(calls, [['compensateProfile', 'slot', 0.1, 'OUTWARD']], 'slot clearance delegates signed profile reconstruction to Geometry Services');

calls.length = 0;
compensateClassifiedContours([{ ...outer }], 0.2, spyServices);
assert.deepEqual(calls, [['parallelProfile', 'outer', 0.1, 'OUTWARD']], 'kerf delegates its geometry operation to Geometry Services');

const serviceOutput = geometryServices.parallelProfile(outer, 0.1, 'OUTWARD');
assert.equal(serviceOutput.pathD, 'M -0.1 -0.1 L 10.1 -0.1 L 10.1 10.1 L -0.1 10.1 Z', 'Geometry Services preserves the established polygon offset output');
assert.equal(geometryServices.orientation(outer), 'COUNTER_CLOCKWISE', 'Geometry Services owns orientation queries');
assert.equal(geometryServices.signedArea(outer), 100, 'Geometry Services owns signed-area queries');

const selective = {
  ...outer,
  points: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }],
  compensationProfile: [false, true, false, false],
};
assert.equal(geometryServices.compensateProfile(selective, -0.1, 'OUTWARD').pathD, 'M 0 0 L 10.1 0 L 10.1 10 L 0 10 Z', 'negative clearance moves only the modified profile in the clearance-increasing direction');
assert.equal(geometryServices.compensateProfile(selective, 0.1, 'OUTWARD').pathD, 'M 0 0 L 9.9 0 L 9.9 10 L 0 10 Z', 'positive clearance moves the modified profile in the opposite direction');
assert.equal(geometryServices.compensateProfile(selective, -0.1, 'OUTWARD').points[2].y, 10, 'corner reconstruction reconnects the compensated profile to unchanged geometry');

const clearanceSelective = (points, selected, value) => geometryServices.compensateProfile({
  ...outer, points, pathD: undefined, compensationProfile: selected,
}, value, 'INWARD');
const horizontalTB = [
  { x: 0, y: 0 }, { x: 3, y: 0 }, { x: 3, y: -2 }, { x: 5, y: -2 },
  { x: 5, y: 0 }, { x: 8, y: 0 }, { x: 8, y: -2 }, { x: 10, y: -2 },
  { x: 10, y: 10 }, { x: 0, y: 10 },
];
const selectedTBProfiles = [false, true, true, true, false, true, true, true, false, false];
const horizontalNegative = clearanceSelective(horizontalTB, selectedTBProfiles, -0.9);
const horizontalPositive = clearanceSelective(horizontalTB, selectedTBProfiles, 0.9);
assert.equal(horizontalNegative.points[2].x, 3.9, 'horizontal TB side wall receives the full 0.90 mm');
assert.equal(horizontalNegative.points[2].y, -1.1, 'negative clearance removes material from a horizontal TB face');
assert.equal(horizontalPositive.points[2].y, -2.9, 'positive clearance adds material in the opposite direction');
assert.deepEqual(horizontalNegative.points[0], horizontalTB[0], 'adjoining imported geometry remains fixed');

const verticalTB = horizontalTB.map(({ x, y }) => ({ x: -y, y: x }));
const verticalNegative = clearanceSelective(verticalTB, selectedTBProfiles, -0.9);
assert.equal(verticalNegative.points[2].x, 1.1, 'vertical TB face has orientation-independent direction');
assert.equal(verticalNegative.points[2].y, 3.9, 'vertical TB side wall receives the full 0.90 mm');

const collinearAnchor = { ...outer,
  points: [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }],
  compensationProfile: [false, true, false, false, false],
};
assert.ok(geometryServices.compensateProfile(collinearAnchor, -0.1, 'INWARD'), 'first/last profile provenance remains aligned across collinear generator anchors');
assert.deepEqual(clearanceSelective(horizontalTB, selectedTBProfiles, 0).points, horizontalTB, 'zero clearance preserves exact geometry');

const signedSlot = { ...slot, compensationProfile: [true, true, true, true] };
assert.equal(geometryServices.compensateProfile(signedSlot, -0.1, 'OUTWARD').pathD, 'M 1.9 1.9 L 4.1 1.9 L 4.1 4.1 L 1.9 4.1 Z', 'negative slot clearance increases slot clearance');
assert.equal(geometryServices.compensateProfile(signedSlot, 0.1, 'OUTWARD').pathD, 'M 2.1 2.1 L 3.9 2.1 L 3.9 3.9 L 2.1 3.9 Z', 'positive slot clearance moves in the opposite direction');
assert.equal(geometryServices.compensateProfile(signedSlot, -0.9, 'OUTWARD').pathD, 'M 1.1 1.1 L 4.9 1.1 L 4.9 4.9 L 1.1 4.9 Z', 'whole-slot signed compensation remains unchanged');
assert.equal(compensateClassifiedContours([{ ...outer }], 0.3)[0].pathD, 'M -0.15 -0.15 L 10.15 -0.15 L 10.15 10.15 L -0.15 10.15 Z', 'kerf direction and half-width remain unchanged');
assert.deepEqual(DEFAULT_PROJECT_SETTINGS, { kerfMm: 0.15, clearanceMm: -0.10, slotClearanceMm: -0.10 }, 'new-project manufacturing defaults are centralized and signed');
const appSource = readFileSync(resolve(root, 'src/App.tsx'), 'utf8');
assert.doesNotMatch(appSource.match(/id="manufacturing-clearance"[^\n]*/)?.[0] ?? '', /min=\{0\}/, 'clearance UI accepts negative values');
assert.doesNotMatch(appSource.match(/id="manufacturing-slot-clearance"[^\n]*/)?.[0] ?? '', /min=\{0\}/, 'slot clearance UI accepts negative values');

for (const file of ['src/app/manufacturingCompensation.ts', 'src/app/compensationStrategies.ts']) {
  const source = readFileSync(resolve(root, file), 'utf8');
  assert.doesNotMatch(source, /buildContourSides|offsetContourSide|lineIntersection|pointsToClosedPathD/, `${file} contains no polygon offset implementation`);
}

console.log('Geometry Services architecture tests passed');
