/** Phase 3 diagnostic-only downstream simulation. Nothing returned here is an
 * authoritative snapshot and callers must not persist these temporary items. */
import { buildFinalGeometry } from './finalGeometry';
import type { FinalGeometry } from './finalGeometry';
import { assembleGeneratedGeometryDiagnostics } from './generatedGeometryAssembly';
import type { PanelAssemblyComparisonStatus } from './generatedGeometryAssembly';
import type { GeneratedGeometryItem } from './generatedGeometryTypes';
import { geometryRelationshipKey } from './geometryRelationships';
import type { PanelCandidate } from './panelComposer';
import { processManufacturingGeometry } from './manufacturingCompensation';
import type { ManufacturingGeometry } from './manufacturingCompensation';
import type { GeneratedProfileId } from './generatedProfiles';
import type { ProfileOffsetSelectionTargetId } from './profileOffsetSelection';
import { pointsMatch, pointsToClosedPathD } from './sharedGeometry';
import type { SvgDocumentModel } from '../svgUtils';

export type PanelDualRunClassification = 'SINGLE_TOOL_MATCH' | 'SINGLE_TOOL_MISMATCH' | 'MIXED_VALID' | 'MIXED_INVALID'
  | Exclude<PanelAssemblyComparisonStatus, 'MATCH' | 'MISMATCH' | 'MIXED_NO_LEGACY_ORACLE'>;

export type PanelDualRunResult = Readonly<{
  panelId: string; classification: PanelDualRunClassification; legacyEquivalence: 'PASS' | 'FAIL' | 'NOT_ORACLE' | 'BLOCKED';
  legacyOwners: ReadonlyArray<string>; composedOwners: ReadonlyArray<string>; legacyFinalGeometry: FinalGeometry;
  diagnosticFinalGeometry: FinalGeometry | null; legacyManufacturing: ManufacturingGeometry;
  diagnosticManufacturing: ManufacturingGeometry | null; finalGeometryEquivalent: boolean | null;
  manufacturingEquivalent: boolean | null;
}>;

const normalized = (value: unknown) => JSON.stringify(value);

/** Packages a candidate as an ephemeral GeneratedGeometryItem solely because
 * buildFinalGeometry's production API accepts generated items. Generator-owned
 * profiles/taps are transported unchanged; slots and all unrelated items stay
 * unchanged. The input array and its objects are never mutated. */
