/** Phase 3 diagnostic-only downstream simulation. Nothing returned here is an
 * authoritative snapshot and callers must not persist these temporary items. */
import { buildFinalGeometry } from './finalGeometry';
import type { FinalGeometry } from './finalGeometry';
import { assembleGeneratedGeometryDiagnostics } from './generatedGeometryAssembly';
import type { PanelAssemblyComparisonStatus } from './generatedGeometryAssembly';
import type { GeneratedGeometryItem } from './generatedGeometryTypes';
import type { PanelCandidate } from './panelComposer';
import { processManufacturingGeometry } from './manufacturingCompensation';
import type { ManufacturingGeometry } from './manufacturingCompensation';
import type { GeneratedProfileId } from './generatedProfiles';
import type { ProfileOffsetSelectionTargetId } from './profileOffsetSelection';
import { pointsToClosedPathD } from './sharedGeometry';
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
export const createDiagnosticGeneratedGeometry = (
  items: ReadonlyArray<GeneratedGeometryItem>, candidate: PanelCandidate,
  ownerOperationIds: ReadonlyArray<string>,
): ReadonlyArray<GeneratedGeometryItem> => {
  const { panelId, points } = candidate;
  const owners = items.filter((item) => item.kind === 'PANEL_PATH' && item.behaviour.replacesPanelId === panelId
    && ownerOperationIds.includes(item.operationId)).sort((a, b) => a.id.localeCompare(b.id));
  if (!owners.length) throw new Error(`No diagnostic packaging owners for ${panelId}.`);
  const pathD = pointsToClosedPathD([...points]);
  const diagnostic: GeneratedGeometryItem = {
    ...owners[0], id: `diagnostic:composed-panel:${panelId}`, operationId: `diagnostic:composed:${panelId}`,
    source: { operationId: `diagnostic:composed:${panelId}`, connectionIds: owners.flatMap((item) => item.source.connectionIds),
      edgeIds: [...new Set(owners.flatMap((item) => item.source.edgeIds))], panelIds: [panelId] },
    geometry: { ...owners[0].geometry, pathD }, pathD,
    profileGroups: owners.flatMap((item) => item.profileGroups ?? []).sort((a, b) => a.id.localeCompare(b.id)),
    generatedProfiles: owners.flatMap((item) => item.generatedProfiles ?? []).sort((a, b) => a.id.localeCompare(b.id)).map((profile) => ({ ...profile,
      geometryProjections: profile.geometryProjections.map((projection) => {
        const segment = candidate.segments.find((value) => value.projectionId === projection.id);
        return segment ? { ...projection, start: { ...segment.start }, end: { ...segment.end } } : projection;
      }),
    })),
    generatedTaps: owners.flatMap((item) => item.generatedTaps ?? []).sort((a, b) => a.id.localeCompare(b.id)),
    diagnostics: [],
  };
  return [...items.filter((item) => !(item.kind === 'PANEL_PATH' && item.behaviour.replacesPanelId === panelId)), diagnostic]
    .sort((a, b) => a.id.localeCompare(b.id));
};

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
