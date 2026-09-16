import type { DrawingPoint } from './drawingTypes';
import type { DrawingInference } from './drawingInference';
import { groupEquivalentDirectionDemands, normalizeUnorientedDirection, type NormalizedDirectionDemand } from './drawingGeometricDemand.js';

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
  directionAuthority: Readonly<{ relation: 'parallel' | 'perpendicular'; referenceLineId: string;
    referenceLineStart: DrawingPoint; referenceLineEnd: DrawingPoint; reason: string }> | null;
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

const chooseParallel = (items: ReadonlyArray<ParallelInference>, previous: DrawingSnap | null) => {
  const old = previous?.channels?.parallel ?? (previous?.type === 'parallel' ? {
    type: 'parallel' as const, entityId: previous.entityId, candidatePoint: previous.effectivePoint, screenDistance: previous.screenDistance,
  } : null);
  const held = old && items.find(({ entityId }) => entityId === old.entityId);
  if (held && held.screenDistance <= DRAWING_PARALLEL_SNAP_RELEASE_PX) return held;
  const first = items[0];
  return first && first.screenDistance <= DRAWING_PARALLEL_SNAP_ACQUIRE_PX ? first : null;
};

const choosePerpendicular = (items: ReadonlyArray<PerpendicularInference>, previous: DrawingSnap | null) => {
  const old = previous?.channels?.perpendicular ?? (previous?.type === 'perpendicular' ? {
    type: 'perpendicular' as const, entityId: previous.entityId, candidatePoint: previous.effectivePoint, screenDistance: previous.screenDistance,
  } : null);
  const held = old && items.find(({ entityId }) => entityId === old.entityId);
  if (held && held.screenDistance <= DRAWING_PERPENDICULAR_SNAP_RELEASE_PX) return held;
  const first = items[0];
  return first && first.screenDistance <= DRAWING_PERPENDICULAR_SNAP_ACQUIRE_PX ? first : null;
};

const choosePointReference = (items: ReadonlyArray<PointReferenceInference>, previous: DrawingSnap | null) => {
  const held = previous?.channels?.pointReference && items.find(({ constructionKey }) =>
    constructionKey === previous.channels.pointReference?.constructionKey);
  if (held && held.screenDistance <= DRAWING_POINT_REFERENCE_SNAP_RELEASE_PX) return held;
  const first = items[0];
  return first && first.screenDistance <= DRAWING_POINT_REFERENCE_SNAP_ACQUIRE_PX ? first : null;
};

type GeometricRequirement = Readonly<
  | { kind: 'direction'; direction: DrawingPoint }
  | { kind: 'coordinate'; axis: 'x' | 'y'; value: number }
>;

/** Tests requirements as geometry rather than as named inference-family pairs. */
const composeSoftRequirements = (origin: DrawingPoint, requirements: readonly GeometricRequirement[]) => {
  const direction = requirements.find((requirement): requirement is Extract<GeometricRequirement, { kind: 'direction' }> => requirement.kind === 'direction');
  if (!direction) return null;
  const length = Math.hypot(direction.direction.x, direction.direction.y);
  if (length <= Number.EPSILON) return null;
  const unit = { x: direction.direction.x / length, y: direction.direction.y / length };
  const parameters = requirements.flatMap((requirement) => {
    if (requirement.kind !== 'coordinate') return [];
    const component = requirement.axis === 'x' ? unit.x : unit.y;
    const start = requirement.axis === 'x' ? origin.x : origin.y;
    return Math.abs(component) <= 1e-12
      ? (Math.abs(start - requirement.value) <= 1e-9 ? [] : [Number.NaN])
      : [(requirement.value - start) / component];
  });
  if (parameters.some((parameter) => !Number.isFinite(parameter) || parameter < 0)) return null;
  if (parameters.length > 1 && parameters.some((parameter) => Math.abs(parameter - parameters[0]) > 1e-9 * Math.max(1, Math.abs(parameter), Math.abs(parameters[0])))) return null;
  const parameter = parameters[0] ?? 0;
  return { x: origin.x + parameter * unit.x, y: origin.y + parameter * unit.y };
};

