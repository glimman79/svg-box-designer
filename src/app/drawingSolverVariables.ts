import { DRAWING_MODEL_SPACE_TOLERANCE, type DrawingEntity, type DrawingSketchV2 } from './drawingTypes.js';

export type DrawingSolverVariable =
  | Readonly<{ kind: 'point-axis'; pointId: string; axis: 'x' | 'y' }>
  | Readonly<{ kind: 'entity-scalar'; entityId: string; scalar: 'circular-radius' }>;

export const pointSolverVariables = (pointId: string): readonly DrawingSolverVariable[] => [
  { kind: 'point-axis', pointId, axis: 'x' },
  { kind: 'point-axis', pointId, axis: 'y' },
];

export const circularRadiusSolverVariable = (entityId: string): DrawingSolverVariable =>
  ({ kind: 'entity-scalar', entityId, scalar: 'circular-radius' });

export const drawingSolverVariableKey = (variable: DrawingSolverVariable): string => variable.kind === 'point-axis'
  ? `point:${variable.pointId}:${variable.axis}`
  : `entity:${variable.entityId}:${variable.scalar}`;

export const deduplicateDrawingSolverVariables = (variables: readonly DrawingSolverVariable[]): DrawingSolverVariable[] =>
  [...new Map(variables.map((variable) => [drawingSolverVariableKey(variable), variable])).values()];

export const readDrawingSolverVariable = (sketch: DrawingSketchV2, variable: DrawingSolverVariable): number | null => {
  if (variable.kind === 'point-axis') return sketch.points[variable.pointId]?.[variable.axis] ?? null;
  const entity = (sketch.entities as unknown as Record<string, DrawingEntity>)[variable.entityId];
  return (entity?.type === 'circle' || entity?.type === 'arc') && Number.isFinite(entity.radius) ? entity.radius : null;
};

/** Applies one candidate value without changing persistent entity or endpoint identity. */
export const writeDrawingSolverVariable = (sketch: DrawingSketchV2, variable: DrawingSolverVariable, value: number): DrawingSketchV2 | null => {
  if (!Number.isFinite(value)) return null;
  if (variable.kind === 'point-axis') {
    const point = sketch.points[variable.pointId];
    return point ? { ...sketch, points: { ...sketch.points, [point.id]: { ...point, [variable.axis]: value } } } : null;
  }
  const entity = (sketch.entities as unknown as Record<string, DrawingEntity>)[variable.entityId];
  if (variable.scalar === 'circular-radius') {
    if ((entity?.type !== 'circle' && entity?.type !== 'arc') || value <= DRAWING_MODEL_SPACE_TOLERANCE) return null;
    if (entity.radius === value) return sketch;
    const entities = { ...sketch.entities, [entity.id]: { ...entity, radius: value } } as DrawingSketchV2['entities'];
    return { ...sketch, entities };
  }
  return null;
};

export const applyDrawingSolverVector = (sketch: DrawingSketchV2, variables: readonly DrawingSolverVariable[], values: readonly number[]): DrawingSketchV2 | null => {
  if (variables.length !== values.length) return null;
  let candidate = sketch;
  for (let index = 0; index < variables.length; index += 1) {
    const next = writeDrawingSolverVariable(candidate, variables[index], values[index]);
    if (!next) return null;
    candidate = next;
  }
  return candidate;
};

export const flattenDrawingSolverVariables = (sketch: DrawingSketchV2, variables: readonly DrawingSolverVariable[]): number[] | null => {
  const values = variables.map((variable) => readDrawingSolverVariable(sketch, variable));
  return values.every((value): value is number => value !== null) ? values : null;
};
