import type { DrawingPoint } from './drawingTypes';
import type { DrawingInference } from './drawingInference';
import { equivalentUnorientedDirections, normalizeUnorientedDirection } from './drawingGeometricDemand.js';

export const DRAWING_ENDPOINT_SNAP_ACQUIRE_PX = 9;
export const DRAWING_ENDPOINT_SNAP_RELEASE_PX = 12;
export const DRAWING_LINE_SNAP_ACQUIRE_PX = 8;
export const DRAWING_LINE_SNAP_RELEASE_PX = 11;
export const DRAWING_MIDPOINT_SNAP_ACQUIRE_PX = 8;
export const DRAWING_MIDPOINT_SNAP_RELEASE_PX = 11;
export const DRAWING_ALIGNMENT_SNAP_ACQUIRE_PX = 8;
export const DRAWING_ALIGNMENT_SNAP_RELEASE_PX = 11;
export const DRAWING_PERPENDICULAR_SNAP_ACQUIRE_PX = 8;
export const DRAWING_PERPENDICULAR_SNAP_RELEASE_PX = 11;
export const DRAWING_PARALLEL_SNAP_ACQUIRE_PX = 8;
export const DRAWING_PARALLEL_SNAP_RELEASE_PX = 11;
export const DRAWING_POINT_REFERENCE_SNAP_ACQUIRE_PX = 8;
export const DRAWING_POINT_REFERENCE_SNAP_RELEASE_PX = 11;

type EndpointInference = Extract<DrawingInference, { type: 'endpoint' }>;
type LineInference = Extract<DrawingInference, { type: 'line' }>;
type MidpointInference = Extract<DrawingInference, { type: 'midpoint' }>;
type PerpendicularInference = Extract<DrawingInference, { type: 'perpendicular' }>;
type ParallelInference = Extract<DrawingInference, { type: 'parallel' }>;
type AlignmentXInference = Extract<DrawingInference, { type: 'alignment-x' }>;
type AlignmentYInference = Extract<DrawingInference, { type: 'alignment-y' }>;
type PointReferenceInference = Extract<DrawingInference, { type: 'point-reference' }>;

/** Acquired construction channels plus explicit singular direction authority.
 * Positional arbitration remains independent and may choose only one endpoint. */
export type DrawingSnapChannels = Readonly<{
  xAlignment: AlignmentXInference | null;
  yAlignment: AlignmentYInference | null;
  perpendicular: PerpendicularInference | null;
  parallel: ParallelInference | null;
  pointReference: PointReferenceInference | null;
  acquiredDirectionCandidate: Readonly<{ relation: 'parallel' | 'perpendicular'; referenceLineId: string; screenDistance: number }> | null;
  directionAuthority: Readonly<{ relation: 'parallel' | 'perpendicular'; referenceLineId: string;
    referenceLineStart: DrawingPoint; referenceLineEnd: DrawingPoint; constructionOrigin: DrawingPoint;
    constructionDirection: DrawingPoint; startPointId: string | null; state: 'acquired' | 'tracking'; reason: string }> | null;
  directionAuthorityReleaseReason: string | null;
  rejectedRedundantDirectionRelations: ReadonlyArray<Readonly<{
    relation: 'parallel' | 'perpendicular';
    referenceLineId: string;
    reason: 'equivalent direction already governed by preferred authority';
  }>>;
}>;

