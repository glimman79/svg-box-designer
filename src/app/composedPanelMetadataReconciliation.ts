/** Pure metadata reconciliation for a successfully composed panel candidate. */
import type { GeneratedGeometryItem } from './generatedGeometryTypes';
import type { GeometryRelationshipIndex } from './geometryRelationships';
import type { GeneratedProfile, GeneratedProfileElementId, GeneratedProfileId, GeometryProjectionId } from './generatedProfiles';
import type { GeneratedTapId, GeneratedTapSegmentRole } from './generatedTaps';
import type { PanelCandidate, PanelCandidateSegment } from './panelComposer';
import { cornerTouchTolerance, pointsMatch } from './sharedGeometry';
import type { Point } from '../svgUtils';

export type ProjectionReconciliationStatus =
  | 'PRESERVED' | 'REMAPPED' | 'REVERSED' | 'SPLIT' | 'COALESCED'
  | 'DROPPED_NONPHYSICAL' | 'ZERO_LENGTH_SEMANTIC' | 'AMBIGUOUS';
export type ProjectionOrientation = 'FORWARD' | 'REVERSED';
export type NormalizedCoverageInterval = readonly [number, number];

export type ReconciledFinalSegmentRef = Readonly<{
  segmentIndex: number;
  orientation: ProjectionOrientation;
  originalCoverage: NormalizedCoverageInterval;
  finalCoverage: NormalizedCoverageInterval;
  start: Readonly<Point>;
  end: Readonly<Point>;
}>;

export type ProjectionReconciliationEvidence = Readonly<{
  originalStart: Readonly<Point>;
  originalEnd: Readonly<Point>;
  finalStart?: Readonly<Point>;
  finalEnd?: Readonly<Point>;
  startMoved: boolean;
  endMoved: boolean;
}>;

export type ProjectionReconciliation = Readonly<{
  panelId: string;
  sourceEdgeId: string;
  operationId: string;
  profileId: GeneratedProfileId;
  elementId: GeneratedProfileElementId;
  originalProjectionId: GeometryProjectionId;
  profileSegmentOrder: number;
  status: ProjectionReconciliationStatus;
  finalSegmentRefs: ReadonlyArray<ReconciledFinalSegmentRef>;
  evidence: ProjectionReconciliationEvidence;
}>;

export type ProfileReconciliationDiagnosticCode =
  | 'RECONCILIATION_REQUIRED_PHYSICAL_MAPPING_MISSING'
  | 'RECONCILIATION_AMBIGUOUS_FINAL_TARGET'
  | 'RECONCILIATION_UNSUPPORTED_SPLIT'
  | 'RECONCILIATION_UNSUPPORTED_COALESCE'
  | 'RECONCILIATION_INVALID_SOURCE_EDGE_OWNERSHIP'
  | 'RECONCILIATION_CONFLICTING_SEMANTIC_LINEAGE'
  | 'RECONCILIATION_INCONSISTENT_TAP_MAPPING'
  | 'RECONCILIATION_INVALID_FINAL_SEGMENT_REF';
export type ProfileReconciliationDiagnostic = Readonly<{
  code: ProfileReconciliationDiagnosticCode;
  blocking: true;
  panelId: string;
  sourceEdgeId: string;
  operationId: string;
  profileId: GeneratedProfileId;
  projectionId?: GeometryProjectionId;
  segmentIndex?: number;
  message: string;
}>;

export type ReconciledProjectionOrigin = Readonly<{
  panelId: string; sourceEdgeId: string; operationId: string; profileId: GeneratedProfileId;
  elementId: GeneratedProfileElementId; originalProjectionId: GeometryProjectionId;
  originalCoverage: NormalizedCoverageInterval; finalCoverage: NormalizedCoverageInterval;
}>;
export type ComposedPanelMetadataReconciliationResult = Readonly<{
  panelId: string;
  reconciliations: ReadonlyArray<ProjectionReconciliation>;
  segmentOrigins: Readonly<Record<number, ReadonlyArray<ReconciledProjectionOrigin>>>;
  diagnostics: ReadonlyArray<ProfileReconciliationDiagnostic>;
  ok: boolean;
}>;
export type ReconcileComposedPanelMetadataInput = Readonly<{
  candidate: PanelCandidate;
  generatedGeometryItems: ReadonlyArray<GeneratedGeometryItem>;
  relationshipIndex: GeometryRelationshipIndex;
}>;

