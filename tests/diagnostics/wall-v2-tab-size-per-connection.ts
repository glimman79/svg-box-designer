import { getFingerJointConnectionViewModel } from '../../src/app/connectionViewModel';
import type { ConnectionMap } from '../../src/app/connectionTypes';
import { applyFingerWidthUpdate } from '../../src/app/tabSizeControl';
import { buildGeneratedTBGeometryItems } from '../../src/app/tbGeometry';
import { buildGeneratedWGeometryItems } from '../../src/app/wallGeometry';
import { startWallGroupWorkflow } from '../../src/app/wallWorkflow';
import type { EdgeAssignmentRecord, SvgDocumentModel } from '../../src/svgUtils';

const assert: (value: unknown, message: string) => asserts value = (value, message) => {
  if (!value) throw new Error(message);
};
const make = (id: string, prefix: 'TB' | 'W', width: number, manual = true) => ({
  id, prefix, properties: { fingerWidthMm: width, isFingerWidthManual: manual },
});
const widths = (connections: ConnectionMap) => Object.fromEntries(Object.entries(connections).map(([id, item]) => [id, (item.properties as any).fingerWidthMm]));

let connections = {
  TB1: make('TB1', 'TB', 9), TB2: make('TB2', 'TB', 9), TB3: make('TB3', 'TB', 9),
  TB4: make('TB4', 'TB', 9, false), W1: make('W1', 'W', 9, false), W2: make('W2', 'W', 9, false),
} as ConnectionMap;
connections = applyFingerWidthUpdate(connections, 'TB4', { fingerWidthMm: 12 });
connections = applyFingerWidthUpdate(connections, 'W1', { fingerWidthMm: 7 });
connections = applyFingerWidthUpdate(connections, 'W2', { fingerWidthMm: 10 });
assert(JSON.stringify(widths(connections)) === JSON.stringify({ TB1: 9, TB2: 9, TB3: 9, TB4: 12, W1: 7, W2: 10 }), 'edits must remain per connection across finished/new TB and W groups');
assert((connections.TB4.properties as any).isFingerWidthManual && (connections.W1.properties as any).isFingerWidthManual && (connections.W2.properties as any).isFingerWidthManual, 'only edited connections become manual');

const beforeTB4Edit = connections;
connections = applyFingerWidthUpdate(connections, 'TB4', { fingerWidthMm: 14 });
assert(widths(connections).TB4 === 14 && widths(connections).W2 === 10 && widths(connections).TB1 === 9, 'selected TB edit must not mutate siblings');
const afterTB4Edit = connections;
connections = beforeTB4Edit; // existing snapshot/history undo semantics
assert(widths(connections).TB4 === 12 && widths(connections).W2 === 10, 'undo snapshot restores only edited value');
connections = afterTB4Edit; // existing snapshot/history redo semantics
assert(widths(connections).TB4 === 14 && widths(connections).W2 === 10, 'redo snapshot reapplies only edited value');
const restored = JSON.parse(JSON.stringify(connections)) as ConnectionMap;
assert(JSON.stringify(widths(restored)) === JSON.stringify(widths(connections)), 'project restore preserves distinct widths without normalization');

const panel = (id: string, x: number) => ({
  id, edgeIds: [`${id}-top`, `${id}-right`, `${id}-bottom`, `${id}-left`], outerEdgeIds: [`${id}-top`, `${id}-right`, `${id}-bottom`, `${id}-left`], innerEdgeIds: [],
  contour: [{ x, y: 0 }, { x: x + 80, y: 0 }, { x: x + 80, y: 40 }, { x, y: 40 }], outerContour: [{ x, y: 0 }, { x: x + 80, y: 0 }, { x: x + 80, y: 40 }, { x, y: 40 }], innerContours: [], bounds: { minX: x, minY: 0, maxX: x + 80, maxY: 40 },
});
const panels = [panel('a', 0), panel('b', 100), panel('c', 200), panel('d', 300), panel('e', 400), panel('f', 500)];
const edges = panels.flatMap((item) => item.contour.map((start, index) => ({ id: item.edgeIds[index], source: item.id, start, end: item.contour[(index + 1) % item.contour.length] })));
const model = { content: '', innerMarkup: '', rootAttributes: { width: null, height: null, viewBox: null }, viewBox: '0 0 580 40', width: 580, height: 40, panels, edges } as unknown as SvgDocumentModel;
const assignments = {
  'a-top': { edgeAssignment: { connectionId: 'TB1', edgeRole: 'A' } }, 'b-top': { edgeAssignment: { connectionId: 'TB1', edgeRole: 'B' } },
  'c-top': { edgeAssignment: { connectionId: 'TB4', edgeRole: 'A' } }, 'd-top': { edgeAssignment: { connectionId: 'TB4', edgeRole: 'B' } },
  'e-top': { edgeAssignment: { connectionId: 'W1', edgeRole: 'A' } }, 'f-top': { edgeAssignment: { connectionId: 'W1', edgeRole: 'B' } },
} as EdgeAssignmentRecord;
const pm = { panels: Object.fromEntries(panels.map(({ id }) => [id, { panelId: id, thicknessMm: 3 }])) } as any;
const geometryConnections = { TB1: make('TB1', 'TB', 9), TB4: make('TB4', 'TB', 12), W1: make('W1', 'W', 7) } as ConnectionMap;
const tbItems = buildGeneratedTBGeometryItems(model, assignments, geometryConnections, pm);
const wItems = buildGeneratedWGeometryItems(model, assignments, geometryConnections, pm);
const pathFor = (items: typeof tbItems, id: string) => items.filter((item) => item.source.connectionIds.includes(id)).map((item) => item.pathD).join('|');
assert(pathFor(tbItems, 'TB1') && pathFor(tbItems, 'TB4') && pathFor(tbItems, 'TB1') !== pathFor(tbItems, 'TB4'), 'real TB generation must retain distinct 9/12 mm profiles');
assert(pathFor(wItems, 'W1') && pathFor(wItems, 'W1') !== pathFor(tbItems, 'TB1'), 'real W generation must consume its own 7 mm profile');

for (const [id, expected] of [['TB1', 9], ['TB4', 12], ['W1', 7], ['W2', 10]] as const) {
  const selected = (id === 'W2' ? restored : geometryConnections)[id];
  const selectedAssignments = {
    'a-top': { edgeAssignment: { connectionId: id, edgeRole: 'A' } },
    'b-top': { edgeAssignment: { connectionId: id, edgeRole: 'B' } },
  } as EdgeAssignmentRecord;
  const vm = getFingerJointConnectionViewModel(model, selectedAssignments, selected as any, pm);
  assert(vm.displayTabMm === expected, `${id} selection must display its own Tab value`);
}
const newWall = startWallGroupWorkflow(connections).connections.W3;
assert(newWall?.prefix === 'W' && newWall.properties.fingerWidthMm === 9 && !newWall.properties.isFingerWidthManual, 'new W owns the workflow default rather than synchronizing existing connections');

console.log('PASS per-connection TB/W Tab state, selection, history/restore snapshots, finish isolation, and real geometry');
