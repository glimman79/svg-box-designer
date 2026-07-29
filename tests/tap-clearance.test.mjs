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
};
const geometry = () => createManufacturingGeometry({ contours: [contour], diagnostics: [] });
const unchanged = JSON.stringify(geometry().finalContourList);

assert.equal(JSON.stringify(applyTapClearance(geometry(), -0.10, []).finalContourList), unchanged, 'zero selected taps is byte-for-byte unchanged');
const one = applyTapClearance(geometry(), -0.10, [tapOne]).finalContourList[0];
assert.notEqual(one.pathD, contour.pathD, 'one selected generated tap changes geometry');
assert.deepEqual(Array.from(one.segmentTapIds), contour.segmentTapIds, 'GeneratedTapId provenance survives manufacturing');
assert.equal(one.points[7].x, 8, 'an unselected neighboring tap remains unchanged');
const multiple = applyTapClearance(geometry(), -0.10, [tapOne, tapTwo]).finalContourList[0];
assert.notEqual(multiple.points[7].x, 8, 'multiple/all generated taps can be selected');
assert.notEqual(multiple.points[3].x, 4, 'adjacent generated tap profiles are independently included in the tap mask');
assert.notEqual(applyTapClearance(geometry(), 0.10, [tapOne]).finalContourList[0].pathD, one.pathD, 'positive Tap Clearance uses the opposite signed offset');
assert.equal(applyTapClearance(geometry(), 0, [tapOne]).finalContourList[0].pathD, contour.pathD, 'zero Tap Clearance preserves exact geometry');

for (const label of ['imported protrusion', 'manually drawn tab', 'tab-like geometry', 'slot geometry', 'straight edge', 'copied geometry without GeneratedTapId']) {
  const ineligible = createManufacturingGeometry({ contours: [{ ...contour, id: label, segmentTapIds: undefined }], diagnostics: [] });
  const before = JSON.stringify(ineligible.finalContourList);
  assert.equal(JSON.stringify(applyTapClearance(ineligible, -0.10, [tapOne]).finalContourList), before, `${label} is ignored without generator-authored provenance`);
}

const finalGeometry = { contours: [contour, { ...contour, id: 'slot', kind: 'INNER', geometryType: 'GENERATED_SLOT', segmentTapIds: undefined }], diagnostics: [] };
const legacyPipeline = processManufacturingGeometry(finalGeometry, 0.15, -0.10, 0, []);
const explicitNoTabs = processManufacturingGeometry(finalGeometry, 0.15, -0.10, 0, [], -0.10, []);
assert.equal(JSON.stringify(explicitNoTabs), JSON.stringify(legacyPipeline), 'Profile Offset, Slot Clearance, and Kerf output is byte-for-byte identical with no selected taps');
console.log('Tap Clearance regression tests passed.');
