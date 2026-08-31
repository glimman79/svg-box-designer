import type { DrawingPoint } from './drawingTypes';
import type { DrawingInference } from './drawingInference';

export const DRAWING_ENDPOINT_SNAP_ACQUIRE_PX = 9;
export const DRAWING_ENDPOINT_SNAP_RELEASE_PX = 12;
export const DRAWING_LINE_SNAP_ACQUIRE_PX = 8;
export const DRAWING_LINE_SNAP_RELEASE_PX = 11;
export const DRAWING_ALIGNMENT_SNAP_ACQUIRE_PX = 8;
export const DRAWING_ALIGNMENT_SNAP_RELEASE_PX = 11;

export type DrawingSnap = Readonly<{
  type: 'none'; active: false; effectivePoint: DrawingPoint; screenDistance: null;
}> | Readonly<{
  type: 'endpoint'; active: true; effectivePoint: DrawingPoint; entityId: string;
  endpoint: 'start' | 'end'; screenDistance: number;
}> | Readonly<{
  type: 'line'; active: true; effectivePoint: DrawingPoint; entityId: string;
  segmentParameter: number; screenDistance: number;
}> | Readonly<{
  type: 'alignment'; active: true; effectivePoint: DrawingPoint; screenDistance: number;
  xReference: Extract<DrawingInference, { type: 'alignment-x' }> | null;
  yReference: Extract<DrawingInference, { type: 'alignment-y' }> | null;
}>;

export type DrawingInferenceCandidates = Readonly<{
  endpoints: ReadonlyArray<Extract<DrawingInference, { type: 'endpoint' }>>;
  lines: ReadonlyArray<Extract<DrawingInference, { type: 'line' }>>;
  alignmentsX: ReadonlyArray<Extract<DrawingInference, { type: 'alignment-x' }>>;
  alignmentsY: ReadonlyArray<Extract<DrawingInference, { type: 'alignment-y' }>>;
}>;

const sameCandidate = (candidate: DrawingInference, previous: DrawingSnap) => candidate.type === previous.type
  && candidate.type !== 'none' && previous.type !== 'none'
  && candidate.entityId === previous.entityId
  && (candidate.type !== 'endpoint' || previous.type !== 'endpoint' || candidate.endpoint === previous.endpoint);

const fromCandidate = (candidate: Exclude<DrawingInference, { type: 'none' }>): DrawingSnap => candidate.type === 'endpoint'
  ? { active: true, type: 'endpoint', effectivePoint: candidate.candidatePoint, entityId: candidate.entityId, endpoint: candidate.endpoint, screenDistance: candidate.screenDistance }
  : candidate.type === 'line'
    ? { active: true, type: 'line', effectivePoint: candidate.candidatePoint, entityId: candidate.entityId, segmentParameter: candidate.segmentParameter, screenDistance: candidate.screenDistance }
    : { active: true, type: 'alignment', effectivePoint: candidate.candidatePoint, screenDistance: candidate.screenDistance, xReference: candidate.type === 'alignment-x' ? candidate : null, yReference: candidate.type === 'alignment-y' ? candidate : null };

/** Pure Drawing-wide spatial snap arbitration. Tool-specific inference does not belong here. */
export const resolveDrawingSnap = ({ rawPoint, candidates, previousSnap, ctrlOverride }: {
  rawPoint: DrawingPoint;
  candidates: DrawingInferenceCandidates;
  previousSnap: DrawingSnap | null;
  ctrlOverride: boolean;
}): DrawingSnap => {
  const none: DrawingSnap = { active: false, type: 'none', effectivePoint: rawPoint, screenDistance: null };
  if (ctrlOverride) return none;

  // An acquired endpoint always supersedes a retained line snap.
  const endpoint = candidates.endpoints[0] ?? null;
  const line = candidates.lines[0] ?? null;
  if (endpoint && endpoint.screenDistance <= DRAWING_ENDPOINT_SNAP_ACQUIRE_PX
    && previousSnap?.type === 'line') return fromCandidate(endpoint);

  if (previousSnap?.active) {
    const candidate = (previousSnap.type === 'endpoint' ? candidates.endpoints : previousSnap.type === 'line' ? candidates.lines : [])
      .find((item) => sameCandidate(item, previousSnap));
    const release = previousSnap.type === 'endpoint' ? DRAWING_ENDPOINT_SNAP_RELEASE_PX : DRAWING_LINE_SNAP_RELEASE_PX;
    if (candidate && sameCandidate(candidate, previousSnap) && candidate.screenDistance <= release) return fromCandidate(candidate);
  }
  if (endpoint && endpoint.screenDistance <= DRAWING_ENDPOINT_SNAP_ACQUIRE_PX) return fromCandidate(endpoint);
  if (line && line.screenDistance <= DRAWING_LINE_SNAP_ACQUIRE_PX) return fromCandidate(line);
  const retained = previousSnap?.type === 'alignment' ? previousSnap : null;
  const chooseAxis = <T extends Extract<DrawingInference, { type: 'alignment-x' | 'alignment-y' }>>(items: ReadonlyArray<T>, old: T | null): T | null => {
    const held = old && items.find((item) => item.referenceId === old.referenceId);
    if (held && held.screenDistance <= DRAWING_ALIGNMENT_SNAP_RELEASE_PX) return held;
    const first = items[0];
    return first && first.screenDistance <= DRAWING_ALIGNMENT_SNAP_ACQUIRE_PX ? first : null;
  };
  const xReference = chooseAxis(candidates.alignmentsX, retained?.xReference ?? null);
  const yReference = chooseAxis(candidates.alignmentsY, retained?.yReference ?? null);
  if (xReference || yReference) return {
    active: true,
    type: 'alignment',
    effectivePoint: { x: xReference?.candidatePoint.x ?? rawPoint.x, y: yReference?.candidatePoint.y ?? rawPoint.y },
    screenDistance: Math.max(xReference?.screenDistance ?? 0, yReference?.screenDistance ?? 0),
    xReference,
    yReference,
  };
  return none;
};
