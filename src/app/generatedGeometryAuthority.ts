import type { SvgDocumentModel } from '../svgUtils';
import { assembleGeneratedGeometryDiagnostics } from './generatedGeometryAssembly';
import type { GeneratedGeometryAssemblyDiagnostics, PanelAssemblyComparisonStatus } from './generatedGeometryAssembly';
import { packageComposedPanelGeometry } from './generatedGeometryDualRun';
import type { GeneratedGeometryItem } from './generatedGeometryTypes';

export type PanelCompositionAuthorityMode = 'legacy' | 'single-tool';
export type PanelAuthorityCohort = 'S_ONLY' | 'TB_ONLY' | 'MIXED' | 'UNSUPPORTED';
export type PanelAuthorityDecision = Readonly<{ panelId: string; relationshipOwners: ReadonlyArray<string>;
  cohort: PanelAuthorityCohort; authority: 'LEGACY' | 'COMPOSED';
  reason: 'MODE_LEGACY' | 'SINGLE_TOOL_APPROVED' | 'MIXED_NOT_ENABLED' | 'UNSUPPORTED_CONTRIBUTOR'
    | 'REPLACEMENT_CONFLICT' | 'MISSING_CONTRIBUTION' | 'INVALID_JUNCTION' | 'LEGACY_MISMATCH';
  candidateStatus: PanelAssemblyComparisonStatus;
  legacyComparisonStatus: 'SINGLE_TOOL_MATCH' | 'SINGLE_TOOL_MISMATCH' | 'NOT_ORACLE' | 'BLOCKED';
  downstreamEquivalenceGate: 'APPROVED' | 'NOT_APPROVED' }>;
export type GeneratedGeometryAuthoritySelection = Readonly<{ generatedGeometry: ReadonlyArray<GeneratedGeometryItem>;
  decisions: ReadonlyArray<PanelAuthorityDecision>; diagnostics: GeneratedGeometryAssemblyDiagnostics;
  panelCompositionModel: 'legacy' | 'relationship-composed-single-tool-v1' }>;

const blockedReason = (status: PanelAssemblyComparisonStatus): PanelAuthorityDecision['reason'] => status === 'BLOCKED_CONFLICT'
  ? 'REPLACEMENT_CONFLICT' : status === 'BLOCKED_MISSING_CONTRIBUTION' ? 'MISSING_CONTRIBUTION'
    : status === 'BLOCKED_INVALID_JUNCTION' ? 'INVALID_JUNCTION' : 'UNSUPPORTED_CONTRIBUTOR';

/** Panel-atomic migration gate. A future fully-authoritative phase should fail closed instead of falling back. */
export const selectGeneratedGeometryAuthority = (svgModel: SvgDocumentModel,
  generatedGeometryItems: ReadonlyArray<GeneratedGeometryItem>, mode: PanelCompositionAuthorityMode = 'legacy',
  diagnostics = assembleGeneratedGeometryDiagnostics(svgModel, generatedGeometryItems),
): GeneratedGeometryAuthoritySelection => {
  let selected = [...generatedGeometryItems];
  const profiles = generatedGeometryItems.flatMap((item) => item.generatedProfiles ?? []);
  const decisions = diagnostics.panelDiagnostics.map((panel): PanelAuthorityDecision => {
    const tools = new Set(panel.replacementOperationIds.map((id) => profiles.find((profile) => profile.operationId === id)?.generatorType));
    const cohort: PanelAuthorityCohort = tools.has(undefined) ? 'UNSUPPORTED' : tools.size > 1 ? 'MIXED'
      : tools.has('S') ? 'S_ONLY' : tools.has('TB') ? 'TB_ONLY' : 'UNSUPPORTED';
    const blocked = panel.status.startsWith('BLOCKED_'); const match = panel.status === 'MATCH';
    const approved = match && (cohort === 'S_ONLY' || cohort === 'TB_ONLY');
    const reason: PanelAuthorityDecision['reason'] = mode === 'legacy' ? 'MODE_LEGACY' : blocked ? blockedReason(panel.status)
      : cohort === 'MIXED' ? 'MIXED_NOT_ENABLED' : cohort === 'UNSUPPORTED' ? 'UNSUPPORTED_CONTRIBUTOR'
        : !match ? 'LEGACY_MISMATCH' : 'SINGLE_TOOL_APPROVED';
    const authority = mode === 'single-tool' && approved ? 'COMPOSED' : 'LEGACY';
    if (authority === 'COMPOSED') {
      const candidate = diagnostics.panelCandidates.find((value) => value.panelId === panel.panelId);
      if (!candidate) throw new Error(`Approved panel ${panel.panelId} has no composed candidate.`);
      selected = [...packageComposedPanelGeometry(selected, candidate, panel.replacementOperationIds)];
    }
    return Object.freeze({ panelId: panel.panelId, relationshipOwners: panel.replacementOperationIds, cohort, authority, reason,
      candidateStatus: panel.status, legacyComparisonStatus: blocked ? 'BLOCKED' : match ? 'SINGLE_TOOL_MATCH'
        : panel.status === 'MIXED_NO_LEGACY_ORACLE' ? 'NOT_ORACLE' : 'SINGLE_TOOL_MISMATCH',
      downstreamEquivalenceGate: approved ? 'APPROVED' : 'NOT_APPROVED' });
  }).sort((a, b) => a.panelId.localeCompare(b.panelId));
  for (const decision of decisions.filter((value) => value.authority === 'COMPOSED')) {
    const count = selected.filter((item) => item.kind === 'PANEL_PATH' && item.behaviour.replacesPanelId === decision.panelId).length;
    if (count !== 1) throw new Error(`Composed authority invariant failed for ${decision.panelId}: ${count} boundaries.`);
  }
  return Object.freeze({ generatedGeometry: Object.freeze(selected), decisions: Object.freeze(decisions), diagnostics,
    panelCompositionModel: decisions.some((value) => value.authority === 'COMPOSED') ? 'relationship-composed-single-tool-v1' : 'legacy' });
};
