import { buildGeneratedTBGeometryItems } from '../../src/app/eGeometry';
import { auditGeneratedGeometryRelationships, buildGeometryRelationshipIndex } from '../../src/app/geometryRelationships';
import { pathDToClosedContour } from '../../src/app/geometryServices';
import { getContourSignedArea } from '../../src/app/sharedGeometry';
import { composeShadowPanel } from '../../src/app/shadowPanelComposer';
import { adaptTBProfilesToShadowContributions } from '../../src/app/tbShadowPanelAdapter';
import type { EdgeRole, Point, SvgDocumentModel, SvgPanel } from '../../src/svgUtils';

const epsilon = 1e-7;
const assert: (condition: unknown, message: string) => asserts condition = (condition, message) => {
  if (!condition) throw new Error(message);
};
const close = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y) < epsilon;
const normalized = (points: ReadonlyArray<Point>) => points.map(({ x, y }) => ({ x: +x.toFixed(9), y: +y.toFixed(9) }));

const rectangle = (id: string, winding: 'CCW' | 'CW') => {
  const ccw = [{ x: 120, y: 0 }, { x: 210, y: 0 }, { x: 210, y: 40 }, { x: 120, y: 40 }];
  const contour = winding === 'CCW' ? ccw : [ccw[0], ccw[3], ccw[2], ccw[1]];
  const edgeIds = contour.map((_, index) => `${id}-edge-${index}`);
  const edges = contour.map((start, index) => ({ id: edgeIds[index], source: id, start, end: contour[(index + 1) % 4] }));
  const panel: SvgPanel = { id, contour, outerContour: contour, edgeIds, outerEdgeIds: edgeIds, innerContours: [], innerEdgeIds: [], bounds: { minX: 120, minY: 0, maxX: 210, maxY: 40 } };
  return { panel, edges };
};

