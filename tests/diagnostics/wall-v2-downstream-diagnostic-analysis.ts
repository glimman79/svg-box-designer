import { buildFinalGeometry } from '../../src/app/finalGeometry';
import { assembleGeneratedGeometryDiagnostics } from '../../src/app/generatedGeometryAssembly';
import { selectGeneratedGeometryAuthority } from '../../src/app/generatedGeometryAuthority';
import { packageComposedPanelGeometry } from '../../src/app/generatedGeometryDualRun';
import { buildGeneratedTBGeometryItems } from '../../src/app/tbGeometry';
import { buildGeneratedWGeometryItems } from '../../src/app/wallGeometry';
import { validateWallAuthoringForApply } from '../../src/app/wallAuthoring';
import type { ConnectionMap } from '../../src/app/connectionTypes';
import type { EdgeAssignmentRecord, SvgDocumentModel, SvgPanel } from '../../src/svgUtils';

const assert: (value: unknown, message: string) => asserts value = (value, message) => { if (!value) throw new Error(message); };
const rectangle = (id: string, x: number, y: number) => {
  const contour = [{ x, y }, { x: x + 80, y }, { x: x + 80, y: y + 60 }, { x, y: y + 60 }];
  const edgeIds = contour.map((_, index) => `${id}-edge-${index}`);
  const panel: SvgPanel = { id, contour, outerContour: contour, innerContours: [], edgeIds, outerEdgeIds: edgeIds,
    innerEdgeIds: [], bounds: { minX: x, minY: y, maxX: x + 80, maxY: y + 60 } };
  return { panel, edges: contour.map((start, index) => ({ id: edgeIds[index], source: id, start, end: contour[(index + 1) % 4] })) };
};

// A six-panel net-shaped diagnostic model. Each of the four browser-failing panel IDs has an
// existing TB edge and receives one native W edge; panel-2 is the common W mate and panel-4 is
// the common TB mate. The exact browser session is unavailable, but this preserves its decisive
// production condition: TB+W ownership on the same panels and four complete W operations.
const made = [rectangle('panel-1', 120, 80), rectangle('panel-2', 120, 0), rectangle('panel-3', 20, 80),
  rectangle('panel-4', 220, 80), rectangle('panel-5', 120, 160), rectangle('panel-6', 220, 160)];
const model: SvgDocumentModel = { content: '', innerMarkup: '', rootAttributes: { width: null, height: null, viewBox: null },
  viewBox: '0 0 340 240', width: 340, height: 240, panels: made.map(({ panel }) => panel), edges: made.flatMap(({ edges }) => edges) };
const affected = ['panel-1', 'panel-3', 'panel-5', 'panel-6'];
const connections: ConnectionMap = {};
const tbAssignments: EdgeAssignmentRecord = {};
const wallAssignments: EdgeAssignmentRecord = {};
affected.forEach((panelId, index) => {
  const tbId = `TB${index + 1}`; const wallId = `W${index + 1}`;
  connections[tbId] = { id: tbId, prefix: 'TB', properties: { fingerWidthMm: 10, isFingerWidthManual: true } };
  connections[wallId] = { id: wallId, prefix: 'W', properties: { fingerWidthMm: 10, isFingerWidthManual: true } };
  tbAssignments[`${panelId}-edge-0`] = { edgeAssignment: { connectionId: tbId, edgeRole: index % 2 ? 'B' : 'A' } };
  tbAssignments[`panel-4-edge-${index}`] = { edgeAssignment: { connectionId: tbId, edgeRole: index % 2 ? 'A' : 'B' } };
  wallAssignments[`${panelId}-edge-1`] = { edgeAssignment: { connectionId: wallId, edgeRole: index % 2 ? 'B' : 'A' } };
  wallAssignments[`panel-2-edge-${index}`] = { edgeAssignment: { connectionId: wallId, edgeRole: index % 2 ? 'A' : 'B' } };
});
const assignments = { ...tbAssignments, ...wallAssignments };
const thickness = { defaultThicknessMm: 3, panels: Object.fromEntries(model.panels.map((panel) => [panel.id, { panelId: panel.id, thicknessMm: 3 }])) };

