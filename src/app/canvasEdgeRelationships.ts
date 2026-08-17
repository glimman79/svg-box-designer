import type { EdgeAssignmentRecord, SvgDocumentModel } from '../svgUtils';
import { toEdgeAssignmentBucket } from './assignmentBuckets';
import type { ConnectionMap } from './connectionTypes';
import { auditGeneratedGeometryRelationships, buildGeometryRelationshipIndex } from './geometryRelationships';
import type { GeometryRelationship, GeometryRelationshipIndex, SourceRelationshipView } from './geometryRelationships';
import type { GeneratedGeometryItem } from './generatedGeometryTypes';

/** Stable UI key. Edge ids are local to a panel and must never be used alone. */
export const sourceEdgeRelationshipKey = (panelId: string, sourceEdgeId: string) => `${panelId}\u0000${sourceEdgeId}`;

export type CanvasEdgeRelationshipState = Readonly<{
  index: GeometryRelationshipIndex;
  bySource: ReadonlyMap<string, SourceRelationshipView>;
}>;

/** Generic, immutable canvas projection of the canonical relationship index. */
export const deriveCanvasEdgeRelationshipState = (relationships: ReadonlyArray<GeometryRelationship>): CanvasEdgeRelationshipState => {
  const index = buildGeometryRelationshipIndex(relationships);
  return Object.freeze({
    index,
    bySource: new Map(index.sources.map((view) => [sourceEdgeRelationshipKey(view.source.panelId, view.source.sourceEdgeId), view])),
  });
};

export const deriveGeneratedCanvasEdgeRelationshipState = (items: ReadonlyArray<GeneratedGeometryItem>): CanvasEdgeRelationshipState => {
  const audited = auditGeneratedGeometryRelationships(items);
  const state = deriveCanvasEdgeRelationshipState(audited.relationships);
  return Object.freeze({ ...state, index: buildGeometryRelationshipIndex(audited.relationships, audited.diagnostics) });
};

/** Authoring adapter only: translates current UI assignments into the same semantic claims consumed above. */
export const collectSourceEdgeAuthoringClaims = (
  svgModel: SvgDocumentModel,
  assignments: EdgeAssignmentRecord,
  connections: ConnectionMap,
): ReadonlyArray<GeometryRelationship> => {
  const panelByEdge = new Map(svgModel.panels.flatMap((panel) => panel.edgeIds.map((edgeId) => [edgeId, panel.id] as const)));
  const claims: GeometryRelationship[] = [];
  Object.entries(assignments).forEach(([sourceEdgeId, assignment]) => {
    const panelId = panelByEdge.get(sourceEdgeId);
    if (!panelId) return;
    const bucket = toEdgeAssignmentBucket(assignment);
    const edgeAssignment = bucket?.edgeAssignment;
    if (edgeAssignment && connections[edgeAssignment.connectionId]?.prefix === 'E') claims.push({
      kind: 'replaces', operationId: `operation:TB:${edgeAssignment.connectionId}`, panelId, sourceEdgeId,
      provenance: 'native-generator-intent', provenanceId: `authoring:TB:${edgeAssignment.connectionId}:${panelId}:${sourceEdgeId}`,
    });
    bucket?.slotAssignments?.forEach((slot) => {
      if (connections[slot.connectionId]?.prefix !== 'S') return;
      claims.push({
        kind: slot.slotRole === 'A' ? 'replaces' : 'references', operationId: `operation:S:${slot.connectionId}`, panelId, sourceEdgeId,
        provenance: 'native-generator-intent', provenanceId: `authoring:S:${slot.connectionId}:${slot.slotRole}:${panelId}:${sourceEdgeId}`,
      });
    });
  });
  return claims;
};
