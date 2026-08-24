import { buildFinalGeometry } from '../../src/app/finalGeometry';
import { assembleGeneratedGeometryDiagnostics } from '../../src/app/generatedGeometryAssembly';
import { selectGeneratedGeometryAuthority } from '../../src/app/generatedGeometryAuthority';
import { packageComposedPanelGeometry } from '../../src/app/generatedGeometryDualRun';
import { processManufacturingGeometry } from '../../src/app/manufacturingCompensation';
import { buildGeneratedTBGeometryItems } from '../../src/app/tbGeometry';
import { buildGeneratedWGeometryItems } from '../../src/app/wallGeometry';
import { validateWallAuthoringForApply } from '../../src/app/wallAuthoring';
import type { ConnectionMap } from '../../src/app/connectionTypes';
import type { EdgeAssignmentRecord, SvgDocumentModel, SvgPanel } from '../../src/svgUtils';

const assert: (value: unknown, message: string) => asserts value = (value, message) => { if (!value) throw new Error(message); };
const importedRect = (id: string, x: number, y: number) => {
  const contour = [{ x, y }, { x: x + 80, y }, { x: x + 80, y: y + 60 }, { x, y: y + 60 }];
  const edgeIds = contour.map((_, index) => `edge-${Number(id.slice(6)) * 4 - 3 + index}`);
  const panel: SvgPanel = { id, contour, outerContour: contour, innerContours: [], edgeIds, outerEdgeIds: edgeIds,
    innerEdgeIds: [], bounds: { minX: x, minY: y, maxX: x + 80, maxY: y + 60 } };
  return { panel, edges: contour.map((start, index) => ({ id: edgeIds[index], source: `rect ${id.slice(6)}`,
    start, end: contour[(index + 1) % contour.length], panelBounds: panel.bounds })) };
};

// One immutable parser-contract capture is shared by every branch. The user's SVG was not
// supplied; this is deliberately not represented as that missing artifact.
const imported = [importedRect('panel-1', 120, 80), importedRect('panel-2', 120, 0), importedRect('panel-3', 20, 80),
  importedRect('panel-4', 220, 80), importedRect('panel-5', 120, 160), importedRect('panel-6', 220, 160)];
const importedModel: SvgDocumentModel = { content: '<svg viewBox="0 0 340 240">...</svg>', innerMarkup: '<rect/>',
  rootAttributes: { width: null, height: null, viewBox: '0 0 340 240' }, viewBox: '0 0 340 240', width: 340, height: 240,
  panels: imported.map((value) => value.panel), edges: imported.flatMap((value) => value.edges) };
const originalModel = JSON.stringify(importedModel);
const affected = ['panel-1', 'panel-3', 'panel-5', 'panel-6'];
const connections: ConnectionMap = {};
const wAssignments: EdgeAssignmentRecord = {}; const tbAssignments: EdgeAssignmentRecord = {};
affected.forEach((panelId, index) => {
  const w = `W${index + 1}`; const tb = `TB${index + 1}`;
  connections[w] = { id: w, prefix: 'W', properties: { fingerWidthMm: 10, isFingerWidthManual: true } };
  connections[tb] = { id: tb, prefix: 'TB', properties: { fingerWidthMm: 10, isFingerWidthManual: true } };
  wAssignments[importedModel.panels.find((panel) => panel.id === panelId)!.edgeIds[1]] = { edgeAssignment: { connectionId: w, edgeRole: 'A' } };
  wAssignments[importedModel.panels[1].edgeIds[index]] = { edgeAssignment: { connectionId: w, edgeRole: 'B' } };
  tbAssignments[importedModel.panels.find((panel) => panel.id === panelId)!.edgeIds[0]] = { edgeAssignment: { connectionId: tb, edgeRole: 'A' } };
  tbAssignments[importedModel.panels[3].edgeIds[index]] = { edgeAssignment: { connectionId: tb, edgeRole: 'B' } };
});
connections.W5 = { id: 'W5', prefix: 'W', properties: { fingerWidthMm: 10, isFingerWidthManual: true } };
const thickness = { defaultThicknessMm: 3, panels: Object.fromEntries(importedModel.panels.map((panel) =>
  [panel.id, { panelId: panel.id, thicknessMm: 3 }])) };

