import type { DrawingEntity, DrawingSketchV2 } from './drawingTypes.js';
import {
  circularRadiusSolverVariable,
  pointSolverVariables,
  type DrawingSolverVariable,
} from './drawingSolverVariables.js';

/** Persistent SketchPoint identities which form an entity's canonical geometry. */
export const drawingEntityDefiningPointIds = (entity: DrawingEntity): readonly string[] => entity.type === 'circle'
  ? [entity.centerPointId]
  : entity.type === 'arc' ? [entity.centerPointId, entity.startPointId, entity.endPointId]
    : [entity.startPointId, entity.endPointId];

/** Canonical continuous coordinates owned or referenced by an entity. */
export const drawingEntitySolverVariables = (entity: DrawingEntity): readonly DrawingSolverVariable[] => [
  ...drawingEntityDefiningPointIds(entity).flatMap(pointSolverVariables),
  ...(['circle', 'arc'].includes(entity.type) ? [circularRadiusSolverVariable(entity.id)] : []),
];

/**
 * No representation-specific implicit point coupling remains; entity-owned
 * equations provide all target Arc connectivity.
 */
export const drawingEntityImplicitComponentPointIds = (_entity: DrawingEntity): readonly string[] => [];

/**
 * An equation imposed by an entity's representation, rather than by a user
 * Constraint or Dimension. It is runtime geometry and is never persisted in
 * either user-authored collection.
 */
export type DrawingEntityEquation = Readonly<{
  id: string;
  entityId: string;
  variables: readonly DrawingSolverVariable[];
  residual: (sketch: DrawingSketchV2) => number | null;
}>;

/**
 * Target Arcs own their two radial equations here so topology, component
 * discovery, solver projection and rank analysis share one authority.
 */
export const drawingEntityEquations = (sketch: DrawingSketchV2, entity: DrawingEntity): readonly DrawingEntityEquation[] => {
  if (entity.type !== 'arc') return [];
  const variables = drawingEntitySolverVariables(entity);
  const radial = (pointId: string, role: string): DrawingEntityEquation => ({
    id: `entity:${entity.id}:radial:${role}`, entityId: entity.id, variables,
    residual: (candidate) => {
      const current = (candidate.entities as unknown as Record<string, DrawingEntity>)[entity.id];
      if (current?.type !== 'arc') return null;
      const center = candidate.points[current.centerPointId], point = candidate.points[pointId];
      return center && point ? Math.hypot(point.x - center.x, point.y - center.y) - current.radius : null;
    },
  });
  return [radial(entity.startPointId, 'start'), radial(entity.endPointId, 'end')];
};

export const collectDrawingEntityEquations = (sketch: DrawingSketchV2): readonly DrawingEntityEquation[] =>
  Object.values(sketch.entities as unknown as Record<string, DrawingEntity>)
    .flatMap((entity) => drawingEntityEquations(sketch, entity));
