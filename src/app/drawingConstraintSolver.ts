import type { DrawingDimension, DrawingDocumentV2, DrawingPoint, DrawingSketchV2 } from './drawingTypes';
import { analyzeDrawingConstraints, constraintEquation, constraintPointKey, drawingConstraintDegreesOfFreedomForPoints, DRAWING_ORIGIN_CONSTRAINT_KEY, pointToLineDistanceAndGradient } from './drawingConstraintAnalysis.js';
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

export type PointToLineMovementCandidate = Readonly<{
  kind: 'ISOLATED_LINE_RIGID_TRANSLATION' | 'CONNECTED_GEOMETRY_LOCAL_DEFORMATION' | 'INDEPENDENT_POINT';
  pointIds: readonly string[];
  lineIds: readonly string[];
  topologyClass: 'INDEPENDENT_POINT' | 'ISOLATED_LINE' | 'CONNECTED_COMPONENT';
  entityCount: number;
  pointCount: number;
  sharedPointCount: number;
  drivingConstraintCount: number;
  degreesOfFreedom: number;
  creationOrder: number;
}>;
export type PointToLineMovementIntent = Readonly<{
  preferred: PointToLineMovementCandidate;
  alternatives: readonly PointToLineMovementCandidate[];
  reason: 'ONLY_MOVABLE_CANDIDATE' | 'LOWER_TOPOLOGY_COST' | 'LOWER_CONSTRAINT_INTERFERENCE' | 'STABLE_CREATION_ORDER';
}>;

/**
 * Resolves semantic Point-to-Line ownership without consulting the persisted
 * selection-order movementPreference. entityOrder is the persisted insertion
 * sequence (and therefore the stable creation order) for Line entities.
 */
export const resolvePointToLineMovementIntent = (sketch: DrawingSketchV2, dimension: DrawingDimension): PointToLineMovementIntent | null => {
  if (dimension.kind !== 'POINT_TO_LINE_DISTANCE') return null;
  const measuredLine = sketch.entities[dimension.references[1].entityId];
  if (!measuredLine) return null;
  const pointKey = constraintPointKey(sketch, dimension.references[0]);
  if (!pointKey) return null;
  const lines = sketch.entityOrder.map((id) => sketch.entities[id]).filter((line): line is NonNullable<typeof line> => Boolean(line));
  const incident = (pointId: string) => lines.filter((line) => line.startPointId === pointId || line.endPointId === pointId);
  const componentForLine = (seedId: string) => {
    const lineIds = new Set([seedId]), pointIds = new Set<string>();
    for (let changed = true; changed;) {
      changed = false;
      for (const line of lines) if (lineIds.has(line.id) || pointIds.has(line.startPointId) || pointIds.has(line.endPointId)) {
        if (!lineIds.has(line.id)) { lineIds.add(line.id); changed = true; }
        if (!pointIds.has(line.startPointId)) { pointIds.add(line.startPointId); changed = true; }
        if (!pointIds.has(line.endPointId)) { pointIds.add(line.endPointId); changed = true; }
      }
    }
    return { lineIds: [...lineIds], pointIds: [...pointIds] };
  };
  const analysis = analyzeDrawingConstraints(sketch);
  const makeCandidate = (seedLineId: string, localPointIds: readonly string[]): PointToLineMovementCandidate => {
    const topology = componentForLine(seedLineId), isolated = topology.lineIds.length === 1;
    const constraintComponents = [...new Set(topology.pointIds.map((id) => analysis.componentByPointId.get(id)).filter(Boolean))];
    const degreesOfFreedom = drawingConstraintDegreesOfFreedomForPoints(sketch, isolated ? topology.pointIds : localPointIds, dimension.id);
    const drivingConstraintCount = new Set(constraintComponents.flatMap((item) => item!.dimensionIds.filter((id) => id !== dimension.id))).size;
    return { kind: isolated ? 'ISOLATED_LINE_RIGID_TRANSLATION' : 'CONNECTED_GEOMETRY_LOCAL_DEFORMATION', pointIds: isolated ? topology.pointIds : localPointIds, lineIds: topology.lineIds,
      topologyClass: isolated ? 'ISOLATED_LINE' : 'CONNECTED_COMPONENT', entityCount: topology.lineIds.length, pointCount: topology.pointIds.length,
      sharedPointCount: topology.pointIds.filter((id) => incident(id).length > 1).length, drivingConstraintCount, degreesOfFreedom,
      creationOrder: Math.min(...topology.lineIds.map((id) => sketch.entityOrder.indexOf(id))) };
  };
  const candidates: PointToLineMovementCandidate[] = [];
  if (pointKey !== DRAWING_ORIGIN_CONSTRAINT_KEY) {
    const pointLines = incident(pointKey);
    if (!pointLines.length) candidates.push({ kind: 'INDEPENDENT_POINT', pointIds: [pointKey], lineIds: [], topologyClass: 'INDEPENDENT_POINT', entityCount: 0, pointCount: 1, sharedPointCount: 0, drivingConstraintCount: analysis.componentByPointId.get(pointKey)?.dimensionIds.filter((id) => id !== dimension.id).length ?? 0, degreesOfFreedom: drawingConstraintDegreesOfFreedomForPoints(sketch, [pointKey], dimension.id), creationOrder: -1 });
    else candidates.push(makeCandidate(pointLines[0].id, [pointKey]));
  }
  candidates.push(makeCandidate(measuredLine.id, [measuredLine.startPointId, measuredLine.endPointId]));
  const unique = candidates.filter((candidate, index) => candidates.findIndex((other) => other.topologyClass === candidate.topologyClass && other.lineIds.join('\0') === candidate.lineIds.join('\0') && other.pointIds.join('\0') === candidate.pointIds.join('\0')) === index);
  const topologyRank = { INDEPENDENT_POINT: 0, ISOLATED_LINE: 1, CONNECTED_COMPONENT: 2 } as const;
  // Lexicographic ownership: legitimate local DOF, topology class, affected
  // Lines, Points and shared Points, constraint interference, then creation order.
  unique.sort((a, b) => (a.degreesOfFreedom <= 0 ? 1 : 0) - (b.degreesOfFreedom <= 0 ? 1 : 0)
    || topologyRank[a.topologyClass] - topologyRank[b.topologyClass] || a.entityCount - b.entityCount || a.pointCount - b.pointCount
    || a.sharedPointCount - b.sharedPointCount || a.drivingConstraintCount - b.drivingConstraintCount || a.creationOrder - b.creationOrder);
  if (!unique.length) return null;
  const [preferred, ...alternatives] = unique, runnerUp = alternatives[0];
  const reason = !runnerUp ? 'ONLY_MOVABLE_CANDIDATE'
    : topologyRank[preferred.topologyClass] !== topologyRank[runnerUp.topologyClass] || preferred.entityCount !== runnerUp.entityCount || preferred.pointCount !== runnerUp.pointCount || preferred.sharedPointCount !== runnerUp.sharedPointCount ? 'LOWER_TOPOLOGY_COST'
      : preferred.drivingConstraintCount !== runnerUp.drivingConstraintCount ? 'LOWER_CONSTRAINT_INTERFERENCE' : 'STABLE_CREATION_ORDER';
  return { preferred, alternatives, reason };
};

