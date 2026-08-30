import type { DrawingPoint } from './drawingTypes';
import type { DrawingInference } from './drawingInference';

export const DRAWING_ENDPOINT_SNAP_ACQUIRE_PX = 9;
export const DRAWING_ENDPOINT_SNAP_RELEASE_PX = 12;
export const DRAWING_LINE_SNAP_ACQUIRE_PX = 8;
export const DRAWING_LINE_SNAP_RELEASE_PX = 11;

export type DrawingSnap = Readonly<{
  type: 'none'; active: false; effectivePoint: DrawingPoint; screenDistance: null;
}> | Readonly<{
  type: 'endpoint'; active: true; effectivePoint: DrawingPoint; entityId: string;
  endpoint: 'start' | 'end'; screenDistance: number;
}> | Readonly<{
  type: 'line'; active: true; effectivePoint: DrawingPoint; entityId: string;
  segmentParameter: number; screenDistance: number;
}>;

export type DrawingInferenceCandidates = Readonly<{
  endpoints: ReadonlyArray<Extract<DrawingInference, { type: 'endpoint' }>>;
  lines: ReadonlyArray<Extract<DrawingInference, { type: 'line' }>>;
}>;

const sameCandidate = (candidate: DrawingInference, previous: DrawingSnap) => candidate.type === previous.type
  && candidate.type !== 'none' && previous.type !== 'none'
  && candidate.entityId === previous.entityId
  && (candidate.type !== 'endpoint' || previous.type !== 'endpoint' || candidate.endpoint === previous.endpoint);

const fromCandidate = (candidate: Exclude<DrawingInference, { type: 'none' }>): DrawingSnap => candidate.type === 'endpoint'
  ? { active: true, type: 'endpoint', effectivePoint: candidate.candidatePoint, entityId: candidate.entityId, endpoint: candidate.endpoint, screenDistance: candidate.screenDistance }
  : { active: true, type: 'line', effectivePoint: candidate.candidatePoint, entityId: candidate.entityId, segmentParameter: candidate.segmentParameter, screenDistance: candidate.screenDistance };

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
    const candidate = (previousSnap.type === 'endpoint' ? candidates.endpoints : candidates.lines)
      .find((item) => sameCandidate(item, previousSnap));
    const release = previousSnap.type === 'endpoint' ? DRAWING_ENDPOINT_SNAP_RELEASE_PX : DRAWING_LINE_SNAP_RELEASE_PX;
    if (candidate && sameCandidate(candidate, previousSnap) && candidate.screenDistance <= release) return fromCandidate(candidate);
  }
  if (endpoint && endpoint.screenDistance <= DRAWING_ENDPOINT_SNAP_ACQUIRE_PX) return fromCandidate(endpoint);
  if (line && line.screenDistance <= DRAWING_LINE_SNAP_ACQUIRE_PX) return fromCandidate(line);
  return none;
};