type SnapBase = Readonly<{ channels: DrawingSnapChannels }>;
export type DrawingSnap = (Readonly<{
  type: 'none'; active: false; effectivePoint: DrawingPoint; screenDistance: null;
}> | Readonly<{
  type: 'point-reference'; active: true; effectivePoint: DrawingPoint; screenDistance: number;
  sourcePointId: string; incidentLineId: string; supportOrigin: DrawingPoint; supportDirection: DrawingPoint; constructionKey: string;
}> | Readonly<{
  type: 'perpendicular'; active: true; effectivePoint: DrawingPoint; entityId: string; screenDistance: number;
}> | Readonly<{
  type: 'parallel'; active: true; effectivePoint: DrawingPoint; entityId: string; screenDistance: number;
}> | Readonly<{
  type: 'midpoint'; active: true; effectivePoint: DrawingPoint; entityId: string;
  stableKey: string; screenDistance: number;
}> | Readonly<{
  type: 'endpoint'; active: true; effectivePoint: DrawingPoint; entityId: string;
  endpoint: 'start' | 'end'; screenDistance: number;
}> | Readonly<{
  type: 'line'; active: true; effectivePoint: DrawingPoint; entityId: string;
  segmentParameter: number; screenDistance: number; lineStart?: DrawingPoint; lineEnd?: DrawingPoint;
}> | Readonly<{
  type: 'alignment'; active: true; effectivePoint: DrawingPoint; screenDistance: number;
  xReference: AlignmentXInference | null;
  yReference: AlignmentYInference | null;
}>) & SnapBase;

export type DrawingInferenceCandidates = Readonly<{
  endpoints: ReadonlyArray<EndpointInference>;
  midpoints: ReadonlyArray<MidpointInference>;
  lines: ReadonlyArray<LineInference>;
  alignmentsX: ReadonlyArray<AlignmentXInference>;
  alignmentsY: ReadonlyArray<AlignmentYInference>;
  perpendiculars: ReadonlyArray<PerpendicularInference>;
  parallels: ReadonlyArray<ParallelInference>;
  pointReferences: ReadonlyArray<PointReferenceInference>;
}>;

const endpointIdentity = (candidate: EndpointInference) => `${candidate.entityId}:${candidate.endpoint}`;
const retainedEndpoint = (previous: DrawingSnap | null, candidates: ReadonlyArray<EndpointInference>) => previous?.type === 'endpoint'
  ? candidates.find((candidate) => endpointIdentity(candidate) === `${previous.entityId}:${previous.endpoint}`) ?? null : null;

/** Endpoint switching rule: nearest eligible endpoint wins; the retained identity
 * wins only an exact distance tie. Stable entity/endpoint identity breaks all other ties. */
const chooseEndpoint = (candidates: ReadonlyArray<EndpointInference>, previous: DrawingSnap | null): EndpointInference | null => {
  const eligible = candidates.filter(({ screenDistance }) => screenDistance <= DRAWING_ENDPOINT_SNAP_ACQUIRE_PX)
    .slice().sort((a, b) => a.screenDistance - b.screenDistance || endpointIdentity(a).localeCompare(endpointIdentity(b)));
  if (!eligible.length) {
    const retained = retainedEndpoint(previous, candidates);
    return retained && retained.screenDistance <= DRAWING_ENDPOINT_SNAP_RELEASE_PX ? retained : null;
  }
  const held = retainedEndpoint(previous, eligible);
  return held && Math.abs(held.screenDistance - eligible[0].screenDistance) <= Number.EPSILON ? held : eligible[0];
};

const chooseAxis = <T extends AlignmentXInference | AlignmentYInference>(items: ReadonlyArray<T>, old: T | null): T | null => {
  const first = items[0];
  const acquired = first && first.screenDistance <= DRAWING_ALIGNMENT_SNAP_ACQUIRE_PX ? first : null;
  const held = old && items.find((item) => item.referenceId === old.referenceId
    && item.constructionKey === old.constructionKey);
  if (!held || (held.positionOwnership !== 'reference-only' && held.screenDistance > DRAWING_ALIGNMENT_SNAP_RELEASE_PX)) return acquired;
  // A same-axis target stays with its unchanged construction identity; proximity
  // remains relevant only when a different eligible target replaces it.
  return acquired && acquired.referenceId !== held.referenceId
    && acquired.screenDistance + 2 <= held.screenDistance ? acquired : held;
};

const choosePointReference = (items: ReadonlyArray<PointReferenceInference>, previous: DrawingSnap | null) => {
  const held = previous?.channels?.pointReference && items.find(({ constructionKey }) =>
    constructionKey === previous.channels.pointReference?.constructionKey);
  if (held && held.screenDistance <= DRAWING_POINT_REFERENCE_SNAP_RELEASE_PX) return held;
  const first = items[0];
  return first && first.screenDistance <= DRAWING_POINT_REFERENCE_SNAP_ACQUIRE_PX ? first : null;
};

