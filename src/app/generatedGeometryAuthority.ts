import type { SvgDocumentModel } from '../svgUtils';
import { assembleGeneratedGeometryDiagnostics } from './generatedGeometryAssembly';
import type { GeneratedGeometryAssemblyDiagnostics, PanelAssemblyComparisonStatus } from './generatedGeometryAssembly';
import { packageComposedPanelGeometry } from './generatedGeometryDualRun';
import type { GeneratedGeometryItem } from './generatedGeometryTypes';
import { buildFinalGeometry } from './finalGeometry';
import { processManufacturingGeometry } from './manufacturingCompensation';
import { defaultPanelContributorRegistry } from './panelContributors';
import type { PanelContributorRegistry } from './panelContributors';

export type PanelCompositionAuthorityMode = 'legacy' | 'single-tool' | 'mixed';
export type PanelCompositionModel = 'legacy' | 'relationship-composed-single-tool-v1' | 'relationship-composed-mixed-v1';
export type PanelAuthorityCohort = 'NONE' | 'S_ONLY' | 'TB_ONLY' | 'REGISTERED_SINGLE' | 'MIXED' | 'UNSUPPORTED';
export type PanelAuthorityDecision = Readonly<{ panelId: string; relationshipOwners: ReadonlyArray<string>;
  cohort: PanelAuthorityCohort; authority: 'LEGACY' | 'COMPOSED';
  reason: 'MODE_LEGACY' | 'SINGLE_TOOL_APPROVED' | 'MIXED_NOT_ENABLED' | 'UNSUPPORTED_CONTRIBUTOR'
    | 'MIXED_APPROVED' | 'REPLACEMENT_CONFLICT' | 'MISSING_CONTRIBUTION' | 'INVALID_JUNCTION'
    | 'LEGACY_MISMATCH' | 'DOWNSTREAM_DIAGNOSTIC_FAILURE';
  candidateStatus: PanelAssemblyComparisonStatus;
  legacyComparisonStatus: 'SINGLE_TOOL_MATCH' | 'SINGLE_TOOL_MISMATCH' | 'NOT_ORACLE' | 'BLOCKED';
  downstreamEquivalenceGate: 'APPROVED' | 'NOT_APPROVED' | 'FAILED'; snapshotMarker: PanelCompositionModel }>;
export type GeneratedGeometryAuthoritySelection = Readonly<{ generatedGeometry: ReadonlyArray<GeneratedGeometryItem>;
  decisions: ReadonlyArray<PanelAuthorityDecision>; diagnostics: GeneratedGeometryAssemblyDiagnostics;
  panelCompositionModel: PanelCompositionModel; ok: boolean;
  blockingDecisions: ReadonlyArray<PanelAuthorityDecision> }>;

const blockedReason = (status: PanelAssemblyComparisonStatus): PanelAuthorityDecision['reason'] => status === 'BLOCKED_CONFLICT'
  ? 'REPLACEMENT_CONFLICT' : status === 'BLOCKED_MISSING_CONTRIBUTION' ? 'MISSING_CONTRIBUTION'
    : status === 'BLOCKED_INVALID_JUNCTION' ? 'INVALID_JUNCTION' : 'UNSUPPORTED_CONTRIBUTOR';

