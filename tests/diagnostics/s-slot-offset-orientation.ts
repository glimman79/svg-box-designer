import { buildGeneratedSGeometryItems, resolveSThickness } from '../../src/app/sGeometry';
import type { SlotConnectionDefinition } from '../../src/app/connectionTypes';
import type { GeneratedGeometryItem } from '../../src/app/generatedGeometryTypes';
import type { EdgeAssignmentRecord, Point, SvgDocumentModel, SvgEdge, SvgPanel } from '../../src/svgUtils';

const EPSILON = 1e-8;
const assert: (condition: unknown, message: string) => asserts condition = (condition, message) => {
  if (!condition) throw new Error(message);
};
const close = (actual: number, expected: number, message: string) => assert(Math.abs(actual - expected) < EPSILON, `${message}: expected ${expected}, got ${actual}`);
const vector = (from: Point, to: Point) => ({ x: to.x - from.x, y: to.y - from.y });
const dot = (a: Point, b: Point) => a.x * b.x + a.y * b.y;
const unit = (value: Point) => { const length = Math.hypot(value.x, value.y); return { x: value.x / length, y: value.y / length }; };
const add = (point: Point, delta: Point) => ({ x: point.x + delta.x, y: point.y + delta.y });
const rotate = (point: Point, angle: number) => ({ x: point.x * Math.cos(angle) - point.y * Math.sin(angle), y: point.x * Math.sin(angle) + point.y * Math.cos(angle) });
const signedArea = (contour: Point[]) => contour.reduce((area, point, index) => { const next = contour[(index + 1) % contour.length]; return area + point.x * next.y - next.x * point.y; }, 0) / 2;

type FixtureOptions = { winding?: 'CW' | 'CCW'; offset?: number; translate?: Point; rotate?: number; reverseB?: boolean; reverseA?: boolean; vertical?: boolean };
type Fixture = { model: SvgDocumentModel; assignments: EdgeAssignmentRecord; connection: SlotConnectionDefinition; aPanel: SvgPanel; bPanel: SvgPanel; aEdge: SvgEdge; bEdge: SvgEdge; contourBEdge: SvgEdge };

const fixture = ({ winding = 'CW', offset = 3, translate = { x: 0, y: 0 }, rotate: angle = 0, reverseB = false, reverseA = false, vertical = false }: FixtureOptions = {}): Fixture => {
  const transform = (point: Point) => add(rotate(vertical ? { x: -point.y, y: point.x } : point, angle), translate);
  const makePanel = (id: string, rawContour: Point[]) => {
    const clockwise = rawContour.map(transform);
    const contour = winding === 'CW' ? clockwise : [clockwise[0], ...clockwise.slice(1).reverse()];
    const edgeIds = contour.map((_, index) => `${id}-edge-${index}`);
    const edges = contour.map((start, index): SvgEdge => ({ id: edgeIds[index], source: id, start, end: contour[(index + 1) % contour.length] }));
    const xs = contour.map((point) => point.x); const ys = contour.map((point) => point.y);
    const panel: SvgPanel = { id, contour, outerContour: contour, innerContours: [], edgeIds, outerEdgeIds: edgeIds, innerEdgeIds: [], bounds: { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) } };
    return { panel, edges };
  };
  const a = makePanel('a', [{ x: 0, y: 0 }, { x: 80, y: 0 }, { x: 80, y: 45 }, { x: 0, y: 45 }]);
  const b = makePanel('b', [{ x: 130, y: 0 }, { x: 250, y: 0 }, { x: 250, y: 60 }, { x: 130, y: 60 }]);
  // Translation/rotation make coordinate predicates awkward, so choose the side whose midpoint is nearest transformed (width/2, 0).
  const nearest = (edges: SvgEdge[], target: Point) => edges.reduce((best, edge) => {
    const midpoint = { x: (edge.start.x + edge.end.x) / 2, y: (edge.start.y + edge.end.y) / 2 };
    const distance = Math.hypot(midpoint.x - target.x, midpoint.y - target.y);
    return distance < best.distance ? { edge, distance } : best;
  }, { edge: edges[0], distance: Number.POSITIVE_INFINITY }).edge;
  const contourAEdge = nearest(a.edges, transform({ x: 40, y: 0 }));
  const contourBEdge = nearest(b.edges, transform({ x: 190, y: 0 }));
  const aEdge = reverseA ? { ...contourAEdge, start: contourAEdge.end, end: contourAEdge.start } : contourAEdge;
  const bEdge = reverseB ? { ...contourBEdge, start: contourBEdge.end, end: contourBEdge.start } : contourBEdge;
  const edges = [...a.edges.map((edge) => edge.id === aEdge.id ? aEdge : edge), ...b.edges.map((edge) => edge.id === bEdge.id ? bEdge : edge)];
  const model: SvgDocumentModel = { content: '', innerMarkup: '', rootAttributes: { width: null, height: null, viewBox: null }, viewBox: '0 0 400 200', width: 400, height: 200, panels: [a.panel, b.panel], edges };
  const assignments: EdgeAssignmentRecord = { [aEdge.id]: { slotAssignments: [{ connectionId: 'S1', slotRole: 'A' }] }, [bEdge.id]: { slotAssignments: [{ connectionId: 'S1', slotRole: 'B' }] } };
  const connection: SlotConnectionDefinition = { id: 'S1', prefix: 'S', properties: { slotOffsetMm: offset, slotLengthMm: 20, isSlotLengthManual: true, kerfMm: 0.15 } };
  return { model, assignments, connection, aPanel: a.panel, bPanel: b.panel, aEdge, bEdge, contourBEdge };
};

