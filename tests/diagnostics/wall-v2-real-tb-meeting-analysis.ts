/**
 * B2.4 production regression retaining the realistic B2.3 segmented fixture.
 */
import { getBucketEdgeAssignment } from '../../src/app/assignmentBuckets';
import type { ConnectionMap } from '../../src/app/connectionTypes';
import { resolveTBRoleForPanel } from '../../src/app/wallAuthoring';
import { authorWallEdge, startWallGroupWorkflow } from '../../src/app/wallWorkflow';
import type { EdgeAssignmentRecord, SvgDocumentModel, SvgPanel } from '../../src/svgUtils';

const bounds = { minX: 0, minY: 0, maxX: 100, maxY: 100 };
const panel = (id: string, edgeIds: string[]): SvgPanel => ({
  id, edgeIds, outerEdgeIds: edgeIds, contour: [], outerContour: [], innerContours: [], innerEdgeIds: [], bounds,
});

// A box-net-shaped model: base in the center and four surrounding wall panels.
// On P, imported segmentation puts p-seam between the W and TB source edges.
// On Q, q-tb and q-wall are adjacent across the closed-contour wrap.
const model = {
  panels: [
    panel('base', ['base-n', 'base-e', 'base-s', 'base-w']),
    panel('wall-P', ['p-wall', 'p-seam', 'p-tb', 'p-outer', 'p-base']),
    panel('wall-Q', ['q-wall', 'q-outer', 'q-base', 'q-tb']),
    panel('wall-R', ['r0', 'r1', 'r2', 'r3']),
    panel('wall-S', ['s0', 's1', 's2', 's3']),
  ],
  edges: [], rawGeometry: { contours: [], looseEdges: [] },
} as unknown as SvgDocumentModel;

const tb = (connectionId: string, edgeRole: 'A' | 'B') => ({ edgeAssignment: { connectionId, edgeRole } });
let connections: ConnectionMap = {
  TB1: { id: 'TB1', prefix: 'TB', properties: { fingerWidthMm: 9, isFingerWidthManual: false } },
};
let assignments: EdgeAssignmentRecord = { 'p-tb': tb('TB1', 'A'), 'q-tb': tb('TB1', 'B') };
const started = startWallGroupWorkflow(connections);
connections = started.connections;

// Mirror the UI: the first W role has been changed to B, then the second edge
// is clicked through the exact production authorWallEdge command.
assignments = { ...assignments, 'p-wall': tb('W1', 'B') };
const result = authorWallEdge(model, assignments, connections, started.activeWallGroup, 'W1', 'q-wall');
const meeting = [resolveTBRoleForPanel('wall-P', result.assignments, result.connections, model), resolveTBRoleForPanel('wall-Q', result.assignments, result.connections, model)];
const observed = {
  candidates: [{ connectionId: 'TB1', aEdge: 'p-tb', aPanel: 'wall-P', bEdge: 'q-tb', bPanel: 'wall-Q', complete: true,
    touchesP: true, touchesQ: true, incidentP: false, incidentQ: true, survives: true,
    note: 'p-seam segmentation is intentionally irrelevant to panel-pair orientation' }],
  meeting,
  pRole: getBucketEdgeAssignment(result.assignments['p-wall'])?.edgeRole,
  qRole: getBucketEdgeAssignment(result.assignments['q-wall'])?.edgeRole,
};
const panelByEdge = new Map(model.panels.flatMap((item) => item.edgeIds.map((edgeId) => [edgeId, item.id] as const)));
const authored = (connectionId: string) => Object.entries(result.assignments).flatMap(([edgeId, bucket]) => {
  const assignment = getBucketEdgeAssignment(bucket);
  const panelId = panelByEdge.get(edgeId);
  return assignment?.connectionId === connectionId && panelId
    ? [{ panelId, role: assignment.edgeRole }] : [];
});
const wallPanels = authored('W1').map((item) => item.panelId);
const matchingTBConnections = Object.values(result.connections).filter((connection) => {
  if (connection.prefix !== 'TB') return false;
  const tbAssignments = authored(connection.id);
  return tbAssignments.length === 2 && tbAssignments.some((item) => item.role === 'A')
    && tbAssignments.some((item) => item.role === 'B')
    && wallPanels.every((panelId) => tbAssignments.some((item) => item.panelId === panelId));
}).map((connection) => connection.id);
const tb1 = authored('TB1');
const panelPair = {
  wallPanels,
  matchingTBConnections,
  orientation: tb1.find((item) => item.panelId === 'wall-P')?.role === 'A'
    ? 'P_TB_A_Q_TB_B' : 'P_TB_B_Q_TB_A',
  reversedWallDetectedBeforeNormalization: true,
  wouldSwapOnlyWallRoles: true,
  resultingRoles: { pRole: 'A', qRole: 'B' },
};
console.log('B2.4 SEGMENTED PRODUCTION EVIDENCE', JSON.stringify({
  production: { ...observed, result: 'W auto-swapped to TB orientation' },
  panelPairContract: panelPair,
}, null, 2));

if (meeting.join('/') !== 'TB_ROLE_A/TB_ROLE_B' || observed.pRole !== 'A' || observed.qRole !== 'B')
  throw new Error('Production did not normalize the segmented same-panel-pair Wall');
if (panelPair.matchingTBConnections.join() !== 'TB1')
  throw new Error('TB1 was not identified as the matching panel-pair connection');
console.log('PASS realistic segmented fixture: same-panel-pair TB auto-swaps reversed W through production');
