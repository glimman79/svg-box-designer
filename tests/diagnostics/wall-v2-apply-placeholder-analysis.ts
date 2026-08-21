/** B2.5 evidence only: demonstrates zero-assignment versus started trailing W. */
import { validateWallAuthoringForApply } from '../../src/app/wallAuthoring';
import { getBucketEdgeAssignment } from '../../src/app/assignmentBuckets';
import type { ConnectionMap } from '../../src/app/connectionTypes';
import type { EdgeAssignmentRecord, SvgDocumentModel, SvgPanel } from '../../src/svgUtils';

const assert: (value: unknown, message: string) => asserts value = (value, message) => { if (!value) throw new Error(message); };
const panel = (id: string, edgeIds: string[]): SvgPanel => ({ id, edgeIds, outerEdgeIds: edgeIds,
  contour: [], outerContour: [], innerContours: [], innerEdgeIds: [], bounds: { minX: 0, minY: 0, maxX: 1, maxY: 1 } });
const model = { panels: [panel('p', ['p1', 'p2', 'p3']), panel('q', ['q1', 'q2', 'q3'])], edges: [] } as unknown as SvgDocumentModel;
const edge = (connectionId: string, edgeRole: 'A' | 'B') => ({ edgeAssignment: { connectionId, edgeRole } });
const connections = Object.fromEntries(['W1', 'W2', 'W3'].map((id) => [id, { id, prefix: 'W', properties: {} }])) as ConnectionMap;
const complete: EdgeAssignmentRecord = { p1: edge('W1', 'A'), q1: edge('W1', 'B'), p2: edge('W2', 'A'), q2: edge('W2', 'B') };
const errorFor = (assignments: EdgeAssignmentRecord) => { try { validateWallAuthoringForApply(model, assignments, connections); }
  catch (error) { return (error as Error).message; } return null; };

assert(errorFor(complete)?.startsWith('W3 is incomplete:'), 'current Apply must fail specifically on empty W3');
assert(errorFor({ ...complete, p3: edge('W3', 'A') })?.startsWith('W3 is incomplete:'), 'started W3 must fail too');
const assignmentCount = (id: string, assignments: EdgeAssignmentRecord) => Object.values(assignments)
  .filter((bucket) => getBucketEdgeAssignment(bucket)?.connectionId === id).length;
const proposedBatch = Object.keys(connections).filter((id) => assignmentCount(id, complete) > 0);
assert(JSON.stringify(proposedBatch) === JSON.stringify(['W1', 'W2']), 'zero-assignment trailing W3 is excluded from proposed batch');
assert(assignmentCount('W3', { ...complete, p3: edge('W3', 'A') }) === 1, 'one-assignment W3 remains a started incomplete connection');
console.log('PASS current Apply validation enumerates empty W3 and reports it incomplete');
console.log('PASS proposed distinction ignores trailing zero-assignment W3 but retains one-assignment W3 as blocking');
