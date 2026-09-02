import type { DrawingDimension, DrawingDocumentV2, DrawingPoint, DrawingSketchV2 } from './drawingTypes';
import { analyzeDrawingConstraints, constraintEquation, constraintPointKey, DRAWING_ORIGIN_CONSTRAINT_KEY, pointToLineDistanceAndGradient } from './drawingConstraintAnalysis.js';
import { measureDimension, measurePointToLine, resolveDimensionLineReference, resolveDrawingPointReference } from './drawingDimension.js';

export const DRAWING_CONSTRAINT_TOLERANCE_MM = 1e-7;
export const DRAWING_COMPONENT_SOLVER_MAX_ITERATIONS = 80;
const INITIAL_DAMPING = 1e-6, ITERATION_CONVERGENCE_MM = 1e-12;
export type DrawingDimensionSolveFailureReason = 'INVALID_TARGET' | 'MISSING_REFERENCE' | 'UNSUPPORTED_DEGENERATE_GEOMETRY' | 'UNDERDETERMINED_ORIENTATION' | 'UNSATISFIABLE_DIMENSION_SET' | 'SOLUTION_VERIFICATION_FAILED';
export type DrawingDimensionSolveResult = Readonly<{ ok: true; document: DrawingDocumentV2; diagnostics: Readonly<{ constraintCount: number; residuals: readonly number[]; iterations: number; pointIds: readonly string[] }> }> | Readonly<{ ok: false; reason: DrawingDimensionSolveFailureReason; message: string }>;
const failureMessages: Record<DrawingDimensionSolveFailureReason, string> = { INVALID_TARGET: 'Dimension must be 0 mm or greater.', MISSING_REFERENCE: 'This dimension no longer has valid geometry.', UNSUPPORTED_DEGENERATE_GEOMETRY: 'This dimension cannot be solved from the current geometry.', UNDERDETERMINED_ORIENTATION: 'This dimension cannot be solved from the current geometry.', UNSATISFIABLE_DIMENSION_SET: 'This value conflicts with another driving dimension.', SOLUTION_VERIFICATION_FAILED: 'The dimension solution could not be verified.' };
export const drawingDimensionSolveFailureMessage = (reason: DrawingDimensionSolveFailureReason): string => failureMessages[reason];
const fail = (reason: DrawingDimensionSolveFailureReason): DrawingDimensionSolveResult => ({ ok: false, reason, message: failureMessages[reason] });

