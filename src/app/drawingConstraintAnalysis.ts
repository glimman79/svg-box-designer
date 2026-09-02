import { pointIdForLineEndpoint } from './drawingTopology.js';
import type { DrawingDimension, DrawingPoint, DrawingPointReference, DrawingSketchV2 } from './drawingTypes.js';

export const DRAWING_CONSTRAINT_RANK_TOLERANCE = Object.freeze({ absolute: 1e-10, relative: 1e-9 });
export const DRAWING_ORIGIN_CONSTRAINT_KEY = 'datum:ORIGIN';

export type DrawingConstraintEquation = Readonly<{ dimension: DrawingDimension; pointKeys: readonly string[] }>;
export type DrawingConstraintComponentAnalysis = Readonly<{ pointIds: ReadonlySet<string>; dimensionIds: readonly string[]; variableCount: number; constraintRank: number; degreesOfFreedom: number }>;
export type DrawingConstraintAnalysis = Readonly<{ components: readonly DrawingConstraintComponentAnalysis[]; componentByPointId: ReadonlyMap<string, DrawingConstraintComponentAnalysis> }>;

export const constraintPointKey = (sketch: DrawingSketchV2, reference: DrawingPointReference): string | null => {
  if (reference.kind === 'datum') return reference.datum === 'ORIGIN' ? DRAWING_ORIGIN_CONSTRAINT_KEY : null;
  if (reference.kind === 'sketchPoint') return sketch.points[reference.pointId] ? reference.pointId : null;
  const line = sketch.entities[reference.entityId];
  if (line?.type !== 'line') return null;
  const pointId = pointIdForLineEndpoint(line, reference.point);
  return sketch.points[pointId] ? pointId : null;
};

export const constraintEquation = (sketch: DrawingSketchV2, dimension: DrawingDimension): DrawingConstraintEquation | null => {
  if (dimension.kind === 'POINT_TO_LINE_DISTANCE') {
    const point = constraintPointKey(sketch, dimension.references[0]);
    const line = sketch.entities[dimension.references[1].entityId];
    if (!point || !line || !sketch.points[line.startPointId] || !sketch.points[line.endPointId] || line.startPointId === line.endPointId) return null;
    return { dimension, pointKeys: [point, line.startPointId, line.endPointId] };
  }
  const a = constraintPointKey(sketch, dimension.references[0]), b = constraintPointKey(sketch, dimension.references[1]);
  return a && b && a !== b ? { dimension, pointKeys: [a, b] } : null;
};

export const pointToLineDistanceAndGradient = (point: DrawingPoint, a: DrawingPoint, b: DrawingPoint) => {
  const dx = b.x - a.x, dy = b.y - a.y, length = Math.hypot(dx, dy);
  if (length <= DRAWING_CONSTRAINT_RANK_TOLERANCE.absolute) return null;
  const signed = (dx * (point.y - a.y) - dy * (point.x - a.x)) / length;
  const side = signed < 0 ? -1 : 1;
  // Finite differences include endpoint rotation and remain stable at zero by
  // using the deterministic positive-side limiting derivative.
  const value = Math.abs(signed), coordinates = [point.x, point.y, a.x, a.y, b.x, b.y];
  const fn = (v: readonly number[]) => {
    const lx = v[4] - v[2], ly = v[5] - v[3], ll = Math.hypot(lx, ly);
    return side * (lx * (v[1] - v[3]) - ly * (v[0] - v[2])) / ll;
  };
  const gradient = coordinates.map((coordinate, index) => { const h = 1e-6 * Math.max(1, Math.abs(coordinate)); const plus = [...coordinates], minus = [...coordinates]; plus[index] += h; minus[index] -= h; return (fn(plus) - fn(minus)) / (2 * h); });
  return { distance: value, signedDistance: signed, gradient };
};

const matrixRank = (source: readonly (readonly number[])[]): number => {
  if (!source.length || !source[0]?.length) return 0;
  const matrix = source.map((row) => [...row]), scale = Math.max(1, ...matrix.flat().map(Math.abs));
  const threshold = DRAWING_CONSTRAINT_RANK_TOLERANCE.absolute + DRAWING_CONSTRAINT_RANK_TOLERANCE.relative * scale;
  let rank = 0;
  for (let column = 0; column < matrix[0].length && rank < matrix.length; column += 1) {
    let pivot = rank;
    for (let row = rank + 1; row < matrix.length; row += 1) if (Math.abs(matrix[row][column]) > Math.abs(matrix[pivot][column])) pivot = row;
    if (Math.abs(matrix[pivot][column]) <= threshold) continue;
    [matrix[rank], matrix[pivot]] = [matrix[pivot], matrix[rank]];
    const divisor = matrix[rank][column]; for (let c = column; c < matrix[rank].length; c += 1) matrix[rank][c] /= divisor;
    for (let row = 0; row < matrix.length; row += 1) if (row !== rank) { const factor = matrix[row][column]; for (let c = column; c < matrix[row].length; c += 1) matrix[row][c] -= factor * matrix[rank][c]; }
    rank += 1;
  }
  return rank;
};

