import type { DrawingEntity, DrawingSketchV2 } from './drawingTypes.js';
import {
  arcBulgeSolverVariable,
  circularRadiusSolverVariable,
  pointSolverVariables,
  type DrawingSolverVariable,
} from './drawingSolverVariables.js';

/** Persistent SketchPoint identities which form an entity's canonical geometry. */
export const drawingEntityDefiningPointIds = (entity: DrawingEntity): readonly string[] => entity.type === 'circle'
  ? [entity.centerPointId]
  : [entity.startPointId, entity.endPointId];

/** Canonical continuous coordinates owned or referenced by an entity. */
export const drawingEntitySolverVariables = (entity: DrawingEntity): readonly DrawingSolverVariable[] => [
  ...drawingEntityDefiningPointIds(entity).flatMap(pointSolverVariables),
  ...(entity.type === 'circle' ? [circularRadiusSolverVariable(entity.id)]
    : entity.type === 'arc' ? [arcBulgeSolverVariable(entity.id)] : []),
];

/**
 * Defining coordinates coupled by the current representation even without a
 * separate equation. The bulge Arc is the only current case; Stage 3 removes
 * this representation-specific coupling when radial equations provide it.
 */
export const drawingEntityImplicitComponentPointIds = (entity: DrawingEntity): readonly string[] =>
  entity.type === 'arc' ? drawingEntityDefiningPointIds(entity) : [];

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
 * Current Line, Circle and endpoint-plus-bulge Arc coordinates are independent,
 * so they own no intrinsic equations. Stage 3 can add target Arc radial
 * equations here without changing topology, component discovery, or rank input.
 */
export const drawingEntityEquations = (_sketch: DrawingSketchV2, _entity: DrawingEntity): readonly DrawingEntityEquation[] => [];

export const collectDrawingEntityEquations = (sketch: DrawingSketchV2): readonly DrawingEntityEquation[] =>
  Object.values(sketch.entities as unknown as Record<string, DrawingEntity>)
    .flatMap((entity) => drawingEntityEquations(sketch, entity));
