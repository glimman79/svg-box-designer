import { pointIdForLineEndpoint } from './drawingTopology.js';
import type { DrawingDimension, DrawingPointReference, DrawingSketchV2 } from './drawingTypes.js';

/** Central numerical policy for Drawing's constraint-rank analysis. */
export const DRAWING_CONSTRAINT_RANK_TOLERANCE = Object.freeze({ absolute: 1e-10, relative: 1e-9 });
const ORIGIN_KEY = 'datum:ORIGIN';

type Equation = Readonly<{ dimension: DrawingDimension; a: string; b: string }>;
export type DrawingConstraintComponentAnalysis = Readonly<{
  pointIds: ReadonlySet<string>;
  dimensionIds: readonly string[];
  variableCount: number;
  constraintRank: number;
  degreesOfFreedom: number;
}>;
export type DrawingConstraintAnalysis = Readonly<{
  components: readonly DrawingConstraintComponentAnalysis[];
  componentByPointId: ReadonlyMap<string, DrawingConstraintComponentAnalysis>;
}>;

/** Resolves both stable point refs and historical line-endpoint refs without coordinate matching. */
export const constraintPointKey = (sketch: DrawingSketchV2, reference: DrawingPointReference): string | null => {
  if (reference.kind === 'datum') return reference.datum === 'ORIGIN' ? ORIGIN_KEY : null;
  if (reference.kind === 'sketchPoint') return sketch.points[reference.pointId] ? reference.pointId : null;
  const line = sketch.entities[reference.entityId];
  if (line?.type !== 'line') return null;
  const pointId = pointIdForLineEndpoint(line, reference.point);
  return sketch.points[pointId] ? pointId : null;
};

const matrixRank = (source: readonly (readonly number[])[]): number => {
  if (!source.length || !source[0]?.length) return 0;
  const matrix = source.map((row) => [...row]);
  const scale = Math.max(1, ...matrix.flat().map(Math.abs));
  const threshold = DRAWING_CONSTRAINT_RANK_TOLERANCE.absolute + DRAWING_CONSTRAINT_RANK_TOLERANCE.relative * scale;
  let rank = 0;
  for (let column = 0; column < matrix[0].length && rank < matrix.length; column += 1) {
    let pivot = rank;
    for (let row = rank + 1; row < matrix.length; row += 1) if (Math.abs(matrix[row][column]) > Math.abs(matrix[pivot][column])) pivot = row;
    if (Math.abs(matrix[pivot][column]) <= threshold) continue;
    [matrix[rank], matrix[pivot]] = [matrix[pivot], matrix[rank]];
    const divisor = matrix[rank][column];
    for (let c = column; c < matrix[rank].length; c += 1) matrix[rank][c] /= divisor;
    for (let row = 0; row < matrix.length; row += 1) {
      if (row === rank) continue;
      const factor = matrix[row][column];
      for (let c = column; c < matrix[row].length; c += 1) matrix[row][c] -= factor * matrix[rank][c];
    }
    rank += 1;
  }
  return rank;
};

const jacobianRow = (sketch: DrawingSketchV2, equation: Equation, pointOrder: readonly string[]): number[] => {
  const row = Array(pointOrder.length * 2).fill(0);
  const a = equation.a === ORIGIN_KEY ? { x: 0, y: 0 } : sketch.points[equation.a];
  const b = equation.b === ORIGIN_KEY ? { x: 0, y: 0 } : sketch.points[equation.b];
  const dx = b.x - a.x, dy = b.y - a.y;
  let gx = 0, gy = 0;
  if (equation.dimension.kind === 'HORIZONTAL_DISTANCE') gx = dx < 0 ? -1 : 1;
  else if (equation.dimension.kind === 'VERTICAL_DISTANCE') gy = dy < 0 ? -1 : 1;
  else {
    const length = Math.hypot(dx, dy);
    // A zero-length aligned dimension has no unique direction. This deterministic
    // limiting direction keeps the Jacobian finite without introducing a variable.
    gx = length > DRAWING_CONSTRAINT_RANK_TOLERANCE.absolute ? dx / length : 1;
    gy = length > DRAWING_CONSTRAINT_RANK_TOLERANCE.absolute ? dy / length : 0;
  }
  for (const [key, sign] of [[equation.a, -1], [equation.b, 1]] as const) {
    if (key === ORIGIN_KEY) continue;
    const index = pointOrder.indexOf(key);
    if (index >= 0) { row[index * 2] += sign * gx; row[index * 2 + 1] += sign * gy; }
  }
  return row;
};

export const analyzeDrawingConstraints = (sketch: DrawingSketchV2, extraDriving?: DrawingDimension): DrawingConstraintAnalysis => {
  const dimensions = [...Object.values(sketch.dimensions).filter(({ role }) => role === 'driving'), ...(extraDriving ? [{ ...extraDriving, role: 'driving' as const }] : [])];
  const equations: Equation[] = dimensions.flatMap((dimension) => {
    const a = constraintPointKey(sketch, dimension.references[0]), b = constraintPointKey(sketch, dimension.references[1]);
    return a && b && a !== b ? [{ dimension, a, b }] : [];
  });
  const parent = new Map(Object.keys(sketch.points).map((id) => [id, id]));
  const find = (id: string): string => { const p = parent.get(id)!; if (p === id) return id; const root = find(p); parent.set(id, root); return root; };
  for (const { a, b } of equations) if (a !== ORIGIN_KEY && b !== ORIGIN_KEY) parent.set(find(b), find(a));
  const groups = new Map<string, string[]>();
  for (const id of Object.keys(sketch.points)) { const root = find(id); groups.set(root, [...(groups.get(root) ?? []), id]); }
  const components = [...groups.values()].map((pointIds): DrawingConstraintComponentAnalysis => {
    const pointSet = new Set(pointIds);
    const componentEquations = equations.filter(({ a, b }) => pointSet.has(a) || pointSet.has(b));
    const constraintRank = matrixRank(componentEquations.map((equation) => jacobianRow(sketch, equation, pointIds)));
    const variableCount = pointIds.length * 2;
    return { pointIds: pointSet, dimensionIds: componentEquations.map(({ dimension }) => dimension.id), variableCount, constraintRank, degreesOfFreedom: variableCount - constraintRank };
  });
  return { components, componentByPointId: new Map(components.flatMap((component) => [...component.pointIds].map((id) => [id, component] as const))) };
};

export const dimensionIncreasesConstraintRank = (sketch: DrawingSketchV2, candidate: DrawingDimension): boolean => {
  const before = analyzeDrawingConstraints(sketch);
  const after = analyzeDrawingConstraints(sketch, candidate);
  return after.components.reduce((sum, component) => sum + component.constraintRank, 0)
    > before.components.reduce((sum, component) => sum + component.constraintRank, 0);
};