const coordinate = (sketch: DrawingSketchV2, key: string): DrawingPoint => key === DRAWING_ORIGIN_CONSTRAINT_KEY ? { x: 0, y: 0 } : sketch.points[key];
export const constraintJacobianRow = (sketch: DrawingSketchV2, equation: DrawingConstraintEquation, pointOrder: readonly string[]): number[] | null => {
  const row = Array(pointOrder.length * 2).fill(0), set = (key: string, gx: number, gy: number) => { const i = pointOrder.indexOf(key); if (i >= 0) { row[i * 2] += gx; row[i * 2 + 1] += gy; } };
  if (equation.dimension.kind === 'POINT_TO_LINE_DISTANCE') {
    const [p, a, b] = equation.pointKeys, result = pointToLineDistanceAndGradient(coordinate(sketch, p), coordinate(sketch, a), coordinate(sketch, b));
    if (!result) return null;
    [p, a, b].forEach((key, i) => set(key, result.gradient[i * 2], result.gradient[i * 2 + 1]));
    return row;
  }
  const [aKey, bKey] = equation.pointKeys, a = coordinate(sketch, aKey), b = coordinate(sketch, bKey), dx = b.x - a.x, dy = b.y - a.y;
  let gx = 0, gy = 0;
  if (equation.dimension.kind === 'HORIZONTAL_DISTANCE') gx = dx < 0 ? -1 : 1;
  else if (equation.dimension.kind === 'VERTICAL_DISTANCE') gy = dy < 0 ? -1 : 1;
  else { const length = Math.hypot(dx, dy); gx = length > DRAWING_CONSTRAINT_RANK_TOLERANCE.absolute ? dx / length : 1; gy = length > DRAWING_CONSTRAINT_RANK_TOLERANCE.absolute ? dy / length : 0; }
  set(aKey, -gx, -gy); set(bKey, gx, gy); return row;
};

export const analyzeDrawingConstraints = (sketch: DrawingSketchV2, extraDriving?: DrawingDimension): DrawingConstraintAnalysis => {
  const equations = [...Object.values(sketch.dimensions).filter(({ role }) => role === 'driving'), ...(extraDriving ? [{ ...extraDriving, role: 'driving' as const }] : [])].map((d) => constraintEquation(sketch, d)).filter((e): e is DrawingConstraintEquation => Boolean(e));
  const parent = new Map(Object.keys(sketch.points).map((id) => [id, id]));
  const find = (id: string): string => { const p = parent.get(id)!; if (p === id) return id; const root = find(p); parent.set(id, root); return root; };
  for (const equation of equations) { const keys = equation.pointKeys.filter((key) => key !== DRAWING_ORIGIN_CONSTRAINT_KEY); for (const key of keys.slice(1)) parent.set(find(key), find(keys[0])); }
  const groups = new Map<string, string[]>(); for (const id of Object.keys(sketch.points)) { const root = find(id); groups.set(root, [...(groups.get(root) ?? []), id]); }
  const components = [...groups.values()].map((pointIds): DrawingConstraintComponentAnalysis => {
    const pointSet = new Set(pointIds), componentEquations = equations.filter((e) => e.pointKeys.some((key) => pointSet.has(key)));
    const rows = componentEquations.map((e) => constraintJacobianRow(sketch, e, pointIds)).filter((r): r is number[] => Boolean(r));
    const constraintRank = matrixRank(rows), variableCount = pointIds.length * 2;
    return { pointIds: pointSet, dimensionIds: componentEquations.map(({ dimension }) => dimension.id), variableCount, constraintRank, degreesOfFreedom: variableCount - constraintRank };
  });
  return { components, componentByPointId: new Map(components.flatMap((component) => [...component.pointIds].map((id) => [id, component] as const))) };
};

export const dimensionIncreasesConstraintRank = (sketch: DrawingSketchV2, candidate: DrawingDimension): boolean => {
  const total = (analysis: DrawingConstraintAnalysis) => analysis.components.reduce((sum, component) => sum + component.constraintRank, 0);
  return total(analyzeDrawingConstraints(sketch, candidate)) > total(analyzeDrawingConstraints(sketch));
};
