import type { SvgDocumentModel } from '../svgUtils';
import { assembleGeneratedGeometryDiagnostics } from './generatedGeometryAssembly';
import type { GeneratedGeometryAssemblyDiagnostics, PanelAssemblyComparisonStatus } from './generatedGeometryAssembly';
import { packageComposedPanelGeometry } from './generatedGeometryDualRun';
import { diagnoseMixedDownstream } from './generatedGeometryDownstreamDiagnostics';
import type { DownstreamDiagnosticServices, MixedDownstreamDiagnostic } from './generatedGeometryDownstreamDiagnostics';
import type { GeneratedGeometryItem } from './generatedGeometryTypes';
import { defaultPanelContributorRegistry } from './panelContributors';
import type { PanelContributorRegistry } from './panelContributors';
import { reconcileComposedPanelMetadata } from './composedPanelMetadataReconciliation';
import type { ComposedPanelMetadataReconciliationResult, ProfileReconciliationDiagnostic } from './composedPanelMetadataReconciliation';

export type PanelCompositionAuthorityMode = 'legacy' | 'single-tool' | 'mixed';
export type PanelCompositionModel = 'legacy' | 'relationship-composed-single-tool-v1' | 'relationship-composed-mixed-v1';
export type PanelAuthorityCohort = 'NONE' | 'S_ONLY' | 'TB_ONLY' | 'REGISTERED_SINGLE' | 'MIXED' | 'UNSUPPORTED';
export type PanelAuthorityDecision = Readonly<{ panelId: string; relationshipOwners: ReadonlyArray<string>;
  cohort: PanelAuthorityCohort; authority: 'LEGACY' | 'COMPOSED';
  reason: 'MODE_LEGACY' | 'SINGLE_TOOL_APPROVED' | 'MIXED_NOT_ENABLED' | 'UNSUPPORTED_CONTRIBUTOR'
    | 'MIXED_APPROVED' | 'REPLACEMENT_CONFLICT' | 'MISSING_CONTRIBUTION' | 'INVALID_JUNCTION'
    | 'LEGACY_MISMATCH' | 'DOWNSTREAM_DIAGNOSTIC_FAILURE' | 'RECONCILIATION_FAILURE';
  candidateStatus: PanelAssemblyComparisonStatus;
  legacyComparisonStatus: 'SINGLE_TOOL_MATCH' | 'SINGLE_TOOL_MISMATCH' | 'NOT_ORACLE' | 'BLOCKED';
  downstreamEquivalenceGate: 'APPROVED' | 'NOT_APPROVED' | 'FAILED'; snapshotMarker: PanelCompositionModel }>;
export type GeneratedGeometryAuthoritySelection = Readonly<{ generatedGeometry: ReadonlyArray<GeneratedGeometryItem>;
  decisions: ReadonlyArray<PanelAuthorityDecision>; diagnostics: GeneratedGeometryAssemblyDiagnostics;
  panelCompositionModel: PanelCompositionModel; ok: boolean;
  blockingDecisions: ReadonlyArray<PanelAuthorityDecision>;
  downstreamDiagnostics: ReadonlyArray<MixedDownstreamDiagnostic>;
  reconciliationDiagnostics: ReadonlyArray<ProfileReconciliationDiagnostic> }>;

const blockedReason = (status: PanelAssemblyComparisonStatus): PanelAuthorityDecision['reason'] => status === 'BLOCKED_CONFLICT'
  ? 'REPLACEMENT_CONFLICT' : status === 'BLOCKED_MISSING_CONTRIBUTION' ? 'MISSING_CONTRIBUTION'
    : status === 'BLOCKED_INVALID_JUNCTION' ? 'INVALID_JUNCTION' : 'UNSUPPORTED_CONTRIBUTOR';