type DirectionCandidate = ParallelInference | PerpendicularInference;

const candidateDirection = (candidate: DirectionCandidate): DrawingPoint | null => {
  if (!candidate.lineStart || !candidate.lineEnd) return null;
  const dx = candidate.lineEnd.x - candidate.lineStart.x, dy = candidate.lineEnd.y - candidate.lineStart.y;
  return normalizeUnorientedDirection(candidate.type === 'parallel' ? { x: dx, y: dy } : { x: -dy, y: dx });
};

const samePoint = (a: DrawingPoint, b: DrawingPoint) => Math.abs(a.x - b.x) <= 1e-9 * Math.max(1, Math.abs(a.x), Math.abs(b.x))
  && Math.abs(a.y - b.y) <= 1e-9 * Math.max(1, Math.abs(a.y), Math.abs(b.y));

const acquireDirectionCandidate = (candidates: DrawingInferenceCandidates): DirectionCandidate | null => {
  const parallel = (candidates.parallels ?? []).find(({ screenDistance }) => screenDistance <= DRAWING_PARALLEL_SNAP_ACQUIRE_PX) ?? null;
  const perpendicular = (candidates.perpendiculars ?? []).find(({ screenDistance }) => screenDistance <= DRAWING_PERPENDICULAR_SNAP_ACQUIRE_PX) ?? null;
  if (!parallel) return perpendicular;
  if (!perpendicular) return parallel;
  const parallelDirection = candidateDirection(parallel), perpendicularDirection = candidateDirection(perpendicular);
  return parallelDirection && perpendicularDirection && equivalentUnorientedDirections(parallelDirection, perpendicularDirection)
    ? parallel : parallel.screenDistance <= perpendicular.screenDistance ? parallel : perpendicular;
};

const candidateForAuthority = (authority: NonNullable<DrawingSnapChannels['directionAuthority']>, candidates: DrawingInferenceCandidates) =>
  (authority.relation === 'parallel' ? candidates.parallels ?? [] : candidates.perpendiculars ?? [])
    .find(({ entityId }) => entityId === authority.referenceLineId) ?? null;

const establishAuthority = (candidate: DirectionCandidate, origin: DrawingPoint, startPointId: string | null,
  state: 'acquired' | 'tracking' = 'acquired'): NonNullable<DrawingSnapChannels['directionAuthority']> | null => {
  const direction = candidateDirection(candidate);
  if (!direction || !candidate.lineStart || !candidate.lineEnd) return null;
  const pointerVector = { x: candidate.candidatePoint.x - origin.x, y: candidate.candidatePoint.y - origin.y };
  const oriented = pointerVector.x * direction.x + pointerVector.y * direction.y < 0
    ? { x: -direction.x, y: -direction.y } : direction;
  return { relation: candidate.type, referenceLineId: candidate.entityId, referenceLineStart: candidate.lineStart,
    referenceLineEnd: candidate.lineEnd, constructionOrigin: origin, constructionDirection: oriented, startPointId, state,
    reason: state === 'acquired' ? 'acquired within direction tolerance' : 'tracking established construction' };
};

const projectToAuthority = (rawPoint: DrawingPoint, authority: NonNullable<DrawingSnapChannels['directionAuthority']>) => {
  const { constructionOrigin: origin, constructionDirection: direction } = authority;
  const parameter = Math.max(0, (rawPoint.x - origin.x) * direction.x + (rawPoint.y - origin.y) * direction.y);
  return { x: origin.x + parameter * direction.x, y: origin.y + parameter * direction.y };
};

