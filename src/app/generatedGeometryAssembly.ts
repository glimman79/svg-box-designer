/**
 * Non-authoritative production-stream assembly diagnostics. The returned data is
 * deliberately separate from GeneratedGeometryItem[] and must never feed the
 * snapshot, final-geometry, preview, export, or persistence pipelines.
 */
import type { GeneratedGeometryItem } from './generatedGeometryTypes';
import { pathDToClosedContour } from './geometryServices';
import { auditGeneratedGeometryRelationships, buildGeometryRelationshipIndex } from './geometryRelationships';
import type { GeometryRelationshipIndex } from './geometryRelationships';
import { composePanel } from './panelComposer';
import type { PanelCandidate, PanelComposerDiagnostic, PanelReplacedEdgeContribution } from './panelComposer';
import { adaptSProfilesToPanelContributions } from './sPanelContributionAdapter';
import { adaptTBProfilesToPanelContributions } from './tbShadowPanelAdapter';
import { cornerTouchTolerance, getContourSignedArea } from './sharedGeometry';
import type { Point, SvgDocumentModel } from '../svgUtils';

export type PanelAssemblyComparisonStatus = 'MATCH' | 'MISMATCH' | 'MIXED_NO_LEGACY_ORACLE'
  | 'BLOCKED_CONFLICT' | 'BLOCKED_MISSING_CONTRIBUTION' | 'BLOCKED_UNSUPPORTED' | 'BLOCKED_INVALID_JUNCTION';
export type LegacyPanelWinner = Readonly<{ panelId: string; winningItemId: string; winningOperationId: string;
  winningToolType: GeneratedGeometryItem['toolType']; arrayIndex: number }>;
export type PanelAssemblyDiagnostic = Readonly<{ panelId: string; status: PanelAssemblyComparisonStatus;
  replacementOperationIds: ReadonlyArray<string>; references: ReadonlyArray<string>; diagnostics: ReadonlyArray<PanelComposerDiagnostic> }>;
export type GeneratedGeometryAssemblyDiagnostics = Readonly<{
  /** Candidates are read-only observations, never GeneratedGeometryItems. */
  panelCandidates: ReadonlyArray<PanelCandidate>;
  panelDiagnostics: ReadonlyArray<PanelAssemblyDiagnostic>;
  relationshipIndex: GeometryRelationshipIndex;
  comparisonResults: ReadonlyArray<Readonly<{ panelId: string; status: PanelAssemblyComparisonStatus; legacyWinner: LegacyPanelWinner | null }>>;
  legacyWinners: ReadonlyArray<LegacyPanelWinner>;
  createdFeatures: ReadonlyArray<GeneratedGeometryItem>;
}>;

const canonical = (points: ReadonlyArray<Point>) => {
  const values = points.map((point) => `${point.x.toFixed(7)},${point.y.toFixed(7)}`);
  if (!values.length) return '';
  return values.map((_, offset) => values.map((__, index) => values[(index + offset) % values.length]).join('|')).sort()[0];
};
const bounds = (points: ReadonlyArray<Point>) => points.reduce((value, point) => ({ minX: Math.min(value.minX, point.x),
  minY: Math.min(value.minY, point.y), maxX: Math.max(value.maxX, point.x), maxY: Math.max(value.maxY, point.y) }),
{ minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });
const close = (a: number, b: number) => Math.abs(a - b) <= cornerTouchTolerance;
const matchesLegacy = (candidate: PanelCandidate, item: GeneratedGeometryItem) => {
  const legacy = pathDToClosedContour(item.pathD);
  if (!legacy || candidate.points.length !== legacy.length || canonical(candidate.points) !== canonical(legacy)) return false;
  const candidateArea = getContourSignedArea([...candidate.points]); const legacyArea = getContourSignedArea(legacy);
  const a = bounds(candidate.points); const b = bounds(legacy);
  return Math.sign(candidateArea) === Math.sign(legacyArea) && close(candidateArea, legacyArea)
    && close(a.minX, b.minX) && close(a.minY, b.minY) && close(a.maxX, b.maxX) && close(a.maxY, b.maxY);
};

