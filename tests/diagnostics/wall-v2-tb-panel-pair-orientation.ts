// Superseded panel-pair diagnostic: B2.1 uses authored contour incidence.
import { getBucketEdgeAssignment } from '../../src/app/assignmentBuckets';
import { normalizeWallConnection, resolveRelevantTBMeeting } from '../../src/app/wallAuthoring';
import type { ConnectionMap } from '../../src/app/connectionTypes';
import type { EdgeAssignmentRecord, SvgDocumentModel } from '../../src/svgUtils';
const assert: (v: unknown, m: string) => asserts v = (v, m) => { if (!v) throw new Error(m); };
const panels = ['P', 'Q'].map(id => ({ id, edgeIds: Array.from({ length: 8 }, (_, i) => `${id}${i}`), contour: [], holes: [], bounds: { minX: 0, minY: 0, maxX: 1, maxY: 1 } }));
const model = { panels, edges: [] } as unknown as SvgDocumentModel;
const connections: ConnectionMap = { W23: { id: 'W23', prefix: 'W', properties: {} }, TB9: { id: 'TB9', prefix: 'TB', properties: { fingerWidthMm: 9, isFingerWidthManual: false } } };
const e = (connectionId: string, edgeRole: 'A' | 'B') => ({ edgeAssignment: { connectionId, edgeRole } });
const base: EdgeAssignmentRecord = { P0: e('W23', 'B'), Q0: e('W23', 'A'), P1: e('TB9', 'A'), Q1: e('TB9', 'B') };
for (const assignments of [base, Object.fromEntries(Object.entries(base).reverse())]) {
  assert(resolveRelevantTBMeeting(model, assignments, connections, 'W23') === 'W_A_SIDE_IS_TB_B', 'order-independent meeting');
  const normalized = normalizeWallConnection(model, assignments, connections, 'W23');
  assert(getBucketEdgeAssignment(normalized.P0)?.edgeRole === 'A' && getBucketEdgeAssignment(normalized.Q0)?.edgeRole === 'B', 'ID-independent normalization');
}
console.log('PASS authored contour incidence is transform/raw-direction/order/connection-number independent');
console.log('PASS old broad panel-pair rule is retired');
