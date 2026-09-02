import type { DrawingDimension, DrawingDocumentV2, DrawingPoint, DrawingSketchV2 } from './drawingTypes';
import { analyzeDrawingConstraints, constraintPointKey } from './drawingConstraintAnalysis.js';
import { measureDimension, resolveDrawingPointReference } from './drawingDimension.js';

/** One numerical policy for component convergence and the committed-state invariant. */
export const DRAWING_CONSTRAINT_TOLERANCE_MM = 1e-7;
export const DRAWING_COMPONENT_SOLVER_MAX_ITERATIONS = 80;
const ORIGIN_KEY = 'datum:ORIGIN';
const INITIAL_DAMPING = 1e-6;
const ITERATION_CONVERGENCE_MM = 1e-12;

export type DrawingDimensionSolveFailureReason =
  | 'INVALID_TARGET'
  | 'MISSING_REFERENCE'
  | 'UNSUPPORTED_DEGENERATE_GEOMETRY'
  | 'UNDERDETERMINED_ORIENTATION'
  | 'UNSATISFIABLE_DIMENSION_SET'
  | 'SOLUTION_VERIFICATION_FAILED';

export type DrawingDimensionSolveResult =
  | Readonly<{ ok: true; document: DrawingDocumentV2; diagnostics: Readonly<{ constraintCount: number; residuals: readonly number[]; iterations: number; pointIds: readonly string[] }> }>
  | Readonly<{ ok: false; reason: DrawingDimensionSolveFailureReason; message: string }>;

const failureMessages: Record<DrawingDimensionSolveFailureReason, string> = {
  INVALID_TARGET: 'Dimension must be 0 mm or greater.',
  MISSING_REFERENCE: 'This dimension no longer has valid geometry.',
  UNSUPPORTED_DEGENERATE_GEOMETRY: 'This dimension cannot be solved from the current geometry.',
  UNDERDETERMINED_ORIENTATION: 'This dimension cannot be solved from the current geometry.',
  UNSATISFIABLE_DIMENSION_SET: 'This value conflicts with another driving dimension.',
  SOLUTION_VERIFICATION_FAILED: 'The dimension solution could not be verified.',
};

export const drawingDimensionSolveFailureMessage = (reason: DrawingDimensionSolveFailureReason): string => failureMessages[reason];
const fail = (reason: DrawingDimensionSolveFailureReason): DrawingDimensionSolveResult => ({ ok: false, reason, message: failureMessages[reason] });

type Equation = Readonly<{ dimension: DrawingDimension; a: string; b: string; target: number }>;
type ComponentState = Readonly<{ pointIds: readonly string[]; equations: readonly Equation[] }>;

const componentForDimension = (sketch: DrawingSketchV2, dimension: DrawingDimension, target: number): ComponentState | null => {
  const a = constraintPointKey(sketch, dimension.references[0]);
  const b = constraintPointKey(sketch, dimension.references[1]);
  if (!a || !b || a === b) return null;
  const seed = a === ORIGIN_KEY ? b : a;
  const component = analyzeDrawingConstraints(sketch).componentByPointId.get(seed);
  if (!component || !component.dimensionIds.includes(dimension.id)) return null;
  const equations = component.dimensionIds.map((id): Equation | null => {
    const item = sketch.dimensions[id];
    if (!item || item.role !== 'driving') return null;
    const first = constraintPointKey(sketch, item.references[0]);
    const second = constraintPointKey(sketch, item.references[1]);
    if (!first || !second || first === second) return null;
    return { dimension: item, a: first, b: second, target: id === dimension.id ? target : item.value };
  });
  return equations.some((item) => !item) ? null : { pointIds: [...component.pointIds], equations: equations as Equation[] };
};

const coordinate = (sketch: DrawingSketchV2, values: readonly number[], indexByPoint: ReadonlyMap<string, number>, key: string): DrawingPoint => {
  if (key === ORIGIN_KEY) return { x: 0, y: 0 };
  const index = indexByPoint.get(key);
  return index === undefined ? sketch.points[key] : { x: values[index * 2], y: values[index * 2 + 1] };
};

