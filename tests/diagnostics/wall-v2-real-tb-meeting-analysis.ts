/**
 * B2.3 evidence fixture. This deliberately records the production mismatch;
 * it is expected to fail until B2.4 changes the production meeting contract.
 */
import { getBucketEdgeAssignment } from '../../src/app/assignmentBuckets';
import type { ConnectionMap } from '../../src/app/connectionTypes';
import { resolveRelevantTBMeeting } from '../../src/app/wallAuthoring';
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
const meeting = resolveRelevantTBMeeting(model, result.assignments, result.connections, 'W1');
const observed = {
  candidates: [{ connectionId: 'TB1', aEdge: 'p-tb', aPanel: 'wall-P', bEdge: 'q-tb', bPanel: 'wall-Q', complete: true,
    touchesP: true, touchesQ: true, incidentP: false, incidentQ: true, survives: false,
    rejection: 'p-wall and p-tb have p-seam between them in wall-P.edgeIds' }],
  meeting,
  pRole: getBucketEdgeAssignment(result.assignments['p-wall'])?.edgeRole,
  qRole: getBucketEdgeAssignment(result.assignments['q-wall'])?.edgeRole,
};
console.error('B2.3 REALISTIC TOPOLOGY EVIDENCE', JSON.stringify(observed, null, 2));

if (meeting !== 'W_A_SIDE_IS_TB_B' || observed.pRole !== 'A' || observed.qRole !== 'B') {
  throw new Error('KNOWN B2.3 FAILURE: same-panel-pair TB1 was filtered by contour-index adjacency, so reversed W1 was not normalized');
}
