import type { DrawingPoint, ResolvedDrawingLine } from './drawingTypes';
import type { AffineTransform, CoordinatePoint } from './drawingTransform';

export const DRAWING_ENDPOINT_INFERENCE_TOLERANCE_PX = 9;
export const DRAWING_LINE_INFERENCE_TOLERANCE_PX = 8;
export const DRAWING_ALIGNMENT_INFERENCE_TOLERANCE_PX = 8;
export const DRAWING_PERPENDICULAR_INFERENCE_TOLERANCE_PX = 8;

export type DrawingModelBounds = Readonly<{ x: number; y: number; width: number; height: number }>;
export type DrawingReferencePoint = Readonly<{ id: string; entityId: string; point: DrawingPoint }>;

export type DrawingInference = Readonly<{
  type: 'none';
  screenDistance: null;
}> | Readonly<{
  type: 'perpendicular';
  entityId: string;
  candidatePoint: DrawingPoint;
  screenDistance: number;
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
  lineStart: DrawingPoint;
  lineEnd: DrawingPoint;
}> | Readonly<{
  type: 'alignment-x';
  referenceId: string;
  entityId: string;
  candidatePoint: DrawingPoint;
  referencePoint?: DrawingPoint;
  screenDistance: number;
  constructionKey?: string;
}> | Readonly<{
  type: 'alignment-y';
  referenceId: string;
  entityId: string;
  candidatePoint: DrawingPoint;
  referencePoint?: DrawingPoint;
  screenDistance: number;
  constructionKey?: string;
}>;

export const NO_DRAWING_INFERENCE: DrawingInference = { type: 'none', screenDistance: null };
export type DrawingInferenceCandidates = Readonly<{
  endpoints: ReadonlyArray<Extract<DrawingInference, { type: 'endpoint' }>>;
  lines: ReadonlyArray<Extract<DrawingInference, { type: 'line' }>>;
  alignmentsX: ReadonlyArray<Extract<DrawingInference, { type: 'alignment-x' }>>;
  alignmentsY: ReadonlyArray<Extract<DrawingInference, { type: 'alignment-y' }>>;
  perpendiculars: ReadonlyArray<Extract<DrawingInference, { type: 'perpendicular' }>>;
}>;

const toScreenPoint = (point: CoordinatePoint, transform: AffineTransform): CoordinatePoint => ({
  x: transform.a * point.x + transform.c * point.y + transform.e,
  y: transform.b * point.x + transform.d * point.y + transform.f,
});

/** Extracts stable, meaningful geometric vertices without coupling inference to a tool. */
export const collectDrawingReferencePoints = (entities: ReadonlyArray<ResolvedDrawingLine>): DrawingReferencePoint[] => {
  const references: DrawingReferencePoint[] = [];
  const coordinates = new Set<string>();
  for (const entity of entities) {
    const points = entity.type === 'line' ? ([['start', entity.start], ['end', entity.end]] as const) : [];
    for (const [name, point] of points) {
      const coordinateKey = `${point.x},${point.y}`;
      if (coordinates.has(coordinateKey)) continue;
      coordinates.add(coordinateKey);
      references.push({ id: `${entity.id}:${name}`, entityId: entity.id, point });
    }
  }
  return references;
};