export const packageComposedPanelGeometry = (
  items: ReadonlyArray<GeneratedGeometryItem>, candidate: PanelCandidate,
  ownerOperationIds: ReadonlyArray<string>,
): ReadonlyArray<GeneratedGeometryItem> => {
  const { panelId, points } = candidate;
  const carriersById = new Map<string, GeneratedGeometryItem>();
  items.filter((item) => item.kind === 'PANEL_PATH' && item.behaviour.assembly === 'panel-boundary'
    && item.behaviour.replacesPanelId === panelId
    && !item.id.startsWith('composed:panel:') && !item.operationId.startsWith('composed:')
    && (item.generatedProfiles ?? []).some((profile) => profile.panelId === panelId
      && ownerOperationIds.includes(profile.operationId)))
    .forEach((item) => {
      const existing = carriersById.get(item.id);
      if (existing && normalized(existing) !== normalized(item)) {
        throw new Error(`Conflicting diagnostic packaging carrier ${item.id} for ${panelId}.`);
      }
      carriersById.set(item.id, item);
    });
  const owners = [...carriersById.values()].sort((a, b) => a.id.localeCompare(b.id));
  if (!owners.length) throw new Error(`No diagnostic packaging owners for ${panelId}.`);
  const uniqueMetadata = <T extends { id: string }>(values: ReadonlyArray<T>, kind: string): ReadonlyArray<T> => {
    const byId = new Map<string, T>();
    values.forEach((value) => {
      const existing = byId.get(value.id);
      if (existing && normalized(existing) !== normalized(value)) {
        throw new Error(`Conflicting ${kind} ${value.id} for ${panelId}.`);
      }
      byId.set(value.id, value);
    });
    return [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
  };
  const pathD = pointsToClosedPathD([...points]);
  const sourceRelationships = uniqueMetadata(owners.flatMap((item) => item.sourceRelationships ?? [])
    .map((relationship) => ({ ...relationship, id: geometryRelationshipKey(relationship) })), 'source relationship')
    .map(({ id: _id, ...relationship }) => relationship);
  const contributorCount = new Set(owners.flatMap((item) => (item.generatedProfiles ?? []).map((profile) => profile.generatorType))).size;
  const remapProfile = (profile: NonNullable<GeneratedGeometryItem['generatedProfiles']>[number]) => {
    // A projection describes a segment in the *current* contour, rather than an
    // immutable generator-local segment.  Composition may adjust a junction,
    // coalesce duplicate directed segments, or remove a zero-extent terminal
    // out-and-back pair.  Resolve through the candidate's stable profile/edge/
    // operation lineage and only transport projections which still have a
    // physical segment in the composed contour.
    const profileSegments = candidate.segments.filter((segment) => segment.profileId === profile.id
      && segment.operationId === profile.operationId && segment.sourceEdgeId === profile.sourceEdgeId);
    const geometryProjections = profile.geometryProjections.flatMap((projection) => {
      // FinalGeometry deliberately ignores a generator-authored zero-length
      // semantic element, so retaining it is both harmless and preserves the
      // single-contributor metadata contract.
      if (pointsMatch(projection.start, projection.end)) return [projection];
      const identityMatch = profileSegments.find((segment) => segment.projectionId === projection.id);
      const geometryMatches = identityMatch ? [] : profileSegments.filter((segment) =>
        pointsMatch(segment.start, projection.start) && pointsMatch(segment.end, projection.end));
      const segment = identityMatch ?? (geometryMatches.length === 1 ? geometryMatches[0] : undefined);
      if (!segment) return contributorCount > 1 ? [] : [projection];
      if (pointsMatch(projection.start, segment.start) && pointsMatch(projection.end, segment.end)) return [projection];
      return [{ ...projection, start: { ...segment.start }, end: { ...segment.end } }];
    });
    return { ...profile, geometryProjections };
  };
  const diagnostic: GeneratedGeometryItem = {
    ...owners[0], id: `composed:panel:${panelId}`, operationId: `composed:${panelId}`,
    source: { operationId: `composed:${panelId}`, connectionIds: [...new Set(owners.flatMap((item) => item.source.connectionIds))].sort(),
      edgeIds: [...new Set(owners.flatMap((item) => item.source.edgeIds))].sort(), panelIds: [panelId] },
    geometry: { ...owners[0].geometry, pathD }, pathD,
    profileGroups: uniqueMetadata(owners.flatMap((item) => item.profileGroups ?? []), 'profile group'),
    generatedProfiles: uniqueMetadata(owners.flatMap((item) => item.generatedProfiles ?? []), 'generated profile').map(remapProfile),
    generatedTaps: uniqueMetadata(owners.flatMap((item) => item.generatedTaps ?? []), 'generated tap'),
    sourceRelationships,
    diagnostics: [],
  };
  return [...items.filter((item) => !(item.kind === 'PANEL_PATH' && item.behaviour.replacesPanelId === panelId)), diagnostic]
    .sort((a, b) => a.id.localeCompare(b.id));
};

/** Backwards-compatible Phase 3 name; authority and diagnostics intentionally share packaging. */
export const createDiagnosticGeneratedGeometry = packageComposedPanelGeometry;

export const runGeneratedGeometryDualRun = (svgModel: SvgDocumentModel, items: ReadonlyArray<GeneratedGeometryItem>,
  kerfMm = 0.12, slotClearanceMm = 0.08, profileOffsetMm = 0.04,
  selectedIds: ReadonlyArray<ProfileOffsetSelectionTargetId | GeneratedProfileId> = [], tapClearanceMm = 0.06,
): ReadonlyArray<PanelDualRunResult> => {
  const assembly = assembleGeneratedGeometryDiagnostics(svgModel, items);
  const legacyFinalGeometry = buildFinalGeometry(svgModel, items);
  const legacyManufacturing = processManufacturingGeometry(legacyFinalGeometry, kerfMm, slotClearanceMm, profileOffsetMm, selectedIds, tapClearanceMm);
  return assembly.panelDiagnostics.map((diagnostic): PanelDualRunResult => {
    const candidate = assembly.panelCandidates.find((value) => value.panelId === diagnostic.panelId);
    const blocked = diagnostic.status.startsWith('BLOCKED_');
    if (!candidate || blocked) return { panelId: diagnostic.panelId, classification: diagnostic.status as PanelDualRunClassification,
      legacyEquivalence: 'BLOCKED', legacyOwners: assembly.legacyWinners.filter((x) => x.panelId === diagnostic.panelId).map((x) => x.winningOperationId),
      composedOwners: diagnostic.replacementOperationIds, legacyFinalGeometry, diagnosticFinalGeometry: null, legacyManufacturing,
      diagnosticManufacturing: null, finalGeometryEquivalent: null, manufacturingEquivalent: null };
    const temporary = createDiagnosticGeneratedGeometry(items, candidate, diagnostic.replacementOperationIds);
    const diagnosticFinalGeometry = buildFinalGeometry(svgModel, temporary);
    const diagnosticManufacturing = processManufacturingGeometry(diagnosticFinalGeometry, kerfMm, slotClearanceMm, profileOffsetMm, selectedIds, tapClearanceMm);
    const mixed = diagnostic.status === 'MIXED_NO_LEGACY_ORACLE';
    const finalGeometryEquivalent = mixed ? null : normalized(legacyFinalGeometry) === normalized(diagnosticFinalGeometry);
    const manufacturingEquivalent = mixed ? null : normalized(legacyManufacturing) === normalized(diagnosticManufacturing);
    const valid = !diagnosticFinalGeometry.diagnostics.some((entry) => entry.severity === 'error')
      && diagnosticManufacturing.contours.length > 0;
    return { panelId: diagnostic.panelId,
      classification: mixed ? (valid ? 'MIXED_VALID' : 'MIXED_INVALID') : finalGeometryEquivalent && manufacturingEquivalent ? 'SINGLE_TOOL_MATCH' : 'SINGLE_TOOL_MISMATCH',
      legacyEquivalence: mixed ? 'NOT_ORACLE' : finalGeometryEquivalent && manufacturingEquivalent ? 'PASS' : 'FAIL',
      legacyOwners: assembly.legacyWinners.filter((x) => x.panelId === diagnostic.panelId).map((x) => x.winningOperationId),
      composedOwners: diagnostic.replacementOperationIds, legacyFinalGeometry, diagnosticFinalGeometry, legacyManufacturing,
      diagnosticManufacturing, finalGeometryEquivalent, manufacturingEquivalent };
  });
};
