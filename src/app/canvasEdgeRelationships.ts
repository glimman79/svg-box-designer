export { collectSourceEdgeAuthoringClaims } from './authoringRelationships';
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
