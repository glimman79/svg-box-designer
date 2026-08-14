import type { GeneratedGeometryItem, GeneratedGeometryKind } from './generatedGeometryTypes';

export type GeometryRelationshipKind = 'replaces' | 'references' | 'creates';
export type RelationshipProvenance = 'native-generated-profile' | 'native-generator-intent' | 'native-generated-feature';

export type SourceGeometryKey = Readonly<{ panelId: string; sourceEdgeId: string }>;
export type GeneratedFeatureKey = Readonly<{ featureId: string; panelId: string; kind: GeneratedGeometryKind }>;

export type SourceGeometryRelationship = Readonly<{
  kind: Extract<GeometryRelationshipKind, 'replaces' | 'references'>;
  operationId: string;
  panelId: string;
  sourceEdgeId: string;
  provenance: RelationshipProvenance;
  provenanceId: string;
}>;

export type CreationGeometryRelationship = Readonly<{
  kind: 'creates';
  operationId: string;
  featureId: string;
  panelId: string;
  featureKind: GeneratedGeometryKind;
  provenance: RelationshipProvenance;
  provenanceId: string;
}>;

export type GeometryRelationship = SourceGeometryRelationship | CreationGeometryRelationship;
export type RelationshipDiagnostic = Readonly<{
  kind: 'replacement-conflict' | 'duplicate-provenance-disagreement' | 'insufficient-provenance';
  key: string;
  operationIds: ReadonlyArray<string>;
  message: string;
}>;

export type OperationRelationshipView = Readonly<{
  operationId: string;
  replaces: ReadonlyArray<SourceGeometryKey>;
  references: ReadonlyArray<SourceGeometryKey>;
  creates: ReadonlyArray<GeneratedFeatureKey>;
}>;
export type SourceRelationshipView = Readonly<{
  source: SourceGeometryKey;
  replacementOwner: string | null;
  replacementClaimants: ReadonlyArray<string>;
  references: ReadonlyArray<string>;
}>;
export type FeatureRelationshipView = Readonly<{ feature: GeneratedFeatureKey; creator: string }>;
export type GeometryRelationshipIndex = Readonly<{
  relationships: ReadonlyArray<GeometryRelationship>;
  diagnostics: ReadonlyArray<RelationshipDiagnostic>;
  operations: ReadonlyArray<OperationRelationshipView>;
  sources: ReadonlyArray<SourceRelationshipView>;
  features: ReadonlyArray<FeatureRelationshipView>;
}>;

const sourceKey = ({ panelId, sourceEdgeId }: SourceGeometryKey) => `${panelId}\u0000${sourceEdgeId}`;
const featureKey = ({ featureId, panelId, kind }: GeneratedFeatureKey) => `${panelId}\u0000${kind}\u0000${featureId}`;
const relationshipKey = (relationship: GeometryRelationship) => relationship.kind === 'creates'
  ? `creates\u0000${relationship.operationId}\u0000${featureKey({ featureId: relationship.featureId, panelId: relationship.panelId, kind: relationship.featureKind })}`
  : `${relationship.kind}\u0000${relationship.operationId}\u0000${sourceKey(relationship)}`;
const compare = (a: string, b: string) => a.localeCompare(b);
const freezeList = <T>(values: T[]): ReadonlyArray<T> => Object.freeze(values.map((value) => Object.freeze(value)));

