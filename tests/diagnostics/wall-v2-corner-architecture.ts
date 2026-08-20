import {
  applyTabsToContour,
  buildInsetPanelContour,
  buildTabOperations,
  buildTabSegmentPlansByConnectionId,
  type PanelEdgeOperation,
} from '../../src/app/tbGeometry';
import { getContourSignedArea } from '../../src/app/sharedGeometry';
import type { EdgeRole, Point, SvgPanel } from '../../src/svgUtils';

const epsilon = 1e-7;
const assert: (condition: unknown, message: string) => asserts condition = (condition, message) => {
  if (!condition) throw new Error(message);
};
const close = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y) <= epsilon;
const transform = (point: Point, angleDegrees: number, translation: Point): Point => {
  const radians = angleDegrees * Math.PI / 180;
  return {
    x: point.x * Math.cos(radians) - point.y * Math.sin(radians) + translation.x,
    y: point.x * Math.sin(radians) + point.y * Math.cos(radians) + translation.y,
  };
};

type FixtureResult = { corner: Point; junction: Point; contour: Point[] };

const run = (
  previousRole: EdgeRole | undefined,
  nextRole: EdgeRole | undefined,
  cornerNumber: number,
  clockwise: boolean,
  angleDegrees = 0,
  translation: Point = { x: 0, y: 0 },
): FixtureResult => {
  const source = [{ x: 0, y: 0 }, { x: 80, y: 0 }, { x: 80, y: 50 }, { x: 0, y: 50 }];
  const traversal = clockwise ? [source[0], source[3], source[2], source[1]] : source;
  const contour = traversal.map((point) => transform(point, angleDegrees, translation));
  const target = transform(source[cornerNumber], angleDegrees, translation);
  const nextIndex = contour.findIndex((point) => close(point, target));
  const previousIndex = (nextIndex + contour.length - 1) % contour.length;
  const edgeIds = contour.map((_, index) => `edge-${index}`);
  const panel: SvgPanel = {
    id: 'base', contour, outerContour: contour, innerContours: [], edgeIds,
    outerEdgeIds: edgeIds, innerEdgeIds: [],
    bounds: { minX: Math.min(...contour.map((p) => p.x)), minY: Math.min(...contour.map((p) => p.y)),
      maxX: Math.max(...contour.map((p) => p.x)), maxY: Math.max(...contour.map((p) => p.y)) },
  };
  const operation = (sideIndex: number, role: EdgeRole): PanelEdgeOperation => ({
    edgeId: edgeIds[sideIndex], connectionId: `TB-${sideIndex}`, role,
    materialThicknessMm: 5, insetDepthMm: 5, fingerWidthMm: 10,
  });
  const operations = [
    ...(previousRole ? [operation(previousIndex, previousRole)] : []),
    ...(nextRole ? [operation(nextIndex, nextRole)] : []),
  ];
  const inset = buildInsetPanelContour(panel, operations);
  assert(inset.ok, `native TB inset failed: ${inset.ok ? '' : inset.reason}`);
  const tabs = buildTabOperations(panel, operations, buildTabSegmentPlansByConnectionId(panel, operations));
  const generated = applyTabsToContour(panel, inset.contour, tabs);
  assert(generated.ok, `native TB tab generation failed: ${generated.ok ? '' : generated.reason}`);

  // The native generator emits one shared role-effective junction. The point nearest the
  // source corner is stable under winding and rigid transforms, unlike raw edge endpoints.
  const junction = generated.contour.reduce((nearest, point) => (
    Math.hypot(point.x - target.x, point.y - target.y) < Math.hypot(nearest.x - target.x, nearest.y - target.y)
      ? point : nearest
  ));
  assert(generated.contour.every((point, index) => !close(point, generated.contour[(index + 1) % generated.contour.length])),
    'TB emitted a zero-length contour segment');
  assert(Math.abs(getContourSignedArea(generated.contour)) > epsilon, 'TB emitted a degenerate contour');
  return { corner: target, junction, contour: generated.contour };
};

for (const clockwise of [false, true]) {
  for (let corner = 0; corner < 4; corner += 1) {
    assert(run(undefined, 'A', corner, clockwise).contour.length > 3, 'isolated A failed');
    assert(run(undefined, 'B', corner, clockwise).contour.length > 3, 'isolated B failed');
    for (const [previous, next] of [['A', 'B'], ['B', 'A']] as const) {
      const base = run(previous, next, corner, clockwise);
      for (const [angle, translation] of [[90, { x: 0, y: 0 }], [27, { x: 0, y: 0 }], [0, { x: 137, y: -43 }]] as const) {
        const moved = run(previous, next, corner, clockwise, angle, translation);
        const expected = transform(base.junction, angle, translation);
        assert(close(moved.junction, expected), `${previous}/${next} junction is not rigid-transform invariant`);
      }
    }
  }
}

const ab = run('A', 'B', 0, false);
const ba = run('B', 'A', 0, false);
const separation = { x: ba.junction.x - ab.junction.x, y: ba.junction.y - ab.junction.y };
assert(close(ab.junction, { x: 5, y: 0 }), `unexpected AB junction ${JSON.stringify(ab.junction)}`);
assert(close(ba.junction, { x: 0, y: 5 }), `unexpected BA junction ${JSON.stringify(ba.junction)}`);
assert(Math.abs(Math.hypot(separation.x, separation.y) - Math.sqrt(50)) <= epsilon, 'unexpected junction separation');

console.log('PASS isolated A and B: all four corners, CW and CCW');
console.log('PASS adjacent A/B and B/A: all four corners, CW and CCW');
console.log('PASS rigid transforms: 90 degrees, 27 degrees, translation');
console.log(`EVIDENCE CCW corner=(0,0) previous=A next=B junction=(${ab.junction.x},${ab.junction.y})`);
console.log(`EVIDENCE CCW corner=(0,0) previous=B next=A junction=(${ba.junction.x},${ba.junction.y})`);
console.log(`EVIDENCE alternative-junction separation=(${separation.x},${separation.y}) magnitude=${Math.hypot(separation.x, separation.y)}`);
console.log('EVIDENCE LIMIT: corner topology alone does not choose roles; B1 panel-pair TB orientation supplies the product rule.');
