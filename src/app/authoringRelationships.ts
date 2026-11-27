import { getBucketEdgeAssignment, getBucketSlotAssignments } from './assignmentBuckets';
import type { ConnectionMap } from './connectionTypes';
import type { GeometryRelationshipKind, SourceGeometryRelationship } from './geometryRelationships';
import { buildGeometryRelationshipIndex } from './geometryRelationships';
import type { PanelCompositionAuthorityMode } from './generatedGeometryAuthority';
import type { EdgeAssignmentRecord, EdgeRole, SlotRole, SvgDocumentModel } from '../svgUtils';
import { GeometryDependencyError } from './geometryDependencyError';

const rejectAuthoring = (error: GeometryDependencyError): void => { throw error; };

export type SourceEdgeAuthoringClaim = SourceGeometryRelationship & Readonly<{
  contributorId: string;
  connectionId: string;
  assignmentRole: EdgeRole | SlotRole | undefined;
}>;

const claim = (kind: Extract<GeometryRelationshipKind, 'replaces' | 'references'>, operationId: string,
  contributorId: string, connectionId: string, assignmentRole: EdgeRole | SlotRole | undefined,
  panelId: string, sourceEdgeId: string): SourceEdgeAuthoringClaim => ({
  kind, operationId, contributorId, connectionId, assignmentRole, panelId, sourceEdgeId,
  provenance: 'native-generator-intent', provenanceId: `${operationId}:${kind}:${panelId}:${sourceEdgeId}`,
});

const compareClaims = (a: SourceEdgeAuthoringClaim, b: SourceEdgeAuthoringClaim) =>
  `${a.panelId}\u0000${a.sourceEdgeId}\u0000${a.operationId}\u0000${a.kind}\u0000${a.assignmentRole ?? ''}`
    .localeCompare(`${b.panelId}\u0000${b.sourceEdgeId}\u0000${b.operationId}\u0000${b.kind}\u0000${b.assignmentRole ?? ''}`);

/** Adapts current authoring records to the same semantic claims emitted by native generators. */
export const collectSourceEdgeAuthoringClaims = (model: SvgDocumentModel, assignments: EdgeAssignmentRecord,
  connections: ConnectionMap): ReadonlyArray<SourceEdgeAuthoringClaim> => {
  const panelByEdge = new Map(model.panels.flatMap((panel) => panel.edgeIds.map((edgeId) => [edgeId, panel.id] as const)));
  const claims: SourceEdgeAuthoringClaim[] = [];
  Object.entries(assignments).forEach(([sourceEdgeId, bucket]) => {
    const panelId = panelByEdge.get(sourceEdgeId);
    if (!panelId) return;
    const edgeAssignment = getBucketEdgeAssignment(bucket);
    if (edgeAssignment && ['TB', 'W'].includes(connections[edgeAssignment.connectionId]?.prefix ?? '')) {
      const contributorId = connections[edgeAssignment.connectionId].prefix as 'TB' | 'W';
      const operationId = `operation:${contributorId}:${edgeAssignment.connectionId}`;
      claims.push(claim('replaces', operationId, contributorId, edgeAssignment.connectionId, edgeAssignment.edgeRole, panelId, sourceEdgeId));
    }
    getBucketSlotAssignments(bucket).forEach((assignment) => {
      if (connections[assignment.connectionId]?.prefix !== 'S') return;
      const operationId = `operation:S:${assignment.connectionId}`;
      claims.push(claim(assignment.slotRole === 'A' ? 'replaces' : 'references', operationId, 'S',
        assignment.connectionId, assignment.slotRole, panelId, sourceEdgeId));
    });
  });
  return Object.freeze(claims.sort(compareClaims).map((value) => Object.freeze(value)));
};

/** Generic exclusive-REPLACES validation, keyed only by stable panel and source-edge identity. */
export const validateSourceEdgeReplacementClaims = (claims: ReadonlyArray<SourceEdgeAuthoringClaim>,
  onFailure = rejectAuthoring): void => {
  const connectionByOperation = new Map(claims.map(claim => [claim.operationId, claim.connectionId]));
  for (const { source, replacementClaimants } of buildGeometryRelationshipIndex(claims).sources) {
    if (replacementClaimants.length < 2) continue;
    const connectionIds = replacementClaimants.map(id => connectionByOperation.get(id)!);
    onFailure(new GeometryDependencyError(connectionIds,
      `Source edge ${source.sourceEdgeId} on panel ${source.panelId} already has replacement operations: ${replacementClaimants.join(', ')}.`));
  }
};

/** Migration eligibility is separate from semantic ownership validity and has no tool-pair policy. */
export const validateAuthorityModeForAuthoringClaims = (claims: ReadonlyArray<SourceEdgeAuthoringClaim>,
  mode: PanelCompositionAuthorityMode, onFailure = rejectAuthoring): void => {
  if (mode === 'mixed') return;
  const byPanel = new Map<string, SourceEdgeAuthoringClaim[]>();
  for (const value of claims.filter(claim => claim.kind === 'replaces')) {
    const replacements = byPanel.get(value.panelId) ?? [];
    replacements.push(value);
    byPanel.set(value.panelId, replacements);
  }
  for (const [panelId, replacements] of byPanel) {
    if (new Set(replacements.map(value => value.contributorId)).size < 2) continue;
    onFailure(new GeometryDependencyError([...new Set(replacements.map(value => value.connectionId))],
      `Panel ${panelId} uses multiple replacement contributors; mixed panel composition requires mixed authority mode.`));
  }
};

export const validateGeometryAuthoring = (model: SvgDocumentModel, assignments: EdgeAssignmentRecord,
  connections: ConnectionMap, mode: PanelCompositionAuthorityMode): ReadonlyArray<SourceEdgeAuthoringClaim> => {
  const claims = collectSourceEdgeAuthoringClaims(model, assignments, connections);
  validateSourceEdgeReplacementClaims(claims);
  validateAuthorityModeForAuthoringClaims(claims, mode);
  return claims;
};
