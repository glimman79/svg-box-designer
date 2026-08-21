import { authorWallEdge, buildWallWorkflowGroups, finishWallGroupWithTrailingCleanup, startWallGroupWorkflow } from '../../src/app/wallWorkflow';
import { collectSourceEdgeAuthoringClaims } from '../../src/app/authoringRelationships';
import { getEdgeAssignmentDisplayLabels, type EdgeAssignmentRecord, type SvgDocumentModel } from '../../src/svgUtils';
import type { ConnectionMap } from '../../src/app/connectionTypes';
import { getBucketEdgeAssignment } from '../../src/app/assignmentBuckets';
const assert = Object.assign((value: unknown, message?: string): asserts value => { if (!value) throw new Error(message ?? 'assertion failed'); }, {
  equal: (a: unknown, b: unknown) => { if (a !== b) throw new Error(`${String(a)} !== ${String(b)}`); },
  deepEqual: (a: unknown, b: unknown) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${JSON.stringify(a)} !== ${JSON.stringify(b)}`); },
});

const panel = (id: string, edgeIds: string[]) => ({ id, pathId: id, edgeIds, contour: [], innerContours: [], bounds: { minX: 0, minY: 0, maxX: 1, maxY: 1 } });
const model = { panels: [panel('p', ['p0','p1','p2','p3','p4','p5','p6','p7']), panel('q', ['q0','q1','q2','q3','q4','q5','q6','q7'])], edges: [] } as unknown as SvgDocumentModel;
const edge = (connectionId: string, edgeRole: 'A'|'B') => ({ edgeAssignment: { connectionId, edgeRole } });
let connections: ConnectionMap = { TB1: { id: 'TB1', prefix: 'TB', properties: {} } as ConnectionMap[string] };
let assignments: EdgeAssignmentRecord = { p1: edge('TB1','A'), q1: edge('TB1','B') };
let started = startWallGroupWorkflow(connections); connections = started.connections;
let group = started.activeWallGroup; let current = started.selectedLabelId;
assert.equal(buildWallWorkflowGroups({}, null, [], {}).length, 0);
assert.deepEqual(buildWallWorkflowGroups(connections, group, [], { [group.groupId]: 2 })[0].labels, ['W1']);

// Reverse the first authored role exactly as the UI role selector permits before completing W1.
assignments = { ...assignments, p0: edge('W1', 'B') };
let result = authorWallEdge(model, assignments, connections, group, current, 'q0');
assignments = result.assignments; connections = result.connections; group = result.activeWallGroup; current = result.selectedLabelId;
assert.equal(getBucketEdgeAssignment(assignments.p0)?.edgeRole, 'A'); assert.equal(getBucketEdgeAssignment(assignments.q0)?.edgeRole, 'B');
assert.equal(getBucketEdgeAssignment(assignments.p1)?.edgeRole, 'A'); assert.equal(current, 'W2');

for (const [a,b,next] of [['p3','q3','W3'], ['p5','q5','W4']] as const) {
  result = authorWallEdge(model, assignments, connections, group, current, a);
  result = authorWallEdge(model, result.assignments, result.connections, result.activeWallGroup, result.selectedLabelId, b);
  assignments = result.assignments; connections = result.connections; group = result.activeWallGroup; current = result.selectedLabelId;
  assert.equal(current, next);
}
assert.deepEqual(group.connectionIds, ['W1','W2','W3','W4']);
assert.equal(buildWallWorkflowGroups(connections, group, [], {})[0].labels.length, 4);
for (const id of ['W1','W2','W3']) assert.equal(Object.values(assignments).filter(x => getBucketEdgeAssignment(x)?.connectionId === id).length, 2);
assert.equal(collectSourceEdgeAuthoringClaims(model, assignments, connections).filter(x => x.operationId.startsWith('operation:W:')).length, 6);
assert.equal(getEdgeAssignmentDisplayLabels(assignments.p0)[0], 'W1-A');
const finished = finishWallGroupWithTrailingCleanup(group, connections, assignments);
assert.equal(finished.activeWallGroup.isActive, false); assert.equal(finished.connections.W4, undefined);
assert.equal(buildWallWorkflowGroups(finished.connections, null, [finished.activeWallGroup], {})[0].labels.length, 3);
console.log('PASS production Wall command normalizes W1, advances W1/W2/W3 in one session, emits six REPLACES claims, labels canvas state, and cleans trailing W on Finish');