const directionRequirement = (candidate: ParallelInference | PerpendicularInference): GeometricRequirement | null => {
  if (!candidate.lineStart || !candidate.lineEnd) return null;
  const x = candidate.lineEnd.x - candidate.lineStart.x, y = candidate.lineEnd.y - candidate.lineStart.y;
  return candidate.type === 'parallel' ? { kind: 'direction', direction: { x, y } }
    : { kind: 'direction', direction: { x: -y, y: x } };
};

const normalizedSemanticDemands = (candidates: DrawingInferenceCandidates): readonly NormalizedDirectionDemand[] => {
  const demands: NormalizedDirectionDemand[] = [];
  candidates.parallels.forEach((candidate) => {
    const direction = candidate.lineStart && candidate.lineEnd && normalizeUnorientedDirection({
      x: candidate.lineEnd.x - candidate.lineStart.x, y: candidate.lineEnd.y - candidate.lineStart.y,
    });
    if (direction) demands.push({ id: `parallel:${candidate.entityId}`, direction, source: 'parallel',
      semanticRelation: 'parallel', referenceIdentity: candidate.entityId, screenDistance: candidate.screenDistance });
  });
  candidates.perpendiculars.forEach((candidate) => {
    const direction = candidate.lineStart && candidate.lineEnd && normalizeUnorientedDirection({
      x: -(candidate.lineEnd.y - candidate.lineStart.y), y: candidate.lineEnd.x - candidate.lineStart.x,
    });
    if (direction) demands.push({ id: `perpendicular:${candidate.entityId}`, direction, source: 'perpendicular',
      semanticRelation: 'perpendicular', referenceIdentity: candidate.entityId, screenDistance: candidate.screenDistance });
  });
  return demands;
};

