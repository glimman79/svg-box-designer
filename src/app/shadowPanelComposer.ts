/**
 * Read-only, non-authoritative panel composition experiment. Nothing in the
 * production geometry pipeline imports this module.
 */
import type { GeneratedGeometryItem } from './generatedGeometryTypes';
import type { GeneratedProfile, GeneratedProfileElementId, GeneratedProfileId, GeometryProjectionId } from './generatedProfiles';
import type { GeneratedTapId, GeneratedTapSegmentRole } from './generatedTaps';
import type { GeometryRelationshipIndex } from './geometryRelationships';
import { cornerTouchTolerance, lineIntersection } from './sharedGeometry';
import type { ContourSide } from './sharedGeometry';
import type { Point, SvgPanel } from '../svgUtils';

export type ShadowTerminalPolicy = 'replace-terminal';
export type ShadowSegment = Readonly<{
  start: Point; end: Point; profileId: GeneratedProfileId; elementId: GeneratedProfileElementId;
  projectionId: GeometryProjectionId; tapId: GeneratedTapId | null; tapRole: GeneratedTapSegmentRole | null;
}>;
export type ShadowUnchangedEdgeContribution = Readonly<{
  kind: 'unchanged'; panelId: string; sourceEdgeId: string; sourceTraversal: ContourSide;
  startSupport: ContourSide; endSupport: ContourSide;
}>;
export type ShadowReplacedEdgeContribution = Readonly<{
  kind: 'replaced'; panelId: string; sourceEdgeId: string; operationId: string; profileId: GeneratedProfileId;
  sourceTraversal: ContourSide; startSupport: ContourSide; endSupport: ContourSide;
  geometry: ReadonlyArray<ShadowSegment>; startPolicy: ShadowTerminalPolicy; endPolicy: ShadowTerminalPolicy;
}>;
export type ShadowPanelContribution = ShadowUnchangedEdgeContribution | ShadowReplacedEdgeContribution;
export type ShadowComposerDiagnostic = Readonly<{
  kind: 'replacement-conflict' | 'missing-replacement-contribution' | 'duplicate-replacement-contribution' | 'invalid-junction' | 'invalid-ring';
  key: string; message: string;
}>;
export type ShadowCandidateSegment = Readonly<{
  segmentIndex: number; start: Point; end: Point; sourceEdgeId: string; profileId: GeneratedProfileId | null;
  operationId: string | null; elementId: GeneratedProfileElementId | null; projectionId: GeometryProjectionId | null;
  tapId: GeneratedTapId | null; tapRole: GeneratedTapSegmentRole | null; relationshipOrigin: 'unchanged' | 'replaces';
}>;
export type ShadowPanelCandidate = Readonly<{
  panelId: string; points: ReadonlyArray<Point>; junctions: ReadonlyArray<Readonly<{ beforeEdgeId: string; afterEdgeId: string; point: Point }>>;
  segments: ReadonlyArray<ShadowCandidateSegment>; diagnostics: ReadonlyArray<ShadowComposerDiagnostic>;
  createdFeatures: ReadonlyArray<GeneratedGeometryItem>;
}>;

const key = (panelId: string, edgeId: string, operationId: string) => `${panelId}\u0000${edgeId}\u0000${operationId}`;
const finiteSide = (side: ContourSide) => [side.start.x, side.start.y, side.end.x, side.end.y].every(Number.isFinite);
const same = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y) <= cornerTouchTolerance;
const clonePoint = (point: Point): Point => ({ x: point.x, y: point.y });

/** S-A diagnostic adapter. Tool knowledge ends at this boundary. */
export const adaptSProfilesToShadowContributions = (profiles: ReadonlyArray<GeneratedProfile>): ReadonlyArray<ShadowReplacedEdgeContribution> => (
  profiles.map((profile) => {
    const elementById = new Map(profile.orderedElements.map((element) => [element.id, element]));
    const support = { start: clonePoint(profile.attachmentStart), end: clonePoint(profile.attachmentEnd) };
    return {
      kind: 'replaced', panelId: profile.panelId, sourceEdgeId: profile.sourceEdgeId, operationId: profile.operationId, profileId: profile.id,
      sourceTraversal: { start: clonePoint(profile.sourceEdgeDirection.start), end: clonePoint(profile.sourceEdgeDirection.end) },
      startSupport: support, endSupport: support, startPolicy: 'replace-terminal', endPolicy: 'replace-terminal',
      geometry: profile.geometryProjections.map((projection) => {
        const element = elementById.get(projection.elementId)!;
        return { start: clonePoint(projection.start), end: clonePoint(projection.end), profileId: profile.id,
          elementId: projection.elementId, projectionId: projection.id, tapId: element.tapId ?? null, tapRole: element.segmentTapRole ?? null };
      }),
    };
  })
);

