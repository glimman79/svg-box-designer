const assert = require('node:assert/strict');
const { applyTapClearance, processManufacturingGeometry } = require('../.test-build/app/manufacturingCompensation.js');
const { createManufacturingGeometry } = require('../.test-build/app/manufacturingGeometry.js');

const points = [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 2, y: -2 }, { x: 4, y: -2 }, { x: 4, y: 0 }, { x: 6, y: 0 }, { x: 6, y: -2 }, { x: 8, y: -2 }, { x: 8, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];
const first = 'generated-tap:first';
const second = 'generated-tap:second';
const contour = { id: 'panel', source: 'final-contour', finalSource: 'applied-panel', kind: 'OUTER', geometryType: 'GENERATED_OUTER', points, pathD: `M ${points.map(({ x, y }) => `${x} ${y}`).join(' L ')} Z`, profileMaterialSide: 'GENERATED_MATING', compensationProfile: points.map(() => false), segmentTapIds: [null, first, first, first, null, second, second, second, null, null, null, null], segmentTapRoles: [null, 'tap-side-start', 'tap-tip', 'tap-side-end', null, 'tap-side-start', 'tap-tip', 'tap-side-end', null, null, null, null] };
const geometry = () => createManufacturingGeometry({ contours: [contour], diagnostics: [] });
const compensated = applyTapClearance(geometry(), -0.1).finalContourList[0];
assert.notEqual(compensated.points[3].x, 4);
assert.notEqual(compensated.points[7].x, 8);
assert.equal(applyTapClearance(geometry(), 0).finalContourList[0].pathD, contour.pathD);
const unprovenanced = createManufacturingGeometry({ contours: [{ ...contour, segmentTapIds: undefined, segmentTapRoles: undefined }], diagnostics: [] });
assert.equal(JSON.stringify(applyTapClearance(unprovenanced, -0.1).finalContourList), JSON.stringify(unprovenanced.finalContourList));
assert.notEqual(processManufacturingGeometry({ contours: [contour], diagnostics: [] }, 0.15, -0.1, 0, [], -0.1).finalContourList[0].pathD, processManufacturingGeometry({ contours: [contour], diagnostics: [] }, 0.15, -0.1, 0, [], 0).finalContourList[0].pathD);
const cornerPoints = [{ x: 0, y: 0 }, { x: 0, y: -2 }, { x: 2, y: -2 }, { x: 2, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];
const corner = { ...contour, id: 'corner', points: cornerPoints, pathD: `M ${cornerPoints.map(({ x, y }) => `${x} ${y}`).join(' L ')} Z`, compensationProfile: cornerPoints.map(() => false), segmentTapIds: [first, first, first, null, null, null, null], segmentTapRoles: ['source-boundary-start', 'tap-tip', 'tap-side-end', null, null, null, null] };
const bounds = (p) => [Math.min(...p.map(v => v.x)), Math.max(...p.map(v => v.x)), Math.min(...p.map(v => v.y)), Math.max(...p.map(v => v.y))];
for (const value of [-0.1, 0, 0.1]) {
  const output = applyTapClearance(createManufacturingGeometry({ contours: [corner], diagnostics: [] }), value).finalContourList[0];
  assert.deepEqual(bounds(output.points), bounds(cornerPoints), `${value}: panel bounding box remains exact`);
  assert.ok(output.points.some((point) => point.x === cornerPoints[0].x && point.y === cornerPoints[0].y), `${value}: corner remains fixed`);
}
console.log('Compiled Tap Clearance regression harness passed.');