const run = (name: string, assignments: EdgeAssignmentRecord) => {
  validateWallAuthoringForApply(importedModel, assignments, connections,
    { groupId: 'diagnostic-wall-group', connectionIds: ['W1', 'W2', 'W3', 'W4', 'W5'], isActive: true });
  const tb = buildGeneratedTBGeometryItems(importedModel, assignments, connections, thickness);
  const w = buildGeneratedWGeometryItems(importedModel, assignments, connections, thickness);
  const raw = [...tb, ...w]; const assembly = assembleGeneratedGeometryDiagnostics(importedModel, raw);
  const packaging = assembly.panelDiagnostics.map((panel) => {
    const candidate = assembly.panelCandidates.find((value) => value.panelId === panel.panelId);
    if (!candidate) return { panelId: panel.panelId, exception: null, candidate: false };
    try { packageComposedPanelGeometry(raw, candidate, panel.replacementOperationIds); return { panelId: panel.panelId, exception: null, candidate: true }; }
    catch (error) { return { panelId: panel.panelId, exception: error instanceof Error ? error.message : String(error), candidate: true }; }
  });
  const authority = selectGeneratedGeometryAuthority(importedModel, raw, 'mixed', assembly);
  const final = buildFinalGeometry(importedModel, authority.generatedGeometry);
  const manufacturing = processManufacturingGeometry(final, 0, 0, 0, [], 0);
  return { name, assignments: Object.keys(assignments), tb, w, raw, assembly, packaging, authority, final, manufacturing };
};

const wallOnly = run('W_ONLY', wAssignments);
const mixed = run('TB_PLUS_W', { ...tbAssignments, ...wAssignments });
const reductions = affected.map((_, index) => run(`W_PLUS_TB_1_TO_${index + 1}`, { ...wAssignments,
  ...Object.fromEntries(Object.entries(tbAssignments).filter(([, value]) => {
    const id = ((value as any).edgeAssignment ?? value).connectionId as string; return Number(id.slice(2)) <= index + 1;
  })) }));
let sameEdgeValidationError: string | null = null;
try {
  validateWallAuthoringForApply(importedModel, { ...wAssignments,
    [importedModel.panels[0].edgeIds[1]]: { edgeAssignment: { connectionId: 'TB1', edgeRole: 'A' } },
    [importedModel.panels[3].edgeIds[0]]: { edgeAssignment: { connectionId: 'TB1', edgeRole: 'B' } } }, connections,
  { groupId: 'diagnostic-wall-group', connectionIds: ['W1', 'W2', 'W3', 'W4', 'W5'], isActive: true });
} catch (error) { sameEdgeValidationError = error instanceof Error ? error.message : String(error); }

assert(wallOnly.authority.ok, 'Imported-contract W-only baseline failed.');
assert(mixed.authority.ok, 'Available imported-contract TB+W branch failed unexpectedly.');
assert(reductions.every((value) => value.authority.ok), 'One-at-a-time TB reduction failed.');
assert(sameEdgeValidationError?.includes('W1 is incomplete'), 'Same-source-edge assignment overwrite did not fail closed during Apply validation.');
assert(JSON.stringify(importedModel) === originalModel, 'Authoring/generation mutated imported topology.');
const summarize = (value: ReturnType<typeof run>) => ({ name: value.name, ok: value.authority.ok,
  assignmentCount: value.assignments.length, authorityInput: value.raw.map((item) => ({ id: item.id, kind: item.kind,
    panelId: item.behaviour.replacesPanelId, tool: item.toolType, operationId: item.operationId })),
  relationships: value.raw.flatMap((item) => item.sourceRelationships ?? []),
  metadataCounts: { profiles: value.raw.flatMap((item) => item.generatedProfiles ?? []).length,
    taps: value.raw.flatMap((item) => item.generatedTaps ?? []).length,
    groups: value.raw.flatMap((item) => item.profileGroups ?? []).length },
  panels: value.assembly.panelDiagnostics, candidates: value.assembly.panelCandidates.map((candidate) =>
    ({ panelId: candidate.panelId, points: candidate.points, junctions: candidate.junctions })), packaging: value.packaging,
  finalErrors: value.final.diagnostics.filter((entry) => entry.severity === 'error'), manufacturingContours: value.manufacturing.contours.length });
console.log(JSON.stringify({ baseModel: { panels: importedModel.panels, edges: importedModel.edges,
  provenanceGap: 'Parser-contract capture; exact manually tested SVG and live state were not supplied.' },
  wallOnly: summarize(wallOnly), mixed: summarize(mixed), reductions: reductions.map((value) => ({ name: value.name, ok: value.authority.ok })),
  sameEdge: { ok: false, stage: 'validateWallAuthoringForApply', exception: sameEdgeValidationError },
  topologyUnchanged: JSON.stringify(importedModel) === originalModel,
  conclusion: 'CURRENT_SOURCE_DOES_NOT_REPRODUCE_MANUAL_FAILURE_WITH_AVAILABLE_IMPORTED_CONTRACT' }, null, 2));