validateWallAuthoringForApply(model, assignments, connections);
const run = (wallCount: number) => {
  const enabled = new Set(Array.from({ length: wallCount }, (_, index) => `W${index + 1}`));
  const selectedWallAssignments = Object.fromEntries(Object.entries(wallAssignments).filter(([, bucket]) => enabled.has(((bucket as any).edgeAssignment ?? bucket).connectionId)));
  const selectedAssignments = { ...tbAssignments, ...selectedWallAssignments };
  const raw = [...buildGeneratedTBGeometryItems(model, selectedAssignments, connections, thickness),
    ...buildGeneratedWGeometryItems(model, selectedAssignments, connections, thickness)];
  const assembly = assembleGeneratedGeometryDiagnostics(model, raw);
  const authority = selectGeneratedGeometryAuthority(model, raw, 'mixed', assembly);
  const details = assembly.panelDiagnostics.filter((panel) => panel.replacementOperationIds.some((id) => id.startsWith('operation:W:'))).map((panel) => {
    const candidate = assembly.panelCandidates.find((value) => value.panelId === panel.panelId);
    let packaged: ReturnType<typeof packageComposedPanelGeometry> | null = null; let packagingError: string | null = null;
    if (candidate) try { packaged = packageComposedPanelGeometry(raw, candidate, panel.replacementOperationIds); }
    catch (error) { packagingError = error instanceof Error ? error.message : String(error); }
    const final = packaged ? buildFinalGeometry(model, packaged) : null;
    return { panelId: panel.panelId, assemblyStatus: panel.status, composerDiagnostics: panel.diagnostics,
      packagingError, finalDiagnostics: final?.diagnostics ?? [], decision: authority.decisions.find((value) => value.panelId === panel.panelId),
      operations: panel.replacementOperationIds, candidatePoints: candidate?.points ?? [], junctions: candidate?.junctions ?? [],
      contributions: raw.flatMap((item) => item.generatedProfiles ?? []).filter((profile) => profile.panelId === panel.panelId).map((profile) => ({
        id: profile.id, generatorType: profile.generatorType, operationId: profile.operationId, sourceEdgeId: profile.sourceEdgeId,
        role: (() => { const bucket = assignments[profile.sourceEdgeId] as any; return (bucket?.edgeAssignment ?? bucket)?.edgeRole; })(),
        attachmentStart: profile.attachmentStart, attachmentEnd: profile.attachmentEnd,
        projections: profile.geometryProjections, taps: profile.orderedTaps,
      })),
      carriers: raw.filter((item) => item.kind === 'PANEL_PATH' && item.behaviour.replacesPanelId === panel.panelId).map((item) => ({
        id: item.id, toolType: item.toolType, operationId: item.operationId, profileGroups: item.profileGroups,
        relationships: item.sourceRelationships, profileCount: item.generatedProfiles?.length ?? 0, tapCount: item.generatedTaps?.length ?? 0,
      })),
    };
  });
  console.log(JSON.stringify({ wallCount, ok: authority.ok, blocking: authority.blockingDecisions.map((value) => ({ panelId: value.panelId, reason: value.reason })), details }, null, 2));
  return { authority, details };
};

const reductions = [1, 2, 3, 4].map(run);
const final = reductions[3];
assert(!final.authority.ok, 'Expected the diagnostic fixture to reproduce downstream mixed-authority failure.');
assert(final.authority.blockingDecisions.some((value) => value.reason === 'DOWNSTREAM_DIAGNOSTIC_FAILURE'), 'Aggregate downstream diagnostic was not reproduced.');
assert(final.details.some((detail) => detail.packagingError?.startsWith('Conflicting diagnostic packaging carrier')), 'Underlying packaging collision was not exposed.');

const tbEquivalentConnections: ConnectionMap = { ...connections };
const tbEquivalentAssignments: EdgeAssignmentRecord = { ...tbAssignments };
Object.entries(wallAssignments).forEach(([edgeId, bucket]) => {
  const assignment = ((bucket as any).edgeAssignment ?? bucket) as { connectionId: string; edgeRole: 'A' | 'B' };
  const id = assignment.connectionId.replace('W', 'TB-W-EQUIVALENT-');
  tbEquivalentConnections[id] ??= { id, prefix: 'TB', properties: { fingerWidthMm: 10, isFingerWidthManual: true } };
  tbEquivalentAssignments[edgeId] = { edgeAssignment: { ...assignment, connectionId: id } };
});
const tbEquivalentRaw = buildGeneratedTBGeometryItems(model, tbEquivalentAssignments, tbEquivalentConnections, thickness);
const tbEquivalent = selectGeneratedGeometryAuthority(model, tbEquivalentRaw, 'mixed');
assert(tbEquivalent.ok, `Equivalent all-TB coherent batch unexpectedly failed: ${tbEquivalent.blockingDecisions.map((value) => value.reason)}`);
console.log(`PASS | aggregate failure reproduced | underlying packaging collision emitted | equivalent TB coherent batch passes (${tbEquivalentRaw.length} carriers)`);
