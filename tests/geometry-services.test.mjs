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
assert.deepEqual(calls, [['signedArea', 'outer'], ['parallelProfile', 'outer', 0.1, 'OUTWARD'], ['replace', 'outer']], 'clearance delegates validation and profile construction to Geometry Services');

calls.length = 0;
applySlotClearance([slot], 0.1, spyServices);
assert.deepEqual(calls, [['parallelProfile', 'slot', 0.1, 'OUTWARD']], 'slot clearance is a caller of the shared parallel profile operation');

calls.length = 0;
compensateClassifiedContours([{ ...outer }], 0.2, spyServices);
assert.deepEqual(calls, [['parallelProfile', 'outer', 0.1, 'OUTWARD']], 'kerf delegates its geometry operation to Geometry Services');

const serviceOutput = geometryServices.parallelProfile(outer, 0.1, 'OUTWARD');
assert.equal(serviceOutput.pathD, 'M -0.1 -0.1 L 10.1 -0.1 L 10.1 10.1 L -0.1 10.1 Z', 'Geometry Services preserves the established polygon offset output');
assert.equal(geometryServices.orientation(outer), 'COUNTER_CLOCKWISE', 'Geometry Services owns orientation queries');
assert.equal(geometryServices.signedArea(outer), 100, 'Geometry Services owns signed-area queries');

for (const file of ['src/app/manufacturingCompensation.ts', 'src/app/compensationStrategies.ts']) {
  const source = readFileSync(resolve(root, file), 'utf8');
  assert.doesNotMatch(source, /buildContourSides|offsetContourSide|lineIntersection|pointsToClosedPathD/, `${file} contains no polygon offset implementation`);
}

console.log('Geometry Services architecture tests passed');