type Equation = Readonly<{ dimension: DrawingDimension; pointKeys: readonly string[]; target: number }>;
type ComponentState = Readonly<{ pointIds: readonly string[]; equations: readonly Equation[] }>;
const componentForDimension = (sketch: DrawingSketchV2, dimension: DrawingDimension, target: number): ComponentState | null => {
  const editedEquation = constraintEquation(sketch, dimension); if (!editedEquation) return null;
  const seed = editedEquation.pointKeys.find((key) => key !== DRAWING_ORIGIN_CONSTRAINT_KEY), component = seed ? analyzeDrawingConstraints(sketch).componentByPointId.get(seed) : null;
  if (!component?.dimensionIds.includes(dimension.id)) return null;
  const equations = component.dimensionIds.map((id): Equation | null => { const item = sketch.dimensions[id], equation = item?.role === 'driving' ? constraintEquation(sketch, item) : null; return item && equation ? { ...equation, target: id === dimension.id ? target : item.value } : null; });
  return equations.some((item) => !item) ? null : { pointIds: [...component.pointIds], equations: equations as Equation[] };
};
const coordinate = (sketch: DrawingSketchV2, values: readonly number[], index: ReadonlyMap<string, number>, key: string): DrawingPoint => { if (key === DRAWING_ORIGIN_CONSTRAINT_KEY) return { x: 0, y: 0 }; const i = index.get(key); return i === undefined ? sketch.points[key] : { x: values[i * 2], y: values[i * 2 + 1] }; };
const evaluateSystem = (sketch: DrawingSketchV2, component: ComponentState, variableIds: readonly string[], values: readonly number[]) => {
  const index = new Map(variableIds.map((id, i) => [id, i])), residuals: number[] = [], jacobian: number[][] = [];
  for (const equation of component.equations) {
    const row = Array(variableIds.length * 2).fill(0);
    if (equation.dimension.kind === 'POINT_TO_LINE_DISTANCE') {
      const [p, a, b] = equation.pointKeys, result = pointToLineDistanceAndGradient(coordinate(sketch, values, index, p), coordinate(sketch, values, index, a), coordinate(sketch, values, index, b));
      if (!result) return null;
      residuals.push(result.distance - equation.target); [p, a, b].forEach((key, j) => { const i = index.get(key); if (i !== undefined) { row[i * 2] += result.gradient[j * 2]; row[i * 2 + 1] += result.gradient[j * 2 + 1]; } });
    } else {
      const [aKey, bKey] = equation.pointKeys, a = coordinate(sketch, values, index, aKey), b = coordinate(sketch, values, index, bKey), dx = b.x - a.x, dy = b.y - a.y;
      let measured: number, gx = 0, gy = 0;
      if (equation.dimension.kind === 'HORIZONTAL_DISTANCE') { measured = Math.abs(dx); gx = dx < 0 ? -1 : 1; }
      else if (equation.dimension.kind === 'VERTICAL_DISTANCE') { measured = Math.abs(dy); gy = dy < 0 ? -1 : 1; }
      else { measured = Math.hypot(dx, dy); gx = measured > DRAWING_CONSTRAINT_TOLERANCE_MM ? dx / measured : 1; gy = measured > DRAWING_CONSTRAINT_TOLERANCE_MM ? dy / measured : 0; }
      residuals.push(measured - equation.target); for (const [key, sign] of [[aKey, -1], [bKey, 1]] as const) { const i = index.get(key); if (i !== undefined) { row[i * 2] += sign * gx; row[i * 2 + 1] += sign * gy; } }
    }
    jacobian.push(row);
  }
  return { residuals, jacobian };
};
const norm = (v: readonly number[]) => v.reduce((s, x) => s + x * x, 0);
const solveLinear = (matrix: number[][], rhs: number[]): number[] | null => { const a = matrix.map((r, i) => [...r, rhs[i]]), n = rhs.length; for (let c = 0; c < n; c += 1) { let p = c; for (let r = c + 1; r < n; r += 1) if (Math.abs(a[r][c]) > Math.abs(a[p][c])) p = r; if (Math.abs(a[p][c]) < 1e-14) return null; [a[c], a[p]] = [a[p], a[c]]; const d = a[c][c]; for (let j = c; j <= n; j += 1) a[c][j] /= d; for (let r = 0; r < n; r += 1) if (r !== c) { const f = a[r][c]; for (let j = c; j <= n; j += 1) a[r][j] -= f * a[c][j]; } } return a.map((r) => r[n]); };
const solveComponent = (sketch: DrawingSketchV2, component: ComponentState, variableIds: readonly string[]) => { let values = variableIds.flatMap((id) => [sketch.points[id].x, sketch.points[id].y]), damping = INITIAL_DAMPING; for (let iteration = 0; iteration <= DRAWING_COMPONENT_SOLVER_MAX_ITERATIONS; iteration += 1) { const system = evaluateSystem(sketch, component, variableIds, values); if (!system) return null; if (system.residuals.every((v) => Math.abs(v) <= ITERATION_CONVERGENCE_MM)) return { values, residuals: system.residuals, iterations: iteration }; if (iteration === DRAWING_COMPONENT_SOLVER_MAX_ITERATIONS || !values.length) break; const n = values.length, normal = Array.from({ length: n }, () => Array(n).fill(0)), rhs = Array(n).fill(0); for (let r = 0; r < system.residuals.length; r += 1) for (let i = 0; i < n; i += 1) { rhs[i] -= system.jacobian[r][i] * system.residuals[r]; for (let j = 0; j < n; j += 1) normal[i][j] += system.jacobian[r][i] * system.jacobian[r][j]; } for (let i = 0; i < n; i += 1) normal[i][i] += damping; const delta = solveLinear(normal, rhs); if (!delta?.every(Number.isFinite)) break; const candidate = values.map((v, i) => v + delta[i]), next = evaluateSystem(sketch, component, variableIds, candidate); if (next && norm(next.residuals) < norm(system.residuals)) { values = candidate; damping = Math.max(1e-12, damping * .25); } else damping = Math.min(1e12, damping * 10); } return null; };

const measurement = (sketch: DrawingSketchV2, dimension: DrawingDimension): number | null => { if (dimension.kind === 'POINT_TO_LINE_DISTANCE') { const p = resolveDrawingPointReference(sketch, dimension.references[0]), l = resolveDimensionLineReference(sketch, dimension.references[1]); return p && l ? measurePointToLine(p, l) : null; } const a = resolveDrawingPointReference(sketch, dimension.references[0]), b = resolveDrawingPointReference(sketch, dimension.references[1]); return a && b ? measureDimension(dimension.kind, a, b) : null; };
export const verifyDrawingDrivingDimensions = (sketch: DrawingSketchV2, ids: readonly string[]): readonly number[] | null => { const residuals = ids.map((id) => { const d = sketch.dimensions[id], value = d?.role === 'driving' ? measurement(sketch, d) : null; return d && value !== null ? Math.abs(value - d.value) : Infinity; }); return residuals.every((v) => Number.isFinite(v) && v <= DRAWING_CONSTRAINT_TOLERANCE_MM) ? residuals : null; };