const residualAndGradient = (equation: Equation, a: DrawingPoint, b: DrawingPoint) => {
  const dx = b.x - a.x, dy = b.y - a.y;
  if (equation.dimension.kind === 'HORIZONTAL_DISTANCE') {
    const sign = dx < 0 ? -1 : 1;
    return { residual: Math.abs(dx) - equation.target, gx: sign, gy: 0 };
  }
  if (equation.dimension.kind === 'VERTICAL_DISTANCE') {
    const sign = dy < 0 ? -1 : 1;
    return { residual: Math.abs(dy) - equation.target, gx: 0, gy: sign };
  }
  const length = Math.hypot(dx, dy);
  return { residual: length - equation.target, gx: length > DRAWING_CONSTRAINT_TOLERANCE_MM ? dx / length : 1, gy: length > DRAWING_CONSTRAINT_TOLERANCE_MM ? dy / length : 0 };
};

const evaluateSystem = (sketch: DrawingSketchV2, component: ComponentState, variableIds: readonly string[], values: readonly number[]) => {
  const indexByPoint = new Map(variableIds.map((id, index) => [id, index]));
  const residuals: number[] = [], jacobian: number[][] = [];
  for (const equation of component.equations) {
    const a = coordinate(sketch, values, indexByPoint, equation.a), b = coordinate(sketch, values, indexByPoint, equation.b);
    const { residual, gx, gy } = residualAndGradient(equation, a, b);
    const row = Array(variableIds.length * 2).fill(0);
    for (const [key, sign] of [[equation.a, -1], [equation.b, 1]] as const) {
      const index = indexByPoint.get(key);
      if (index !== undefined) { row[index * 2] += sign * gx; row[index * 2 + 1] += sign * gy; }
    }
    residuals.push(residual); jacobian.push(row);
  }
  return { residuals, jacobian };
};

const squaredNorm = (values: readonly number[]): number => values.reduce((sum, value) => sum + value * value, 0);
const solveLinear = (matrix: number[][], rhs: number[]): number[] | null => {
  const augmented = matrix.map((row, index) => [...row, rhs[index]]), size = rhs.length;
  for (let column = 0; column < size; column += 1) {
    let pivot = column;
    for (let row = column + 1; row < size; row += 1) if (Math.abs(augmented[row][column]) > Math.abs(augmented[pivot][column])) pivot = row;
    if (Math.abs(augmented[pivot][column]) < 1e-14) return null;
    [augmented[column], augmented[pivot]] = [augmented[pivot], augmented[column]];
    const divisor = augmented[column][column];
    for (let c = column; c <= size; c += 1) augmented[column][c] /= divisor;
    for (let row = 0; row < size; row += 1) {
      if (row === column) continue;
      const factor = augmented[row][column];
      for (let c = column; c <= size; c += 1) augmented[row][c] -= factor * augmented[column][c];
    }
  }
  return augmented.map((row) => row[size]);
};