const generate = (input: Fixture) => buildGeneratedSGeometryItems(input.model, input.assignments, { S1: input.connection }, { defaultThicknessMm: 99, panels: { a: { panelId: 'a', thicknessMm: 4 }, b: { panelId: 'b', thicknessMm: 7 } } });
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
const inspect = (input: Fixture) => {
  const generated = generate(input); const generatedSlots = slots(generated);
  assert(generatedSlots.length > 0, 'fixture did not generate slots');
  const rawUnit = unit(vector(input.bEdge.start, input.bEdge.end));
  const inward = inwardNormal(input);
  generatedSlots.forEach((slot) => {
    const metric = slot.geometry.metrics!; const slotPoints = points(slot); const center = centroid(slot);
    close(metric.widthMm, 4, 'slot metric width must use S-A PM thickness');
    close(Math.abs(dot(vector(slotPoints[0], slotPoints[3]), inward)), 4, 'physical slot width must be perpendicular to B edge');
    close(dot(vector(input.bEdge.start, center), inward), input.connection.properties.slotOffsetMm, 'signed perpendicular centroid offset');
    close(dot(vector(input.bEdge.start, center), rawUnit), (metric.startDistance + metric.endDistance) / 2, 'centroid longitudinal position');
    close(dot(vector(input.bEdge.start, slotPoints[0]), rawUnit), metric.startDistance, 'path start longitudinal position');
    close(dot(vector(input.bEdge.start, slotPoints[1]), rawUnit), metric.endDistance, 'path end longitudinal position');
    close(Math.hypot(slotPoints[1].x - slotPoints[0].x, slotPoints[1].y - slotPoints[0].y), metric.endDistance - metric.startDistance, 'path length must match metrics');
  });
  const thickness = resolveSThickness(input.model, input.assignments, input.connection, { defaultThicknessMm: 99, panels: { a: { panelId: 'a', thicknessMm: 4 }, b: { panelId: 'b', thicknessMm: 7 } } });
  close(thickness.panelBThicknessMm!, 7, 'insertion depth must remain S-B PM thickness');
  return generatedSlots;
};

for (const winding of ['CW', 'CCW'] as const) {
  for (const offset of [3, 0, -3]) inspect(fixture({ winding, offset }));
}
inspect(fixture({ vertical: true }));
inspect(fixture({ rotate: Math.PI / 6 }));

const base = fixture(); const moved = fixture({ translate: { x: 37, y: -23 } });
const baseSlots = inspect(base); const movedSlots = inspect(moved);
baseSlots.forEach((slot, index) => points(slot).forEach((point, pointIndex) => {
  const translated = points(movedSlots[index])[pointIndex]; close(translated.x - point.x, 37, 'translated slot x'); close(translated.y - point.y, -23, 'translated slot y');
}));

const forward = fixture(); const reversedB = fixture({ reverseB: true });
const forwardSlots = inspect(forward); const reversedBSlots = inspect(reversedB);
assert(forwardSlots.length === reversedBSlots.length, 'raw B reversal changed SLOT_PATH count');
forwardSlots.forEach((slot, index) => {
  const reversed = reversedBSlots[index];
  close(slot.geometry.metrics!.widthMm, reversed.geometry.metrics!.widthMm, 'raw B reversal changed width');
  close(slot.geometry.metrics!.startDistance, reversed.geometry.metrics!.startDistance, 'raw B reversal changed startDistance metric');
  close(slot.geometry.metrics!.endDistance, reversed.geometry.metrics!.endDistance, 'raw B reversal changed endDistance metric');
  close(dot(vector(reversedB.bEdge.start, centroid(reversed)), inwardNormal(reversedB)), 3, 'raw B reversal changed inward offset sign');
  const sum = add(centroid(slot), centroid(reversed));
  const endpointSum = add(forward.bEdge.start, forward.bEdge.end);
  close(sum.x, endpointSum.x + inwardNormal(forward).x * 6, 'raw B reversal did not mirror centroid in x');
  close(sum.y, endpointSum.y + inwardNormal(forward).y * 6, 'raw B reversal did not mirror centroid in y');
  assert(slot.pathD !== reversed.pathD, 'raw B reversal unexpectedly preserved path coordinates');
});

const reversedAItems = generate(fixture({ reverseA: true }));
const basePanel = generate(fixture()).find((item) => item.kind === 'PANEL_PATH')!;
const reversedAPanel = reversedAItems.find((item) => item.kind === 'PANEL_PATH')!;
assert(basePanel.pathD === reversedAPanel.pathD, 'raw A reversal changed generated S-A physical geometry');
assert(slots(reversedAItems).map((slot) => slot.pathD).join('|') === forwardSlots.map((slot) => slot.pathD).join('|'), 'raw A reversal changed S-B slots');

console.log('S slot offset/orientation diagnostics: PASS');
console.log('positive offset = panel-inward; negative = panel-outward; zero = source-edge baseline');
console.log('raw B reversal preserves offset sign but mirrors longitudinal placement from the opposite endpoint');
console.log('raw A reversal leaves generated physical geometry unchanged');