/**
 * The isolated-owner Point-to-Line attempt has one motion DOF: translation
 * along the measured line's original normal. The generic component solver is
 * deliberately kept as the fallback when this rigid candidate conflicts with
 * another driving equation in the component.
 */
const rigidLineTranslationCandidate = (sketch: DrawingSketchV2, edited: DrawingDimension, targetValue: number, component: ComponentState, intent: PointToLineMovementCandidate): DrawingSketchV2 | null => {
  if (edited.kind !== 'POINT_TO_LINE_DISTANCE' || intent.kind !== 'ISOLATED_LINE_RIGID_TRANSLATION') return null;
  const point = resolveDrawingPointReference(sketch, edited.references[0]), measuredLine = resolveDimensionLineReference(sketch, edited.references[1]);
  if (!point || !measuredLine) return null;
  const dx = measuredLine.end.x - measuredLine.start.x, dy = measuredLine.end.y - measuredLine.start.y, length = Math.hypot(dx, dy);
  if (length <= DRAWING_CONSTRAINT_TOLERANCE_MM) return null;
  const normal = { x: -dy / length, y: dx / length };
  const signedDistance = (point.x - measuredLine.start.x) * normal.x + (point.y - measuredLine.start.y) * normal.y;
  // Preserve the current side for every non-coincident relationship. At zero,
  // choose the normal's positive point-side deterministically.
  const desiredSignedDistance = (signedDistance < 0 ? -1 : 1) * targetValue;
  const movingMeasuredLine = intent.lineIds.includes(measuredLine.id);
  const translation = movingMeasuredLine ? signedDistance - desiredSignedDistance : desiredSignedDistance - signedDistance;
  const delta = { x: normal.x * translation, y: normal.y * translation };
  const points = { ...sketch.points };
  for (const id of intent.pointIds) {
    const original = sketch.points[id];
    if (!original) return null;
    points[id] = { ...original, x: original.x + delta.x, y: original.y + delta.y };
  }
  const candidate = { ...sketch, points, dimensions: { ...sketch.dimensions, [edited.id]: { ...edited, value: targetValue } } };
  return verifyDrawingDrivingDimensions(candidate, component.equations.map((equation) => equation.dimension.id)) ? candidate : null;
};

