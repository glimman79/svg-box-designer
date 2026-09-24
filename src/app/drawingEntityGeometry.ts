import type { DrawingPoint, ResolvedDrawingArc, ResolvedDrawingCircle, ResolvedDrawingLine } from './drawingTypes.js';
import { distanceToArc } from './drawingArcGeometry.js';

export type ResolvedDrawingEntity = ResolvedDrawingLine | ResolvedDrawingCircle | ResolvedDrawingArc;

export const distanceToDrawingEntity = (entity: ResolvedDrawingEntity, point: DrawingPoint): number => {
  if (entity.type === 'circle') return Math.abs(Math.hypot(point.x - entity.center.x, point.y - entity.center.y) - entity.radius);
  if (entity.type === 'arc') return distanceToArc(point, entity);
  const dx = entity.end.x - entity.start.x, dy = entity.end.y - entity.start.y;
  const length2 = dx * dx + dy * dy;
  const t = length2 ? Math.max(0, Math.min(1, ((point.x - entity.start.x) * dx + (point.y - entity.start.y) * dy) / length2)) : 0;
  return Math.hypot(point.x - (entity.start.x + t * dx), point.y - (entity.start.y + t * dy));
};
