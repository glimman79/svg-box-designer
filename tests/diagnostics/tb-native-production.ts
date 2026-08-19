import { buildGeneratedTBGeometryItems } from '../../src/app/tbGeometry';
import { startTBGroupWorkflow } from '../../src/app/tbWorkflow';
import type { SvgDocumentModel, SvgPanel } from '../../src/svgUtils';

const assert = (condition: unknown, message: string) => {
  if (!condition) throw new Error(message);
};

const rectangle = (id: string, x: number) => {
  const contour = [{ x, y: 0 }, { x: x + 80, y: 0 }, { x: x + 80, y: 40 }, { x, y: 40 }];
  const edgeIds = contour.map((_, index) => `${id}-edge-${index}`);
  const edges = contour.map((start, index) => ({ id: edgeIds[index], source: id, start, end: contour[(index + 1) % contour.length] }));
  const panel: SvgPanel = {
    id, contour, outerContour: contour, innerContours: [], edgeIds, outerEdgeIds: edgeIds, innerEdgeIds: [],
    bounds: { minX: x, minY: 0, maxX: x + 80, maxY: 40 },
  };
  return { panel, edges };
};

const first = rectangle('panel-a', 0);
const second = rectangle('panel-b', 100);
const model: SvgDocumentModel = {
  content: '', innerMarkup: '', rootAttributes: { width: null, height: null, viewBox: null },
  viewBox: '0 0 200 50', width: 200, height: 50,
  panels: [first.panel, second.panel], edges: [...first.edges, ...second.edges],
};
const workflow = startTBGroupWorkflow({}, { materialThicknessMm: 3, fingerWidthMm: 9, isFingerWidthManual: false });
assert(workflow.selectedLabelId === 'TB1', 'native TB allocation did not produce TB1');
assert(workflow.connections.TB1?.prefix === 'TB', 'native TB connection did not use the TB prefix');

const assignments = {
  [first.panel.edgeIds[0]]: { edgeAssignment: { connectionId: 'TB1', edgeRole: 'A' as const } },
  [second.panel.edgeIds[0]]: { edgeAssignment: { connectionId: 'TB1', edgeRole: 'B' as const } },
};
const panelManager = { panels: {
  [first.panel.id]: { panelId: first.panel.id, thicknessMm: 3 },
  [second.panel.id]: { panelId: second.panel.id, thicknessMm: 5 },
} };
const items = buildGeneratedTBGeometryItems(model, assignments, workflow.connections, panelManager);
assert(items.length === 2, 'native TB generator did not emit both assigned panels');
assert(items.every((item) => item.toolType === 'TB'), 'generated item lost TB tool identity');
assert(items.flatMap((item) => item.generatedProfiles ?? []).every((profile) => (
  profile.generatorType === 'TB' && profile.operationId === 'operation:TB:TB1'
)), 'generated profile lost native TB operation identity');
assert(items.flatMap((item) => item.generatedTaps ?? []).length > 0, 'native TB generator emitted no taps');

console.log('Native TB production smoke: PASS');