/** Runs once at an explicit generation/apply boundary (or directly in tests). It never mutates input. */
export const assembleGeneratedGeometryDiagnostics = (
  svgModel: SvgDocumentModel,
  generatedGeometryItems: ReadonlyArray<GeneratedGeometryItem>,
): GeneratedGeometryAssemblyDiagnostics => {
  const audit = auditGeneratedGeometryRelationships(generatedGeometryItems);
  // Re-index the audited records so ownership comes solely from the normalized relationship index.
  const relationshipIndex = buildGeometryRelationshipIndex(audit.relationships, audit.diagnostics.filter((entry) => entry.kind !== 'replacement-conflict'));
  const profiles = generatedGeometryItems.flatMap((item) => item.generatedProfiles ?? []);
  const supportedOperations = new Set(profiles.filter((profile) => profile.generatorType === 'S' || profile.generatorType === 'TB').map((profile) => profile.operationId));
  const contributions: PanelReplacedEdgeContribution[] = [
    ...adaptSProfilesToPanelContributions(profiles.filter((profile) => profile.generatorType === 'S')),
    ...adaptTBProfilesToPanelContributions(profiles.filter((profile) => profile.generatorType === 'TB')),
  ];
  const createdFeatures = relationshipIndex.features.map((view) => generatedGeometryItems.find((item) => item.id === view.feature.featureId))
    .filter((item): item is GeneratedGeometryItem => !!item).sort((a, b) => a.id.localeCompare(b.id));
  const legacyWinnersByPanel = new Map<string, LegacyPanelWinner>();
  generatedGeometryItems.forEach((item, arrayIndex) => { if (item.kind === 'PANEL_PATH' && item.behaviour.replacesPanelId) legacyWinnersByPanel.set(item.behaviour.replacesPanelId,
    { panelId: item.behaviour.replacesPanelId, winningItemId: item.id, winningOperationId: item.operationId, winningToolType: item.toolType, arrayIndex }); });
  const panelCandidates: PanelCandidate[] = []; const panelDiagnostics: PanelAssemblyDiagnostic[] = [];
  const comparisonResults: Array<{ panelId: string; status: PanelAssemblyComparisonStatus; legacyWinner: LegacyPanelWinner | null }> = [];
  [...svgModel.panels].sort((a, b) => a.id.localeCompare(b.id)).forEach((panel) => {
    const views = relationshipIndex.sources.filter((view) => view.source.panelId === panel.id && panel.outerEdgeIds.includes(view.source.sourceEdgeId));
    const owners = [...new Set(views.flatMap((view) => view.replacementClaimants))].sort();
    if (!owners.length) return;
    const references = [...new Set(views.flatMap((view) => view.references))].sort();
    const unsupported = owners.some((owner) => !supportedOperations.has(owner));
    let candidate: PanelCandidate | null = null; let status: PanelAssemblyComparisonStatus;
    let diagnostics: ReadonlyArray<PanelComposerDiagnostic> = [];
    if (unsupported) status = 'BLOCKED_UNSUPPORTED';
    else {
      candidate = composePanel(panel, relationshipIndex, contributions, createdFeatures.filter((item) => item.behaviour.ownerPanelId === panel.id));
      diagnostics = candidate.diagnostics;
      if (diagnostics.some((entry) => entry.kind === 'replacement-conflict')) status = 'BLOCKED_CONFLICT';
      else if (diagnostics.some((entry) => entry.kind === 'missing-replacement-contribution' || entry.kind === 'duplicate-replacement-contribution')) status = 'BLOCKED_MISSING_CONTRIBUTION';
      else if (diagnostics.length) status = 'BLOCKED_INVALID_JUNCTION';
      else {
        panelCandidates.push(candidate);
        const winner = legacyWinnersByPanel.get(panel.id); const tools = new Set(contributions.filter((entry) => owners.includes(entry.operationId)).map((entry) => profiles.find((profile) => profile.id === entry.profileId)?.generatorType));
        status = tools.size > 1 ? 'MIXED_NO_LEGACY_ORACLE' : winner && matchesLegacy(candidate, generatedGeometryItems[winner.arrayIndex]) ? 'MATCH' : 'MISMATCH';
      }
    }
    panelDiagnostics.push({ panelId: panel.id, status, replacementOperationIds: owners, references, diagnostics });
    comparisonResults.push({ panelId: panel.id, status, legacyWinner: legacyWinnersByPanel.get(panel.id) ?? null });
  });
  return Object.freeze({ panelCandidates: Object.freeze(panelCandidates), panelDiagnostics: Object.freeze(panelDiagnostics),
    relationshipIndex, comparisonResults: Object.freeze(comparisonResults),
    legacyWinners: Object.freeze([...legacyWinnersByPanel.values()].sort((a, b) => a.panelId.localeCompare(b.panelId))),
    createdFeatures: Object.freeze(createdFeatures) });
};
