import { getBucketEdgeAssignment, getBucketSlotAssignments } from './assignmentBuckets';
import type { ConnectionMap } from './connectionTypes';
import type { GeometryRelationshipKind, SourceGeometryRelationship } from './geometryRelationships';
import { buildGeometryRelationshipIndex } from './geometryRelationships';
import type { PanelCompositionAuthorityMode } from './generatedGeometryAuthority';
import type { EdgeAssignmentRecord, EdgeRole, SlotRole, SvgDocumentModel } from '../svgUtils';

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
    if (edgeAssignment && connections[edgeAssignment.connectionId]?.prefix === 'TB') {
      const operationId = `operation:TB:${edgeAssignment.connectionId}`;
      claims.push(claim('replaces', operationId, 'TB', edgeAssignment.connectionId, edgeAssignment.edgeRole, panelId, sourceEdgeId));
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
export const validateSourceEdgeReplacementClaims = (claims: ReadonlyArray<SourceEdgeAuthoringClaim>): void => {
  const index = buildGeometryRelationshipIndex(claims);
  const conflict = index.diagnostics.find((diagnostic) => diagnostic.kind === 'replacement-conflict');
  if (!conflict) return;
  const source = index.sources.find((view) => view.replacementClaimants.length > 1
    && view.replacementClaimants.every((operationId) => conflict.operationIds.includes(operationId)));
  throw new Error(`Source edge ${source?.source.sourceEdgeId ?? conflict.key} on panel ${source?.source.panelId ?? 'unknown'} already has replacement operations: ${conflict.operationIds.join(', ')}.`);
};

/** Migration eligibility is separate from semantic ownership validity and has no tool-pair policy. */
export const validateAuthorityModeForAuthoringClaims = (claims: ReadonlyArray<SourceEdgeAuthoringClaim>,
  mode: PanelCompositionAuthorityMode): void => {
  if (mode === 'mixed') return;
  const contributorsByPanel = new Map<string, Set<string>>();
  claims.filter((value) => value.kind === 'replaces').forEach((value) => {
    const contributors = contributorsByPanel.get(value.panelId) ?? new Set<string>();
    contributors.add(value.contributorId); contributorsByPanel.set(value.panelId, contributors);
  });
  const mixedPanel = [...contributorsByPanel].find(([, contributors]) => contributors.size > 1);
  if (mixedPanel) throw new Error(`Panel ${mixedPanel[0]} uses multiple replacement contributors; mixed panel composition requires mixed authority mode.`);
};

export const validateGeometryAuthoring = (model: SvgDocumentModel, assignments: EdgeAssignmentRecord,
  connections: ConnectionMap, mode: PanelCompositionAuthorityMode): ReadonlyArray<SourceEdgeAuthoringClaim> => {
  const claims = collectSourceEdgeAuthoringClaims(model, assignments, connections);
  validateSourceEdgeReplacementClaims(claims);
  validateAuthorityModeForAuthoringClaims(claims, mode);
  return claims;
};
