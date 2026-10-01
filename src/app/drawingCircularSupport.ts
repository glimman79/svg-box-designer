import { resolveArcFromBulge } from './drawingArcGeometry.js';
import {
  DRAWING_MODEL_SPACE_TOLERANCE,
  type DrawingArcEntity,
  type DrawingCircleEntity,
  type DrawingPoint,
  type DrawingSketchV2,
  type ResolvedDrawingArc,
  type ResolvedDrawingCircle,
} from './drawingTypes.js';

export type CircularEntity = DrawingCircleEntity | DrawingArcEntity;
export type ResolvedCircularEntity = ResolvedDrawingCircle | ResolvedDrawingArc;

/**
 * Representation-neutral mathematical support shared by circular geometry.
 * A Circle's center identity is persistent; the current endpoint-plus-bulge
 * Arc deliberately exposes only a derived center until the atomic Arc cutover.
 */
export type ResolvedCircularSupport = Readonly<{
  entity: ResolvedCircularEntity;
  center: DrawingPoint;
  radius: number;
  centerIdentity:
    | Readonly<{ kind: 'persistent'; pointId: string }>
    | Readonly<{ kind: 'derived'; entityId: string; role: 'center' }>;
}>;

/** Resolves an entity to its authoritative support Circle without adding state. */
export const resolveCircularSupport = (
  sketch: DrawingSketchV2,
  entity: CircularEntity,
): ResolvedCircularSupport | null => {
  if (entity.type === 'circle') {
    const center = sketch.points[entity.centerPointId];
    if (!center || !Number.isFinite(entity.radius) || entity.radius <= DRAWING_MODEL_SPACE_TOLERANCE) return null;
    const resolved: ResolvedDrawingCircle = { ...entity, center: { x: center.x, y: center.y } };
    return {
      entity: resolved,
      center: resolved.center,
      radius: resolved.radius,
      centerIdentity: { kind: 'persistent', pointId: entity.centerPointId },
    };
  }

  const resolved = resolveArcFromBulge(entity, sketch.points[entity.startPointId], sketch.points[entity.endPointId]);
  return resolved ? {
    entity: resolved,
    center: resolved.center,
    radius: resolved.radius,
    centerIdentity: { kind: 'derived', entityId: entity.id, role: 'center' },
  } : null;
};
