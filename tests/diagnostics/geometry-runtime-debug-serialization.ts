import { deserializeGeometryRuntimeDebugState, serializeGeometryRuntimeDebugState } from '../../src/app/geometryRuntimeDebug';
import { selectGeneratedGeometryAuthority } from '../../src/app/generatedGeometryAuthority';
import { buildGeneratedWGeometryItems } from '../../src/app/wallGeometry';
import type { SvgDocumentModel, SvgPanel } from '../../src/svgUtils';

const assert: (value: unknown, message: string) => asserts value = (value, message) => { if (!value) throw new Error(message); };
const rectangle = (id: string, x: number) => {
  const contour = [{ x, y: 0 }, { x: x + 40, y: 0 }, { x: x + 40, y: 30 }, { x, y: 30 }];
  const edgeIds = contour.map((_, index) => `${id}-e${index}`);
  const panel: SvgPanel = { id, contour, outerContour: contour, innerContours: [], edgeIds, outerEdgeIds: edgeIds,
    innerEdgeIds: [], bounds: { minX: x, minY: 0, maxX: x + 40, maxY: 30 } };
  return { panel, edges: contour.map((start, index) => ({ id: edgeIds[index], source: id, start, end: contour[(index + 1) % 4] })) };
};
const rectangles = [rectangle('a', 0), rectangle('b', 60)];
const svgModel: SvgDocumentModel = { content: '<svg/>', innerMarkup: '', rootAttributes: { width: null, height: null, viewBox: null },
  viewBox: '0 0 100 30', width: 100, height: 30, panels: rectangles.map(({ panel }) => panel), edges: rectangles.flatMap(({ edges }) => edges) };
const connections: any = { W1: { id: 'W1', prefix: 'W', properties: { fingerWidthMm: 8, isFingerWidthManual: false } } };
const edgeAssignments: any = { 'a-e0': { edgeAssignment: { connectionId: 'W1', edgeRole: 'A' } },
  'b-e0': { edgeAssignment: { connectionId: 'W1', edgeRole: 'B' } } };
const panelManager = { defaultThicknessMm: 3, isApplied: true, isDirty: false,
  panels: { a: { panelId: 'a', thicknessMm: 3 }, b: { panelId: 'b', thicknessMm: 3 } } };
const state = { svgModel, connections, edgeAssignments, panelManager, marker: undefined, map: new Map([['W1', { enabled: true }]]),
  values: [null, undefined, Number.POSITIVE_INFINITY] };
const serialized = serializeGeometryRuntimeDebugState(state);
const restored = deserializeGeometryRuntimeDebugState<typeof state>(serialized);
assert(serialized === serializeGeometryRuntimeDebugState(restored), 'serialization is not deterministic after round trip');
assert(restored.marker === undefined && restored.values[0] === null && restored.values[1] === undefined, 'null/undefined were not retained');
assert(restored.map instanceof Map && restored.map.get('W1')?.enabled, 'Map identity was not restored');
const before = buildGeneratedWGeometryItems(svgModel, edgeAssignments, connections, panelManager);
const after = buildGeneratedWGeometryItems(restored.svgModel, restored.edgeAssignments, restored.connections, restored.panelManager);
assert(serializeGeometryRuntimeDebugState(before) === serializeGeometryRuntimeDebugState(after), 'round-trip generation differs');
assert(serializeGeometryRuntimeDebugState(selectGeneratedGeometryAuthority(svgModel, before, 'single-tool'))
  === serializeGeometryRuntimeDebugState(selectGeneratedGeometryAuthority(restored.svgModel, after, 'single-tool')), 'round-trip authority differs');
console.log('PASS | deterministic lossless round trip | same IDs, relationships, generated geometry, and authority');