export const solveDrawingDimensionEdit = ({ document, dimensionId, targetValue }: Readonly<{ document: DrawingDocumentV2; dimensionId: string; targetValue: number }>): DrawingDimensionSolveResult => {
  if (!Number.isFinite(targetValue) || targetValue < 0) return fail('INVALID_TARGET'); const sketch = document.sketches[document.activeSketchId], edited = sketch?.dimensions[dimensionId]; if (!sketch || !edited || edited.role !== 'driving') return fail('MISSING_REFERENCE');
  if (edited.kind === 'LINE_TO_LINE_ANGLE') return fail('MISSING_REFERENCE');
  if (edited.kind === 'POINT_TO_LINE_DISTANCE') { const line = resolveDimensionLineReference(sketch, edited.references[1]); if (!line || measurePointToLine(resolveDrawingPointReference(sketch, edited.references[0])!, line) === null) return fail('UNSUPPORTED_DEGENERATE_GEOMETRY'); }
  else { const a = resolveDrawingPointReference(sketch, edited.references[0]), b = resolveDrawingPointReference(sketch, edited.references[1]); if (!a || !b) return fail('MISSING_REFERENCE'); const dx = b.x - a.x, dy = b.y - a.y; if (edited.kind === 'ALIGNED_DISTANCE' && (targetValue <= DRAWING_CONSTRAINT_TOLERANCE_MM || Math.hypot(dx, dy) <= DRAWING_CONSTRAINT_TOLERANCE_MM)) return fail('UNSUPPORTED_DEGENERATE_GEOMETRY'); if (edited.kind === 'HORIZONTAL_DISTANCE' && Math.abs(dx) <= DRAWING_CONSTRAINT_TOLERANCE_MM && targetValue > DRAWING_CONSTRAINT_TOLERANCE_MM) return fail('UNDERDETERMINED_ORIENTATION'); if (edited.kind === 'VERTICAL_DISTANCE' && Math.abs(dy) <= DRAWING_CONSTRAINT_TOLERANCE_MM && targetValue > DRAWING_CONSTRAINT_TOLERANCE_MM) return fail('UNDERDETERMINED_ORIENTATION'); }
  const component = componentForDimension(sketch, edited, targetValue); if (!component) return fail('MISSING_REFERENCE'); let preferred: readonly string[];
  const movementIntent = edited.kind === 'POINT_TO_LINE_DISTANCE' ? resolvePointToLineMovementIntent(sketch, edited) : null;
  const finish = (candidate: DrawingSketchV2, iterations: number): DrawingDimensionSolveResult => ({ ok: true, document: { ...document, sketches: { ...document.sketches, [sketch.id]: candidate } }, diagnostics: { constraintCount: component.equations.length, residuals: verifyDrawingDrivingDimensions(candidate, component.equations.map((equation) => equation.dimension.id))!, iterations, pointIds: component.pointIds } });
  if (movementIntent) for (const candidateIntent of [movementIntent.preferred, ...movementIntent.alternatives]) {
    const rigidCandidate = rigidLineTranslationCandidate(sketch, edited, targetValue, component, candidateIntent);
    if (rigidCandidate) return finish(rigidCandidate, 0);
    if (candidateIntent.kind !== 'ISOLATED_LINE_RIGID_TRANSLATION') {
      const variableIds = candidateIntent.pointIds.filter((id) => component.pointIds.includes(id)), local = solveComponent(sketch, component, variableIds);
      if (local) {
        const points = { ...sketch.points }; variableIds.forEach((id, i) => { points[id] = { ...points[id], x: local.values[i * 2], y: local.values[i * 2 + 1] }; });
        const candidate = { ...sketch, points, dimensions: { ...sketch.dimensions, [dimensionId]: { ...edited, value: targetValue } } };
        if (verifyDrawingDrivingDimensions(candidate, component.equations.map((equation) => equation.dimension.id))) return finish(candidate, local.iterations);
      }
    }
  }
  if (edited.kind === 'POINT_TO_LINE_DISTANCE') {
    if (!movementIntent) return fail('MISSING_REFERENCE');
    preferred = movementIntent.preferred.pointIds;
  }
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