/** Pure Drawing-wide channel acquisition followed by positional authority arbitration. */
export const resolveDrawingSnap = ({ rawPoint, candidates, previousSnap, ctrlOverride, axisDirectionActive = false, activeLineStart = null }: {
  rawPoint: DrawingPoint; candidates: DrawingInferenceCandidates; previousSnap: DrawingSnap | null; ctrlOverride: boolean;
  axisDirectionActive?: boolean; activeLineStart?: DrawingPoint | null;
}): DrawingSnap => {
  const emptyChannels: DrawingSnapChannels = { xAlignment: null, yAlignment: null, perpendicular: null, parallel: null, pointReference: null,
    directionAuthority: null, rejectedRedundantDirectionRelations: [] };
  const none = (channels = emptyChannels): DrawingSnap => ({ active: false, type: 'none', effectivePoint: rawPoint, screenDistance: null, channels });
  // Layer 0 hard guard: no acquired or retained channel can survive Ctrl.
  if (ctrlOverride) return none();

  const oldChannels = previousSnap?.channels ?? emptyChannels;
  const xReference = chooseAxis(candidates.alignmentsX, oldChannels.xAlignment);
  const yReference = chooseAxis(candidates.alignmentsY, oldChannels.yAlignment);
  // H/V is the exclusive direction authority. Retention is evaluated only in
  // the non-axis direction domain, while point-reference channels stay global.
  const coordinateRequirements: GeometricRequirement[] = [
    ...(xReference?.positionOwnership === 'defines-position' ? [{ kind: 'coordinate', axis: 'x', value: xReference.candidatePoint.x } as const] : []),
    ...(yReference?.positionOwnership === 'defines-position' ? [{ kind: 'coordinate', axis: 'y', value: yReference.candidatePoint.y } as const] : []),
  ];
  // Candidate families first become geometric demand groups. An acquired
  // coordinate may admit a compatible group through the normal release band;
  // this makes a fresh post-click frame compositional without family priority.
  const composableDemandGroups = activeLineStart && coordinateRequirements.length
    ? groupEquivalentDirectionDemands(normalizedSemanticDemands(candidates)).filter((group) =>
      group.demands.some(({ screenDistance }) => screenDistance <= Math.max(DRAWING_PARALLEL_SNAP_RELEASE_PX, DRAWING_PERPENDICULAR_SNAP_RELEASE_PX))
      && composeSoftRequirements(activeLineStart, [{ kind: 'direction', direction: group.direction }, ...coordinateRequirements]))
    : [];
  const composableReference = <T extends ParallelInference | PerpendicularInference>(items: readonly T[], source: T['type']) => {
    const identities = new Set(composableDemandGroups.flatMap(({ demands }) => demands
      .filter((demand) => demand.source === source).map(({ referenceIdentity }) => referenceIdentity)));
    return items.filter(({ entityId }) => identities.has(entityId)).sort((a, b) =>
      a.screenDistance - b.screenDistance || a.entityId.localeCompare(b.entityId))[0] ?? null;
  };
  const retainCompatibleDirection = <T extends ParallelInference | PerpendicularInference>(selected: T | null, old: T | null, items: readonly T[]) => {
    if (selected || !activeLineStart || coordinateRequirements.length === 0 || !old) return selected;
    const current = items.find(({ entityId }) => entityId === old.entityId);
    const requirement = current && directionRequirement(current);
    return current && requirement && composeSoftRequirements(activeLineStart, [requirement, ...coordinateRequirements]) ? current : null;
  };
  const oldPerpendicular = previousSnap?.channels?.perpendicular ?? null;
  const oldParallel = previousSnap?.channels?.parallel ?? null;
  const acquiredParallel = axisDirectionActive ? null : retainCompatibleDirection(
    chooseParallel(candidates.parallels ?? [], previousSnap) ?? composableReference(candidates.parallels ?? [], 'parallel'),
    oldParallel, candidates.parallels ?? []);
  const acquiredPerpendicular = axisDirectionActive ? null : retainCompatibleDirection(
    choosePerpendicular(candidates.perpendiculars ?? [], previousSnap) ?? composableReference(candidates.perpendiculars ?? [], 'perpendicular'),
    oldPerpendicular, candidates.perpendiculars ?? []);

  // Parallel and Perpendicular observations can describe the same unoriented
  // ray.  Such observations are plural geometric evidence, but authoring has
  // exactly one direction authority. Prefer Parallel as the stable semantic
  // representative of an equivalent group; otherwise retain the closer
  // independently acquired direction.
  const directionsEquivalent = acquiredParallel && acquiredPerpendicular && (() => {
    const parallelRequirement = directionRequirement(acquiredParallel);
    const perpendicularRequirement = directionRequirement(acquiredPerpendicular);
    const parallelDirection = parallelRequirement?.kind === 'direction' && normalizeUnorientedDirection(parallelRequirement.direction);
    const perpendicularDirection = perpendicularRequirement?.kind === 'direction' && normalizeUnorientedDirection(perpendicularRequirement.direction);
    return Boolean(parallelDirection && perpendicularDirection
      && groupEquivalentDirectionDemands([
        { id: `parallel:${acquiredParallel.entityId}`, direction: parallelDirection, source: 'parallel', semanticRelation: 'parallel',
          referenceIdentity: acquiredParallel.entityId, screenDistance: acquiredParallel.screenDistance },
        { id: `perpendicular:${acquiredPerpendicular.entityId}`, direction: perpendicularDirection, source: 'perpendicular', semanticRelation: 'perpendicular',
          referenceIdentity: acquiredPerpendicular.entityId, screenDistance: acquiredPerpendicular.screenDistance },
      ]).length === 1);
  })();
  const selectedRelation = acquiredParallel && acquiredPerpendicular
    ? (directionsEquivalent || acquiredParallel.screenDistance <= acquiredPerpendicular.screenDistance ? 'parallel' : 'perpendicular')
    : acquiredParallel ? 'parallel' : acquiredPerpendicular ? 'perpendicular' : null;
  const parallel = selectedRelation === 'parallel' ? acquiredParallel : null;
  const perpendicular = selectedRelation === 'perpendicular' ? acquiredPerpendicular : null;
  const rejectedRedundantDirectionRelations: DrawingSnapChannels['rejectedRedundantDirectionRelations'] = directionsEquivalent && acquiredPerpendicular
    ? [{ relation: 'perpendicular', referenceLineId: acquiredPerpendicular.entityId,
      reason: 'equivalent direction already governed by preferred authority' }]
    : [];
  const selectedDirectionCandidate = selectedRelation === 'parallel' ? parallel : selectedRelation === 'perpendicular' ? perpendicular : null;
  const directionAuthority: DrawingSnapChannels['directionAuthority'] = selectedDirectionCandidate?.lineStart && selectedDirectionCandidate.lineEnd
    ? { relation: selectedRelation!, referenceLineId: selectedDirectionCandidate.entityId,
      referenceLineStart: selectedDirectionCandidate.lineStart, referenceLineEnd: selectedDirectionCandidate.lineEnd,
      reason: directionsEquivalent && selectedRelation === 'parallel'
        ? 'preferred representative of equivalent direction observations'
        : 'nearest acquired non-axis direction' }
    : null;
  const parallelPositionCandidate = parallel;
  const perpendicularPositionCandidate = perpendicular;
  const pointReference = choosePointReference(candidates.pointReferences ?? [], previousSnap);
  const channels: DrawingSnapChannels = { xAlignment: xReference, yAlignment: yReference, perpendicular, parallel, pointReference,
    directionAuthority, rejectedRedundantDirectionRelations };

  // Hysteresis stabilizes a class; it never changes this authority ordering.
  const endpoint = chooseEndpoint(candidates.endpoints, previousSnap);
  if (endpoint) return { active: true, type: 'endpoint', effectivePoint: endpoint.candidatePoint, entityId: endpoint.entityId,
    endpoint: endpoint.endpoint, screenDistance: endpoint.screenDistance, channels };

  const retainedMidpoint = previousSnap?.type === 'midpoint'
    ? (candidates.midpoints ?? []).find(({ stableKey }) => stableKey === previousSnap.stableKey) : null;
  const midpoint = retainedMidpoint && retainedMidpoint.screenDistance <= DRAWING_MIDPOINT_SNAP_RELEASE_PX
    ? retainedMidpoint : (candidates.midpoints ?? []).find(({ screenDistance }) => screenDistance <= DRAWING_MIDPOINT_SNAP_ACQUIRE_PX);
  if (midpoint) return { active: true, type: 'midpoint', effectivePoint: midpoint.candidatePoint, entityId: midpoint.entityId,
    stableKey: midpoint.stableKey, screenDistance: midpoint.screenDistance, channels };

  const retainedLine = previousSnap?.type === 'line'
    ? candidates.lines.find(({ entityId }) => entityId === previousSnap.entityId) : null;
  const line = retainedLine && retainedLine.screenDistance <= DRAWING_LINE_SNAP_RELEASE_PX
    ? retainedLine : candidates.lines.find(({ screenDistance }) => screenDistance <= DRAWING_LINE_SNAP_ACQUIRE_PX);
  if (line) return { active: true, type: 'line', effectivePoint: line.candidatePoint, entityId: line.entityId,
    segmentParameter: line.segmentParameter, screenDistance: line.screenDistance, lineStart: line.lineStart, lineEnd: line.lineEnd, channels };
  if (pointReference) return { active: true, type: 'point-reference', effectivePoint: pointReference.candidatePoint,
    screenDistance: pointReference.screenDistance, sourcePointId: pointReference.sourcePointId,
    incidentLineId: pointReference.incidentLineId, supportOrigin: pointReference.supportOrigin,
    supportDirection: pointReference.supportDirection, constructionKey: pointReference.constructionKey, channels };
  if (parallelPositionCandidate) return { active: true, type: 'parallel', effectivePoint: parallelPositionCandidate.candidatePoint,
    entityId: parallelPositionCandidate.entityId, screenDistance: parallelPositionCandidate.screenDistance, channels };
  if (perpendicularPositionCandidate) return { active: true, type: 'perpendicular', effectivePoint: perpendicularPositionCandidate.candidatePoint,
    entityId: perpendicularPositionCandidate.entityId, screenDistance: perpendicularPositionCandidate.screenDistance, channels };
  if (xReference || yReference) return { active: true, type: 'alignment',
    effectivePoint: {
      x: xReference?.positionOwnership !== 'reference-only' ? xReference?.candidatePoint.x ?? rawPoint.x : rawPoint.x,
      y: yReference?.positionOwnership !== 'reference-only' ? yReference?.candidatePoint.y ?? rawPoint.y : rawPoint.y,
    },
    screenDistance: Math.max(xReference?.screenDistance ?? 0, yReference?.screenDistance ?? 0), xReference, yReference, channels };
  return none(channels);
};

/** Removes Line-to-Line direction presentation after final H/V authority is known. */
export const suppressDirectionRelations = (snap: DrawingSnap): DrawingSnap => {
  const channels = { ...snap.channels, perpendicular: null, parallel: null, directionAuthority: null };
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
