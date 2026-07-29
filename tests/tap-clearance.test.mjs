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

const allTaps = applyTapClearance(geometry(), -0.10).finalContourList[0];
assert.notEqual(allTaps.pathD, contour.pathD, 'Tap Clearance changes generated male taps automatically');
assert.notEqual(allTaps.points[3].x, 4, 'the first GeneratedTapId receives Tap Clearance');
assert.notEqual(allTaps.points[7].x, 8, 'the second GeneratedTapId receives Tap Clearance without selection');
assert.deepEqual(Array.from(allTaps.segmentTapIds), contour.segmentTapIds, 'GeneratedTapId provenance survives manufacturing');
assert.notEqual(applyTapClearance(geometry(), 0.10).finalContourList[0].pathD, allTaps.pathD, 'positive Tap Clearance uses the opposite signed offset');
assert.equal(applyTapClearance(geometry(), 0).finalContourList[0].pathD, contour.pathD, 'zero Tap Clearance is identical to disabling the Tap stage');

for (const label of ['imported geometry', 'manually created geometry', 'tab-like geometry', 'slot geometry', 'straight edge', 'copied geometry without GeneratedTapId']) {
  const ineligible = createManufacturingGeometry({ contours: [{ ...contour, id: label, geometryType: label === 'slot geometry' ? 'GENERATED_SLOT' : contour.geometryType, segmentTapIds: undefined }], diagnostics: [] });
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
console.log('Tap Clearance regression tests passed.');
