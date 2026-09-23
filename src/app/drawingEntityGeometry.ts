import type { DrawingEntity, DrawingPoint, DrawingSketchV2, ResolvedDrawingArc, ResolvedDrawingCircle, ResolvedDrawingLine } from './drawingTypes.js';
import { resolveLine } from './drawingTopology.js';
import { distanceToArc, resolveArcFromBulge } from './drawingArcGeometry.js';

export type ResolvedDrawingEntity = ResolvedDrawingLine | ResolvedDrawingCircle | ResolvedDrawingArc;
export const resolveDrawingEntity = (sketch: DrawingSketchV2, entity: DrawingEntity): ResolvedDrawingEntity | null => {
  if (entity.type === 'line') return resolveLine(sketch, entity);
  if (entity.type === 'circle') {
    const center = sketch.points[entity.centerPointId];
    return center && Number.isFinite(entity.radius) && entity.radius > 0 ? { ...entity, center: { x: center.x, y: center.y } } : null;
  }
  const start = sketch.points[entity.startPointId], end = sketch.points[entity.endPointId];
  return start && end ? resolveArcFromBulge(entity, start, end) : null;
};
export const drawingEntityPointIds = (entity: DrawingEntity): readonly string[] =>
  entity.type === 'circle' ? [entity.centerPointId] : [entity.startPointId, entity.endPointId];

export const distanceToDrawingEntity = (entity: ResolvedDrawingEntity, point: DrawingPoint): number => {
  if (entity.type === 'circle') return Math.abs(Math.hypot(point.x - entity.center.x, point.y - entity.center.y) - entity.radius);
  if (entity.type === 'arc') return distanceToArc(point, entity);
  const dx = entity.end.x - entity.start.x, dy = entity.end.y - entity.start.y;
  const length2 = dx * dx + dy * dy;
  const t = length2 ? Math.max(0, Math.min(1, ((point.x - entity.start.x) * dx + (point.y - entity.start.y) * dy) / length2)) : 0;
  return Math.hypot(point.x - (entity.start.x + t * dx), point.y - (entity.start.y + t * dy));
};