const full = (): NormalizedCoverageInterval => Object.freeze([0, 1] as const);
const point = (p: Point): Readonly<Point> => Object.freeze({ x: p.x, y: p.y });
const semanticKey = (p: GeneratedProfile) => `${p.panelId}\0${p.sourceEdgeId}\0${p.operationId}\0${p.id}`;
const mappingKey = (m: ProjectionReconciliation) => `${m.panelId}\0${m.sourceEdgeId}\0${m.operationId}\0${m.profileId}\0${String(m.profileSegmentOrder).padStart(12, '0')}\0${m.originalProjectionId}`;
const finiteSegment = (s: PanelCandidateSegment) => Number.isInteger(s.segmentIndex) && s.segmentIndex >= 0
  && [s.start.x, s.start.y, s.end.x, s.end.y].every(Number.isFinite);
const segmentLength = (a: Point, b: Point) => Math.hypot(b.x - a.x, b.y - a.y);
const projectionParameter = (p: Point, a: Point, b: Point) => {
  const dx = b.x - a.x; const dy = b.y - a.y; const denominator = dx * dx + dy * dy;
  return denominator ? ((p.x - a.x) * dx + (p.y - a.y) * dy) / denominator : 0;
};
const onProjectionLine = (p: Point, a: Point, b: Point) => {
  const length = segmentLength(a, b);
  return length > cornerTouchTolerance && Math.abs((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x)) / length <= cornerTouchTolerance;
};
const freezeRef = (segment: PanelCandidateSegment, orientation: ProjectionOrientation,
  originalCoverage: NormalizedCoverageInterval): ReconciledFinalSegmentRef => Object.freeze({
  segmentIndex: segment.segmentIndex, orientation, originalCoverage: Object.freeze([...originalCoverage]) as NormalizedCoverageInterval,
  finalCoverage: full(), start: point(segment.start), end: point(segment.end),
});

