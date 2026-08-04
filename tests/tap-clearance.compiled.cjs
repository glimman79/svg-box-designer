const assert = require('node:assert/strict');
const { applyTapClearance, processManufacturingGeometry } = require('../.test-build/app/manufacturingCompensation.js');
const { createManufacturingGeometry } = require('../.test-build/app/manufacturingGeometry.js');
const { resolveTapClearanceElementIds } = require('../.test-build/app/tapClearance.js');

const points = [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 2, y: -2 }, { x: 4, y: -2 }, { x: 4, y: 0 }, { x: 6, y: 0 }, { x: 6, y: -2 }, { x: 8, y: -2 }, { x: 8, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];
const element = (id, kind, order) => ({ id, profileId: 'profile', kind, profileOrder: order, geometryProjectionId: `projection:${id}` });
const elementSpecs = [
  ['boundary-0', 'boundary-run'], ['first-leading', 'tap-leading-wall'], ['first-tip', 'tap-tip'], ['first-trailing', 'tap-trailing-wall'],
  ['boundary-1', 'boundary-run'], ['last-leading', 'tap-leading-wall'], ['last-tip', 'tap-tip'], ['last-trailing', 'tap-trailing-wall'], ['boundary-2', 'boundary-run'],
];
const orderedElements = elementSpecs.map(([id, kind], order) => element(id, kind, order));
const geometryProjections = orderedElements.map((value, order) => ({ id: value.geometryProjectionId, profileId: 'profile', elementId: value.id, kind: 'current-contour-segment', profileSegmentOrder: order, start: points[order], end: points[order + 1] }));
const profile = {
  id: 'profile', generatorType: 'TB', operationId: 'operation', panelId: 'panel', sourceEdgeId: 'edge',
  sourceEdgeDirection: { start: points[0], end: points[9] }, attachmentStart: points[0], attachmentEnd: points[9], orderedElements, geometryProjections,
  orderedTaps: [
    { id: 'first', tapIndex: 0, totalTapCount: 2, leadingWallElementId: 'first-leading', tipElementId: 'first-tip', trailingWallElementId: 'first-trailing', isFirstTap: true, isMiddleTap: false, isLastTap: false },
    { id: 'last', tapIndex: 1, totalTapCount: 2, leadingWallElementId: 'last-leading', tipElementId: 'last-tip', trailingWallElementId: 'last-trailing', isFirstTap: false, isMiddleTap: false, isLastTap: true },
  ], leadingBoundaryRun: 'boundary-0', trailingBoundaryRun: 'boundary-2',
};
const contour = { id: 'panel', panelId: 'panel', source: 'final-contour', finalSource: 'applied-panel', kind: 'OUTER', geometryType: 'GENERATED_OUTER', points, pathD: `M ${points.map(({ x, y }) => `${x} ${y}`).join(' L ')} Z`, compensationProfile: points.map(() => false),
  // Deliberately contradictory legacy metadata: production must ignore it.
  segmentTapIds: points.map(() => null), segmentTapRoles: points.map(() => 'tap-tip') };
const geometry = (profiles = [profile], currentContour = contour) => createManufacturingGeometry({ contours: [currentContour], diagnostics: [], generatedProfiles: profiles });

assert.deepEqual([...resolveTapClearanceElementIds(profile)], ['first-trailing', 'last-leading']);
const compensated = applyTapClearance(geometry(), -0.1).finalContourList[0];
assert.notEqual(compensated.pathD, contour.pathD, 'semantic inner walls receive Tap Clearance');
assert.equal(applyTapClearance(geometry(), 0).finalContourList[0].pathD, contour.pathD);
assert.equal(applyTapClearance(geometry([]), -0.1).finalContourList[0].pathD, contour.pathD, 'legacy segment roles do not grant eligibility');

const single = { ...profile, orderedTaps: [{ ...profile.orderedTaps[0], totalTapCount: 1, isLastTap: true }] };
assert.deepEqual([...resolveTapClearanceElementIds(single)], [], 'single-tap walls and tip are fixed by product policy');
assert.equal(applyTapClearance(geometry([single]), -0.1).finalContourList[0].pathD, contour.pathD);

const reversedPoints = [points[0], ...points.slice(1).reverse()];
const reversedContour = { ...contour, points: reversedPoints, pathD: `M ${reversedPoints.map(({ x, y }) => `${x} ${y}`).join(' L ')} Z` };
assert.notEqual(applyTapClearance(geometry([profile], reversedContour), -0.1).finalContourList[0].pathD, reversedContour.pathD, 'contour winding does not change semantic eligibility');
assert.notEqual(processManufacturingGeometry({ contours: [contour], diagnostics: [], generatedProfiles: [profile] }, 0.15, -0.1, 0, [], -0.1).finalContourList[0].pathD,
  processManufacturingGeometry({ contours: [contour], diagnostics: [], generatedProfiles: [profile] }, 0.15, -0.1, 0, [], 0).finalContourList[0].pathD);
console.log('Compiled semantic Tap Clearance production regression harness passed.');
