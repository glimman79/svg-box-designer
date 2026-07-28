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
const { buildFinalGeometry } = load('src/app/finalGeometry.ts');

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
  { x: 5, y: 0 }, { x: 8, y: 0 }, { x: 8, y: -2 }, { x: 9, y: -2 },
  { x: 9, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 },
];
const selectedTBProfiles = [true, true, true, true, true, true, true, true, true, false, false, false];
const horizontalNegative = clearanceSelective(horizontalTB, selectedTBProfiles, -0.9);
const horizontalPositive = clearanceSelective(horizontalTB, selectedTBProfiles, 0.9);
const roundedPoints = (points) => points.map(({ x, y }) => ({ x: Number(x.toFixed(6)), y: Number(y.toFixed(6)) }));
assert.deepEqual(roundedPoints(horizontalNegative.points), [
  { x: 0, y: 0.9 }, { x: 3.9, y: 0.9 }, { x: 3.9, y: -1.1 }, { x: 4.1, y: -1.1 },
  { x: 4.1, y: 0.9 }, { x: 8.9, y: 0.9 }, { x: 8.9, y: -1.1 }, { x: 8.1, y: -1.1 },
  { x: 8.1, y: 0.9 }, { x: 10, y: 0.9 }, { x: 10, y: 10 }, { x: 0, y: 10 },
], 'horizontal complete profile offsets entry, bases, walls, depth faces, and exit together');
assert.equal(horizontalNegative.points[2].y, -1.1, 'negative clearance removes material from a horizontal TB face');
assert.equal(horizontalPositive.points[2].y, -2.9, 'positive clearance adds material in the opposite direction');
assert.deepEqual(horizontalNegative.points.slice(10), horizontalTB.slice(10), 'neighboring imported edges remain fixed while transition endpoints are reconstructed');
horizontalNegative.points.forEach((point, index, points) => {
  assert.ok(Number.isFinite(point.x) && Number.isFinite(point.y), 'endpoint reconstruction emits no NaN values');
  assert.notDeepEqual(point, points[(index + 1) % points.length], 'endpoint reconstruction emits no zero-length spikes');
});

const verticalTB = horizontalTB.map(({ x, y }) => ({ x: -y, y: x }));
const verticalNegative = clearanceSelective(verticalTB, selectedTBProfiles, -0.9);
assert.equal(verticalNegative.points[2].x, 1.1, 'vertical TB face has orientation-independent direction');
assert.equal(verticalNegative.points[2].y, 3.9, 'vertical TB side wall receives the full 0.90 mm');

const importedRectangle = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];
const finalGeometryFor = (imported, generated, profileEdges = [0]) => buildFinalGeometry({ panels: [{ id: 'panel', contour: imported, outerContour: imported, innerContours: [], edgeIds: imported.map((_, index) => `edge-${index}`) }] }, [{
  id: 'generated:panel', operationId: 'operation', toolType: 'TB', kind: 'PANEL_PATH', source: { operationId: 'operation', panelIds: ['panel'], edgeIds: imported.map((_, index) => `edge-${index}`), connectionIds: [] },
  geometry: { type: 'path', pathD: `M ${generated.map(({ x, y }) => `${x} ${y}`).join(' L ')} Z` }, behaviour: { assembly: 'panel-boundary', replacesPanelId: 'panel' },
  manufacturingClassification: 'GENERATED_OUTER', pathD: `M ${generated.map(({ x, y }) => `${x} ${y}`).join(' L ')} Z`, diagnostics: [],
  profileGroups: profileEdges.map((edgeIndex) => ({ id: `profile-${edgeIndex}`, kind: 'BOUNDARY_PROFILE', sourceOperationId: 'operation', connectionId: `connection-${edgeIndex}`, panelId: 'panel', sourceEdgeId: `edge-${edgeIndex}`, attachmentStart: imported[edgeIndex], attachmentEnd: imported[(edgeIndex + 1) % imported.length] })),
}]).contours[0];
assert.deepEqual(finalGeometryFor(importedRectangle, horizontalTB).compensationProfile, selectedTBProfiles, 'FinalGeometry authors complete horizontal profile membership including first, last, and replacement-base segments');
assert.deepEqual(finalGeometryFor(importedRectangle, horizontalTB).segmentProfileIds.map(Boolean), selectedTBProfiles, 'available profile union is exactly the old automatic mask');
assert.deepEqual(finalGeometryFor(importedRectangle.map(({ x, y }) => ({ x: -y, y: x })), verticalTB).compensationProfile, selectedTBProfiles, 'FinalGeometry authors the identical complete profile membership vertically');
assert.deepEqual(finalGeometryFor([...importedRectangle].reverse(), [...horizontalTB].reverse(), [2]).segmentProfileIds.filter(Boolean), Array(9).fill('profile-2'), 'reversed source-edge direction preserves complete authored extent');

