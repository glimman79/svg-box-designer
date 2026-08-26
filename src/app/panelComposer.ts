/** Pure, deterministic, tool-neutral panel boundary composition core. */
import type { GeneratedGeometryItem } from './generatedGeometryTypes';
import type { GeneratedProfileElementId, GeneratedProfileId, GeometryProjectionId } from './generatedProfiles';
import type { GeneratedTapId, GeneratedTapSegmentRole } from './generatedTaps';
import type { GeometryRelationshipIndex } from './geometryRelationships';
import { cornerTouchTolerance, lineIntersection, pointsMatch } from './sharedGeometry';
import type { ContourSide } from './sharedGeometry';
import type { Point, SvgPanel } from '../svgUtils';

export type PanelTerminalPolicy = 'replace-terminal';
export type PanelSegment = Readonly<{
  start: Point; end: Point; profileId: GeneratedProfileId; elementId: GeneratedProfileElementId;
  projectionId: GeometryProjectionId; tapId: GeneratedTapId | null; tapRole: GeneratedTapSegmentRole | null;
}>;
export type NonphysicalProjectionDisposition = 'TERMINAL_INVERSE_PAIR_NONPHYSICAL';
export type NonphysicalProjectionLineage = Readonly<{
  panelId: string; sourceEdgeId: string; operationId: string; profileId: GeneratedProfileId;
  elementId: GeneratedProfileElementId; projectionId: GeometryProjectionId; start: Point; end: Point;
  tapId: GeneratedTapId | null; tapRole: GeneratedTapSegmentRole | null;
  disposition: NonphysicalProjectionDisposition;
}>;
export type PanelUnchangedEdgeContribution = Readonly<{
  kind: 'unchanged'; panelId: string; sourceEdgeId: string; sourceTraversal: ContourSide;
  startSupport: ContourSide; endSupport: ContourSide;
}>;
export type PanelReplacedEdgeContribution = Readonly<{
  kind: 'replaced'; panelId: string; sourceEdgeId: string; operationId: string; profileId: GeneratedProfileId;
  sourceTraversal: ContourSide; startSupport: ContourSide; endSupport: ContourSide;
  geometry: ReadonlyArray<PanelSegment>; startPolicy: PanelTerminalPolicy; endPolicy: PanelTerminalPolicy;
  nonphysicalProjectionLineage?: ReadonlyArray<NonphysicalProjectionLineage>;
}>;
export type PanelContribution = PanelUnchangedEdgeContribution | PanelReplacedEdgeContribution;
export type PanelComposerDiagnostic = Readonly<{
  kind: 'replacement-conflict' | 'missing-replacement-contribution' | 'duplicate-replacement-contribution' | 'invalid-junction' | 'invalid-ring';
  key: string; message: string;
}>;
export type PanelCandidateSegment = Readonly<{
  segmentIndex: number; start: Point; end: Point; panelId: string; sourceEdgeId: string; profileId: GeneratedProfileId | null;
  operationId: string | null; elementId: GeneratedProfileElementId | null; projectionId: GeometryProjectionId | null;
  tapId: GeneratedTapId | null; tapRole: GeneratedTapSegmentRole | null; relationshipOrigin: 'unchanged' | 'replaces';
}>;
export type PanelCandidate = Readonly<{
  panelId: string; points: ReadonlyArray<Point>; junctions: ReadonlyArray<Readonly<{ beforeEdgeId: string; afterEdgeId: string; point: Point }>>;
  segments: ReadonlyArray<PanelCandidateSegment>; diagnostics: ReadonlyArray<PanelComposerDiagnostic>;
  createdFeatures: ReadonlyArray<GeneratedGeometryItem>;
  nonphysicalProjectionLineage?: ReadonlyArray<NonphysicalProjectionLineage>;
}>;

const key = (panelId: string, edgeId: string, operationId: string) => `${panelId}\u0000${edgeId}\u0000${operationId}`;
const finiteSide = (side: ContourSide) => [side.start.x, side.start.y, side.end.x, side.end.y].every(Number.isFinite);
const same = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y) <= cornerTouchTolerance;
const clonePoint = (point: Point): Point => ({ x: point.x, y: point.y });

/**
 * Keep a generator's terminal representation when resolving its support lines
 * produces the same geometric point.  The preceding contribution's end is
 * canonical because it is the terminal already emitted by traversal; the
 * following generated start is the fallback.  Thus generated/generated
 * joins are deterministic, either mixed join preserves its sole generated
 * terminal, and original/original joins retain the computed intersection.
 * A terminal which is materially different never overrides the intersection.
 */
const preserveGeneratedTerminal = (computed: Point, previous: PanelContribution, current: PanelContribution): Point => {
  const previousEnd = previous.kind === 'replaced' ? previous.geometry[previous.geometry.length - 1]?.end : undefined;
  if (previousEnd && pointsMatch(computed, previousEnd)) return previousEnd;
  const currentStart = current.kind === 'replaced' ? current.geometry[0]?.start : undefined;
  if (currentStart && pointsMatch(computed, currentStart)) return currentStart;
  return computed;
};


