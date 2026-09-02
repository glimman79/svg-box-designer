import { sketchPointIdFromReference } from './drawingDimension.js';
import type { DrawingSketchV2 } from './drawingTypes.js';

export const GEOMETRY_CONSTRAINT_VISUAL_STATES = ['FREE', 'CONSTRAINED', 'FULLY_LOCKED'] as const;
export type GeometryConstraintVisualState = typeof GEOMETRY_CONSTRAINT_VISUAL_STATES[number];

export type GeometryConstraintVisualTarget =
  | Readonly<{ kind: 'line'; lineId: string }>
  | Readonly<{ kind: 'point'; pointId: string }>;

/**
 * A future constraint solver may supply this only after a rigorous DOF/rank
 * analysis. The current Drawing solver validates equations but does not produce
 * such a proof, so production callers intentionally omit this input.
 */
export type GeometryFreedomProof = Readonly<{
  isRigorous: true;
  degreesOfFreedom: number;
}>;

const targetPointIds = (sketch: DrawingSketchV2, target: GeometryConstraintVisualTarget): ReadonlySet<string> => {
  if (target.kind === 'point') return new Set(sketch.points[target.pointId] ? [target.pointId] : []);
  const line = sketch.entities[target.lineId];
  return new Set(line?.type === 'line' ? [line.startPointId, line.endPointId] : []);
};

const hasDrivingRestriction = (sketch: DrawingSketchV2, pointIds: ReadonlySet<string>): boolean => (
  Object.values(sketch.dimensions).some((dimension) => dimension.role === 'driving' && dimension.references.some((reference) => {
    const pointId = sketchPointIdFromReference(sketch, reference);
    return Boolean(pointId && pointIds.has(pointId));
  }))
);

/**
 * Derives presentation semantics from constraint authority; it never persists
 * visual state in geometry. Driving equations establish CONSTRAINED, reference
 * measurements do not, and FULLY_LOCKED requires an explicit rigorous zero-DOF
 * proof rather than a dimension-count or topology heuristic.
 */
export const getGeometryConstraintVisualState = (
  sketch: DrawingSketchV2,
  target: GeometryConstraintVisualTarget,
  freedomProof?: GeometryFreedomProof,
): GeometryConstraintVisualState => {
  if (freedomProof?.isRigorous && freedomProof.degreesOfFreedom === 0) return 'FULLY_LOCKED';
  return hasDrivingRestriction(sketch, targetPointIds(sketch, target)) ? 'CONSTRAINED' : 'FREE';
};

export const geometryConstraintVisualClass = (state: GeometryConstraintVisualState): string => (
  `geometry-${state.toLowerCase().replace('_', '-')}`
);
