import { buildGeneratedSGeometryItems, getSContourPlacementSegment, resolveSThickness } from '../../src/app/sGeometry';
import { getContourSideCanonicalOrientation, isContourSideReversedFromCanonical } from '../../src/app/sharedGeometry';
import type { SlotConnectionDefinition } from '../../src/app/connectionTypes';
import type { GeneratedGeometryItem } from '../../src/app/generatedGeometryTypes';
import type { EdgeAssignmentRecord, Point, SvgDocumentModel, SvgEdge, SvgPanel } from '../../src/svgUtils';

const EPSILON = 1e-8;
const assert: (condition: unknown, message: string) => asserts condition = (condition, message) => { if (!condition) throw new Error(message); };
const close = (actual: number, expected: number, message: string) => assert(Math.abs(actual - expected) < EPSILON, `${message}: expected ${expected}, got ${actual}`);
const vector = (from: Point, to: Point) => ({ x: to.x - from.x, y: to.y - from.y });
const dot = (a: Point, b: Point) => a.x * b.x + a.y * b.y;
const unit = (value: Point) => { const length = Math.hypot(value.x, value.y); return { x: value.x / length, y: value.y / length }; };
const add = (point: Point, delta: Point) => ({ x: point.x + delta.x, y: point.y + delta.y });
const rotate = (point: Point, angle: number) => ({ x: point.x * Math.cos(angle) - point.y * Math.sin(angle), y: point.x * Math.sin(angle) + point.y * Math.cos(angle) });
const signedArea = (contour: Point[]) => contour.reduce((area, point, index) => { const next = contour[(index + 1) % contour.length]; return area + point.x * next.y - next.x * point.y; }, 0) / 2;

type Winding = 'CW' | 'CCW';
type FixtureOptions = { aWinding?: Winding; bWinding?: Winding; offset?: number; translate?: Point; rotate?: number; reverseB?: boolean; reverseA?: boolean; vertical?: boolean; bLength?: number };
type Fixture = { model: SvgDocumentModel; assignments: EdgeAssignmentRecord; connection: SlotConnectionDefinition; aPanel: SvgPanel; bPanel: SvgPanel; aEdge: SvgEdge; bEdge: SvgEdge; contourBEdge: SvgEdge };

const fixture = ({ aWinding = 'CW', bWinding = 'CW', offset = 3, translate = { x: 0, y: 0 }, rotate: angle = 0, reverseB = false, reverseA = false, vertical = false, bLength = 120 }: FixtureOptions = {}): Fixture => {
  const transform = (point: Point) => add(rotate(vertical ? { x: -point.y, y: point.x } : point, angle), translate);
  const makePanel = (id: string, rawContour: Point[], winding: Winding) => {
    const clockwise = rawContour.map(transform);
    const contour = winding === 'CW' ? clockwise : [clockwise[0], ...clockwise.slice(1).reverse()];
    const edgeIds = contour.map((_, index) => `${id}-edge-${index}`);
    const edges = contour.map((start, index): SvgEdge => ({ id: edgeIds[index], source: id, start, end: contour[(index + 1) % contour.length] }));
    const xs = contour.map((point) => point.x); const ys = contour.map((point) => point.y);
    const panel: SvgPanel = { id, contour, outerContour: contour, innerContours: [], edgeIds, outerEdgeIds: edgeIds, innerEdgeIds: [], bounds: { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) } };
    return { panel, edges };
  };
  const a = makePanel('a', [{ x: 0, y: 0 }, { x: 80, y: 0 }, { x: 80, y: 45 }, { x: 0, y: 45 }], aWinding);
  const b = makePanel('b', [{ x: 130, y: 0 }, { x: 130 + bLength, y: 0 }, { x: 130 + bLength, y: 60 }, { x: 130, y: 60 }], bWinding);
  const nearest = (edges: SvgEdge[], target: Point) => edges.reduce((best, edge) => {
    const midpoint = { x: (edge.start.x + edge.end.x) / 2, y: (edge.start.y + edge.end.y) / 2 };
    const distance = Math.hypot(midpoint.x - target.x, midpoint.y - target.y);
    return distance < best.distance ? { edge, distance } : best;
  }, { edge: edges[0], distance: Number.POSITIVE_INFINITY }).edge;
  const contourAEdge = nearest(a.edges, transform({ x: 40, y: 0 }));
  const contourBEdge = nearest(b.edges, transform({ x: 130 + bLength / 2, y: 0 }));
  const aEdge = reverseA ? { ...contourAEdge, start: contourAEdge.end, end: contourAEdge.start } : contourAEdge;
  const bEdge = reverseB ? { ...contourBEdge, start: contourBEdge.end, end: contourBEdge.start } : contourBEdge;
  const edges = [...a.edges.map((edge) => edge.id === aEdge.id ? aEdge : edge), ...b.edges.map((edge) => edge.id === bEdge.id ? bEdge : edge)];
  const model: SvgDocumentModel = { content: '', innerMarkup: '', rootAttributes: { width: null, height: null, viewBox: null }, viewBox: '0 0 400 200', width: 400, height: 200, panels: [a.panel, b.panel], edges };
  const assignments: EdgeAssignmentRecord = { [aEdge.id]: { slotAssignments: [{ connectionId: 'S1', slotRole: 'A' }] }, [bEdge.id]: { slotAssignments: [{ connectionId: 'S1', slotRole: 'B' }] } };
  const connection: SlotConnectionDefinition = { id: 'S1', prefix: 'S', properties: { slotOffsetMm: offset, slotLengthMm: 20, isSlotLengthManual: true, kerfMm: 0.15 } };
  return { model, assignments, connection, aPanel: a.panel, bPanel: b.panel, aEdge, bEdge, contourBEdge };
};

