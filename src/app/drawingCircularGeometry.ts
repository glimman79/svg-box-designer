import { DRAWING_MODEL_SPACE_TOLERANCE, type DrawingPoint } from './drawingTypes.js';

export type CircularGeometry = Readonly<{ center: DrawingPoint; radius: number }>;

/** Projects onto an infinite support Circle; finite Arc clamping stays Arc-specific. */
export const projectPointToCircularSupport = (point: DrawingPoint, support: CircularGeometry): DrawingPoint => {
  const dx = point.x - support.center.x, dy = point.y - support.center.y;
  const length = Math.hypot(dx, dy);
  return length > DRAWING_MODEL_SPACE_TOLERANCE
    ? { x: support.center.x + support.radius * dx / length, y: support.center.y + support.radius * dy / length }
    : { x: support.center.x + support.radius, y: support.center.y };
};

/** Signed radial equation for an infinite circular support. */
export const circularSupportResidual = (point: DrawingPoint, support: CircularGeometry): number =>
  Math.hypot(point.x - support.center.x, point.y - support.center.y) - support.radius;