/** Project-atomic migration gate. Raw generator output is the only valid input. */
export const selectGeneratedGeometryAuthority = (svgModel: SvgDocumentModel,
  generatedGeometryItems: ReadonlyArray<GeneratedGeometryItem>, mode: PanelCompositionAuthorityMode = 'legacy',
  diagnostics?: GeneratedGeometryAssemblyDiagnostics,
  contributorRegistry: PanelContributorRegistry = defaultPanelContributorRegistry,
): GeneratedGeometryAuthoritySelection => {
  diagnostics ??= assembleGeneratedGeometryDiagnostics(svgModel, generatedGeometryItems, contributorRegistry);
  let selected = [...generatedGeometryItems];
  const profiles = generatedGeometryItems.flatMap((item) => item.generatedProfiles ?? []);
  const decisions = diagnostics.panelDiagnostics.map((panel): PanelAuthorityDecision => {
    const tools = new Set(panel.replacementOperationIds.map((id) => profiles.find((profile) => profile.operationId === id)?.generatorType));
    const unsupported = tools.has(undefined) || [...tools].some((tool) => tool !== undefined && !contributorRegistry.has(tool));
    const cohort: PanelAuthorityCohort = unsupported ? 'UNSUPPORTED' : tools.size > 1 ? 'MIXED'
      : tools.has('S') ? 'S_ONLY' : tools.has('TB') ? 'TB_ONLY' : tools.size === 1 ? 'REGISTERED_SINGLE' : 'NONE';
    const blocked = panel.status.startsWith('BLOCKED_'); const match = panel.status === 'MATCH';
    const singleToolApproved = match && (cohort === 'S_ONLY' || cohort === 'TB_ONLY' || cohort === 'REGISTERED_SINGLE');
    const mixedCandidate = cohort === 'MIXED' && panel.status === 'MIXED_NO_LEGACY_ORACLE';
    const candidate = diagnostics.panelCandidates.find((value) => value.panelId === panel.panelId);
    let downstreamGate: PanelAuthorityDecision['downstreamEquivalenceGate'] = singleToolApproved ? 'APPROVED' : 'NOT_APPROVED';
    if (mode === 'mixed' && mixedCandidate && candidate) {
      try {
        const temporary = packageComposedPanelGeometry(generatedGeometryItems, candidate, panel.replacementOperationIds);
        const finalGeometry = buildFinalGeometry(svgModel, temporary);
        const manufacturing = processManufacturingGeometry(finalGeometry, 0, 0, 0, [], 0);
        downstreamGate = !finalGeometry.diagnostics.some((entry) => entry.severity === 'error') && manufacturing.contours.length > 0
          ? 'APPROVED' : 'FAILED';
      } catch {
        downstreamGate = 'FAILED';
      }
    }
    const approved = singleToolApproved || (mixedCandidate && downstreamGate === 'APPROVED');
    const reason: PanelAuthorityDecision['reason'] = mode === 'legacy' ? 'MODE_LEGACY' : blocked ? blockedReason(panel.status)
      : cohort === 'UNSUPPORTED' ? 'UNSUPPORTED_CONTRIBUTOR' : mixedCandidate && mode !== 'mixed' ? 'MIXED_NOT_ENABLED'
        : mixedCandidate && downstreamGate === 'FAILED' ? 'DOWNSTREAM_DIAGNOSTIC_FAILURE'
          : mixedCandidate ? 'MIXED_APPROVED' : !match ? 'LEGACY_MISMATCH' : 'SINGLE_TOOL_APPROVED';
    const authority = ((mode === 'single-tool' && singleToolApproved) || (mode === 'mixed' && approved)) ? 'COMPOSED' : 'LEGACY';
    if (authority === 'COMPOSED') {
      if (!candidate) throw new Error(`Approved panel ${panel.panelId} has no composed candidate.`);
      selected = [...packageComposedPanelGeometry(selected, candidate, panel.replacementOperationIds)];
    }
    return Object.freeze({ panelId: panel.panelId, relationshipOwners: panel.replacementOperationIds, cohort, authority, reason,
      candidateStatus: panel.status, legacyComparisonStatus: blocked ? 'BLOCKED' : match ? 'SINGLE_TOOL_MATCH'
        : panel.status === 'MIXED_NO_LEGACY_ORACLE' ? 'NOT_ORACLE' : 'SINGLE_TOOL_MISMATCH',
      downstreamEquivalenceGate: downstreamGate, snapshotMarker: authority === 'COMPOSED' && cohort === 'MIXED'
        ? 'relationship-composed-mixed-v1' : authority === 'COMPOSED' ? 'relationship-composed-single-tool-v1' : 'legacy' });
  }).sort((a, b) => a.panelId.localeCompare(b.panelId));
  const blockingDecisions = decisions.filter((decision) => mode === 'mixed'
    ? decision.authority !== 'COMPOSED'
    : mode === 'single-tool' && decision.cohort !== 'MIXED' && decision.authority !== 'COMPOSED');
  if (blockingDecisions.length) {
    return Object.freeze({ ok: false, generatedGeometry: Object.freeze([]), decisions: Object.freeze(decisions), diagnostics,
      blockingDecisions: Object.freeze(blockingDecisions), panelCompositionModel: 'legacy' });
  }
  for (const decision of decisions.filter((value) => value.authority === 'COMPOSED')) {
    const count = selected.filter((item) => item.kind === 'PANEL_PATH' && item.behaviour.replacesPanelId === decision.panelId).length;
    if (count !== 1) throw new Error(`Composed authority invariant failed for ${decision.panelId}: ${count} boundaries.`);
  }
  const mixedAuthority = decisions.some((value) => value.authority === 'COMPOSED' && value.cohort === 'MIXED');
  return Object.freeze({ ok: true, generatedGeometry: Object.freeze(selected), decisions: Object.freeze(decisions), diagnostics,
    blockingDecisions: Object.freeze([]),
    panelCompositionModel: mixedAuthority ? 'relationship-composed-mixed-v1'
      : decisions.some((value) => value.authority === 'COMPOSED') ? 'relationship-composed-single-tool-v1' : 'legacy' });
};
