import { applySharedFingerWidthUpdates, shouldShowFingerJointTabControl } from '../../src/app/tabSizeControl';
import { buildGeneratedTBGeometryItems } from '../../src/app/tbGeometry';
import { buildGeneratedWGeometryItems } from '../../src/app/wallGeometry';
import { getSharedTBEdgeProperties } from '../../src/app/tbWorkflow';
import { startWallGroupWorkflow } from '../../src/app/wallWorkflow';
import type { ConnectionMap } from '../../src/app/connectionTypes';
import type { EdgeAssignmentRecord, SvgDocumentModel } from '../../src/svgUtils';

const assert: (value: unknown, message: string) => asserts value = (value, message) => {
  if (!value) throw new Error(message);
};
const connection = (id: string, prefix: 'TB' | 'W', width: number) => ({
  id, prefix, properties: { fingerWidthMm: width, isFingerWidthManual: true },
});

for (const tool of ['TB', 'W'] as const) {
  assert(shouldShowFingerJointTabControl(tool, tool), `${tool} must show Tab control`);
}
for (const tool of ['select', 'S', 'C', 'P', 'manufacturing'] as const) {
  assert(!shouldShowFingerJointTabControl(tool, null), `${tool} must preserve hidden Tab control behavior`);
}

const panel = (id: string, x: number) => ({
  id, edgeIds: [`${id}-top`, `${id}-right`, `${id}-bottom`, `${id}-left`], outerEdgeIds: [`${id}-top`, `${id}-right`, `${id}-bottom`, `${id}-left`], innerEdgeIds: [],
  contour: [{ x, y: 0 }, { x: x + 60, y: 0 }, { x: x + 60, y: 40 }, { x, y: 40 }],
  outerContour: [{ x, y: 0 }, { x: x + 60, y: 0 }, { x: x + 60, y: 40 }, { x, y: 40 }], innerContours: [],
  bounds: { minX: x, minY: 0, maxX: x + 60, maxY: 40 },
});
const a = panel('a', 0);
const b = panel('b', 80);
const edges = [a, b].flatMap((item) => item.contour.map((start, index) => ({
  id: item.edgeIds[index], source: item.id, start, end: item.contour[(index + 1) % item.contour.length],
})));
const model = { content: '', innerMarkup: '', rootAttributes: { width: null, height: null, viewBox: null }, viewBox: '0 0 160 40', width: 160, height: 40, panels: [a, b], edges } as unknown as SvgDocumentModel;
const pm = { panels: { a: { panelId: 'a', thicknessMm: 3 }, b: { panelId: 'b', thicknessMm: 3 } } } as any;

for (const width of [9, 12]) {
  const tbAssignments = { 'a-top': { edgeAssignment: { connectionId: 'TB1', edgeRole: 'A' } }, 'b-top': { edgeAssignment: { connectionId: 'TB1', edgeRole: 'B' } } } as EdgeAssignmentRecord;
  const wAssignments = { 'a-top': { edgeAssignment: { connectionId: 'W1', edgeRole: 'A' } }, 'b-top': { edgeAssignment: { connectionId: 'W1', edgeRole: 'B' } } } as EdgeAssignmentRecord;
  const tbConnections = { TB1: connection('TB1', 'TB', width) } as ConnectionMap;
  const wConnections = { W1: connection('W1', 'W', width) } as ConnectionMap;
  const tb = buildGeneratedTBGeometryItems(model, tbAssignments, tbConnections, pm);
  const wall = buildGeneratedWGeometryItems(model, wAssignments, wConnections, pm);
  assert(tb.length === wall.length && tb.length > 0, `${width}: TB/W must generate equivalent item counts`);
  assert(tb.map((item) => item.pathD).join('|') === wall.map((item) => item.pathD).join('|'), `${width}: TB/W must use identical finger width geometry`);

  const nextWall = startWallGroupWorkflow(tbConnections).connections.W1;
  assert(nextWall?.prefix === 'W' && nextWall.properties.fingerWidthMm === width, `${width}: new W must inherit shared TB value`);
  assert(getSharedTBEdgeProperties(wConnections, { fingerWidthMm: 99, isFingerWidthManual: false }).fingerWidthMm === width, `${width}: new TB must inherit shared W value`);

  const edited = applySharedFingerWidthUpdates({ ...tbConnections, ...wConnections }, { fingerWidthMm: width });
  assert(edited.TB1.prefix === 'TB' && edited.TB1.properties.fingerWidthMm === width, `${width}: edit must update TB source`);
  assert(edited.W1.prefix === 'W' && edited.W1.properties.fingerWidthMm === width, `${width}: edit under W must update Wall source`);
  assert(edited.TB1.properties.isFingerWidthManual && edited.W1.properties.isFingerWidthManual, `${width}: shared validation/update path must mark manual`);
}

console.log('PASS TB/W Tab control visibility and shared 9/12 mm finger-width generation');
