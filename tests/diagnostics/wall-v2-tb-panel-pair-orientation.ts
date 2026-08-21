/**
 * B2.3A diagnostic-only oracle. This intentionally does not import or alter the
 * production Wall resolver: it characterizes the clarified panel-pair contract.
 */
import { getBucketEdgeAssignment } from '../../src/app/assignmentBuckets';
import type { ConnectionMap } from '../../src/app/connectionTypes';
import type { EdgeAssignmentRecord, SvgDocumentModel, SvgPanel } from '../../src/svgUtils';

type PairOrientation = 'NO_TB_ORIENTATION' | 'FIRST_A_SECOND_B' | 'FIRST_B_SECOND_A'
  | 'AMBIGUOUS_TB_ORIENTATION';
type Authored = { panelId: string; sourceEdgeId: string; role: 'A' | 'B' };

const assert: (condition: unknown, message: string) => asserts condition = (condition, message) => {
  if (!condition) throw new Error(message);
};
const edge = (connectionId: string, edgeRole: 'A' | 'B') => ({ edgeAssignment: { connectionId, edgeRole } });
const definition = (id: string, prefix: 'TB' | 'W') => ({ id, prefix, properties: prefix === 'TB'
  ? { fingerWidthMm: 9, isFingerWidthManual: false } : {} }) as ConnectionMap[string];
const panel = (id: string, edgeIds: string[]): SvgPanel => ({
  id, edgeIds, outerEdgeIds: edgeIds, contour: [], outerContour: [], innerContours: [], innerEdgeIds: [],
  bounds: { minX: 0, minY: 0, maxX: 1, maxY: 1 },
});
const model = { panels: [
  panel('P', ['p-wall', 'p-seam', 'p-tb-near', 'p3', 'p4', 'p-tb-far']),
  panel('Q', ['q-wall', 'q1', 'q2', 'q-tb-near', 'q4', 'q-tb-far']),
  panel('R', ['r0', 'r1']), panel('S', ['s0', 's1']),
], edges: [] } as unknown as SvgDocumentModel;

const authoredFor = (assignments: EdgeAssignmentRecord, connectionId: string): Authored[] => {
  const panelByEdge = new Map(model.panels.flatMap((p) => p.edgeIds.map((id) => [id, p.id] as const)));
  return Object.entries(assignments).flatMap(([sourceEdgeId, bucket]) => {
    const assignment = getBucketEdgeAssignment(bucket);
    const panelId = panelByEdge.get(sourceEdgeId);
    return assignment?.connectionId === connectionId && panelId && (assignment.edgeRole === 'A' || assignment.edgeRole === 'B')
      ? [{ panelId, sourceEdgeId, role: assignment.edgeRole }] : [];
  });
};

const resolveTBOrientationForPanelPair = (firstPanelId: string, secondPanelId: string,
  assignments: EdgeAssignmentRecord, connections: ConnectionMap): PairOrientation => {
  if (firstPanelId === secondPanelId) return 'AMBIGUOUS_TB_ORIENTATION';
  const votes = new Set<'FIRST_A_SECOND_B' | 'FIRST_B_SECOND_A'>();
  for (const connection of Object.values(connections)) {
    if (connection.prefix !== 'TB') continue;
    const authored = authoredFor(assignments, connection.id);
    const touchesPair = authored.some((item) => item.panelId === firstPanelId)
      && authored.some((item) => item.panelId === secondPanelId);
    if (!touchesPair) continue; // A-only/B-only and P/R or Q/S drafts do not vote.
    if (authored.length !== 2 || authored.filter((item) => item.role === 'A').length !== 1
      || authored.filter((item) => item.role === 'B').length !== 1
      || authored.filter((item) => item.panelId === firstPanelId).length !== 1
      || authored.filter((item) => item.panelId === secondPanelId).length !== 1) {
      return 'AMBIGUOUS_TB_ORIENTATION';
    }
    votes.add(authored.find((item) => item.panelId === firstPanelId)!.role === 'A'
      ? 'FIRST_A_SECOND_B' : 'FIRST_B_SECOND_A');
  }
  return votes.size === 0 ? 'NO_TB_ORIENTATION' : votes.size === 1 ? [...votes][0]
    : 'AMBIGUOUS_TB_ORIENTATION';
};