/** Pure Drawing-wide channel acquisition followed by positional authority arbitration. */
export const resolveDrawingSnap = ({ rawPoint, candidates, previousSnap, ctrlOverride, axisDirectionActive = false, activeLineStart = null, activeLineStartPointId = null }: {
  rawPoint: DrawingPoint; candidates: DrawingInferenceCandidates; previousSnap: DrawingSnap | null; ctrlOverride: boolean;
  axisDirectionActive?: boolean; activeLineStart?: DrawingPoint | null; activeLineStartPointId?: string | null;
}): DrawingSnap => {
  const emptyChannels: DrawingSnapChannels = { xAlignment: null, yAlignment: null, perpendicular: null, parallel: null, pointReference: null,
    acquiredDirectionCandidate: null, directionAuthority: null, directionAuthorityReleaseReason: null, rejectedRedundantDirectionRelations: [] };
  const none = (channels = emptyChannels): DrawingSnap => ({ active: false, type: 'none', effectivePoint: rawPoint, screenDistance: null, channels });
  if (ctrlOverride) return none({ ...emptyChannels, directionAuthorityReleaseReason: 'ctrl-override' });

  const oldChannels = previousSnap?.channels ?? emptyChannels;
  const xReference = chooseAxis(candidates.alignmentsX, oldChannels.xAlignment);
  const yReference = chooseAxis(candidates.alignmentsY, oldChannels.yAlignment);
  const pointReference = choosePointReference(candidates.pointReferences ?? [], previousSnap);
  const freshCandidate = axisDirectionActive ? null : acquireDirectionCandidate(candidates);
  const previousAuthority = oldChannels.directionAuthority;
  const retainedCandidate = previousAuthority && activeLineStart && samePoint(previousAuthority.constructionOrigin, activeLineStart)
    && previousAuthority.startPointId === activeLineStartPointId ? candidateForAuthority(previousAuthority, candidates) : null;
  let releaseReason: string | null = axisDirectionActive && previousAuthority ? 'superseded-by-axis' : null;
  if (previousAuthority && !axisDirectionActive && !retainedCandidate) releaseReason = activeLineStart && !samePoint(previousAuthority.constructionOrigin, activeLineStart)
    || previousAuthority.startPointId !== activeLineStartPointId ? 'start-changed' : 'reference-invalid';
  let authority = !axisDirectionActive && retainedCandidate && activeLineStart
    ? establishAuthority(retainedCandidate, activeLineStart, activeLineStartPointId, 'tracking') : null;
  if (authority && freshCandidate) {
    const freshDirection = candidateDirection(freshCandidate);
    if (freshCandidate.entityId !== authority.referenceLineId && freshDirection
      && !equivalentUnorientedDirections(freshDirection, authority.constructionDirection)) {
      releaseReason = `superseded-by-${freshCandidate.type}`;
      authority = establishAuthority(freshCandidate, activeLineStart!, activeLineStartPointId);
    }
  } else if (!authority && freshCandidate && activeLineStart) authority = establishAuthority(freshCandidate, activeLineStart, activeLineStartPointId);

  const authorityCandidate = authority ? candidateForAuthority(authority, candidates) : null;
  const parallel = authority?.relation === 'parallel' && authorityCandidate?.type === 'parallel' ? authorityCandidate : null;
  const perpendicular = authority?.relation === 'perpendicular' && authorityCandidate?.type === 'perpendicular' ? authorityCandidate : null;
  const acquiredDirectionCandidate = freshCandidate ? { relation: freshCandidate.type, referenceLineId: freshCandidate.entityId,
    screenDistance: freshCandidate.screenDistance } : null;
  const redundant = authority ? [...(candidates.parallels ?? []), ...(candidates.perpendiculars ?? [])]
    .filter((candidate) => candidate.type !== authority.relation && candidate.entityId !== authority.referenceLineId
      && candidate.screenDistance <= (candidate.type === 'parallel' ? DRAWING_PARALLEL_SNAP_ACQUIRE_PX : DRAWING_PERPENDICULAR_SNAP_ACQUIRE_PX)
      && candidateDirection(candidate) && equivalentUnorientedDirections(candidateDirection(candidate)!, authority.constructionDirection))
    .map((candidate) => ({ relation: candidate.type, referenceLineId: candidate.entityId,
      reason: 'equivalent direction already governed by preferred authority' as const })) : [];
  const channels: DrawingSnapChannels = { xAlignment: xReference, yAlignment: yReference, perpendicular, parallel, pointReference,
    acquiredDirectionCandidate, directionAuthority: authority, directionAuthorityReleaseReason: releaseReason, rejectedRedundantDirectionRelations: redundant };

  const endpoint = chooseEndpoint(candidates.endpoints, previousSnap);
  if (endpoint) return { active: true, type: 'endpoint', effectivePoint: endpoint.candidatePoint, entityId: endpoint.entityId,
    endpoint: endpoint.endpoint, screenDistance: endpoint.screenDistance, channels };
  const retainedMidpoint = previousSnap?.type === 'midpoint' ? (candidates.midpoints ?? []).find(({ stableKey }) => stableKey === previousSnap.stableKey) : null;
  const midpoint = retainedMidpoint && retainedMidpoint.screenDistance <= DRAWING_MIDPOINT_SNAP_RELEASE_PX ? retainedMidpoint
    : (candidates.midpoints ?? []).find(({ screenDistance }) => screenDistance <= DRAWING_MIDPOINT_SNAP_ACQUIRE_PX);
  if (midpoint) return { active: true, type: 'midpoint', effectivePoint: midpoint.candidatePoint, entityId: midpoint.entityId,
    stableKey: midpoint.stableKey, screenDistance: midpoint.screenDistance, channels };
  const retainedLine = previousSnap?.type === 'line' ? candidates.lines.find(({ entityId }) => entityId === previousSnap.entityId) : null;
  const line = retainedLine && retainedLine.screenDistance <= DRAWING_LINE_SNAP_RELEASE_PX ? retainedLine
    : candidates.lines.find(({ screenDistance }) => screenDistance <= DRAWING_LINE_SNAP_ACQUIRE_PX);
  if (line) return { active: true, type: 'line', effectivePoint: line.candidatePoint, entityId: line.entityId, segmentParameter: line.segmentParameter,
    screenDistance: line.screenDistance, lineStart: line.lineStart, lineEnd: line.lineEnd, channels };
  if (pointReference) return { active: true, type: 'point-reference', effectivePoint: pointReference.candidatePoint, screenDistance: pointReference.screenDistance,
    sourcePointId: pointReference.sourcePointId, incidentLineId: pointReference.incidentLineId, supportOrigin: pointReference.supportOrigin,
    supportDirection: pointReference.supportDirection, constructionKey: pointReference.constructionKey, channels };
  if (xReference || yReference) return { active: true, type: 'alignment', effectivePoint: {
      x: xReference?.positionOwnership !== 'reference-only' ? xReference?.candidatePoint.x ?? rawPoint.x : rawPoint.x,
      y: yReference?.positionOwnership !== 'reference-only' ? yReference?.candidatePoint.y ?? rawPoint.y : rawPoint.y },
    screenDistance: Math.max(xReference?.screenDistance ?? 0, yReference?.screenDistance ?? 0), xReference, yReference, channels };
  if (authority && authorityCandidate) return { active: true, type: authority.relation, effectivePoint: projectToAuthority(rawPoint, authority),
    entityId: authority.referenceLineId, screenDistance: authorityCandidate.screenDistance, channels } as DrawingSnap;
  return none(channels);
};

/** Removes Line-to-Line direction presentation after final H/V authority is known. */
export const suppressDirectionRelations = (snap: DrawingSnap): DrawingSnap => {
  const channels = { ...snap.channels, perpendicular: null, parallel: null, directionAuthority: null, directionAuthorityReleaseReason: 'superseded-by-axis' };
  if (snap.type !== 'parallel' && snap.type !== 'perpendicular') return { ...snap, channels };
  const xReference = channels.xAlignment;
  const yReference = channels.yAlignment;
  if (xReference || yReference) return {
    active: true,
    type: 'alignment',
    effectivePoint: snap.effectivePoint,
    screenDistance: Math.max(xReference?.screenDistance ?? 0, yReference?.screenDistance ?? 0),
    xReference,
    yReference,
    channels,
  };
  return { active: false, type: 'none', effectivePoint: snap.effectivePoint, screenDistance: null, channels };
};
