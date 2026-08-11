import {
  applyTabsToContour,
  buildInsetPanelContour,
  buildTabOperations,
  buildTabSegmentPlansByConnectionId,
  type PanelEdgeOperation,
} from '../../src/app/eGeometry';
import { getContourSignedArea } from '../../src/app/sharedGeometry';
import type { EdgeRole, Point, SvgPanel } from '../../src/svgUtils';

const tolerance = 1e-8;
const assert = {
  equal: (actual: unknown, expected: unknown) => { if (actual !== expected) throw new Error(`${actual} !== ${expected}`); },
  ok: (value: unknown, message = 'assertion failed') => { if (!value) throw new Error(message); },
  deepEqual: (actual: unknown, expected: unknown) => {
    if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${JSON.stringify(actual)} !== ${JSON.stringify(expected)}`);
  },
};
const close = (left: Point, right: Point) => Math.hypot(left.x - right.x, left.y - right.y) <= tolerance;
const corners: Point[] = [{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 30 }, { x: 0, y: 30 }];

const runCase = (
  previousRole: EdgeRole,
  currentRole: EdgeRole,
  cornerIndex: number,
  previousDepth: number,
  currentDepth: number,
  reversed: boolean,
) => {
  const contour = reversed ? [corners[0], corners[3], corners[2], corners[1]] : corners;
  const currentSideIndex = contour.findIndex((point) => close(point, corners[cornerIndex]));
  const previousSideIndex = (currentSideIndex + contour.length - 1) % contour.length;
  const edgeIds = contour.map((_, index) => `edge-${index}`);
  const panel: SvgPanel = {
    id: 'panel', contour, edgeIds,
    outerContour: contour, innerContours: [], outerEdgeIds: edgeIds, innerEdgeIds: [],
    bounds: { minX: 0, minY: 0, maxX: 40, maxY: 30 },
  };
  const makeOperation = (sideIndex: number, role: EdgeRole, depth: number): PanelEdgeOperation => ({
    edgeId: edgeIds[sideIndex], connectionId: `tb-${sideIndex}`, role,
    materialThicknessMm: depth, insetDepthMm: depth, fingerWidthMm: 7,
  });
  const operations = [
    makeOperation(previousSideIndex, previousRole, previousDepth),
    makeOperation(currentSideIndex, currentRole, currentDepth),
  ];
  const inset = buildInsetPanelContour(panel, operations);
  assert.equal(inset.ok, true);
  if (!inset.ok) throw new Error(inset.reason);
  const tabOperations = buildTabOperations(panel, operations, buildTabSegmentPlansByConnectionId(panel, operations));
  const result = applyTabsToContour(panel, inset.contour, tabOperations);
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error(result.reason);

  const corner = corners[cornerIndex];
  const previousVector = {
    x: contour[currentSideIndex].x - contour[previousSideIndex].x,
    y: contour[currentSideIndex].y - contour[previousSideIndex].y,
  };
  const currentEnd = contour[(currentSideIndex + 1) % contour.length];
  const currentVector = { x: currentEnd.x - corner.x, y: currentEnd.y - corner.y };
  const winding = getContourSignedArea(contour) >= 0 ? 1 : -1;
  const inwardNormal = (vector: Point) => ({ x: -vector.y / Math.hypot(vector.x, vector.y) * winding, y: vector.x / Math.hypot(vector.x, vector.y) * winding });
  const previousInset = inwardNormal(previousVector);
  const currentInset = inwardNormal(currentVector);
  const expected = {
    x: corner.x + (currentRole === 'A' ? currentInset.x * currentDepth : 0) + (previousRole === 'A' ? previousInset.x * previousDepth : 0),
    y: corner.y + (currentRole === 'A' ? currentInset.y * currentDepth : 0) + (previousRole === 'A' ? previousInset.y * previousDepth : 0),
  };
  const oldInsetInset = {
    x: corner.x + currentInset.x * currentDepth + previousInset.x * previousDepth,
    y: corner.y + currentInset.y * currentDepth + previousInset.y * previousDepth,
  };
  const matches = result.contour.filter((point) => close(point, expected));
  assert.ok(matches.length >= 1, `missing shared junction ${JSON.stringify(expected)}`);
  assert.ok(result.contour.every((point) => Number.isFinite(point.x) && Number.isFinite(point.y)));
  assert.ok(Math.abs(getContourSignedArea(result.contour)) > tolerance);
  result.contour.forEach((point, index) => assert.ok(!close(point, result.contour[(index + 1) % result.contour.length])));

  const label = `${previousRole}${currentRole} corner=${cornerIndex} winding=${reversed ? 'reversed' : 'original'} depths=${previousDepth}/${currentDepth}`;
  console.log(`Case: ${label}`);
  console.log(`Previous role: ${previousRole}`);
  console.log(`Current role: ${currentRole}`);
  console.log(`Previous effective support line: ${previousRole === 'A' ? 'inset' : 'outward/original'}`);
  console.log(`Current effective support line: ${currentRole === 'A' ? 'inset' : 'outward/original'}`);
  console.log(`Expected shared junction: (${expected.x},${expected.y})`);
  console.log(`Actual shared junction: (${matches[0].x},${matches[0].y})`);
  if (previousRole !== currentRole) console.log(`Previous incorrect inset/inset point: (${oldInsetInset.x},${oldInsetInset.y})`);
  console.log('PASS');
  return expected;
};

for (const reversed of [false, true]) {
  for (let cornerIndex = 0; cornerIndex < 4; cornerIndex += 1) {
    for (const [previousRole, currentRole] of [['A', 'A'], ['B', 'B'], ['A', 'B'], ['B', 'A']] as const) {
      runCase(previousRole, currentRole, cornerIndex, 5, 5, reversed);
    }
    for (const [previousDepth, currentDepth] of [[3, 3], [5, 5], [3, 5], [5, 3]]) {
      runCase('A', 'B', cornerIndex, previousDepth, currentDepth, reversed);
      runCase('B', 'A', cornerIndex, previousDepth, currentDepth, reversed);
    }
  }
}

assert.deepEqual(runCase('A', 'A', 0, 5, 5, false), { x: 5, y: 5 });
assert.deepEqual(runCase('B', 'B', 0, 5, 5, false), { x: 0, y: 0 });
assert.deepEqual(runCase('A', 'B', 0, 5, 5, false), { x: 5, y: 0 });
assert.deepEqual(runCase('B', 'A', 0, 5, 5, false), { x: 0, y: 5 });
