import { geometryServices, isRedundantContiguousCollinearJoin } from '../../src/app/geometryServices';
import { getContourSignedArea } from '../../src/app/sharedGeometry';
import type { FinalContour } from '../../src/app/contourClassification';
import type { Point } from '../../src/svgUtils';

const fail = (message: string): never => { throw new Error(message); };
const check = (condition: unknown, message: string) => { if (!condition) fail(message); };
const basePoints: Point[] = [
  { x: 0, y: 0 }, { x: 30, y: 0 }, { x: 30, y: -5 }, { x: 60, y: -5 }, { x: 60, y: 0 },
  { x: 80, y: 0 }, { x: 90, y: 0 }, { x: 90, y: 5 }, { x: 90, y: 60 }, { x: 0, y: 60 },
];
const selected = basePoints.map((_, index) => index === 6 || index === 7);
const side = (start: Point, end: Point) => ({ start, end });
check(isRedundantContiguousCollinearJoin(side({ x: 0, y: 0 }, { x: 5, y: 0 }), side({ x: 5, y: 0 }, { x: 10, y: 0 })), 'valid redundant join was rejected');
for (const [previous, current, label] of [
  [side({ x: 0, y: 0 }, { x: 5, y: 0 }), side({ x: 5, y: 1 }, { x: 10, y: 1 }), 'parallel separated'],
  [side({ x: 0, y: 0 }, { x: 5, y: 0 }), side({ x: 6, y: 0 }, { x: 10, y: 0 }), 'disconnected'],
  [side({ x: 0, y: 0 }, { x: 5, y: 0 }), side({ x: 5, y: 0 }, { x: 0, y: 0 }), 'opposite direction'],
  [side({ x: 5, y: 0 }, { x: 5, y: 0 }), side({ x: 5, y: 0 }, { x: 10, y: 0 }), 'zero length'],
  [side({ x: 0, y: 0 }, { x: 5, y: 0 }), side({ x: 5, y: 0 }, { x: Number.NaN, y: 0 }), 'non-finite'],
] as const) check(!isRedundantContiguousCollinearJoin(previous, current), `${label} join was accepted`);

const validate = (source: Point[], result: FinalContour | null, label: string) => {
  check(result?.points && result.points.length >= 3, `${label}: reconstruction failed`);
  const points = result!.points!;
  check(points.every(({ x, y }) => Number.isFinite(x) && Number.isFinite(y)), `${label}: non-finite coordinate`);
  check(points.every((point, index) => point.x !== points[(index + 1) % points.length].x
    || point.y !== points[(index + 1) % points.length].y), `${label}: zero-length side`);
  check(Math.abs(getContourSignedArea(points)) > 1e-7, `${label}: degenerate result`);
  check(Math.sign(getContourSignedArea(points)) === Math.sign(getContourSignedArea(source)), `${label}: winding changed`);
};

const compensate = (points: Point[], mask: boolean[], amount: number, label: string) => {
  const result = geometryServices.compensateProfile({
    id: label, source: 'final-contour', finalSource: 'applied-panel', kind: 'OUTER', geometryType: 'GENERATED_OUTER',
    points, compensationProfile: mask, segmentTapRoles: points.map(() => 'source-boundary-start'),
  }, amount, 'INWARD');
  validate(points, result, label);
  return result!;
};

for (const amount of [0.9, -0.9]) compensate(basePoints, selected, amount, `canonical ${amount}`);
for (const turns of [0, 1, 2, 3]) {
  const rotate = ({ x, y }: Point) => turns === 0 ? { x, y }
    : turns === 1 ? { x: -y, y: x }
      : turns === 2 ? { x: -x, y: -y } : { x: y, y: -x };
  compensate(basePoints.map(rotate), selected, 0.9, `rotation ${turns * 90}`);
}

for (let shift = 0; shift < basePoints.length; shift += 1) {
  const rotateArray = <T>(values: T[]) => [...values.slice(shift), ...values.slice(0, shift)];
  compensate(rotateArray(basePoints), rotateArray(selected), 0.9, `cyclic shift ${shift}`);
}

const reversed = [...basePoints].reverse();
const reversedMask = reversed.map((_, index) => selected[(basePoints.length - 2 - index + basePoints.length) % basePoints.length]);
compensate(reversed, reversedMask, 0.9, 'clockwise');

const selectionConfigurations = [
  [0, 1, 2, 3], [9], [6, 7], [0, 1, 2, 3, 6, 7], [0, 1, 2, 3, 5, 6, 7, 8], [5, 6, 7, 8],
  basePoints.map((_, index) => index),
];
selectionConfigurations.forEach((indexes, index) => compensate(
  basePoints, basePoints.map((_, segmentIndex) => indexes.includes(segmentIndex)), 0.9, `selection ${index + 1}`,
));

const multiple = [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 7, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];
const multipleResult = compensate(multiple, multiple.map(() => true), 0.9, 'multiple selected joins');
check(multipleResult.points?.length === 4, 'multiple selected joins were not collapsed');

console.log('selected/selected redundant-join regression: passed');
