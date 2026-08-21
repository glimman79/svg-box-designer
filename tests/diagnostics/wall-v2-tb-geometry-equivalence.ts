import { buildGeneratedTBGeometryItems } from '../../src/app/tbGeometry';
import { buildGeneratedWGeometryItems } from '../../src/app/wallGeometry';
import type { ConnectionMap } from '../../src/app/connectionTypes';
import type { EdgeAssignmentRecord, Point, SvgDocumentModel, SvgPanel } from '../../src/svgUtils';

const assert = (value: unknown, message: string) => { if (!value) throw new Error(message); };
const transform = (point: Point, angle: number, dx: number, dy: number): Point => ({
  x: point.x * Math.cos(angle) - point.y * Math.sin(angle) + dx,
  y: point.x * Math.sin(angle) + point.y * Math.cos(angle) + dy,
});
const panel = (id: string, x: number, angle = 0, dx = 0, dy = 0, ccw = false) => {
  let contour = [{ x, y: 0 }, { x: x + 80, y: 0 }, { x: x + 80, y: 40 }, { x, y: 40 }].map((p) => transform(p, angle, dx, dy));
  if (ccw) contour = [contour[0], ...contour.slice(1).reverse()];
  const edgeIds = contour.map((_, i) => `${id}-edge-${i}`);
  const edges = contour.map((start, i) => ({ id: edgeIds[i], source: id, start, end: contour[(i + 1) % contour.length] }));
  const xs = contour.map((p) => p.x); const ys = contour.map((p) => p.y);
  const value: SvgPanel = { id, contour, outerContour: contour, innerContours: [], edgeIds, outerEdgeIds: edgeIds,
    innerEdgeIds: [], bounds: { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) } };
  return { panel: value, edges };
};

type Case = { name: string; sides: number[]; roles?: Array<'A' | 'B'>; angle?: number; dx?: number; dy?: number; ccw?: boolean; manual?: boolean; thickness?: [number, number] };
const cases: Case[] = [
  { name: 'isolated A/B and corners', sides: [0] }, { name: 'adjacent A/B', sides: [0, 1], roles: ['A', 'B'] },
  { name: 'adjacent B/A', sides: [0, 1], roles: ['B', 'A'] }, { name: 'same-role A/A', sides: [0, 1], roles: ['A', 'A'] },
  { name: 'same-role B/B corner terminals', sides: [0, 1], roles: ['B', 'B'] }, { name: 'three edges', sides: [0, 1, 2] },
  { name: 'all four edges', sides: [0, 1, 2, 3] }, { name: 'CCW contour', sides: [0, 3], ccw: true },
  { name: '90 degree rotation', sides: [0, 1], angle: Math.PI / 2 }, { name: '27 degree rotation', sides: [0, 1], angle: 27 * Math.PI / 180 },
  { name: 'translation', sides: [0, 1], dx: 41, dy: -17 }, { name: 'unequal thickness automatic width', sides: [0], thickness: [3, 7] },
  { name: 'manual width', sides: [0], manual: true },
];
const canonical = (items: unknown) => JSON.stringify(items).replaceAll('W', 'TB').replaceAll('w', 'tb');
for (const fixture of cases) {
  const a = panel('panel-a', 0, fixture.angle, fixture.dx, fixture.dy, fixture.ccw);
  const b = panel('panel-b', 120, fixture.angle, fixture.dx, fixture.dy, fixture.ccw);
  const model: SvgDocumentModel = { content: '', innerMarkup: '', rootAttributes: { width: null, height: null, viewBox: null },
    viewBox: '0 0 300 200', width: 300, height: 200, panels: [a.panel, b.panel], edges: [...a.edges, ...b.edges] };
  const tb: ConnectionMap = {}; const wall: ConnectionMap = {}; const tbAssignments: EdgeAssignmentRecord = {}; const wAssignments: EdgeAssignmentRecord = {};
  fixture.sides.forEach((side, i) => {
    const roleA = fixture.roles?.[i] ?? 'A'; const roleB = roleA === 'A' ? 'B' : 'A'; const suffix = i + 1;
    tb[`TB${suffix}`] = { id: `TB${suffix}`, prefix: 'TB', properties: { fingerWidthMm: 11, isFingerWidthManual: !!fixture.manual } };
    wall[`W${suffix}`] = { id: `W${suffix}`, prefix: 'W', properties: { fingerWidthMm: 11, isFingerWidthManual: !!fixture.manual } };
    tbAssignments[a.panel.edgeIds[side]] = { edgeAssignment: { connectionId: `TB${suffix}`, edgeRole: roleA } };
    tbAssignments[b.panel.edgeIds[side]] = { edgeAssignment: { connectionId: `TB${suffix}`, edgeRole: roleB } };
    wAssignments[a.panel.edgeIds[side]] = { edgeAssignment: { connectionId: `W${suffix}`, edgeRole: roleA } };
    wAssignments[b.panel.edgeIds[side]] = { edgeAssignment: { connectionId: `W${suffix}`, edgeRole: roleB } };
  });
  const thickness = fixture.thickness ?? [3, 5];
  const pm = { panels: { 'panel-a': { panelId: 'panel-a', thicknessMm: thickness[0] }, 'panel-b': { panelId: 'panel-b', thicknessMm: thickness[1] } } };
  const tbItems = buildGeneratedTBGeometryItems(model, tbAssignments, tb, pm);
  const wallItems = buildGeneratedWGeometryItems(model, wAssignments, wall, pm);
  assert(tbItems.length === wallItems.length && tbItems.length === 2, `${fixture.name}: missing generated panels`);
  assert(canonical(wallItems) === canonical(tbItems), `${fixture.name}: Wall output differs from TB after identity normalization`);
  if (fixture.name.includes('B/B corner')) assert(wallItems.flatMap((x) => x.generatedTaps ?? []).some((tap) => tap.segmentRoles.includes('tap-side-start')), 'W-B corner terminal role was lost');
}
console.log(`Wall/TB exact geometry equivalence (${cases.length} fixtures): PASS`);