export const isPointInDrawingBounds = (point: DrawingPoint, bounds: DrawingModelBounds, epsilon = 1e-9) => (
  point.x >= bounds.x - epsilon && point.x <= bounds.x + bounds.width + epsilon
  && point.y >= bounds.y - epsilon && point.y <= bounds.y + bounds.height + epsilon
);

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
  lines: ReadonlyArray<ResolvedDrawingLine>,
  drawingToClientTransform: AffineTransform,
  visibleBounds?: DrawingModelBounds,
  activeLineStart?: DrawingPoint | null,
  activeAngularDegrees?: number | null,
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
        lineStart: line.start,
        lineEnd: line.end,
      });
  }
  const alignmentsX: Array<Extract<DrawingInference, { type: 'alignment-x' }>> = [];
  const alignmentsY: Array<Extract<DrawingInference, { type: 'alignment-y' }>> = [];
  const perpendiculars: Array<Extract<DrawingInference, { type: 'perpendicular' }>> = [];
  if (activeLineStart) for (const line of lines) {
    const dx = line.end.x - line.start.x, dy = line.end.y - line.start.y, length = Math.hypot(dx, dy);
    if (length <= 1e-9) continue;
    const nx = -dy / length, ny = dx / length;
    const pointerModel = clientToModelPointForInference(pointerClientPoint, drawingToClientTransform);
    if (!pointerModel) continue;
    const radial = (pointerModel.x - activeLineStart.x) * nx + (pointerModel.y - activeLineStart.y) * ny;
    if (Math.abs(radial) <= 1e-9) continue;
    const candidatePoint = { x: activeLineStart.x + radial * nx, y: activeLineStart.y + radial * ny };
    const screen = toScreenPoint(candidatePoint, drawingToClientTransform);
    perpendiculars.push({ type: 'perpendicular', entityId: line.id, candidatePoint, screenDistance: Math.hypot(pointerClientPoint.x - screen.x, pointerClientPoint.y - screen.y) });
  }
  if (visibleBounds) {
    const radians = activeAngularDegrees === null || activeAngularDegrees === undefined ? null : activeAngularDegrees * Math.PI / 180;
    const angularDirection = radians === null ? null : {
      x: Math.abs(Math.cos(radians)) <= 1e-12 ? 0 : Math.cos(radians),
      y: Math.abs(Math.sin(radians)) <= 1e-12 ? 0 : Math.sin(radians),
    };
    const constructionKey = angularDirection && activeLineStart
      ? `${activeLineStart.x},${activeLineStart.y}:${activeAngularDegrees}` : undefined;
    for (const reference of collectDrawingReferencePoints(lines).filter(({ point }) => isPointInDrawingBounds(point, visibleBounds))) {
      if (angularDirection && activeLineStart) {
        if (Math.abs(angularDirection.x) > 1e-12) {
          const t = (reference.point.x - activeLineStart.x) / angularDirection.x;
          if (Number.isFinite(t) && t >= 0) {
            const candidatePoint = { x: reference.point.x, y: activeLineStart.y + t * angularDirection.y };
            const screen = toScreenPoint(candidatePoint, drawingToClientTransform);
            alignmentsX.push({ type: 'alignment-x', referenceId: reference.id, entityId: reference.entityId, candidatePoint, referencePoint: reference.point,
              screenDistance: Math.hypot(pointerClientPoint.x - screen.x, pointerClientPoint.y - screen.y), constructionKey });
          }
        }
        if (Math.abs(angularDirection.y) > 1e-12) {
          const t = (reference.point.y - activeLineStart.y) / angularDirection.y;
          if (Number.isFinite(t) && t >= 0) {
            const candidatePoint = { x: activeLineStart.x + t * angularDirection.x, y: reference.point.y };
            const screen = toScreenPoint(candidatePoint, drawingToClientTransform);
            alignmentsY.push({ type: 'alignment-y', referenceId: reference.id, entityId: reference.entityId, candidatePoint, referencePoint: reference.point,
              screenDistance: Math.hypot(pointerClientPoint.x - screen.x, pointerClientPoint.y - screen.y), constructionKey });
          }
        }
        continue;
      }
      const xScreen = toScreenPoint({ x: reference.point.x, y: 0 }, drawingToClientTransform);
      const yScreen = toScreenPoint({ x: 0, y: reference.point.y }, drawingToClientTransform);
      const pointerModel = clientToModelPointForInference(pointerClientPoint, drawingToClientTransform);
      if (!pointerModel) continue;
      const rawXScreen = toScreenPoint({ x: pointerModel.x, y: 0 }, drawingToClientTransform);
      const rawYScreen = toScreenPoint({ x: 0, y: pointerModel.y }, drawingToClientTransform);
      alignmentsX.push({ type: 'alignment-x', referenceId: reference.id, entityId: reference.entityId, candidatePoint: reference.point, screenDistance: Math.hypot(rawXScreen.x - xScreen.x, rawXScreen.y - xScreen.y) });
      alignmentsY.push({ type: 'alignment-y', referenceId: reference.id, entityId: reference.entityId, candidatePoint: reference.point, screenDistance: Math.hypot(rawYScreen.x - yScreen.x, rawYScreen.y - yScreen.y) });
    }
  }
  const stableSort = <T extends { screenDistance: number; referenceId?: string }>(a: T, b: T) => a.screenDistance - b.screenDistance || (a.referenceId ?? '').localeCompare(b.referenceId ?? '');
  return {
    endpoints: endpoints.sort((a, b) => a.screenDistance - b.screenDistance || `${a.entityId}:${a.endpoint}`.localeCompare(`${b.entityId}:${b.endpoint}`)),
    lines: lineCandidates.sort((a, b) => a.screenDistance - b.screenDistance || a.entityId.localeCompare(b.entityId)),
    alignmentsX: alignmentsX.sort(stableSort),
    alignmentsY: alignmentsY.sort(stableSort),
    perpendiculars: perpendiculars.sort((a, b) => a.screenDistance - b.screenDistance || a.entityId.localeCompare(b.entityId)),
  };
};

const clientToModelPointForInference = (point: CoordinatePoint, transform: AffineTransform): CoordinatePoint | null => {
  const determinant = transform.a * transform.d - transform.b * transform.c;
  if (Math.abs(determinant) < Number.EPSILON) return null;
  return {
    x: (transform.d * (point.x - transform.e) - transform.c * (point.y - transform.f)) / determinant,
    y: (-transform.b * (point.x - transform.e) + transform.a * (point.y - transform.f)) / determinant,
  };
};

/** Backward-compatible visual inference resolver using acquire tolerances. */
export const resolveDrawingInference = (pointerClientPoint: CoordinatePoint, lines: ReadonlyArray<ResolvedDrawingLine>, drawingToClientTransform: AffineTransform): DrawingInference => {
  const candidates = collectDrawingInferenceCandidates(pointerClientPoint, lines, drawingToClientTransform);
  if (candidates.endpoints[0] && candidates.endpoints[0].screenDistance <= DRAWING_ENDPOINT_INFERENCE_TOLERANCE_PX) return candidates.endpoints[0];
  if (candidates.lines[0] && candidates.lines[0].screenDistance <= DRAWING_LINE_INFERENCE_TOLERANCE_PX) return candidates.lines[0];
  return NO_DRAWING_INFERENCE;
};
