import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const moduleCache = new Map();

const loadSrcModule = (relativePath) => {
  const absolutePath = resolve(root, relativePath);
  if (moduleCache.has(absolutePath)) return moduleCache.get(absolutePath).exports;
  const source = readFileSync(absolutePath, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const loadedModule = { exports: {} };
  moduleCache.set(absolutePath, loadedModule);
  const baseDir = dirname(absolutePath);
  const localRequire = (id) => {
    if (id.startsWith('./') || id.startsWith('../')) {
      const resolvedPath = resolve(baseDir, id);
      if (resolvedPath.startsWith(resolve(root, 'src'))) {
        return loadSrcModule(`${resolvedPath.slice(resolve(root).length + 1)}.ts`);
      }
    }
    return require(id);
  };
  vm.runInNewContext(output, { require: localRequire, module: loadedModule, exports: loadedModule.exports, console, structuredClone }, { filename: `${relativePath}.cjs` });
  return loadedModule.exports;
};

const { buildManufacturingGeometry, applyClearance } = loadSrcModule('src/app/manufacturingPipeline.ts');
const { compensateClassifiedContours, pathDToClosedContour } = loadSrcModule('src/app/manufacturingCompensation.ts');

const contour = (id, kind, pathD, finalSource = kind === 'INNER' ? 's-slot' : 'original-panel') => ({
  id,
  kind,
  pathD,
  source: 'final-contour',
  finalSource,
});

const boundsForPathD = (pathD) => {
  const points = pathDToClosedContour(pathD);
  assert.ok(points, `expected closed path: ${pathD}`);
  return points.reduce((bounds, point) => ({
    minX: Math.min(bounds.minX, point.x),
    maxX: Math.max(bounds.maxX, point.x),
    minY: Math.min(bounds.minY, point.y),
    maxY: Math.max(bounds.maxY, point.y),
  }), { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity });
};

const assertBoundsClose = (actual, expected, message) => {
  for (const key of ['minX', 'maxX', 'minY', 'maxY']) {
    assert.ok(Math.abs(actual[key] - expected[key]) < 0.000001, `${message} ${key}: expected ${expected[key]}, got ${actual[key]}`);
  }
};

const rectangle = contour('rect', 'OUTER', 'M 0 0 L 10 0 L 10 8 L 0 8 Z');
const rectangleManufacturing = buildManufacturingGeometry([rectangle], { clearanceMm: 0.25, kerfMm: 0 });
assert.equal(rectangleManufacturing.contours[0].clearanceApplied, false, 'rectangle clearance does nothing');
assertBoundsClose(boundsForPathD(rectangleManufacturing.contours[0].pathD), { minX: 0, maxX: 10, minY: 0, maxY: 8 }, 'rectangle outer contour unchanged');

const slot = contour('slot', 'INNER', 'M 2 2 L 4 2 L 4 4 L 2 4 Z', 's-slot');
const slotManufacturing = buildManufacturingGeometry([rectangle, slot], { clearanceMm: 0.25, kerfMm: 0 });
assert.equal(slotManufacturing.contours.find((item) => item.id === 'slot').clearanceApplied, true, 'slot receives clearance');
assertBoundsClose(boundsForPathD(slotManufacturing.contours.find((item) => item.id === 'slot').pathD), { minX: 1.75, maxX: 4.25, minY: 1.75, maxY: 4.25 }, 'slot grows by clearance');
assertBoundsClose(boundsForPathD(slotManufacturing.contours.find((item) => item.id === 'rect').pathD), { minX: 0, maxX: 10, minY: 0, maxY: 8 }, 'slot case outer contour unchanged');

const finger = contour('finger', 'OUTER', 'M 0 0 L 10 0 L 10 3 L 12 3 L 12 5 L 10 5 L 10 8 L 0 8 Z', 'applied-panel');
const fingerManufacturing = buildManufacturingGeometry([finger], { clearanceMm: 0.25, kerfMm: 0 });
assert.equal(fingerManufacturing.contours[0].clearanceApplied, true, 'finger contour receives clearance');
assertBoundsClose(boundsForPathD(fingerManufacturing.contours[0].pathD), { minX: 0, maxX: 12, minY: 0, maxY: 8 }, 'finger outer contour unchanged');
assert.notEqual(fingerManufacturing.contours[0].pathD, finger.pathD, 'finger mating feature geometry changes');

const outerKerf = contour('outer-kerf', 'OUTER', 'M 0 0 L 10 0 L 10 8 L 0 8 Z');
const innerKerf = contour('inner-kerf', 'INNER', 'M 2 2 L 6 2 L 6 5 L 2 5 Z');
const kerfOnly = buildManufacturingGeometry([outerKerf, innerKerf], { clearanceMm: 0, kerfMm: 0.10 });
const legacyKerf = compensateClassifiedContours([outerKerf, innerKerf], 0.10);
assert.deepEqual(kerfOnly.contours.map((item) => item.pathD), legacyKerf.map((item) => item.pathD), 'kerf still behaves exactly as before when clearance is zero');
assertBoundsClose(boundsForPathD(kerfOnly.contours[0].pathD), { minX: -0.05, maxX: 10.05, minY: -0.05, maxY: 8.05 }, 'outer kerf expands');
assertBoundsClose(boundsForPathD(kerfOnly.contours[1].pathD), { minX: 2.05, maxX: 5.95, minY: 2.05, maxY: 4.95 }, 'inner kerf shrinks');

const clearanceZero = buildManufacturingGeometry([rectangle, slot], { clearanceMm: 0, kerfMm: 0 });
assert.deepEqual(clearanceZero.contours.map((item) => item.pathD), [rectangle.pathD, slot.pathD], 'clearance=0 and kerf=0 leaves geometry unchanged');

const kerfZero = buildManufacturingGeometry([rectangle, slot], { clearanceMm: 0.25, kerfMm: 0 });
assertBoundsClose(boundsForPathD(kerfZero.contours.find((item) => item.id === 'slot').pathD), { minX: 1.75, maxX: 4.25, minY: 1.75, maxY: 4.25 }, 'kerf=0 applies only clearance');

const clearanceOnly = applyClearance([slot], 0.25);
assert.equal(clearanceOnly[0].clearanceApplied, true, 'applyClearance marks manufactured mating features');

console.log('manufacturing pipeline tests passed');