const beginsWithFeature = [{ x: 0, y: 0 }, { x: 0, y: -2 }, { x: 2, y: -2 }, { x: 2, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];
assert.equal(finalGeometryFor(importedRectangle, beginsWithFeature).segmentProfileIds.slice(0, 4).every((id) => id === 'profile-0'), true, 'a profile beginning with a feature spans both attachments');
const endsWithFeature = [{ x: 0, y: 0 }, { x: 8, y: 0 }, { x: 8, y: -2 }, { x: 10, y: -2 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];
assert.equal(finalGeometryFor(importedRectangle, endsWithFeature).segmentProfileIds.slice(0, 4).every((id) => id === 'profile-0'), true, 'a profile ending with a feature spans both attachments');

const twoEdgeGenerated = [...horizontalTB.slice(0, 10), { x: 10, y: 4 }, { x: 12, y: 4 }, { x: 12, y: 7 }, { x: 10, y: 7 }, { x: 10, y: 10 }, { x: 0, y: 10 }];
const twoEdgeProfiles = finalGeometryFor(importedRectangle, twoEdgeGenerated, [0, 1]).segmentProfileIds;
assert.equal(twoEdgeProfiles.slice(0, 9).every((id) => id === 'profile-0'), true, 'multiple features and both terminal bases share the first source-edge identity');
assert.equal(twoEdgeProfiles.slice(9, 14).every((id) => id === 'profile-1'), true, 'a neighboring source edge receives only its own identity');

const collinearAnchor = { ...outer,
  points: [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }],
  compensationProfile: [false, true, false, false, false],
};
assert.ok(geometryServices.compensateProfile(collinearAnchor, -0.1, 'INWARD'), 'first/last profile provenance remains aligned across collinear generator anchors');
assert.deepEqual(roundedPoints(geometryServices.compensateProfile(collinearAnchor, -0.1, 'INWARD').points), [
  { x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 0.1 },
  { x: 10, y: 0.1 }, { x: 10, y: 10 }, { x: 0, y: 10 },
], 'a profile bounded by collinear unchanged segments reconstructs both parallel transitions');
const verticalCollinearAnchor = {
  ...collinearAnchor,
  points: collinearAnchor.points.map(({ x, y }) => ({ x: -y, y: x })),
};
assert.deepEqual(roundedPoints(geometryServices.compensateProfile(verticalCollinearAnchor, -0.1, 'INWARD').points), [
  { x: 0, y: 0 }, { x: 0, y: 5 }, { x: -0.1, y: 5 },
  { x: -0.1, y: 10 }, { x: -10, y: 10 }, { x: -10, y: 0 },
], 'parallel transition reconstruction is orientation-independent');
assert.deepEqual(clearanceSelective(horizontalTB, selectedTBProfiles, 0).points, horizontalTB, 'zero clearance preserves exact geometry');
assert.deepEqual(roundedPoints(horizontalPositive.points.map(({ x, y }, index) => ({ x: x + horizontalNegative.points[index].x - 2 * horizontalTB[index].x, y: y + horizontalNegative.points[index].y - 2 * horizontalTB[index].y }))), horizontalTB.map(() => ({ x: 0, y: 0 })), '+0.90 mm and -0.90 mm are coordinate-symmetric around the complete source profile');

const signedSlot = { ...slot, compensationProfile: [true, true, true, true] };
assert.equal(geometryServices.compensateProfile(signedSlot, -0.1, 'OUTWARD').pathD, 'M 1.9 1.9 L 4.1 1.9 L 4.1 4.1 L 1.9 4.1 Z', 'negative slot clearance increases slot clearance');
assert.equal(geometryServices.compensateProfile(signedSlot, 0.1, 'OUTWARD').pathD, 'M 2.1 2.1 L 3.9 2.1 L 3.9 3.9 L 2.1 3.9 Z', 'positive slot clearance moves in the opposite direction');
assert.equal(geometryServices.compensateProfile(signedSlot, -0.9, 'OUTWARD').pathD, 'M 1.1 1.1 L 4.9 1.1 L 4.9 4.9 L 1.1 4.9 Z', 'whole-slot signed compensation remains unchanged');
assert.equal(compensateClassifiedContours([{ ...outer }], 0.3)[0].pathD, 'M -0.15 -0.15 L 10.15 -0.15 L 10.15 10.15 L -0.15 10.15 Z', 'kerf direction and half-width remain unchanged');
assert.deepEqual(DEFAULT_PROJECT_SETTINGS, { kerfMm: 0.15, clearanceMm: 0, slotClearanceMm: -0.10 }, 'only new-project Clearance defaults to zero; Kerf and Slot Clearance defaults remain unchanged');
const appSource = readFileSync(resolve(root, 'src/App.tsx'), 'utf8');
assert.doesNotMatch(appSource.match(/id="manufacturing-clearance"[^\n]*/)?.[0] ?? '', /min=\{0\}/, 'clearance UI accepts negative values');
assert.doesNotMatch(appSource.match(/id="manufacturing-slot-clearance"[^\n]*/)?.[0] ?? '', /min=\{0\}/, 'slot clearance UI accepts negative values');
assert.ok(appSource.indexOf('clearance-profile-underlays') < appSource.indexOf('final-contour-kerf-layer'), 'profile indication is rendered below the manufacturing contour');
assert.ok(appSource.indexOf('final-contour-kerf-layer') < appSource.indexOf('clearance-profile-hit-targets'), 'transparent hit targets are rendered above the manufacturing contour');
const styleSource = readFileSync(resolve(root, 'src/styles.css'), 'utf8');
assert.match(styleSource, /\.clearance-profile-hitbox \{[^}]*fill: none;[^}]*stroke: transparent;[^}]*pointer-events: stroke;/, 'hit target is wide, transparent, and pointer-enabled');
assert.match(styleSource, /\.clearance-profile-underlay\.selected \{[^}]*rgba\([^)]*, 0\.48\)/, 'selected indication is a semi-transparent underlay');

for (const file of ['src/app/manufacturingCompensation.ts', 'src/app/compensationStrategies.ts']) {
  const source = readFileSync(resolve(root, file), 'utf8');
  assert.doesNotMatch(source, /buildContourSides|offsetContourSide|lineIntersection|pointsToClosedPathD/, `${file} contains no polygon offset implementation`);
}

console.log('Geometry Services architecture tests passed');