export const reconcileComposedPanelMetadata = (input: ReconcileComposedPanelMetadataInput): ComposedPanelMetadataReconciliationResult => {
  const diagnostics: ProfileReconciliationDiagnostic[] = [];
  const mappings: ProjectionReconciliation[] = [];
  const profiles = [...new Set(input.generatedGeometryItems.flatMap((item) => item.generatedProfiles ?? [])
    .filter((profile) => profile.panelId === input.candidate.panelId))].sort((a, b) => semanticKey(a).localeCompare(semanticKey(b)));
  const diagnostic = (profile: GeneratedProfile, code: ProfileReconciliationDiagnosticCode, message: string,
    projectionId?: GeometryProjectionId, segmentIndex?: number) => diagnostics.push(Object.freeze({ code, blocking: true, panelId: profile.panelId,
    sourceEdgeId: profile.sourceEdgeId, operationId: profile.operationId, profileId: profile.id, ...(projectionId ? { projectionId } : {}),
    ...(segmentIndex === undefined ? {} : { segmentIndex }), message }));

  profiles.forEach((profile) => {
    const source = input.relationshipIndex.sources.find((entry) => entry.source.panelId === profile.panelId && entry.source.sourceEdgeId === profile.sourceEdgeId);
    if ((source?.replacementClaimants.length ?? 0) > 1) {
      diagnostic(profile, 'RECONCILIATION_INVALID_SOURCE_EDGE_OWNERSHIP', 'Source edge has more than one REPLACES owner.'); return;
    }
    const elementById = new Map(profile.orderedElements.map((element) => [element.id, element]));
    [...profile.geometryProjections].sort((a, b) => a.profileSegmentOrder - b.profileSegmentOrder || a.id.localeCompare(b.id)).forEach((projection) => {
      const element = elementById.get(projection.elementId);
      const baseEvidence = { originalStart: point(projection.start), originalEnd: point(projection.end) };
      const addMapping = (status: ProjectionReconciliationStatus, refs: ReadonlyArray<ReconciledFinalSegmentRef>, evidence: ProjectionReconciliationEvidence) => mappings.push(Object.freeze({
        panelId: profile.panelId, sourceEdgeId: profile.sourceEdgeId, operationId: profile.operationId, profileId: profile.id,
        elementId: projection.elementId, originalProjectionId: projection.id, profileSegmentOrder: projection.profileSegmentOrder,
        status, finalSegmentRefs: Object.freeze([...refs]), evidence: Object.freeze(evidence),
      }));
      if (!element || projection.profileId !== profile.id || element.profileId !== profile.id || element.geometryProjectionId !== projection.id) {
        diagnostic(profile, 'RECONCILIATION_CONFLICTING_SEMANTIC_LINEAGE', 'Profile, element, and projection lineage is inconsistent.', projection.id); return;
      }
      if (pointsMatch(projection.start, projection.end)) {
        addMapping('ZERO_LENGTH_SEMANTIC', [], { ...baseEvidence, startMoved: false, endMoved: false }); return;
      }
      const lineage = input.candidate.segments.filter((segment) => segment.panelId === profile.panelId && segment.sourceEdgeId === profile.sourceEdgeId
        && segment.operationId === profile.operationId && segment.profileId === profile.id && segment.elementId === element.id && segment.projectionId === projection.id);
      const valid: PanelCandidateSegment[] = [];
      lineage.forEach((segment) => {
        if (!finiteSegment(segment) || !input.candidate.segments.some((entry) => entry.segmentIndex === segment.segmentIndex) || segment.panelId !== input.candidate.panelId) {
          diagnostic(profile, 'RECONCILIATION_INVALID_FINAL_SEGMENT_REF', 'Candidate segment cannot form a valid final segment reference.', projection.id, segment.segmentIndex); return;
        }
        if ((element.tapId !== undefined || element.segmentTapRole !== undefined)
          && (segment.tapId !== element.tapId || segment.tapRole !== element.segmentTapRole)) {
          diagnostic(profile, 'RECONCILIATION_INCONSISTENT_TAP_MAPPING', 'Candidate tap identity or role contradicts its element.', projection.id, segment.segmentIndex); return;
        }
        valid.push(segment);
      });
      if (!valid.length) {
        diagnostic(profile, 'RECONCILIATION_REQUIRED_PHYSICAL_MAPPING_MISSING', 'Required nonzero projection has no authoritative final target.', projection.id); return;
      }
      if (valid.length === 1) {
        const segment = valid[0]; const reversed = pointsMatch(segment.start, projection.end) && pointsMatch(segment.end, projection.start);
        const preserved = pointsMatch(segment.start, projection.start) && pointsMatch(segment.end, projection.end);
        const orientation: ProjectionOrientation = reversed ? 'REVERSED' : 'FORWARD';
        const status: ProjectionReconciliationStatus = reversed ? 'REVERSED' : preserved ? 'PRESERVED' : 'REMAPPED';
        addMapping(status, [freezeRef(segment, orientation, full())], { ...baseEvidence, finalStart: point(segment.start), finalEnd: point(segment.end),
          startMoved: !pointsMatch(projection.start, segment.start), endMoved: !pointsMatch(projection.end, segment.end) }); return;
      }
      const ordered = [...valid].sort((a, b) => projectionParameter(a.start, projection.start, projection.end) - projectionParameter(b.start, projection.start, projection.end));
      const forward = ordered.every((segment) => onProjectionLine(segment.start, projection.start, projection.end) && onProjectionLine(segment.end, projection.start, projection.end))
        && pointsMatch(ordered[0].start, projection.start) && pointsMatch(ordered.at(-1)!.end, projection.end)
        && ordered.slice(1).every((segment, index) => pointsMatch(ordered[index].end, segment.start));
      const reverseOrder = [...valid].sort((a, b) => projectionParameter(b.end, projection.start, projection.end) - projectionParameter(a.end, projection.start, projection.end));
      const reversed = reverseOrder.every((segment) => onProjectionLine(segment.start, projection.start, projection.end) && onProjectionLine(segment.end, projection.start, projection.end))
        && pointsMatch(reverseOrder[0].end, projection.start) && pointsMatch(reverseOrder.at(-1)!.start, projection.end)
        && reverseOrder.slice(1).every((segment, index) => pointsMatch(reverseOrder[index].start, segment.end));
      if (!forward && !reversed) {
        addMapping('AMBIGUOUS', [], { ...baseEvidence, startMoved: false, endMoved: false });
        diagnostic(profile, 'RECONCILIATION_AMBIGUOUS_FINAL_TARGET', 'Stable lineage admits more than one final target.', projection.id); return;
      }
      const chain = forward ? ordered : reverseOrder; const orientation: ProjectionOrientation = forward ? 'FORWARD' : 'REVERSED';
      const refs = chain.map((segment) => {
        const first = orientation === 'FORWARD' ? segment.start : segment.end; const last = orientation === 'FORWARD' ? segment.end : segment.start;
        return freezeRef(segment, orientation, Object.freeze([projectionParameter(first, projection.start, projection.end), projectionParameter(last, projection.start, projection.end)] as const));
      });
      addMapping('SPLIT', refs, { ...baseEvidence, finalStart: point(chain[0].start), finalEnd: point(chain.at(-1)!.end), startMoved: false, endMoved: false });
      diagnostic(profile, 'RECONCILIATION_UNSUPPORTED_SPLIT', 'Split mapping is explicit but unsupported by current consumers.', projection.id);
    });
  });

  const originBuckets = new Map<number, ReconciledProjectionOrigin[]>();
  mappings.forEach((mapping) => mapping.finalSegmentRefs.forEach((ref) => {
    const origins = originBuckets.get(ref.segmentIndex) ?? [];
    origins.push(Object.freeze({ panelId: mapping.panelId, sourceEdgeId: mapping.sourceEdgeId, operationId: mapping.operationId,
      profileId: mapping.profileId, elementId: mapping.elementId, originalProjectionId: mapping.originalProjectionId,
      originalCoverage: ref.originalCoverage, finalCoverage: ref.finalCoverage })); originBuckets.set(ref.segmentIndex, origins);
  }));
  originBuckets.forEach((origins) => {
    if (origins.length < 2) return;
    const ids = new Set(origins.map((origin) => origin.originalProjectionId)); if (ids.size < 2) return;
    mappings.forEach((mapping, index) => {
      if (!mapping.finalSegmentRefs.some((ref) => originBuckets.get(ref.segmentIndex) === origins)) return;
      mappings[index] = Object.freeze({ ...mapping, status: 'COALESCED' });
      const profile = profiles.find((entry) => entry.id === mapping.profileId)!;
      diagnostic(profile, 'RECONCILIATION_UNSUPPORTED_COALESCE', 'Coalesced origins are explicit but unsupported by current consumers.', mapping.originalProjectionId);
    });
  });
  mappings.sort((a, b) => mappingKey(a).localeCompare(mappingKey(b)));
  diagnostics.sort((a, b) => `${a.panelId}\0${a.sourceEdgeId}\0${a.operationId}\0${a.profileId}\0${a.projectionId ?? ''}\0${a.code}\0${a.segmentIndex ?? ''}`
    .localeCompare(`${b.panelId}\0${b.sourceEdgeId}\0${b.operationId}\0${b.profileId}\0${b.projectionId ?? ''}\0${b.code}\0${b.segmentIndex ?? ''}`));
  const segmentOrigins: Record<number, ReadonlyArray<ReconciledProjectionOrigin>> = {};
  [...originBuckets].sort(([a], [b]) => a - b).forEach(([index, origins]) => { segmentOrigins[index] = Object.freeze(origins.sort((a, b) =>
    `${a.panelId}\0${a.sourceEdgeId}\0${a.operationId}\0${a.profileId}\0${a.elementId}\0${a.originalProjectionId}`.localeCompare(`${b.panelId}\0${b.sourceEdgeId}\0${b.operationId}\0${b.profileId}\0${b.elementId}\0${b.originalProjectionId}`))); });
  return Object.freeze({ panelId: input.candidate.panelId, reconciliations: Object.freeze(mappings), segmentOrigins: Object.freeze(segmentOrigins),
    diagnostics: Object.freeze(diagnostics), ok: diagnostics.length === 0 });
};
