import type { DrawingDimension, DrawingEntity, DrawingPoint, DrawingSketchV2, ResolvedDrawingArc, ResolvedDrawingCircle } from './drawingTypes.js';
import { resolveCircularSupport } from './drawingCircularSupport.js';

export type ResolvedCircularSize = Readonly<{
  entity: ResolvedDrawingCircle | ResolvedDrawingArc;
  mode: 'radius' | 'diameter';
  radius: number;
  measurement: number;
}>;

/** Shared geometry boundary for circular size semantics. No derived radius or attachment is persisted. */
export const resolveCircularSize = (sketch: DrawingSketchV2, entityId: string): ResolvedCircularSize | null => {
  const entity = (sketch.entities as unknown as Record<string, DrawingEntity>)[entityId];
  if (entity?.type !== 'circle' && entity?.type !== 'arc') return null;
  const support = resolveCircularSupport(sketch, entity);
  if (!support) return null;
  const mode = entity.type === 'circle' ? 'diameter' : 'radius';
  return { entity: support.entity, mode, radius: support.radius,
    measurement: mode === 'diameter' ? 2 * support.radius : support.radius };
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

/** Stable model-space placement for circular dimensions created without a pointer. */
export const defaultCircularSizePlacementAnchor = (resolved: ResolvedCircularSize): DrawingPoint => {
  const angle = resolved.entity.type === 'arc'
    ? resolved.entity.startAngle + resolved.entity.signedSweep / 2
    : 0;
  const distance = resolved.radius * 1.4;
  return {
    x: resolved.entity.center.x + Math.cos(angle) * distance,
    y: resolved.entity.center.y + Math.sin(angle) * distance,
  };
};

/** Derived annotation endpoints; neither endpoint becomes persisted sketch geometry. */
export const circularDimensionEndpoints = (resolved: ResolvedCircularSize, anchor: DrawingPoint): Readonly<{ start: DrawingPoint; end: DrawingPoint }> => {
  const end = circularAttachment(resolved, anchor);
  if (resolved.mode === 'radius') return { start: resolved.entity.center, end };
  const center = resolved.entity.center;
  const dx = end.x - center.x, dy = end.y - center.y, length = Math.hypot(dx, dy) || 1;
  return {
    start: { x: center.x - dx / length * resolved.radius, y: center.y - dy / length * resolved.radius },
    end,
  };
};