/** Normalizes semantic claims only. It neither resolves conflicts nor participates in contour assembly. */
export const buildGeometryRelationshipIndex = (input: ReadonlyArray<GeometryRelationship>, initialDiagnostics: ReadonlyArray<RelationshipDiagnostic> = []): GeometryRelationshipIndex => {
  const ordered = [...input].sort((a, b) => compare(relationshipKey(a), relationshipKey(b)) || compare(a.provenance, b.provenance) || compare(a.provenanceId, b.provenanceId));
  const unique = new Map<string, GeometryRelationship>();
  const diagnostics: RelationshipDiagnostic[] = [...initialDiagnostics];
  ordered.forEach((relationship) => {
    const key = relationshipKey(relationship);
    const prior = unique.get(key);
    if (!prior) unique.set(key, relationship);
    else if (prior.provenance !== relationship.provenance || prior.provenanceId !== relationship.provenanceId) diagnostics.push({
      kind: 'duplicate-provenance-disagreement', key, operationIds: [relationship.operationId],
      message: `Duplicate ${relationship.kind} claim has differing provenance (${prior.provenanceId}, ${relationship.provenanceId}).`,
    });
  });
  const relationships = [...unique.values()];
  const sourceClaims = new Map<string, { source: SourceGeometryKey; replacements: Set<string>; references: Set<string> }>();
  const operationClaims = new Map<string, { replaces: Map<string, SourceGeometryKey>; references: Map<string, SourceGeometryKey>; creates: Map<string, GeneratedFeatureKey> }>();
  const features = new Map<string, FeatureRelationshipView>();
  relationships.forEach((relationship) => {
    const operation = operationClaims.get(relationship.operationId) ?? { replaces: new Map(), references: new Map(), creates: new Map() };
    operationClaims.set(relationship.operationId, operation);
    if (relationship.kind === 'creates') {
      const feature = { featureId: relationship.featureId, panelId: relationship.panelId, kind: relationship.featureKind };
      operation.creates.set(featureKey(feature), feature);
      features.set(featureKey(feature), { feature, creator: relationship.operationId });
      return;
    }
    const source = { panelId: relationship.panelId, sourceEdgeId: relationship.sourceEdgeId };
    const key = sourceKey(source);
    const claims = sourceClaims.get(key) ?? { source, replacements: new Set(), references: new Set() };
    sourceClaims.set(key, claims);
    if (relationship.kind === 'replaces') { claims.replacements.add(relationship.operationId); operation.replaces.set(key, source); }
    else { claims.references.add(relationship.operationId); operation.references.set(key, source); }
  });
  sourceClaims.forEach((claims, key) => {
    const operationIds = [...claims.replacements].sort(compare);
    if (operationIds.length > 1) diagnostics.push({ kind: 'replacement-conflict', key, operationIds,
      message: `${claims.source.panelId} / ${claims.source.sourceEdgeId} is replaced by multiple operations: ${operationIds.join(', ')}.` });
  });
  diagnostics.sort((a, b) => compare(`${a.kind}\u0000${a.key}\u0000${a.operationIds.join('\u0000')}`, `${b.kind}\u0000${b.key}\u0000${b.operationIds.join('\u0000')}`));
  const operations = [...operationClaims].sort(([a], [b]) => compare(a, b)).map(([operationId, value]) => ({ operationId,
    replaces: freezeList([...value.replaces].sort(([a], [b]) => compare(a, b)).map(([, key]) => key)),
    references: freezeList([...value.references].sort(([a], [b]) => compare(a, b)).map(([, key]) => key)),
    creates: freezeList([...value.creates].sort(([a], [b]) => compare(a, b)).map(([, key]) => key)),
  }));
  const sources = [...sourceClaims].sort(([a], [b]) => compare(a, b)).map(([, value]) => {
    const replacementClaimants = [...value.replacements].sort(compare);
    return { source: Object.freeze(value.source), replacementOwner: replacementClaimants.length === 1 ? replacementClaimants[0] : null,
      replacementClaimants: Object.freeze(replacementClaimants), references: Object.freeze([...value.references].sort(compare)) };
  });
  return Object.freeze({ relationships: freezeList(relationships), diagnostics: freezeList(diagnostics), operations: freezeList(operations), sources: freezeList(sources), features: freezeList([...features].sort(([a], [b]) => compare(a, b)).map(([, value]) => value)) });
};

/** Audits native generated output. Legacy items without edge-local profiles remain explicitly unresolved. */
export const auditGeneratedGeometryRelationships = (items: ReadonlyArray<GeneratedGeometryItem>): GeometryRelationshipIndex => {
  const relationships: GeometryRelationship[] = [];
  const diagnostics: RelationshipDiagnostic[] = [];
  items.forEach((item) => {
    (item.generatedProfiles ?? []).forEach((profile) => relationships.push({ kind: 'replaces', operationId: profile.operationId,
      panelId: profile.panelId, sourceEdgeId: profile.sourceEdgeId, provenance: 'native-generated-profile', provenanceId: profile.id }));
    relationships.push(...(item.sourceRelationships ?? []));
    if (item.kind === 'SLOT_PATH' && item.behaviour.assembly === 'slot-cutout') relationships.push({ kind: 'creates', operationId: item.operationId,
      featureId: item.id, panelId: item.behaviour.ownerPanelId ?? '', featureKind: item.kind, provenance: 'native-generated-feature', provenanceId: item.id });
    if (item.kind === 'PANEL_PATH' && (item.profileGroups?.length ?? 0) > 0 && (item.generatedProfiles?.length ?? 0) === 0) diagnostics.push({
      kind: 'insufficient-provenance', key: item.id, operationIds: [], message: `Generated item ${item.id} has compatibility profile groups but no native GeneratedProfile provenance.`,
    });
  });
  return buildGeometryRelationshipIndex(relationships, diagnostics);
};
