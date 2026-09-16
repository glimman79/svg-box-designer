import { DRAWING_MODEL_SPACE_TOLERANCE, type DrawingPoint } from './drawingTypes.js';

export const normalizeUnorientedDirection = (direction: DrawingPoint): DrawingPoint | null => {
  const length = Math.hypot(direction.x, direction.y);
  if (length <= DRAWING_MODEL_SPACE_TOLERANCE) return null;
  let x = direction.x / length, y = direction.y / length;
  if (x < -DRAWING_MODEL_SPACE_TOLERANCE || (Math.abs(x) <= DRAWING_MODEL_SPACE_TOLERANCE && y < 0)) {
    x = -x; y = -y;
  }
  return { x, y };
};

export const equivalentUnorientedDirections = (a: DrawingPoint, b: DrawingPoint) =>
  Math.abs(a.x * b.y - a.y * b.x) <= DRAWING_MODEL_SPACE_TOLERANCE;
