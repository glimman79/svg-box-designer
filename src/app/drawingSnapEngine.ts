import type { DrawingPoint } from './drawingTypes';
import type { DrawingInference } from './drawingInference';

export const DRAWING_ENDPOINT_SNAP_ACQUIRE_PX = 9;
export const DRAWING_ENDPOINT_SNAP_RELEASE_PX = 12;
export const DRAWING_LINE_SNAP_ACQUIRE_PX = 8;
export const DRAWING_LINE_SNAP_RELEASE_PX = 11;
export const DRAWING_ALIGNMENT_SNAP_ACQUIRE_PX = 8;
export const DRAWING_ALIGNMENT_SNAP_RELEASE_PX = 11;
export const DRAWING_PERPENDICULAR_SNAP_ACQUIRE_PX = 8;
export const DRAWING_PERPENDICULAR_SNAP_RELEASE_PX = 11;

type EndpointInference = Extract<DrawingInference, { type: 'endpoint' }>;
type LineInference = Extract<DrawingInference, { type: 'line' }>;
type PerpendicularInference = Extract<DrawingInference, { type: 'perpendicular' }>;
type AlignmentXInference = Extract<DrawingInference, { type: 'alignment-x' }>;
type AlignmentYInference = Extract<DrawingInference, { type: 'alignment-y' }>;

/** Independent transient channels. Positional arbitration may choose only one point,
 * but it must not erase compatible construction/presentation intent. */
export type DrawingSnapChannels = Readonly<{
  xAlignment: AlignmentXInference | null;
  yAlignment: AlignmentYInference | null;
  perpendicular: PerpendicularInference | null;
}>;

type SnapBase = Readonly<{ channels: DrawingSnapChannels }>;
export type DrawingSnap = (Readonly<{
  type: 'none'; active: false; effectivePoint: DrawingPoint; screenDistance: null;
}> | Readonly<{
  type: 'perpendicular'; active: true; effectivePoint: DrawingPoint; entityId: string; screenDistance: number;
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
  lines: ReadonlyArray<LineInference>;
  alignmentsX: ReadonlyArray<AlignmentXInference>;
  alignmentsY: ReadonlyArray<AlignmentYInference>;
  perpendiculars: ReadonlyArray<PerpendicularInference>;
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
  const held = old && items.find((item) => item.referenceId === old.referenceId);
  if (held && held.screenDistance <= DRAWING_ALIGNMENT_SNAP_RELEASE_PX) return held;
  const first = items[0];
  return first && first.screenDistance <= DRAWING_ALIGNMENT_SNAP_ACQUIRE_PX ? first : null;
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

/** Pure Drawing-wide channel acquisition followed by positional authority arbitration. */
export const resolveDrawingSnap = ({ rawPoint, candidates, previousSnap, ctrlOverride }: {
  rawPoint: DrawingPoint; candidates: DrawingInferenceCandidates; previousSnap: DrawingSnap | null; ctrlOverride: boolean;
}): DrawingSnap => {
  const emptyChannels: DrawingSnapChannels = { xAlignment: null, yAlignment: null, perpendicular: null };
  const none = (channels = emptyChannels): DrawingSnap => ({ active: false, type: 'none', effectivePoint: rawPoint, screenDistance: null, channels });
  // Layer 0 hard guard: no acquired or retained channel can survive Ctrl.
  if (ctrlOverride) return none();

  const oldChannels = previousSnap?.channels ?? emptyChannels;
  const xReference = chooseAxis(candidates.alignmentsX, oldChannels.xAlignment);
  const yReference = chooseAxis(candidates.alignmentsY, oldChannels.yAlignment);
  const perpendicular = choosePerpendicular(candidates.perpendiculars, previousSnap);
  const channels: DrawingSnapChannels = { xAlignment: xReference, yAlignment: yReference, perpendicular };

  // Hysteresis stabilizes a class; it never changes this authority ordering.
  const endpoint = chooseEndpoint(candidates.endpoints, previousSnap);
  if (endpoint) return { active: true, type: 'endpoint', effectivePoint: endpoint.candidatePoint, entityId: endpoint.entityId,
    endpoint: endpoint.endpoint, screenDistance: endpoint.screenDistance, channels };

  const retainedLine = previousSnap?.type === 'line'
    ? candidates.lines.find(({ entityId }) => entityId === previousSnap.entityId) : null;
  const line = retainedLine && retainedLine.screenDistance <= DRAWING_LINE_SNAP_RELEASE_PX
    ? retainedLine : candidates.lines.find(({ screenDistance }) => screenDistance <= DRAWING_LINE_SNAP_ACQUIRE_PX);
  if (line) return { active: true, type: 'line', effectivePoint: line.candidatePoint, entityId: line.entityId,
    segmentParameter: line.segmentParameter, screenDistance: line.screenDistance, lineStart: line.lineStart, lineEnd: line.lineEnd, channels };
  if (perpendicular) return { active: true, type: 'perpendicular', effectivePoint: perpendicular.candidatePoint,
    entityId: perpendicular.entityId, screenDistance: perpendicular.screenDistance, channels };
  if (xReference || yReference) return { active: true, type: 'alignment',
    effectivePoint: { x: xReference?.candidatePoint.x ?? rawPoint.x, y: yReference?.candidatePoint.y ?? rawPoint.y },
    screenDistance: Math.max(xReference?.screenDistance ?? 0, yReference?.screenDistance ?? 0), xReference, yReference, channels };
  return none(channels);
};