const run = (name: string, roles: Partial<Record<number, EdgeRole>>, depth: number, winding: 'CCW' | 'CW', fingerWidth?: number) => {
  const { panel, edges } = rectangle(name, winding);
  const matePanels: SvgPanel[] = []; const mateEdges: SvgDocumentModel['edges'] = [];
  const assignments: any = {}; const connections: any = {};
  Object.entries(roles).forEach(([rawSide, role]) => {
    const side = Number(rawSide); const connectionId = `TB-${name}-connection-${side}`;
    const mate = rectangle(`${name}-tb-mate-${side}`, winding);
    const translatedContour = mate.panel.contour.map(({ x, y }) => ({ x: x + 300 + side * 120, y }));
    mate.panel.contour = translatedContour; mate.panel.outerContour = translatedContour;
    mate.edges.forEach((edge, index) => { edge.start = translatedContour[index]; edge.end = translatedContour[(index + 1) % 4]; });
    matePanels.push(mate.panel); mateEdges.push(...mate.edges);
    assignments[panel.edgeIds[side]] = { edgeAssignment: { connectionId, edgeRole: role } };
    assignments[mate.panel.edgeIds[side]] = { edgeAssignment: { connectionId, edgeRole: role === 'A' ? 'B' : 'A' } };
    connections[connectionId] = { id: connectionId, prefix: 'TB', properties: { materialThicknessMm: depth,
      fingerWidthMm: fingerWidth ?? 30, isFingerWidthManual: fingerWidth !== undefined } };
  });
  const model: SvgDocumentModel = { content: '', innerMarkup: '', rootAttributes: { width: null, height: null, viewBox: null },
    viewBox: '0 0 1000 80', width: 1000, height: 80, panels: [panel, ...matePanels], edges: [...edges, ...mateEdges] };
  const items = buildGeneratedTBGeometryItems(model, assignments, connections,
    { defaultThicknessMm: depth, panels: Object.fromEntries([panel, ...matePanels].map(({ id }) => [id, { panelId: id, thicknessMm: depth }])) });
  const frozen = JSON.stringify(items); const item = items.find(({ source }) => source.panelIds.includes(panel.id));
  assert(item, `${name}: production fixture failed`);
  assert(item.kind === 'PANEL_PATH' && item.geometry.type === 'path', `${name}: no production panel path`);
  const production = pathDToClosedContour(item.geometry.pathD);
  assert(production, `${name}: production contour did not parse`);
  const profiles = item.generatedProfiles ?? [];
  const contributions = adaptTBProfilesToShadowContributions(profiles);
  const index = auditGeneratedGeometryRelationships(items);
  const candidate = composeShadowPanel(panel, index, [...contributions].reverse());
  assert(!candidate.diagnostics.length, `${name}: ${candidate.diagnostics.map(({ message }) => message).join('; ')}`);
  assert(candidate.points.length === production.length, `${name}: segment count differs (${candidate.points.length}/${production.length}) ${JSON.stringify(candidate.segments)} / ${JSON.stringify(production)}`);
  assert(candidate.points.every((point, index) => close(point, production[index])), `${name}: ordered coordinates differ`);
  assert(Math.abs(getContourSignedArea([...candidate.points]) - getContourSignedArea([...production])) < epsilon, `${name}: signed area differs`);
  assert(Math.sign(getContourSignedArea([...candidate.points])) === Math.sign(getContourSignedArea([...production])), `${name}: winding differs`);
  assert(candidate.segments.every(({ start, end }) => !close(start, end)), `${name}: emitted a zero-length physical segment`);
  assert(candidate.segments.every((segment, segmentIndex) => segment.segmentIndex === segmentIndex), `${name}: segment indexes are not aligned`);
  const profilesById = new Map(profiles.map((profile) => [profile.id, profile]));
  candidate.segments.filter(({ relationshipOrigin }) => relationshipOrigin === 'replaces').forEach((segment) => {
    const profile = segment.profileId && profilesById.get(segment.profileId);
    assert(profile && segment.sourceEdgeId === profile.sourceEdgeId, `${name}: source/profile provenance differs`);
    assert(segment.operationId === profile.operationId, `${name}: logical operation provenance differs`);
    if (profiles.length > 1) assert(segment.operationId !== item.operationId, `${name}: aggregate operation leaked into edge provenance`);
    const element = profile.orderedElements.find(({ id }) => id === segment.elementId);
    assert(element && element.geometryProjectionId === segment.projectionId, `${name}: element/projection provenance differs`);
    assert((element.tapId ?? null) === segment.tapId && (element.segmentTapRole ?? null) === segment.tapRole, `${name}: tap provenance differs`);
  });
  const reversedIndex = buildGeometryRelationshipIndex([...index.relationships].reverse());
  const again = composeShadowPanel(panel, reversedIndex, contributions);
  assert(JSON.stringify({ ...candidate, points: normalized(candidate.points) }) === JSON.stringify({ ...again, points: normalized(again.points) }), `${name}: input order changed output`);
  assert(JSON.stringify(items) === frozen, `${name}: shadow adapter/composer mutated production output`);
};

for (const winding of ['CCW', 'CW'] as const) for (const depth of [2.4, 3.25, 5.5]) {
  for (let side = 0; side < 4; side += 1) {
    run(`isolated-A-${winding}-${depth}-${side}`, { [side]: 'A' }, depth, winding);
    run(`isolated-B-${winding}-${depth}-${side}`, { [side]: 'B' }, depth, winding);
  }
  for (let current = 0; current < 4; current += 1) {
    const previous = (current + 3) % 4;
    for (const [first, second] of [['A', 'A'], ['A', 'B'], ['B', 'A'], ['B', 'B']] as const) {
      run(`${first}${second}-${winding}-${depth}-${previous}-${current}`, { [previous]: first, [current]: second }, depth, winding);
    }
  }
}
run('non-adjacent', { 0: 'A', 2: 'B' }, 3.25, 'CCW');
run('three-edges', { 0: 'A', 1: 'B', 3: 'A' }, 3.25, 'CW');
run('four-edges', { 0: 'A', 1: 'B', 2: 'A', 3: 'B' }, 3.25, 'CCW');
run('custom-width', { 0: 'B', 1: 'B', 2: 'A', 3: 'B' }, 3.25, 'CW', 10);
console.log('Shadow panel composer TB adapter: PASS');
