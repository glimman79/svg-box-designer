const assert = require('node:assert/strict');
const { applyTapClearance, processManufacturingGeometry } = require('../.test-build/app/manufacturingCompensation.js');
const { createManufacturingGeometry } = require('../.test-build/app/manufacturingGeometry.js');

const points = [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 2, y: -2 }, { x: 4, y: -2 }, { x: 4, y: 0 }, { x: 6, y: 0 }, { x: 6, y: -2 }, { x: 8, y: -2 }, { x: 8, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];
const first = 'generated-tap:first';
const second = 'generated-tap:second';
const contour = { id: 'panel', source: 'final-contour', finalSource: 'applied-panel', kind: 'OUTER', geometryType: 'GENERATED_OUTER', points, pathD: `M ${points.map(({ x, y }) => `${x} ${y}`).join(' L ')} Z`, profileMaterialSide: 'GENERATED_MATING', compensationProfile: points.map(() => false), segmentTapIds: [null, first, first, first, null, second, second, second, null, null, null, null] };
const geometry = () => createManufacturingGeometry({ contours: [contour], diagnostics: [] });
const baseline = JSON.stringify(geometry().finalContourList);
assert.equal(JSON.stringify(applyTapClearance(geometry(), -0.1, []).finalContourList), baseline);
assert.notEqual(applyTapClearance(geometry(), -0.1, [first]).finalContourList[0].pathD, contour.pathD);
assert.notEqual(applyTapClearance(geometry(), -0.1, [first, second]).finalContourList[0].points[7].x, 8);
assert.equal(applyTapClearance(geometry(), 0, [first]).finalContourList[0].pathD, contour.pathD);
assert.notEqual(applyTapClearance(geometry(), 0.1, [first]).finalContourList[0].pathD, applyTapClearance(geometry(), -0.1, [first]).finalContourList[0].pathD);
const unprovenanced = createManufacturingGeometry({ contours: [{ ...contour, segmentTapIds: undefined }], diagnostics: [] });
assert.equal(JSON.stringify(applyTapClearance(unprovenanced, -0.1, [first]).finalContourList), JSON.stringify(unprovenanced.finalContourList));
assert.equal(JSON.stringify(processManufacturingGeometry({ contours: [contour], diagnostics: [] }, 0.15, -0.1, 0, [])), JSON.stringify(processManufacturingGeometry({ contours: [contour], diagnostics: [] }, 0.15, -0.1, 0, [], -0.1, [])));
console.log('Compiled Tap Clearance regression harness passed.');