const connections = (...ids: string[]): ConnectionMap => Object.fromEntries([
  ['W23', definition('W23', 'W')], ...ids.map((id) => [id, definition(id, 'TB')] as const),
]);
const expect = (actual: PairOrientation, expected: PairOrientation, name: string) =>
  assert(actual === expected, `${name}: expected ${expected}, received ${actual}`);

expect(resolveTBOrientationForPanelPair('P', 'Q', {}, connections()), 'NO_TB_ORIENTATION', 'no TB');
expect(resolveTBOrientationForPanelPair('P', 'Q', { 'p-tb-near': edge('TB1', 'A'), 'q-tb-near': edge('TB1', 'B') }, connections('TB1')),
  'FIRST_A_SECOND_B', 'P=A/Q=B');
expect(resolveTBOrientationForPanelPair('P', 'Q', { 'p-tb-near': edge('TB1', 'B'), 'q-tb-near': edge('TB1', 'A') }, connections('TB1')),
  'FIRST_B_SECOND_A', 'P=B/Q=A');
expect(resolveTBOrientationForPanelPair('P', 'Q', { 'p-tb-far': edge('TB1', 'A'), 'q-tb-far': edge('TB1', 'B') }, connections('TB1')),
  'FIRST_A_SECOND_B', 'same panels at remote source edges');
expect(resolveTBOrientationForPanelPair('P', 'Q', { 'p-tb-near': edge('TB1', 'A'), r0: edge('TB1', 'B') }, connections('TB1')),
  'NO_TB_ORIENTATION', 'P/R unrelated');
expect(resolveTBOrientationForPanelPair('P', 'Q', { 'q-tb-near': edge('TB1', 'A'), s0: edge('TB1', 'B') }, connections('TB1')),
  'NO_TB_ORIENTATION', 'Q/S unrelated');
const consistent = { 'p-tb-near': edge('TB1', 'A'), 'q-tb-near': edge('TB1', 'B'),
  'p-tb-far': edge('TB2', 'A'), 'q-tb-far': edge('TB2', 'B') };
expect(resolveTBOrientationForPanelPair('P', 'Q', consistent, connections('TB1', 'TB2')),
  'FIRST_A_SECOND_B', 'two consistent TBs');
const contradictory = { ...consistent, 'p-tb-far': edge('TB2', 'B'), 'q-tb-far': edge('TB2', 'A') };
expect(resolveTBOrientationForPanelPair('P', 'Q', contradictory, connections('TB1', 'TB2')),
  'AMBIGUOUS_TB_ORIENTATION', 'two contradictory TBs');
expect(resolveTBOrientationForPanelPair('P', 'Q', { 'p-tb-near': edge('TB1', 'A') }, connections('TB1')),
  'NO_TB_ORIENTATION', 'incomplete A-only TB');
expect(resolveTBOrientationForPanelPair('P', 'Q', { 'p-tb-near': edge('TB1', 'A'), 'q-tb-near': edge('TB1', 'B'), r0: edge('TB1', 'A') }, connections('TB1')),
  'AMBIGUOUS_TB_ORIENTATION', 'malformed complete-looking TB');
expect(resolveTBOrientationForPanelPair('Q', 'P', consistent, connections('TB1', 'TB2')),
  'FIRST_B_SECOND_A', 'argument reversal');

const reversedWall = { 'p-wall': edge('W23', 'B'), 'q-wall': edge('W23', 'A'), ...consistent };
const orientation = resolveTBOrientationForPanelPair('P', 'Q', reversedWall, connections('TB1', 'TB2'));
assert(orientation === 'FIRST_A_SECOND_B', 'panel-pair vote must require P=A/Q=B');
const wouldSwap = authoredFor(reversedWall, 'W23').some((item) => item.panelId === 'P' && item.role === 'B');
assert(wouldSwap, 'reversed W23 must be detected independently of its connection number');

console.log('PASS B2.3A panel-pair oracle: no/one/unrelated/remote/multiple/incomplete/malformed/order cases');
console.log('PASS reversed W23 would swap only W roles; source location, segmentation, and W number are irrelevant');
