import { collectSourceEdgeAuthoringClaims, validateSourceEdgeReplacementClaims } from '../../src/app/authoringRelationships';
import { deriveCanvasEdgeRelationshipState, sourceEdgeRelationshipKey } from '../../src/app/canvasEdgeRelationships';
import type { SourceEdgeAuthoringClaim } from '../../src/app/authoringRelationships';

const assert: (value: unknown, message: string) => asserts value = (value, message) => { if (!value) throw new Error(message); };
const equal = (actual: unknown, expected: unknown, message: string) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${message}: ${JSON.stringify(actual)} !== ${JSON.stringify(expected)}`);
};
const contour = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];
const edgeIds = contour.map((_, index) => `edge-${index}`);
const model: any = { panels: [{ id: 'P', contour, outerContour: contour, innerContours: [], edgeIds, outerEdgeIds: edgeIds,
  innerEdgeIds: [], bounds: { minX: 0, minY: 0, maxX: 10, maxY: 10 } }] };
const connectionEntries: Array<[string, any]> = [
  ['TB1', { id: 'TB1', prefix: 'TB', properties: {} }],
  ['TB2', { id: 'TB2', prefix: 'TB', properties: {} }],
  ['S1', { id: 'S1', prefix: 'S', properties: {} }],
  ['S2', { id: 'S2', prefix: 'S', properties: {} }],
  ['S3', { id: 'S3', prefix: 'S', properties: {} }],
];
const connections = Object.fromEntries(connectionEntries);
const assignments: any = {
  'edge-0': { edgeAssignment: { connectionId: 'TB1', edgeRole: 'A' }, slotAssignments: [
    { connectionId: 'S3', slotRole: 'B' }, { connectionId: 'S1', slotRole: 'B' }, { connectionId: 'S2', slotRole: 'B' },
  ] },
  'edge-1': { slotAssignments: [{ connectionId: 'S1', slotRole: 'A' }] },
};

const claims = collectSourceEdgeAuthoringClaims(model, assignments, connections);
const tb = claims.find((value) => value.connectionId === 'TB1');
assert(tb?.kind === 'replaces' && tb.operationId === 'operation:TB:TB1' && tb.contributorId === 'TB'
  && tb.panelId === 'P' && tb.sourceEdgeId === 'edge-0' && tb.assignmentRole === 'A', 'TB canonical claim changed');
const sA = claims.find((value) => value.connectionId === 'S1' && value.assignmentRole === 'A');
assert(sA?.kind === 'replaces' && sA.operationId === 'operation:S:S1' && sA.contributorId === 'S'
  && sA.panelId === 'P' && sA.sourceEdgeId === 'edge-1', 'S-A canonical claim changed');
const references = claims.filter((value) => value.kind === 'references');
assert(references.length === 3 && references.every((value) => value.panelId === 'P' && value.sourceEdgeId === 'edge-0'
  && value.contributorId === 'S' && value.assignmentRole === 'B'), 'three S-B claims were not retained');
validateSourceEdgeReplacementClaims(claims);

const reversedAssignments = Object.fromEntries(Object.entries(assignments).reverse().map(([edgeId, bucket]: [string, any]) =>
  [edgeId, bucket.slotAssignments ? { ...bucket, slotAssignments: [...bucket.slotAssignments].reverse() } : bucket]));
equal(collectSourceEdgeAuthoringClaims(model, reversedAssignments, connections), claims, 'assignment ordering changed canonical output');
equal(collectSourceEdgeAuthoringClaims(model, assignments, Object.fromEntries([...connectionEntries].reverse())), claims,
  'connection ordering changed canonical output');

const canvas = deriveCanvasEdgeRelationshipState(claims);
const shared = canvas.bySource.get(sourceEdgeRelationshipKey('P', 'edge-0'));
assert(shared?.replacementOwner === 'operation:TB:TB1' && shared.references.length === 3
  && canvas.index.diagnostics.length === 0, 'canvas did not project canonical mixed claims');

const manualClaim = (operationId: string, contributorId: string): SourceEdgeAuthoringClaim => ({
  kind: 'replaces', operationId, contributorId, connectionId: operationId, assignmentRole: 'A', panelId: 'P', sourceEdgeId: 'edge-0',
  provenance: 'native-generator-intent', provenanceId: operationId,
});
const expectConflict = (values: ReadonlyArray<SourceEdgeAuthoringClaim>, label: string) => {
  let diagnostic = '';
  try { validateSourceEdgeReplacementClaims(values); } catch (error) { diagnostic = error instanceof Error ? error.message : ''; }
  assert(diagnostic.includes(values[0].operationId) && diagnostic.includes(values[1].operationId), `${label} did not fail closed deterministically`);
};
expectConflict([tb!, { ...sA!, panelId: 'P', sourceEdgeId: 'edge-0' }], 'TB/S-A conflict');
expectConflict([manualClaim('operation:TB:TB1', 'TB'), manualClaim('operation:TB:TB2', 'TB')], 'TB/TB conflict');
expectConflict([manualClaim('operation:S:S1', 'S'), manualClaim('operation:S:S2', 'S')], 'S-A/S-A conflict');

console.log('canonical authored relationships: mappings=PASS references=PASS conflicts=PASS ordering=PASS canvas=PASS');
