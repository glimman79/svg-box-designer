import type { AffineTransform, CoordinatePoint } from './drawingTransform.js';
import type { DrawingPoint, DrawingSketchPoint, ResolvedDrawingArc, ResolvedDrawingCircle } from './drawingTypes.js';
import { projectPointToArc } from './drawingArcGeometry.js';
import { deriveArcThroughThreePoints, distanceToArc } from './drawingArcGeometry.js';

export const DRAWING_CURVE_SNAP_ACQUIRE_PX = 5;
export const DRAWING_CURVE_SNAP_RELEASE_PX = 7;
export const DRAWING_CIRCUMFERENCE_POINT_ACQUIRE_PX = 7;
export const DRAWING_CIRCUMFERENCE_POINT_RELEASE_PX = 9;

const toClient = (point: DrawingPoint, transform: AffineTransform): CoordinatePoint => ({
  x: transform.a * point.x + transform.c * point.y + transform.e,
  y: transform.b * point.x + transform.d * point.y + transform.f,
});

export type DrawingCurveSnapCandidate = Readonly<{
  curveId: string;
  point: DrawingPoint;
  screenDistance: number;
}>;

/** Exact model-space projection onto semantic Circle geometry (never tessellation). */
export const projectPointToCircle = (point: DrawingPoint, circle: ResolvedDrawingCircle): DrawingPoint => {
  const dx = point.x - circle.center.x, dy = point.y - circle.center.y;
  const length = Math.hypot(dx, dy);
  // The nearest point is undefined at the center. Pick the positive model X
  // direction deterministically so acquisition remains finite and repeatable.
  return length > 1e-12
    ? { x: circle.center.x + circle.radius * dx / length, y: circle.center.y + circle.radius * dy / length }
    : { x: circle.center.x + circle.radius, y: circle.center.y };
};
export const projectPointToDrawingCurve = (point: DrawingPoint, curve: ResolvedDrawingCircle | ResolvedDrawingArc): DrawingPoint =>
  curve.type === 'circle' ? projectPointToCircle(point, curve) : projectPointToArc(point, curve);

export const resolvePointOnCurveSnap = ({ rawPoint, pointerClient, circles = [], curves = circles, transform, previousCurveId }: {
  rawPoint: DrawingPoint; pointerClient: CoordinatePoint; circles?: readonly ResolvedDrawingCircle[];
  curves?: readonly (ResolvedDrawingCircle | ResolvedDrawingArc)[];
  transform: AffineTransform; previousCurveId: string | null;
}): DrawingCurveSnapCandidate | null => {
  const candidates = curves.map((curve) => {
    const point = projectPointToDrawingCurve(rawPoint, curve), client = toClient(point, transform);
    return { curveId: curve.id, point, screenDistance: Math.hypot(pointerClient.x - client.x, pointerClient.y - client.y) };
  }).sort((a, b) => a.screenDistance - b.screenDistance || a.curveId.localeCompare(b.curveId));
  const acquired = candidates.find(({ screenDistance }) => screenDistance <= DRAWING_CURVE_SNAP_ACQUIRE_PX);
  if (acquired) return acquired;
  const retained = candidates.find(({ curveId }) => curveId === previousCurveId);
  return retained && retained.screenDistance <= DRAWING_CURVE_SNAP_RELEASE_PX ? retained : null;
};

export type DrawingCircumferencePointCandidate = Readonly<{
  pointId: string;
  point: DrawingPoint;
  radius: number;
  screenDistance: number;
}>;

/** Finds points reached by the candidate circumference. Pointer angle is irrelevant. */
export const resolveCircumferencePointSnap = ({ center, rawPoint, points, transform, previousPointId }: {
  center: DrawingPoint; rawPoint: DrawingPoint; points: readonly DrawingSketchPoint[];
  transform: AffineTransform; previousPointId: string | null;
}): DrawingCircumferencePointCandidate | null => {
  const rawRadius = Math.hypot(rawPoint.x - center.x, rawPoint.y - center.y);
  const candidates = points.flatMap((point) => {
    const dx = point.x - center.x, dy = point.y - center.y, radius = Math.hypot(dx, dy);
    if (radius <= 1e-12 || !Number.isFinite(rawRadius)) return [];
    const onCandidate = { x: center.x + dx * rawRadius / radius, y: center.y + dy * rawRadius / radius };
    const pointClient = toClient(point, transform), candidateClient = toClient(onCandidate, transform);
    return [{ pointId: point.id, point: { x: point.x, y: point.y }, radius,
      screenDistance: Math.hypot(pointClient.x - candidateClient.x, pointClient.y - candidateClient.y) }];
  }).sort((a, b) => a.screenDistance - b.screenDistance || a.pointId.localeCompare(b.pointId));
  const acquired = candidates.find(({ screenDistance }) => screenDistance <= DRAWING_CIRCUMFERENCE_POINT_ACQUIRE_PX);
  if (acquired) return acquired;
  const retained = candidates.find(({ pointId }) => pointId === previousPointId);
  return retained && retained.screenDistance <= DRAWING_CIRCUMFERENCE_POINT_RELEASE_PX ? retained : null;
};
export const resolveArcFormPointSnap = ({ start, end, rawPoint, points, transform, previousPointId }: {
  start: DrawingPoint; end: DrawingPoint; rawPoint: DrawingPoint; points: readonly DrawingSketchPoint[];
  transform: AffineTransform; previousPointId: string | null;
}): DrawingCircumferencePointCandidate | null => {
  const candidate = deriveArcThroughThreePoints(start, end, rawPoint);
  if (!candidate) return null;
  const scale = Math.hypot(transform.a, transform.b);
  const candidates = points.flatMap((point) => {
    if (Math.hypot(point.x - start.x, point.y - start.y) <= 1e-9 || Math.hypot(point.x - end.x, point.y - end.y) <= 1e-9) return [];
    const exact = deriveArcThroughThreePoints(start, end, point);
    if (!exact) return [];
    return [{ pointId: point.id, point: { x: point.x, y: point.y }, radius: exact.radius,
      screenDistance: distanceToArc(point, candidate) * scale }];
  }).sort((a, b) => a.screenDistance - b.screenDistance || a.pointId.localeCompare(b.pointId));
  return candidates.find(({ screenDistance }) => screenDistance <= DRAWING_CIRCUMFERENCE_POINT_ACQUIRE_PX)
    ?? candidates.find(({ pointId, screenDistance }) => pointId === previousPointId && screenDistance <= DRAWING_CIRCUMFERENCE_POINT_RELEASE_PX) ?? null;
};
