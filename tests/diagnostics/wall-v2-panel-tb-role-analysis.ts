/** B2.5 evidence only: contrasts production B2.4 with the proposed per-panel rule. */
import { getWallAssignments, normalizeWallConnection, resolveTBOrientationForPanelPair } from '../../src/app/wallAuthoring';
import { getBucketEdgeAssignment } from '../../src/app/assignmentBuckets';
import type { ConnectionMap } from '../../src/app/connectionTypes';
import type { EdgeAssignmentRecord, SvgDocumentModel, SvgPanel } from '../../src/svgUtils';

const assert: (value: unknown, message: string) => asserts value = (value, message) => { if (!value) throw new Error(message); };
const panel = (id: string, edgeIds: string[]): SvgPanel => ({ id, edgeIds, outerEdgeIds: edgeIds,
  contour: [], outerContour: [], innerContours: [], innerEdgeIds: [], bounds: { minX: 0, minY: 0, maxX: 1, maxY: 1 } });
const model = { panels: [panel('center', ['c1', 'c2', 'c4']), panel('top', ['top-tb', 'top-w1', 'top-w2']),
  panel('right', ['right-tb', 'right-w1']), panel('left', ['left-tb', 'left-w2'])], edges: [] } as unknown as SvgDocumentModel;
const edge = (connectionId: string, edgeRole: 'A' | 'B') => ({ edgeAssignment: { connectionId, edgeRole } });
const connections: ConnectionMap = {
  TB1: { id: 'TB1', prefix: 'TB', properties: { fingerWidthMm: 9, isFingerWidthManual: false } },
  TB2: { id: 'TB2', prefix: 'TB', properties: { fingerWidthMm: 9, isFingerWidthManual: false } },
  TB4: { id: 'TB4', prefix: 'TB', properties: { fingerWidthMm: 9, isFingerWidthManual: false } },
  W1: { id: 'W1', prefix: 'W', properties: {} }, W2: { id: 'W2', prefix: 'W', properties: {} },
};
const authored: EdgeAssignmentRecord = {
  'top-tb': edge('TB1', 'A'), c1: edge('TB1', 'B'), 'right-tb': edge('TB2', 'B'), c2: edge('TB2', 'A'),
  'left-tb': edge('TB4', 'B'), c4: edge('TB4', 'A'), 'top-w1': edge('W1', 'A'), 'right-w1': edge('W1', 'B'),
  'top-w2': edge('W2', 'B'), 'left-w2': edge('W2', 'A'),
};

assert(resolveTBOrientationForPanelPair('top', 'left', authored, connections, model) === 'NO_TB_ORIENTATION',
  'production must expose that no single TB joins top and left');
const current = normalizeWallConnection(model, authored, connections, 'W2');
assert(getWallAssignments(model, current, 'W2').find((x) => x.panelId === 'top')?.role === 'B',
  'current B2.4 must leave reversed W2 unchanged');

type ProposedPanelRole = 'NO_TB_ROLE' | 'TB_ROLE_A' | 'TB_ROLE_B' | 'AMBIGUOUS_TB_ROLE';
const proposedRole = (panelId: string): ProposedPanelRole => {
  const panelByEdge = new Map(model.panels.flatMap((p) => p.edgeIds.map((id) => [id, p.id])));
  const roles = new Set<'A' | 'B'>();
  for (const connection of Object.values(connections).filter((c) => c.prefix === 'TB')) {
    const entries = Object.entries(authored).flatMap(([sourceEdgeId, bucket]) => {
      const assignment = getBucketEdgeAssignment(bucket);
      return assignment?.connectionId === connection.id && assignment.edgeRole
        ? [{ panelId: panelByEdge.get(sourceEdgeId), role: assignment.edgeRole }] : [];
    });
    if (entries.length === 2 && entries.filter((x) => x.role === 'A').length === 1
      && entries.filter((x) => x.role === 'B').length === 1 && entries[0].panelId !== entries[1].panelId) {
      entries.filter((x) => x.panelId === panelId).forEach((x) => roles.add(x.role));
    }
  }
  return roles.size === 0 ? 'NO_TB_ROLE' : roles.size > 1 ? 'AMBIGUOUS_TB_ROLE'
    : roles.has('A') ? 'TB_ROLE_A' : 'TB_ROLE_B';
};
assert(proposedRole('top') === 'TB_ROLE_A', 'top must inherit A from TB1');
assert(proposedRole('left') === 'TB_ROLE_B', 'left must inherit B from TB4');
assert(proposedRole('right') === 'TB_ROLE_B', 'right must inherit B from TB2');
assert(proposedRole('top') === 'TB_ROLE_A' && proposedRole('right') === 'TB_ROLE_B', 'W1 is A/B');
assert(proposedRole('top') === 'TB_ROLE_A' && proposedRole('left') === 'TB_ROLE_B', 'proposed W2 swaps to A/B');
console.log('PASS current B2.4 returns NO_TB_ORIENTATION and leaves screenshot W2 top=B/left=A');
console.log('PASS diagnostic panel resolver finds top=A (TB1), right=B (TB2), left=B (TB4); proposed W2 is top=A/left=B');