/** Project-atomic migration gate. Raw generator output is the only valid input. */
export const selectGeneratedGeometryAuthority = (svgModel: SvgDocumentModel,
  generatedGeometryItems: ReadonlyArray<GeneratedGeometryItem>, mode: PanelCompositionAuthorityMode = 'legacy',
  diagnostics?: GeneratedGeometryAssemblyDiagnostics,
  contributorRegistry: PanelContributorRegistry = defaultPanelContributorRegistry,
  downstreamServices?: DownstreamDiagnosticServices,
): GeneratedGeometryAuthoritySelection => {
  diagnostics ??= assembleGeneratedGeometryDiagnostics(svgModel, generatedGeometryItems, contributorRegistry);
  let selected = [...generatedGeometryItems];
  const profiles = generatedGeometryItems.flatMap((item) => item.generatedProfiles ?? []);
  const reconciliationByPanel = new Map<string, ComposedPanelMetadataReconciliationResult>();
  diagnostics.panelCandidates.forEach((candidate) => reconciliationByPanel.set(candidate.panelId,
    reconcileComposedPanelMetadata({ candidate, generatedGeometryItems, relationshipIndex: diagnostics!.relationshipIndex })));
  const reconciliationDiagnostics = Object.freeze([...reconciliationByPanel.values()].flatMap((result) => result.diagnostics));
  // Downstream validation is project-atomic: validate the complete composed candidate set,
  // rather than one composed panel surrounded by unrelated raw panel carriers.
  let mixedDownstreamGate: PanelAuthorityDecision['downstreamEquivalenceGate'] = 'NOT_APPROVED';
  let downstreamDiagnostics: ReadonlyArray<MixedDownstreamDiagnostic> = Object.freeze([]);
  if (mode === 'mixed' && reconciliationDiagnostics.length === 0
    && diagnostics.panelDiagnostics.some((panel) => panel.status === 'MIXED_NO_LEGACY_ORACLE')) {
    const downstreamPanels = diagnostics.panelDiagnostics.flatMap((panel) => {
      const candidate = diagnostics!.panelCandidates.find((value) => value.panelId === panel.panelId);
      const reconciliation = candidate ? reconciliationByPanel.get(candidate.panelId) : undefined;
      return candidate && reconciliation?.ok && !panel.status.startsWith('BLOCKED_')
        ? [{ panelId: panel.panelId, status: panel.status, candidate, replacementOperationIds: panel.replacementOperationIds,
          reconciliation }] : [];
    });
    downstreamDiagnostics = diagnoseMixedDownstream(svgModel, generatedGeometryItems, downstreamPanels, downstreamServices);
    mixedDownstreamGate = downstreamDiagnostics.every((entry) => entry.firstFailure === null) ? 'APPROVED' : 'FAILED';
  }
  const decisions = diagnostics.panelDiagnostics.map((panel): PanelAuthorityDecision => {
    const tools = new Set(panel.replacementOperationIds.map((id) => profiles.find((profile) => profile.operationId === id)?.generatorType));
    const unsupported = tools.has(undefined) || [...tools].some((tool) => tool !== undefined && !contributorRegistry.has(tool));
    const cohort: PanelAuthorityCohort = unsupported ? 'UNSUPPORTED' : tools.size > 1 ? 'MIXED'
      : tools.has('S') ? 'S_ONLY' : tools.has('TB') ? 'TB_ONLY' : tools.size === 1 ? 'REGISTERED_SINGLE' : 'NONE';
    const blocked = panel.status.startsWith('BLOCKED_'); const match = panel.status === 'MATCH';
    const singleToolApproved = match && (cohort === 'S_ONLY' || cohort === 'TB_ONLY' || cohort === 'REGISTERED_SINGLE');
    const mixedCandidate = cohort === 'MIXED' && panel.status === 'MIXED_NO_LEGACY_ORACLE';
    const candidate = diagnostics.panelCandidates.find((value) => value.panelId === panel.panelId);
    const reconciliation = candidate ? reconciliationByPanel.get(candidate.panelId) : undefined;
    const reconciliationFailed = !!candidate && (!reconciliation?.ok || reconciliation.diagnostics.some((entry) => entry.blocking));
    let downstreamGate: PanelAuthorityDecision['downstreamEquivalenceGate'] = singleToolApproved ? 'APPROVED' : 'NOT_APPROVED';
    if (mode === 'mixed' && mixedCandidate && candidate) {
      downstreamGate = mixedDownstreamGate;
    }
    const approved = !reconciliationFailed && (singleToolApproved || (mixedCandidate && downstreamGate === 'APPROVED'));
    const reason: PanelAuthorityDecision['reason'] = mode === 'legacy' ? 'MODE_LEGACY' : blocked ? blockedReason(panel.status)
      : cohort === 'UNSUPPORTED' ? 'UNSUPPORTED_CONTRIBUTOR' : reconciliationFailed ? 'RECONCILIATION_FAILURE'
        : mixedCandidate && mode !== 'mixed' ? 'MIXED_NOT_ENABLED'
        : mixedCandidate && downstreamGate === 'FAILED' ? 'DOWNSTREAM_DIAGNOSTIC_FAILURE'
          : mixedCandidate ? 'MIXED_APPROVED' : !match ? 'LEGACY_MISMATCH' : 'SINGLE_TOOL_APPROVED';
    const authority = ((mode === 'single-tool' && approved && singleToolApproved) || (mode === 'mixed' && approved)) ? 'COMPOSED' : 'LEGACY';
    if (authority === 'COMPOSED') {
      if (!candidate) throw new Error(`Approved panel ${panel.panelId} has no composed candidate.`);
      if (!reconciliation?.ok) throw new Error(`Approved panel ${panel.panelId} has no successful reconciliation.`);
      selected = [...packageComposedPanelGeometry(selected, candidate, panel.replacementOperationIds, reconciliation)];
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
      blockingDecisions: Object.freeze(blockingDecisions), downstreamDiagnostics, reconciliationDiagnostics, panelCompositionModel: 'legacy' });
  }
  for (const decision of decisions.filter((value) => value.authority === 'COMPOSED')) {
    const count = selected.filter((item) => item.kind === 'PANEL_PATH' && item.behaviour.replacesPanelId === decision.panelId).length;
    if (count !== 1) throw new Error(`Composed authority invariant failed for ${decision.panelId}: ${count} boundaries.`);
  }
  const mixedAuthority = decisions.some((value) => value.authority === 'COMPOSED' && value.cohort === 'MIXED');
  return Object.freeze({ ok: true, generatedGeometry: Object.freeze(selected), decisions: Object.freeze(decisions), diagnostics,
    blockingDecisions: Object.freeze([]), downstreamDiagnostics, reconciliationDiagnostics,
    panelCompositionModel: mixedAuthority ? 'relationship-composed-mixed-v1'
      : decisions.some((value) => value.authority === 'COMPOSED') ? 'relationship-composed-single-tool-v1' : 'legacy' });
};
