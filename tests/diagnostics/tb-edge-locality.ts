import { buildGeneratedTBGeometryItems } from '../../src/app/eGeometry';
import { getContourSignedArea } from '../../src/app/sharedGeometry';
import type { EdgeRole, Point, SvgDocumentModel, SvgPanel } from '../../src/svgUtils';

const epsilon = 1e-7;
const close = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y) < epsilon;
const assert = (condition: unknown, message: string) => { if (!condition) throw new Error(message); };
const point = (value: Point) => `(${value.x},${value.y})`;

const rectangle = (winding: 'CCW' | 'CW', reversedSourceSide = -1) => {
  const ccw = [{ x: 120, y: 0 }, { x: 210, y: 0 }, { x: 210, y: 40 }, { x: 120, y: 40 }];
  const contour = winding === 'CCW' ? ccw : [ccw[0], ccw[3], ccw[2], ccw[1]];
  const edgeIds = contour.map((_, index) => `edge-${index}`);
  const edges = contour.map((start, index) => {
    const end = contour[(index + 1) % contour.length];
    return { id: edgeIds[index], source: 'panel', start: index === reversedSourceSide ? end : start, end: index === reversedSourceSide ? start : end };
  });
  const panel: SvgPanel = { id: 'panel', contour, outerContour: contour, innerContours: [], edgeIds, outerEdgeIds: edgeIds, innerEdgeIds: [], bounds: { minX: 120, minY: 0, maxX: 210, maxY: 40 } };
  return { panel, edges };
};

const run = (name: string, roles: Partial<Record<number, EdgeRole>>, depth = 5, winding: 'CCW' | 'CW' = 'CCW', reversedSourceSide = -1) => {
  const { panel, edges } = rectangle(winding, reversedSourceSide);
  const assignments: any = {}; const connections: any = {};
  Object.entries(roles).forEach(([rawSide, role]) => {
    const side = Number(rawSide); const id = `TB-${side}`;
    assignments[panel.edgeIds[side]] = { edgeAssignment: { connectionId: id, edgeRole: role } };
    connections[id] = { id, prefix: 'W', properties: { materialThicknessMm: depth, fingerWidthMm: 30, isFingerWidthManual: true } };
  });
  const model: SvgDocumentModel = { content: '', innerMarkup: '', rootAttributes: { width: null, height: null, viewBox: null }, viewBox: '0 0 240 80', width: 240, height: 80, panels: [panel], edges };
  const items = buildGeneratedTBGeometryItems(model, assignments, connections, { defaultThicknessMm: depth, panels: { panel: { panelId: 'panel', thicknessMm: depth } } });
  assert(items.length === 1, `${name}: generator produced no panel`);
  const item = items[0]; const path = item.geometry.type === 'path' ? item.geometry.pathD : '';
  const values = [...path.matchAll(/[ML]\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)/g)];
  const contour = values.map((match) => ({ x: Number(match[1]), y: Number(match[2]) }));
  assert(path.endsWith('Z'), `${name}: contour is not closed`);
  assert(contour.length >= 3 && Math.abs(getContourSignedArea(contour)) > epsilon, `${name}: invalid area`);
  assert(contour.every(({ x, y }) => Number.isFinite(x) && Number.isFinite(y)), `${name}: non-finite coordinate`);
  contour.forEach((value, index) => assert(!close(value, contour[(index + 1) % contour.length]), `${name}: zero-length physical side`));

  for (const profile of item.generatedProfiles ?? []) {
    const side = panel.edgeIds.indexOf(profile.sourceEdgeId); const previous = (side + 3) % 4; const next = (side + 1) % 4;
    const previousOperated = roles[previous] !== undefined; const nextOperated = roles[next] !== undefined;
    const sourceStart = panel.contour[side]; const sourceEnd = panel.contour[next];
    if (!previousOperated) assert(close(profile.attachmentStart, sourceStart), `${name}: isolated start slid to ${point(profile.attachmentStart)}`);
    if (!nextOperated) assert(close(profile.attachmentEnd, sourceEnd), `${name}: isolated end slid to ${point(profile.attachmentEnd)}`);
    const neighborSupports = [!previousOperated ? previous : -1, !nextOperated ? next : -1].filter((index) => index >= 0).map((index) => ({ start: panel.contour[index], end: panel.contour[(index + 1) % 4] }));
    const onSupport = (start: Point, end: Point, support: { start: Point; end: Point }) => {
      const dx = support.end.x - support.start.x; const dy = support.end.y - support.start.y;
      const cross = (p: Point) => Math.abs((p.x - support.start.x) * dy - (p.y - support.start.y) * dx) < epsilon;
      return !close(start, end) && cross(start) && cross(end);
    };
    const offending = profile.geometryProjections.filter((projection) => neighborSupports.some((support) => onSupport(projection.start, projection.end, support)));
    if (offending.length) console.log(name, path, offending.map(({ start, end }) => `${point(start)}>${point(end)}`));
    assert(offending.length === 0, `${name}: ${offending.length} generated segments lie on unoperated neighboring supports`);
    console.log(`${name} edge=${side} source=${point(sourceStart)}..${point(sourceEnd)} attachment=${point(profile.attachmentStart)}..${point(profile.attachmentEnd)} adjacent-operated=${previousOperated ? 'YES' : 'NO'}/${nextOperated ? 'YES' : 'NO'} terminal-segments=${profile.geometryProjections.filter((projection) => close(projection.start, sourceStart) || close(projection.end, sourceEnd)).length} neighbor-support-segments=${offending.length} PASS`);
  }
  return { item, panel };
};

const canonicalA = run('isolated-A-control', { 0: 'A' });
const canonicalB = run('isolated-B-depth-5', { 0: 'B' });
assert(canonicalB.item.geometry.type === 'path' && canonicalB.item.geometry.pathD === 'M 120 0 L 150 0 L 150 5 L 180 5 L 180 0 L 210 0 L 210 40 L 120 40 Z', `canonical B path mismatch: ${canonicalB.item.geometry.type === 'path' ? canonicalB.item.geometry.pathD : ''}`);
assert(canonicalA.item.geometry.type === 'path' && canonicalA.item.geometry.pathD.length > 0, 'isolated A changed to empty geometry');
run('isolated-B-depth-3', { 0: 'B' }, 3);
for (const winding of ['CCW', 'CW'] as const) for (let side = 0; side < 4; side += 1) {
  run(`isolated-B-${winding}-side-${side}`, { [side]: 'B' }, 5, winding);
  run(`isolated-B-reversed-source-${winding}-side-${side}`, { [side]: 'B' }, 5, winding, side);
}
run('two-non-adjacent-B', { 0: 'B', 2: 'B' });
run('non-adjacent-A-B', { 0: 'A', 2: 'B' });
run('previous-neighbor-operated-only', { 0: 'A', 1: 'B' });
run('next-neighbor-operated-only', { 0: 'B', 1: 'A' });
for (const [name, first, second] of [['AA', 'A', 'A'], ['BB', 'B', 'B'], ['AB', 'A', 'B'], ['BA', 'B', 'A']] as const) run(name, { 0: first, 1: second });
run('four-operated-edges', { 0: 'A', 1: 'B', 2: 'A', 3: 'B' });
console.log('TB edge-locality: PASS');
