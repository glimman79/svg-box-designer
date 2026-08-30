import type { DrawingLineEntity, DrawingPoint } from './drawingTypes';
import type { AffineTransform, CoordinatePoint } from './drawingTransform';

export const DRAWING_ENDPOINT_INFERENCE_TOLERANCE_PX = 9;
export const DRAWING_LINE_INFERENCE_TOLERANCE_PX = 8;

export type DrawingInference = Readonly<{
  type: 'none';
  screenDistance: null;
}> | Readonly<{
  type: 'endpoint';
  entityId: string;
  endpoint: 'start' | 'end';
  candidatePoint: DrawingPoint;
  screenDistance: number;
}> | Readonly<{
  type: 'line';
  entityId: string;
  candidatePoint: DrawingPoint;
  segmentParameter: number;
  screenDistance: number;
}>;

export const NO_DRAWING_INFERENCE: DrawingInference = { type: 'none', screenDistance: null };
export type DrawingInferenceCandidates = Readonly<{
  endpoints: ReadonlyArray<Extract<DrawingInference, { type: 'endpoint' }>>;
  lines: ReadonlyArray<Extract<DrawingInference, { type: 'line' }>>;
}>;

const toScreenPoint = (point: CoordinatePoint, transform: AffineTransform): CoordinatePoint => ({
  x: transform.a * point.x + transform.c * point.y + transform.e,
  y: transform.b * point.x + transform.d * point.y + transform.f,
});

export const distancePointToSegment = (
  point: CoordinatePoint,
  start: CoordinatePoint,
  end: CoordinatePoint,
): Readonly<{ distance: number; parameter: number }> => {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return { distance: Math.hypot(point.x - start.x, point.y - start.y), parameter: 0 };
  const parameter = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared));
  return {
    distance: Math.hypot(point.x - (start.x + parameter * dx), point.y - (start.y + parameter * dy)),
    parameter,
  };
};

/** Resolves visual-only inference against committed active-sketch lines in client pixels. */
export const collectDrawingInferenceCandidates = (
  pointerClientPoint: CoordinatePoint,
  lines: ReadonlyArray<DrawingLineEntity>,
  drawingToClientTransform: AffineTransform,
): DrawingInferenceCandidates => {
  const endpoints: Array<Extract<DrawingInference, { type: 'endpoint' }>> = [];
  for (const line of lines) {
    for (const endpoint of ['start', 'end'] as const) {
      const candidatePoint = line[endpoint];
      const screenPoint = toScreenPoint(candidatePoint, drawingToClientTransform);
      const screenDistance = Math.hypot(pointerClientPoint.x - screenPoint.x, pointerClientPoint.y - screenPoint.y);
      endpoints.push({ type: 'endpoint', entityId: line.id, endpoint, candidatePoint, screenDistance });
    }
  }
  const lineCandidates: Array<Extract<DrawingInference, { type: 'line' }>> = [];
  for (const line of lines) {
    const start = toScreenPoint(line.start, drawingToClientTransform);
    const end = toScreenPoint(line.end, drawingToClientTransform);
    const { distance: screenDistance, parameter } = distancePointToSegment(pointerClientPoint, start, end);
    lineCandidates.push({
        type: 'line',
        entityId: line.id,
        candidatePoint: {
          x: line.start.x + parameter * (line.end.x - line.start.x),
          y: line.start.y + parameter * (line.end.y - line.start.y),
        },
        segmentParameter: parameter,
        screenDistance,
      });
  }
  return {
    endpoints: endpoints.sort((a, b) => a.screenDistance - b.screenDistance),
    lines: lineCandidates.sort((a, b) => a.screenDistance - b.screenDistance),
  };
};

/** Backward-compatible visual inference resolver using acquire tolerances. */
export const resolveDrawingInference = (pointerClientPoint: CoordinatePoint, lines: ReadonlyArray<DrawingLineEntity>, drawingToClientTransform: AffineTransform): DrawingInference => {
  const candidates = collectDrawingInferenceCandidates(pointerClientPoint, lines, drawingToClientTransform);
  if (candidates.endpoints[0] && candidates.endpoints[0].screenDistance <= DRAWING_ENDPOINT_INFERENCE_TOLERANCE_PX) return candidates.endpoints[0];
  if (candidates.lines[0] && candidates.lines[0].screenDistance <= DRAWING_LINE_INFERENCE_TOLERANCE_PX) return candidates.lines[0];
  return NO_DRAWING_INFERENCE;
};