/** Bounded damped Gauss-Newton. Damping selects the minimum-displacement local solution. */
const solveComponent = (sketch: DrawingSketchV2, component: ComponentState, variableIds: readonly string[]) => {
  let values = variableIds.flatMap((id) => [sketch.points[id].x, sketch.points[id].y]);
  let damping = INITIAL_DAMPING;
  for (let iteration = 0; iteration <= DRAWING_COMPONENT_SOLVER_MAX_ITERATIONS; iteration += 1) {
    const system = evaluateSystem(sketch, component, variableIds, values);
    if (system.residuals.every((value) => Math.abs(value) <= ITERATION_CONVERGENCE_MM)) return { values, residuals: system.residuals, iterations: iteration };
    if (iteration === DRAWING_COMPONENT_SOLVER_MAX_ITERATIONS || values.length === 0) break;
    const size = values.length, normal = Array.from({ length: size }, () => Array(size).fill(0)), rhs = Array(size).fill(0);
    for (let row = 0; row < system.residuals.length; row += 1) for (let i = 0; i < size; i += 1) {
      rhs[i] -= system.jacobian[row][i] * system.residuals[row];
      for (let j = 0; j < size; j += 1) normal[i][j] += system.jacobian[row][i] * system.jacobian[row][j];
    }
    for (let i = 0; i < size; i += 1) normal[i][i] += damping;
    const delta = solveLinear(normal, rhs);
    if (!delta || delta.some((value) => !Number.isFinite(value))) break;
    const candidate = values.map((value, index) => value + delta[index]);
    const candidateResiduals = evaluateSystem(sketch, component, variableIds, candidate).residuals;
    if (squaredNorm(candidateResiduals) < squaredNorm(system.residuals)) { values = candidate; damping = Math.max(1e-12, damping * 0.25); }
    else damping = Math.min(1e12, damping * 10);
  }
  return null;
};

/** Public invariant assertion used by the edit boundary and focused tests. */
export const verifyDrawingDrivingDimensions = (sketch: DrawingSketchV2, dimensionIds: readonly string[]): readonly number[] | null => {
  const residuals: number[] = [];
  for (const id of dimensionIds) {
    const dimension = sketch.dimensions[id];
    if (!dimension || dimension.role !== 'driving') return null;
    const a = resolveDrawingPointReference(sketch, dimension.references[0]), b = resolveDrawingPointReference(sketch, dimension.references[1]);
    if (!a || !b) return null;
    residuals.push(Math.abs(measureDimension(dimension.kind, a, b) - dimension.value));
  }
  return residuals.every((value) => Number.isFinite(value) && value <= DRAWING_CONSTRAINT_TOLERANCE_MM) ? residuals : null;
};