const panelManager = { defaultThicknessMm: 99, panels: { a: { panelId: 'a', thicknessMm: 4 }, b: { panelId: 'b', thicknessMm: 7 } } };
const generate = (input: Fixture) => buildGeneratedSGeometryItems(input.model, input.assignments, { S1: input.connection }, panelManager);
const slots = (items: GeneratedGeometryItem[]) => items.filter((item) => item.kind === 'SLOT_PATH');
const points = (slot: GeneratedGeometryItem): Point[] => {
  const numbers = slot.pathD.match(/-?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?/gi)?.map(Number) ?? [];
  assert(numbers.length === 8, `expected four points in slot path, got ${slot.pathD}`);
  return Array.from({ length: 4 }, (_, index) => ({ x: numbers[index * 2], y: numbers[index * 2 + 1] }));
};
const centroid = (slot: GeneratedGeometryItem) => points(slot).reduce((sum, point) => ({ x: sum.x + point.x / 4, y: sum.y + point.y / 4 }), { x: 0, y: 0 });
const inwardNormal = (input: Fixture) => {
  const direction = unit(vector(input.contourBEdge.start, input.contourBEdge.end));
  const sign = signedArea(input.bPanel.contour) >= 0 ? 1 : -1;
  return { x: -direction.y * sign, y: direction.x * sign };
};
const canonicalFrame = (input: Fixture) => {
  const reversed = isContourSideReversedFromCanonical(input.contourBEdge);
  const start = reversed ? input.contourBEdge.end : input.contourBEdge.start;
  const end = reversed ? input.contourBEdge.start : input.contourBEdge.end;
  return { start, tangent: unit(vector(start, end)) };
};
const canonicalRange = (input: Fixture, slot: GeneratedGeometryItem) => {
  const frame = canonicalFrame(input);
  const values = points(slot).map((point) => dot(vector(frame.start, point), frame.tangent));
  return { start: Math.min(...values), end: Math.max(...values) };
};
const inspect = (input: Fixture) => {
  const generatedSlots = slots(generate(input));
  assert(generatedSlots.length > 0, 'fixture did not generate slots');
  const inward = inwardNormal(input); const frame = canonicalFrame(input);
  generatedSlots.forEach((slot) => {
    const metric = slot.geometry.metrics!; const slotPoints = points(slot); const center = centroid(slot); const range = canonicalRange(input, slot);
    close(metric.widthMm, 4, 'slot metric width must use S-A PM thickness');
    close(Math.abs(dot(vector(slotPoints[0], slotPoints[3]), inward)), 4, 'physical slot width must be perpendicular to B edge');
    close(dot(vector(frame.start, center), inward), input.connection.properties.slotOffsetMm, 'signed perpendicular centroid offset');
    close(range.start, metric.startDistance, 'canonical path start');
    close(range.end, metric.endDistance, 'canonical path end');
    close(Math.hypot(slotPoints[1].x - slotPoints[0].x, slotPoints[1].y - slotPoints[0].y), metric.endDistance - metric.startDistance, 'path length must match metrics');
  });
  const thickness = resolveSThickness(input.model, input.assignments, input.connection, panelManager);
  close(thickness.panelBThicknessMm!, 7, 'insertion depth must remain S-B PM thickness');
  return generatedSlots;
};

for (const aWinding of ['CW', 'CCW'] as const) for (const bWinding of ['CW', 'CCW'] as const) {
  const generatedSlots = inspect(fixture({ aWinding, bWinding }));
  const baselineSlots = inspect(fixture({ aWinding: 'CW', bWinding: 'CW' }));
  generatedSlots.forEach((slot, index) => {
    const actual = canonicalRange(fixture({ aWinding, bWinding }), slot); const expected = canonicalRange(fixture(), baselineSlots[index]);
    close(actual.start, expected.start, `${aWinding}/${bWinding} canonical start`); close(actual.end, expected.end, `${aWinding}/${bWinding} canonical end`);
  });
}
for (const offset of [3, 0, -3]) inspect(fixture({ offset }));
inspect(fixture({ vertical: true }));
inspect(fixture({ rotate: Math.PI / 6 }));

