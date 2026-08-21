/**
 * B2.4 production-path regression matrix for the locked panel-pair contract.
 */
import { getWallAssignments, normalizeWallConnection, resolveTBOrientationForPanelPair } from '../../src/app/wallAuthoring';
import type { ConnectionMap } from '../../src/app/connectionTypes';
import type { EdgeAssignmentRecord, SvgDocumentModel, SvgPanel } from '../../src/svgUtils';

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

const connections = (...ids: string[]): ConnectionMap => Object.fromEntries([
  ['W23', definition('W23', 'W')], ...ids.map((id) => [id, definition(id, 'TB')] as const),
]);
const expect = (actual: ReturnType<typeof resolveTBOrientationForPanelPair>, expected: ReturnType<typeof resolveTBOrientationForPanelPair>, name: string) =>
  assert(actual === expected, `${name}: expected ${expected}, received ${actual}`);

expect(resolveTBOrientationForPanelPair('P', 'Q', {}, connections(), model), 'NO_TB_ORIENTATION', 'no TB');
expect(resolveTBOrientationForPanelPair('P', 'Q', { 'p-tb-near': edge('TB1', 'A'), 'q-tb-near': edge('TB1', 'B') }, connections('TB1'), model),
  'FIRST_A_SECOND_B', 'P=A/Q=B');
expect(resolveTBOrientationForPanelPair('P', 'Q', { 'p-tb-near': edge('TB1', 'B'), 'q-tb-near': edge('TB1', 'A') }, connections('TB1'), model),
  'FIRST_B_SECOND_A', 'P=B/Q=A');
expect(resolveTBOrientationForPanelPair('P', 'Q', { 'p-tb-far': edge('TB1', 'A'), 'q-tb-far': edge('TB1', 'B') }, connections('TB1'), model),
  'FIRST_A_SECOND_B', 'same panels at remote source edges');
expect(resolveTBOrientationForPanelPair('P', 'Q', { 'p-tb-near': edge('TB1', 'A'), r0: edge('TB1', 'B') }, connections('TB1'), model),
  'NO_TB_ORIENTATION', 'P/R unrelated');
expect(resolveTBOrientationForPanelPair('P', 'Q', { 'q-tb-near': edge('TB1', 'A'), s0: edge('TB1', 'B') }, connections('TB1'), model),
  'NO_TB_ORIENTATION', 'Q/S unrelated');
const consistent = { 'p-tb-near': edge('TB1', 'A'), 'q-tb-near': edge('TB1', 'B'),
  'p-tb-far': edge('TB2', 'A'), 'q-tb-far': edge('TB2', 'B') };
expect(resolveTBOrientationForPanelPair('P', 'Q', consistent, connections('TB1', 'TB2'), model),
  'FIRST_A_SECOND_B', 'two consistent TBs');
const contradictory = { ...consistent, 'p-tb-far': edge('TB2', 'B'), 'q-tb-far': edge('TB2', 'A') };
expect(resolveTBOrientationForPanelPair('P', 'Q', contradictory, connections('TB1', 'TB2'), model),
  'AMBIGUOUS_TB_ORIENTATION', 'two contradictory TBs');
expect(resolveTBOrientationForPanelPair('P', 'Q', { 'p-tb-near': edge('TB1', 'A') }, connections('TB1'), model),
  'NO_TB_ORIENTATION', 'incomplete A-only TB');
expect(resolveTBOrientationForPanelPair('P', 'Q', { 'p-tb-near': edge('TB1', 'A'), 'q-tb-near': edge('TB1', 'B'), r0: edge('TB1', 'A') }, connections('TB1'), model),
  'AMBIGUOUS_TB_ORIENTATION', 'malformed complete-looking TB');
expect(resolveTBOrientationForPanelPair('Q', 'P', consistent, connections('TB1', 'TB2'), model),
  'FIRST_B_SECOND_A', 'argument reversal');

const roleOn = (assignments: EdgeAssignmentRecord, panelId: string) =>
  getWallAssignments(model, assignments, 'W23').find((item) => item.panelId === panelId)?.role;
const normalizedRoles = (pRole: 'A' | 'B', qRole: 'A' | 'B', tbRoles?: ['A' | 'B', 'A' | 'B']) => {
  const authored: EdgeAssignmentRecord = { 'p-wall': edge('W23', pRole), 'q-wall': edge('W23', qRole) };
  const ids: string[] = [];
  if (tbRoles) {
    authored['p-tb-near'] = edge('TB1', tbRoles[0]); authored['q-tb-near'] = edge('TB1', tbRoles[1]);
    ids.push('TB1');
  }
  const result = normalizeWallConnection(model, authored, connections(...ids), 'W23');
  return [roleOn(result, 'P'), roleOn(result, 'Q')].join('/');
};
assert(normalizedRoles('A', 'B') === 'A/B', 'A: no TB preserves P=A/Q=B');
assert(normalizedRoles('B', 'A') === 'B/A', 'B: no TB preserves P=B/Q=A');
assert(normalizedRoles('A', 'B', ['A', 'B']) === 'A/B', 'C: matching P=A/Q=B is unchanged');
assert(normalizedRoles('B', 'A', ['A', 'B']) === 'A/B', 'D: reversed W follows TB P=A/Q=B');
assert(normalizedRoles('B', 'A', ['B', 'A']) === 'B/A', 'E: matching P=B/Q=A is unchanged');
assert(normalizedRoles('A', 'B', ['B', 'A']) === 'B/A', 'F: reversed W follows TB P=B/Q=A');

const reversedWall = { 'p-wall': edge('W23', 'B'), 'q-wall': edge('W23', 'A'), ...consistent };
const orientation = resolveTBOrientationForPanelPair('P', 'Q', reversedWall, connections('TB1', 'TB2'), model);
assert(orientation === 'FIRST_A_SECOND_B', 'panel-pair vote must require P=A/Q=B');
const normalized = normalizeWallConnection(model, reversedWall, connections('TB1', 'TB2'), 'W23');
assert(getWallAssignments(model, normalized, 'W23').find((item) => item.panelId === 'P')?.role === 'A',
  'reversed W23 must normalize independently of its connection number');

console.log('PASS B2.4 production panel-pair resolver: no/one/unrelated/remote/multiple/incomplete/malformed/order cases');
console.log('PASS reversed W23 swaps only W roles; source location, segmentation, and W number are irrelevant');