/** Pure, component-local authoritative path for every Driving Dimension edit. */
export const solveDrawingDimensionEdit = ({ document, dimensionId, targetValue }: Readonly<{ document: DrawingDocumentV2; dimensionId: string; targetValue: number }>): DrawingDimensionSolveResult => {
  if (!Number.isFinite(targetValue) || targetValue < 0) return fail('INVALID_TARGET');
  const sketch = document.sketches[document.activeSketchId], edited = sketch?.dimensions[dimensionId];
  if (!sketch || !edited || edited.role !== 'driving') return fail('MISSING_REFERENCE');
  const first = resolveDrawingPointReference(sketch, edited.references[0]), second = resolveDrawingPointReference(sketch, edited.references[1]);
  if (!first || !second) return fail('MISSING_REFERENCE');
  const currentDx = second.x - first.x, currentDy = second.y - first.y;
  if (edited.kind === 'ALIGNED_DISTANCE' && (targetValue <= DRAWING_CONSTRAINT_TOLERANCE_MM || Math.hypot(currentDx, currentDy) <= DRAWING_CONSTRAINT_TOLERANCE_MM)) return fail('UNSUPPORTED_DEGENERATE_GEOMETRY');
  if (edited.kind === 'HORIZONTAL_DISTANCE' && Math.abs(currentDx) <= DRAWING_CONSTRAINT_TOLERANCE_MM && targetValue > DRAWING_CONSTRAINT_TOLERANCE_MM) return fail('UNDERDETERMINED_ORIENTATION');
  if (edited.kind === 'VERTICAL_DISTANCE' && Math.abs(currentDy) <= DRAWING_CONSTRAINT_TOLERANCE_MM && targetValue > DRAWING_CONSTRAINT_TOLERANCE_MM) return fail('UNDERDETERMINED_ORIENTATION');
  const component = componentForDimension(sketch, edited, targetValue);
  if (!component) return fail('MISSING_REFERENCE');

  // Preserve the historical first-reference anchor when that gauge permits a
  // solution. If connected constraints require it to move, retry with every point.
  const firstKey = constraintPointKey(sketch, edited.references[0]);
  const preferredVariables = component.pointIds.filter((id) => id !== firstKey);
  let variableIds: readonly string[] = preferredVariables;
  let solved = solveComponent(sketch, component, variableIds);
  if (!solved && preferredVariables.length !== component.pointIds.length) { variableIds = component.pointIds; solved = solveComponent(sketch, component, variableIds); }
  if (!solved) return fail('UNSATISFIABLE_DIMENSION_SET');

  const points = { ...sketch.points };
  variableIds.forEach((id, index) => { points[id] = { ...points[id], x: solved!.values[index * 2], y: solved!.values[index * 2 + 1] }; });
  if (Object.values(points).some(({ x, y }) => !Number.isFinite(x) || !Number.isFinite(y))) return fail('SOLUTION_VERIFICATION_FAILED');
  const dimensions = { ...sketch.dimensions, [dimensionId]: { ...edited, value: targetValue } };
  let solvedSketch = { ...sketch, points, dimensions };
  // Remove harmless damping round-off on the edited equation when doing so keeps
  // every component equation true. This also preserves exact axis coordinates.
  const editedA = constraintPointKey(solvedSketch, edited.references[0]), editedB = constraintPointKey(solvedSketch, edited.references[1]);
  const polishKey = editedB === ORIGIN_KEY ? editedA : editedB;
  const anchorKey = editedB === ORIGIN_KEY ? editedB : editedA;
  if (polishKey && polishKey !== ORIGIN_KEY && anchorKey) {
    const movable = coordinate(solvedSketch, [], new Map(), polishKey), anchor = coordinate(solvedSketch, [], new Map(), anchorKey);
    const dx = movable.x - anchor.x, dy = movable.y - anchor.y;
    let polished: DrawingPoint | null = null;
    if (edited.kind === 'HORIZONTAL_DISTANCE') polished = { x: anchor.x + (dx < 0 ? -targetValue : targetValue), y: movable.y };
    else if (edited.kind === 'VERTICAL_DISTANCE') polished = { x: movable.x, y: anchor.y + (dy < 0 ? -targetValue : targetValue) };
    else {
      const originalMovable = coordinate(sketch, [], new Map(), polishKey), originalAnchor = coordinate(sketch, [], new Map(), anchorKey);
      const intentDx = originalMovable.x - originalAnchor.x, intentDy = originalMovable.y - originalAnchor.y;
      const intentLength = Math.hypot(intentDx, intentDy);
      if (intentLength > 0) polished = { x: anchor.x + intentDx / intentLength * targetValue, y: anchor.y + intentDy / intentLength * targetValue };
    }
    if (polished) {
      const candidate = { ...solvedSketch, points: { ...solvedSketch.points, [polishKey]: { ...solvedSketch.points[polishKey], ...polished } } };
      if (verifyDrawingDrivingDimensions(candidate, component.equations.map(({ dimension }) => dimension.id))) solvedSketch = candidate;
    }
  }
  const residuals = verifyDrawingDrivingDimensions(solvedSketch, component.equations.map(({ dimension }) => dimension.id));
  if (!residuals) return fail('SOLUTION_VERIFICATION_FAILED');
  if (targetValue === edited.value && variableIds.every((id, index) => Math.abs(solved!.values[index * 2] - sketch.points[id].x) <= DRAWING_CONSTRAINT_TOLERANCE_MM && Math.abs(solved!.values[index * 2 + 1] - sketch.points[id].y) <= DRAWING_CONSTRAINT_TOLERANCE_MM)) {
    return { ok: true, document, diagnostics: { constraintCount: component.equations.length, residuals, iterations: solved.iterations, pointIds: component.pointIds } };
  }
  return { ok: true, document: { ...document, sketches: { ...document.sketches, [sketch.id]: solvedSketch } }, diagnostics: { constraintCount: component.equations.length, residuals, iterations: solved.iterations, pointIds: component.pointIds } };
};