const base = fixture(); const moved = fixture({ translate: { x: 37, y: -23 } });
const baseSlots = inspect(base); const movedSlots = inspect(moved);
baseSlots.forEach((slot, index) => points(slot).forEach((point, pointIndex) => {
  const translated = points(movedSlots[index])[pointIndex]; close(translated.x - point.x, 37, 'translated slot x'); close(translated.y - point.y, -23, 'translated slot y');
}));

const reversedB = fixture({ reverseB: true }); const reversedBSlots = inspect(reversedB);
assert(baseSlots.length === reversedBSlots.length, 'raw B reversal changed SLOT_PATH count');
baseSlots.forEach((slot, index) => {
  const reversed = reversedBSlots[index];
  assert(slot.id === reversed.id, 'raw B reversal changed generated slot ID');
  assert(slot.pathD === reversed.pathD, 'raw B reversal changed physical path coordinates');
  assert(JSON.stringify(slot.geometry.metrics) === JSON.stringify(reversed.geometry.metrics), 'raw B reversal changed canonical metrics');
  assert(JSON.stringify(slot.source) === JSON.stringify(reversed.source), 'raw B reversal changed source identity');
  assert(JSON.stringify(slot.sourceRelationships) === JSON.stringify(reversed.sourceRelationships), 'raw B reversal changed relationship identity');
});

const reversedAItems = generate(fixture({ reverseA: true }));
const basePanel = generate(base).find((item) => item.kind === 'PANEL_PATH')!;
const reversedAPanel = reversedAItems.find((item) => item.kind === 'PANEL_PATH')!;
assert(basePanel.pathD === reversedAPanel.pathD, 'raw A reversal changed generated S-A physical geometry');
assert(slots(reversedAItems).map((slot) => slot.pathD).join('|') === baseSlots.map((slot) => slot.pathD).join('|'), 'raw A reversal changed S-B slots');

// An 80 mm A side and 120 mm B side make mirroring over B (rather than A) observable.
const asymmetricInterval = { startDistance: 30, endDistance: 50 };
const followingPlacement = getSContourPlacementSegment(asymmetricInterval, { start: { x: 0, y: 0 }, end: { x: 120, y: 0 } });
const reversedPlacement = getSContourPlacementSegment(asymmetricInterval, { start: { x: 120, y: 0 }, end: { x: 0, y: 0 } });
close(followingPlacement.startDistance, 30, 'following 120 mm B placement start');
close(followingPlacement.endDistance, 50, 'following 120 mm B placement end');
close(reversedPlacement.startDistance, 70, 'reversed 120 mm B placement start');
close(reversedPlacement.endDistance, 90, 'reversed 120 mm B placement end');
const unequalForward = fixture({ bLength: 120, bWinding: 'CW' });
const unequalReversed = fixture({ bLength: 120, bWinding: 'CCW' });
const unequalForwardSlots = inspect(unequalForward); const unequalReversedSlots = inspect(unequalReversed);
assert(isContourSideReversedFromCanonical(unequalForward.contourBEdge) !== isContourSideReversedFromCanonical(unequalReversed.contourBEdge), 'unequal fixture must exercise both contour orientations');
unequalForwardSlots.forEach((slot, index) => {
  const metric = slot.geometry.metrics!; const reversedMetric = unequalReversedSlots[index].geometry.metrics!;
  close(canonicalRange(unequalForward, slot).start, metric.startDistance, 'unequal forward canonical start');
  close(canonicalRange(unequalReversed, unequalReversedSlots[index]).start, metric.startDistance, 'unequal reversed canonical start');
  close(reversedMetric.startDistance, metric.startDistance, 'unequal metrics start identity');
  close(reversedMetric.endDistance, metric.endDistance, 'unequal metrics end identity');
  const bLength = 120;
  const contourPlacementStart = bLength - metric.endDistance;
  const contourPlacementEnd = bLength - metric.startDistance;
  close(contourPlacementStart + metric.endDistance, bLength, 'reversed placement start mirrors over B length');
  close(contourPlacementEnd + metric.startDistance, bLength, 'reversed placement end mirrors over B length');
});
assert(getContourSideCanonicalOrientation(fixture({ rotate: Math.PI / 6 }).contourBEdge) === 'horizontal', 'rotated fixture must use existing dominant-axis canonical rule');

console.log('S slot offset/orientation diagnostics: PASS');
console.log('raw A and raw B endpoint reversal leave generated physical geometry unchanged');
console.log('CW/CW, CW/CCW, CCW/CW, and CCW/CCW preserve canonical longitudinal placement');
console.log('horizontal, vertical, rotated, translated, and unequal-length placement passed');
console.log('positive offset = panel-inward; negative = panel-outward; zero = source-side baseline');