export const solveDrawingDimensionEdit = ({ document, dimensionId, targetValue }: Readonly<{ document: DrawingDocumentV2; dimensionId: string; targetValue: number }>): DrawingDimensionSolveResult => {
  if (!Number.isFinite(targetValue) || targetValue < 0) return fail('INVALID_TARGET'); const sketch = document.sketches[document.activeSketchId], edited = sketch?.dimensions[dimensionId]; if (!sketch || !edited || edited.role !== 'driving') return fail('MISSING_REFERENCE');
  if (edited.kind === 'POINT_TO_LINE_DISTANCE') { const line = resolveDimensionLineReference(sketch, edited.references[1]); if (!line || measurePointToLine(resolveDrawingPointReference(sketch, edited.references[0])!, line) === null) return fail('UNSUPPORTED_DEGENERATE_GEOMETRY'); }
  else { const a = resolveDrawingPointReference(sketch, edited.references[0]), b = resolveDrawingPointReference(sketch, edited.references[1]); if (!a || !b) return fail('MISSING_REFERENCE'); const dx = b.x - a.x, dy = b.y - a.y; if (edited.kind === 'ALIGNED_DISTANCE' && (targetValue <= DRAWING_CONSTRAINT_TOLERANCE_MM || Math.hypot(dx, dy) <= DRAWING_CONSTRAINT_TOLERANCE_MM)) return fail('UNSUPPORTED_DEGENERATE_GEOMETRY'); if (edited.kind === 'HORIZONTAL_DISTANCE' && Math.abs(dx) <= DRAWING_CONSTRAINT_TOLERANCE_MM && targetValue > DRAWING_CONSTRAINT_TOLERANCE_MM) return fail('UNDERDETERMINED_ORIENTATION'); if (edited.kind === 'VERTICAL_DISTANCE' && Math.abs(dy) <= DRAWING_CONSTRAINT_TOLERANCE_MM && targetValue > DRAWING_CONSTRAINT_TOLERANCE_MM) return fail('UNDERDETERMINED_ORIENTATION'); }
  const component = componentForDimension(sketch, edited, targetValue); if (!component) return fail('MISSING_REFERENCE'); let preferred: readonly string[];
  if (edited.kind === 'POINT_TO_LINE_DISTANCE') { const pointKey = constraintPointKey(sketch, edited.references[0]), line = sketch.entities[edited.references[1].entityId]; preferred = edited.movementPreference === 'point' && pointKey !== DRAWING_ORIGIN_CONSTRAINT_KEY ? [pointKey!].filter(Boolean) : [...new Set([line.startPointId, line.endPointId])]; }
  else { const first = constraintPointKey(sketch, edited.references[0]); preferred = component.pointIds.filter((id) => id !== first); }
  let variableIds: readonly string[] = preferred.filter((id) => component.pointIds.includes(id)), solved = solveComponent(sketch, component, variableIds); if (!solved && variableIds.length !== component.pointIds.length) { variableIds = component.pointIds; solved = solveComponent(sketch, component, variableIds); } if (!solved) return fail('UNSATISFIABLE_DIMENSION_SET');
  const points = { ...sketch.points }; variableIds.forEach((id, i) => { points[id] = { ...points[id], x: solved!.values[i * 2], y: solved!.values[i * 2 + 1] }; }); const dimensions = { ...sketch.dimensions, [dimensionId]: { ...edited, value: targetValue } }; let solvedSketch = { ...sketch, points, dimensions };
  if (edited.kind !== 'POINT_TO_LINE_DISTANCE') {
    const aKey = constraintPointKey(sketch, edited.references[0]), bKey = constraintPointKey(sketch, edited.references[1]), movableKey = bKey === DRAWING_ORIGIN_CONSTRAINT_KEY ? aKey : bKey, anchorKey = bKey === DRAWING_ORIGIN_CONSTRAINT_KEY ? bKey : aKey;
    if (movableKey && movableKey !== DRAWING_ORIGIN_CONSTRAINT_KEY && anchorKey && variableIds.includes(movableKey)) {
      const anchor = coordinate(solvedSketch, [], new Map(), anchorKey), movable = coordinate(solvedSketch, [], new Map(), movableKey), originalAnchor = coordinate(sketch, [], new Map(), anchorKey), originalMovable = coordinate(sketch, [], new Map(), movableKey); let polished: DrawingPoint;
      const intentDx = originalMovable.x - originalAnchor.x, intentDy = originalMovable.y - originalAnchor.y;
      if (edited.kind === 'HORIZONTAL_DISTANCE') polished = { x: anchor.x + (intentDx < 0 ? -targetValue : targetValue), y: movable.y };
      else if (edited.kind === 'VERTICAL_DISTANCE') polished = { x: movable.x, y: anchor.y + (intentDy < 0 ? -targetValue : targetValue) };
      else { const length = Math.hypot(intentDx, intentDy); polished = { x: anchor.x + intentDx / length * targetValue, y: anchor.y + intentDy / length * targetValue }; }
      const candidate = { ...solvedSketch, points: { ...solvedSketch.points, [movableKey]: { ...solvedSketch.points[movableKey], ...polished } } }; if (verifyDrawingDrivingDimensions(candidate, component.equations.map((e) => e.dimension.id))) solvedSketch = candidate;
    }
  }
  const residuals = verifyDrawingDrivingDimensions(solvedSketch, component.equations.map((e) => e.dimension.id)); if (!residuals) return fail('SOLUTION_VERIFICATION_FAILED');
  return { ok: true, document: { ...document, sketches: { ...document.sketches, [sketch.id]: solvedSketch } }, diagnostics: { constraintCount: component.equations.length, residuals, iterations: solved.iterations, pointIds: component.pointIds } };
};
