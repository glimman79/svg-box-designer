import { selectGeneratedGeometryAuthority } from '../../src/app/generatedGeometryAuthority';
import { assembleGeneratedGeometryDiagnostics } from '../../src/app/generatedGeometryAssembly';
import { packageComposedPanelGeometry } from '../../src/app/generatedGeometryDualRun';
import type { GeneratedGeometryItem } from '../../src/app/generatedGeometryTypes';
import { createPanelManagerStateFromModel } from '../../src/app/panelManagerModel';
import { buildGeneratedTBGeometryItems } from '../../src/app/tbGeometry';
import { authorWallEdge, startWallGroupWorkflow } from '../../src/app/wallWorkflow';
import { buildGeneratedWGeometryItems } from '../../src/app/wallGeometry';
import type { ConnectionMap } from '../../src/app/connectionTypes';
import type { EdgeAssignmentRecord, SvgDocumentModel, SvgPanel } from '../../src/svgUtils';

const assert: (condition: unknown, message: string) => asserts condition = (condition, message) => {
  if (!condition) throw new Error(message);
};
const rectangle = (id: string, x: number, y: number) => {
  const contour = [{ x, y }, { x: x + 80, y }, { x: x + 80, y: y + 60 }, { x, y: y + 60 }];
  const edgeIds = contour.map((_, index) => `${id}-edge-${index}`);
  const panel: SvgPanel = { id, contour, outerContour: contour, innerContours: [], edgeIds,
    outerEdgeIds: edgeIds, innerEdgeIds: [], bounds: { minX: x, minY: y, maxX: x + 80, maxY: y + 60 } };
  return { panel, edges: contour.map((start, index) => ({ id: edgeIds[index], source: id, start, end: contour[(index + 1) % 4] })) };
};

const made = [rectangle('panel-1', 120, 80), rectangle('panel-2', 120, 0), rectangle('panel-3', 20, 80),
  rectangle('panel-4', 220, 80), rectangle('panel-5', 120, 160), rectangle('panel-6', 220, 160)];
const model: SvgDocumentModel = { content: '', innerMarkup: '', rootAttributes: { width: null, height: null, viewBox: null },
  viewBox: '0 0 340 240', width: 340, height: 240, panels: made.map(({ panel }) => panel), edges: made.flatMap(({ edges }) => edges) };
const affected = ['panel-1', 'panel-3', 'panel-5', 'panel-6'];
let connections: ConnectionMap = {};
let assignments: EdgeAssignmentRecord = {};

// Model the completed TB authoring state. Apply uses only these maps and PM state; TB workflow/history groups
// are deliberately represented separately below because App does not pass them to either generator.
affected.forEach((panelId, index) => {
  const id = `TB${index + 1}`;
  connections[id] = { id, prefix: 'TB', properties: { fingerWidthMm: 10, isFingerWidthManual: true } };
  assignments[`${panelId}-edge-0`] = { edgeAssignment: { connectionId: id, edgeRole: 'A' } };
  assignments[`panel-4-edge-${index}`] = { edgeAssignment: { connectionId: id, edgeRole: 'B' } };
});
const createdPanelManager = createPanelManagerStateFromModel(model);
const panelManager = { ...createdPanelManager, defaultThicknessMm: 3, isApplied: true, isDirty: false,
  panels: Object.fromEntries(model.panels.map((panel) => [panel.id, { panelId: panel.id, thicknessMm: 3 }])) };
const tbFirstRaw = buildGeneratedTBGeometryItems(model, assignments, connections, panelManager);
const tbFirst = selectGeneratedGeometryAuthority(model, tbFirstRaw, 'mixed');
assert(tbFirst.ok, 'TB-first Apply must succeed.');

// Use the production Wall workflow commands for W1..W4. Completion auto-creates W5 and leaves it empty.
let wall = startWallGroupWorkflow(connections);
connections = wall.connections;
let activeWallGroup = wall.activeWallGroup;
for (let index = 0; index < affected.length; index += 1) {
  const id = `W${index + 1}`;
  let next = authorWallEdge(model, assignments, connections, activeWallGroup, id, `${affected[index]}-edge-1`);
  assignments = next.assignments; connections = next.connections; activeWallGroup = next.activeWallGroup;
  next = authorWallEdge(model, assignments, connections, activeWallGroup, id, `panel-2-edge-${index}`);
  assignments = next.assignments; connections = next.connections; activeWallGroup = next.activeWallGroup;
}
assert(activeWallGroup.connectionIds.at(-1) === 'W5' && connections.W5?.prefix === 'W', 'Workflow must leave the W5 placeholder.');

const runApply = (previous: ReadonlyArray<GeneratedGeometryItem>) => {
  // This is App.applyPanelPaths' fresh-generation rule: previous authoritative items are not merged or supplied.
  const tb = buildGeneratedTBGeometryItems(model, assignments, connections, panelManager);
  const w = buildGeneratedWGeometryItems(model, assignments, connections, panelManager);
  const raw = [...tb, ...w];
  const authority = selectGeneratedGeometryAuthority(model, raw, 'mixed');
  return { previousCount: previous.length, tb, w, raw, authority };
};
const clean = runApply([]);
const afterTb = runApply(tbFirst.generatedGeometry);
const repeated = runApply(afterTb.authority.generatedGeometry);
const reentered = runApply(repeated.authority.generatedGeometry);
for (const result of [clean, afterTb, repeated, reentered]) assert(result.authority.ok, 'Browser-sequence Apply unexpectedly failed.');

const carrierEvidence = affected.map((panelId) => ({ panelId, carriers: clean.raw
  .filter((item) => item.kind === 'PANEL_PATH' && item.behaviour.replacesPanelId === panelId)
  .map((item) => ({ id: item.id, kind: item.kind, operationId: item.operationId, toolType: item.toolType })) }));
assert(carrierEvidence.every(({ carriers }) => carriers.length === 2 && new Set(carriers.map(({ id }) => id)).size === 2),
  `Every mixed panel must have distinct TB and W carriers: ${JSON.stringify(carrierEvidence)}`);
const assembly = assembleGeneratedGeometryDiagnostics(model, clean.raw);
const packagingEvidence = affected.map((panelId) => {
  const panel = assembly.panelDiagnostics.find((entry) => entry.panelId === panelId)!;
  const candidate = assembly.panelCandidates.find((entry) => entry.panelId === panelId)!;
  try {
    packageComposedPanelGeometry(clean.raw, candidate, panel.replacementOperationIds);
    return { panelId, exception: null };
  } catch (error) {
    return { panelId, exception: error instanceof Error ? error.message : String(error) };
  }
});
assert(packagingEvidence.every(({ exception }) => exception === null), `Packaging outside authority failed: ${JSON.stringify(packagingEvidence)}`);
console.log(JSON.stringify({ result: 'PASS_CURRENT_SOURCE_DOES_NOT_REPRODUCE_BROWSER_FAILURE', panelCount: model.panels.length,
  assignments: Object.keys(assignments).length, activeWallGroup, completedTBGroupWouldBeIgnoredByApply: true,
  w5AssignmentCount: Object.values(assignments).filter((bucket: any) => bucket.edgeAssignment?.connectionId === 'W5').length,
  firstApplyCounts: { tb: clean.tb.length, w: clean.w.length, combined: clean.raw.length }, carrierEvidence, packagingEvidence,
  variants: { clean: clean.authority.ok, previousTbApply: afterTb.authority.ok, repeatedWallApply: repeated.authority.ok,
    finishAndReenterEquivalent: reentered.authority.ok } }, null, 2));
