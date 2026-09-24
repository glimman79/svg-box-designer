import { resolveArcFromBulge } from './drawingArcGeometry.js';
import type { DrawingDimension, DrawingEntity, DrawingPoint, DrawingSketchV2, ResolvedDrawingArc, ResolvedDrawingCircle } from './drawingTypes.js';

export type ResolvedCircularSize = Readonly<{
  entity: ResolvedDrawingCircle | ResolvedDrawingArc;
  mode: 'radius' | 'diameter';
  radius: number;
  measurement: number;
}>;

/** Shared geometry boundary for circular size semantics. No derived radius or attachment is persisted. */
export const resolveCircularSize = (sketch: DrawingSketchV2, entityId: string): ResolvedCircularSize | null => {
  const entity = (sketch.entities as unknown as Record<string, DrawingEntity>)[entityId];
  if (entity?.type === 'circle') {
    const center = sketch.points[entity.centerPointId];
    return center && Number.isFinite(entity.radius) && entity.radius > 0
      ? { entity: { ...entity, center }, mode: 'diameter', radius: entity.radius, measurement: 2 * entity.radius } : null;
  }
  if (entity?.type === 'arc') {
    const resolved = resolveArcFromBulge(entity, sketch.points[entity.startPointId], sketch.points[entity.endPointId]);
    return resolved ? { entity: resolved, mode: 'radius', radius: resolved.radius, measurement: resolved.radius } : null;
  }
  return null;
};

export const measureCircularDimension = (sketch: DrawingSketchV2, dimension: DrawingDimension): number | null => {
  if (dimension.kind !== 'CIRCULAR_SIZE') return null;
  const resolved = resolveCircularSize(sketch, dimension.references[0].entityId);
  return resolved?.mode === dimension.mode ? resolved.measurement : null;
};

export const circularAttachment = (resolved: ResolvedCircularSize, anchor: DrawingPoint): DrawingPoint => {
  const center = resolved.entity.center;
  let angle = Math.atan2(anchor.y - center.y, anchor.x - center.x);
  if (resolved.entity.type === 'arc') {
    const start = resolved.entity.startAngle, sweep = resolved.entity.signedSweep;
    const normalize = (value: number) => ((value % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    const progress = sweep > 0 ? normalize(angle - start) : normalize(start - angle);
    if (progress > Math.abs(sweep)) {
      const end = start + sweep;
      const angularDistance = (a: number, b: number) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
      angle = angularDistance(angle, start) <= angularDistance(angle, end) ? start : end;
    }
  }
  return { x: center.x + Math.cos(angle) * resolved.radius, y: center.y + Math.sin(angle) * resolved.radius };
};