export const composePanel = (panel: SvgPanel, relationships: GeometryRelationshipIndex,
  replacements: ReadonlyArray<PanelReplacedEdgeContribution>, createdFeatures: ReadonlyArray<GeneratedGeometryItem> = []): PanelCandidate => {
  const orderedCreatedFeatures = [...createdFeatures].sort((a, b) => a.id.localeCompare(b.id));
  const diagnostics: PanelComposerDiagnostic[] = [];
  if (panel.outerContour.length !== panel.outerEdgeIds.length || panel.outerContour.length < 3) diagnostics.push({ kind: 'invalid-ring', key: panel.id, message: `${panel.id} has an unaligned source-edge ring.` });
  const sourceViews = new Map(relationships.sources.filter((view) => view.source.panelId === panel.id).map((view) => [view.source.sourceEdgeId, view]));
  const replacementMap = new Map<string, PanelReplacedEdgeContribution[]>();
  replacements.forEach((value) => { const k = key(value.panelId, value.sourceEdgeId, value.operationId); replacementMap.set(k, [...(replacementMap.get(k) ?? []), value]); });
  const contributions: PanelContribution[] = panel.outerEdgeIds.map((sourceEdgeId, index) => {
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
    const intersection = finiteSide(previous.endSupport) && finiteSide(current.startSupport) ? lineIntersection(previous.endSupport, current.startSupport) : null;
    const point = intersection ? preserveGeneratedTerminal(intersection, previous, current) : null;
    if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) diagnostics.push({ kind: 'invalid-junction', key: `${panel.id}\u0000${previous.sourceEdgeId}\u0000${current.sourceEdgeId}`, message: `Adjacent attachment supports do not have one finite intersection.` });
    return point ? { beforeEdgeId: previous.sourceEdgeId, afterEdgeId: current.sourceEdgeId, point } : null;
  });
  if (diagnostics.length || junctions.some((value) => !value)) return { panelId: panel.id, points: [], junctions: [], segments: [], diagnostics: diagnostics.sort((a, b) => `${a.kind}\0${a.key}`.localeCompare(`${b.kind}\0${b.key}`)), createdFeatures: orderedCreatedFeatures };
  const resolved = junctions as Array<{ beforeEdgeId: string; afterEdgeId: string; point: Point }>;
  const nonphysicalById = new Map<string, NonphysicalProjectionLineage>();
  contributions.filter((value): value is PanelReplacedEdgeContribution => value.kind === 'replaced')
    .flatMap((value) => value.nonphysicalProjectionLineage ?? []).forEach((lineage) => {
      const identity = `${lineage.panelId}\0${lineage.sourceEdgeId}\0${lineage.operationId}\0${lineage.profileId}\0${lineage.elementId}\0${lineage.projectionId}`;
      const existing = nonphysicalById.get(identity);
      if (existing && JSON.stringify(existing) !== JSON.stringify(lineage)) throw new Error(`Conflicting nonphysical projection lineage ${identity}.`);
      nonphysicalById.set(identity, lineage);
    });
  const nonphysicalProjectionLineage = Object.freeze([...nonphysicalById.entries()].sort(([a], [b]) => a.localeCompare(b))
    .map(([, lineage]) => lineage));
  const segments: PanelCandidateSegment[] = [];
  contributions.forEach((contribution, edgeIndex) => {
    const startJ = resolved[edgeIndex].point; const endJ = resolved[(edgeIndex + 1) % resolved.length].point;
    if (contribution.kind === 'unchanged') {
      if (!same(startJ, endJ)) segments.push({ segmentIndex: segments.length, start: clonePoint(startJ), end: clonePoint(endJ), panelId: contribution.panelId, sourceEdgeId: contribution.sourceEdgeId,
        profileId: null, operationId: null, elementId: null, projectionId: null, tapId: null, tapRole: null, relationshipOrigin: 'unchanged' });
      return;
    }
    contribution.geometry.forEach((part, partIndex) => {
      const start = partIndex === 0 ? startJ : part.start; const end = partIndex === contribution.geometry.length - 1 ? endJ : part.end;
      if (!same(start, end)) segments.push({ segmentIndex: segments.length, start: clonePoint(start), end: clonePoint(end), panelId: contribution.panelId, sourceEdgeId: contribution.sourceEdgeId,
        profileId: contribution.profileId, operationId: contribution.operationId, elementId: part.elementId, projectionId: part.projectionId,
        tapId: part.tapId, tapRole: part.tapRole, relationshipOrigin: 'replaces' });
    });
  });
  return { panelId: panel.id, points: segments.map(({ start }) => clonePoint(start)), junctions: resolved, segments, diagnostics: [],
    createdFeatures: orderedCreatedFeatures, nonphysicalProjectionLineage };
};