export const composeShadowPanel = (panel: SvgPanel, relationships: GeometryRelationshipIndex,
  replacements: ReadonlyArray<ShadowReplacedEdgeContribution>, createdFeatures: ReadonlyArray<GeneratedGeometryItem> = []): ShadowPanelCandidate => {
  const orderedCreatedFeatures = [...createdFeatures].sort((a, b) => a.id.localeCompare(b.id));
  const diagnostics: ShadowComposerDiagnostic[] = [];
  if (panel.outerContour.length !== panel.outerEdgeIds.length || panel.outerContour.length < 3) diagnostics.push({ kind: 'invalid-ring', key: panel.id, message: `${panel.id} has an unaligned source-edge ring.` });
  const sourceViews = new Map(relationships.sources.filter((view) => view.source.panelId === panel.id).map((view) => [view.source.sourceEdgeId, view]));
  const replacementMap = new Map<string, ShadowReplacedEdgeContribution[]>();
  replacements.forEach((value) => { const k = key(value.panelId, value.sourceEdgeId, value.operationId); replacementMap.set(k, [...(replacementMap.get(k) ?? []), value]); });
  const contributions: ShadowPanelContribution[] = panel.outerEdgeIds.map((sourceEdgeId, index) => {
    const traversal = { start: clonePoint(panel.outerContour[index]), end: clonePoint(panel.outerContour[(index + 1) % panel.outerContour.length]) };
    const view = sourceViews.get(sourceEdgeId);
    if ((view?.replacementClaimants.length ?? 0) > 1) {
      diagnostics.push({ kind: 'replacement-conflict', key: `${panel.id}\u0000${sourceEdgeId}`, message: `${sourceEdgeId} has replacement claimants ${(view?.replacementClaimants ?? []).join(', ')}.` });
      return { kind: 'unchanged', panelId: panel.id, sourceEdgeId, sourceTraversal: traversal, startSupport: traversal, endSupport: traversal };
    }
    if (view?.replacementOwner) {
      const candidates = replacementMap.get(key(panel.id, sourceEdgeId, view.replacementOwner)) ?? [];
      if (candidates.length !== 1) diagnostics.push({ kind: candidates.length ? 'duplicate-replacement-contribution' : 'missing-replacement-contribution', key: key(panel.id, sourceEdgeId, view.replacementOwner), message: `${candidates.length} contributions match the unique replacement claim.` });
      if (candidates.length === 1) return candidates[0];
    }
    return { kind: 'unchanged', panelId: panel.id, sourceEdgeId, sourceTraversal: traversal, startSupport: traversal, endSupport: traversal };
  });
  const blocking = diagnostics.length > 0;
  const junctions = blocking ? [] : contributions.map((current, index) => {
    const previous = contributions[(index + contributions.length - 1) % contributions.length];
    const point = finiteSide(previous.endSupport) && finiteSide(current.startSupport) ? lineIntersection(previous.endSupport, current.startSupport) : null;
    if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) diagnostics.push({ kind: 'invalid-junction', key: `${panel.id}\u0000${previous.sourceEdgeId}\u0000${current.sourceEdgeId}`, message: `Adjacent attachment supports do not have one finite intersection.` });
    return point ? { beforeEdgeId: previous.sourceEdgeId, afterEdgeId: current.sourceEdgeId, point } : null;
  });
  if (diagnostics.length || junctions.some((value) => !value)) return { panelId: panel.id, points: [], junctions: [], segments: [], diagnostics: diagnostics.sort((a, b) => `${a.kind}\0${a.key}`.localeCompare(`${b.kind}\0${b.key}`)), createdFeatures: orderedCreatedFeatures };
  const resolved = junctions as Array<{ beforeEdgeId: string; afterEdgeId: string; point: Point }>;
  const segments: ShadowCandidateSegment[] = [];
  contributions.forEach((contribution, edgeIndex) => {
    const startJ = resolved[edgeIndex].point; const endJ = resolved[(edgeIndex + 1) % resolved.length].point;
    if (contribution.kind === 'unchanged') {
      if (!same(startJ, endJ)) segments.push({ segmentIndex: segments.length, start: clonePoint(startJ), end: clonePoint(endJ), sourceEdgeId: contribution.sourceEdgeId,
        profileId: null, operationId: null, elementId: null, projectionId: null, tapId: null, tapRole: null, relationshipOrigin: 'unchanged' });
      return;
    }
    contribution.geometry.forEach((part, partIndex) => {
      const start = partIndex === 0 ? startJ : part.start; const end = partIndex === contribution.geometry.length - 1 ? endJ : part.end;
      if (!same(start, end)) segments.push({ segmentIndex: segments.length, start: clonePoint(start), end: clonePoint(end), sourceEdgeId: contribution.sourceEdgeId,
        profileId: contribution.profileId, operationId: contribution.operationId, elementId: part.elementId, projectionId: part.projectionId,
        tapId: part.tapId, tapRole: part.tapRole, relationshipOrigin: 'replaces' });
    });
  });
  return { panelId: panel.id, points: segments.map(({ start }) => clonePoint(start)), junctions: resolved, segments, diagnostics: [], createdFeatures: orderedCreatedFeatures };
};
