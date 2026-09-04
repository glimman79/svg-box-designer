import type { DrawingDimension, DrawingDocumentV2, DrawingPoint, DrawingSketchV2 } from './drawingTypes';
import { analyzeDrawingConstraints, constraintEquation, constraintPointKey, drawingConstraintDegreesOfFreedomForPoints, DRAWING_ORIGIN_CONSTRAINT_KEY, lineToLineAngleAndGradient, lineToLineDistanceAndGradient, pointToLineDistanceAndGradient } from './drawingConstraintAnalysis.js';
import { measureDimension, measureLineToLineDistance, measurePointToLine, resolveDimensionLineReference, resolveDrawingPointReference } from './drawingDimension.js';

export const DRAWING_CONSTRAINT_TOLERANCE_MM = 1e-7;
export const DRAWING_COMPONENT_SOLVER_MAX_ITERATIONS = 80;
const INITIAL_DAMPING = 1e-6, ITERATION_CONVERGENCE_MM = 1e-12;
export type DrawingDimensionSolveFailureReason = 'INVALID_TARGET' | 'INVALID_ANGLE_TARGET' | 'MISSING_REFERENCE' | 'UNSUPPORTED_DEGENERATE_GEOMETRY' | 'UNDERDETERMINED_ORIENTATION' | 'UNSATISFIABLE_DIMENSION_SET' | 'SOLUTION_VERIFICATION_FAILED';
export type DrawingDimensionSolveResult = Readonly<{ ok: true; document: DrawingDocumentV2; diagnostics: Readonly<{ constraintCount: number; residuals: readonly number[]; iterations: number; pointIds: readonly string[] }> }> | Readonly<{ ok: false; reason: DrawingDimensionSolveFailureReason; message: string }>;
const failureMessages: Record<DrawingDimensionSolveFailureReason, string> = { INVALID_TARGET: 'Dimension must be 0 mm or greater.', INVALID_ANGLE_TARGET: 'Angle must be greater than 0° and less than 180°.', MISSING_REFERENCE: 'This dimension no longer has valid geometry.', UNSUPPORTED_DEGENERATE_GEOMETRY: 'This dimension cannot be solved from the current geometry.', UNDERDETERMINED_ORIENTATION: 'This dimension cannot be solved from the current geometry.', UNSATISFIABLE_DIMENSION_SET: 'This value conflicts with another driving dimension.', SOLUTION_VERIFICATION_FAILED: 'The dimension solution could not be verified.' };
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
    if (equation.dimension.kind === 'LINE_TO_LINE_ANGLE') {
      const [a0, a1, b0, b1] = equation.pointKeys, sector = equation.dimension.angleSector;
      const result = lineToLineAngleAndGradient(...([a0, a1, b0, b1].map((key) => coordinate(sketch, values, index, key)) as [DrawingPoint, DrawingPoint, DrawingPoint, DrawingPoint]), sector.sideA * sector.sideB as -1 | 1);
      if (!result) return null;
      residuals.push(result.angleDegrees - equation.target); [a0, a1, b0, b1].forEach((key, j) => { const i = index.get(key); if (i !== undefined) { row[i * 2] += result.gradient[j * 2]; row[i * 2 + 1] += result.gradient[j * 2 + 1]; } });
    } else if (equation.dimension.kind === 'POINT_TO_LINE_DISTANCE') {
      const [p, a, b] = equation.pointKeys, result = pointToLineDistanceAndGradient(coordinate(sketch, values, index, p), coordinate(sketch, values, index, a), coordinate(sketch, values, index, b));
      if (!result) return null;
      residuals.push(result.distance - equation.target); [p, a, b].forEach((key, j) => { const i = index.get(key); if (i !== undefined) { row[i * 2] += result.gradient[j * 2]; row[i * 2 + 1] += result.gradient[j * 2 + 1]; } });
    } else if (equation.dimension.kind === 'LINE_TO_LINE_DISTANCE') {
      const [a0, a1, b0, b1] = equation.pointKeys, result = lineToLineDistanceAndGradient(...([a0, a1, b0, b1].map((key) => coordinate(sketch, values, index, key)) as [DrawingPoint, DrawingPoint, DrawingPoint, DrawingPoint]));
      if (!result) return null;
      residuals.push(result.distance - equation.target); [a0, a1, b0, b1].forEach((key, j) => { const i = index.get(key); if (i !== undefined) { row[i * 2] += result.gradient[j * 2]; row[i * 2 + 1] += result.gradient[j * 2 + 1]; } });
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
const solveComponent = (sketch: DrawingSketchV2, component: ComponentState, variableIds: readonly string[], movementWeights?: ReadonlyMap<string, number>) => { let values = variableIds.flatMap((id) => [sketch.points[id].x, sketch.points[id].y]), damping = INITIAL_DAMPING; for (let iteration = 0; iteration <= DRAWING_COMPONENT_SOLVER_MAX_ITERATIONS; iteration += 1) { const system = evaluateSystem(sketch, component, variableIds, values); if (!system) return null; if (system.residuals.every((v) => Math.abs(v) <= ITERATION_CONVERGENCE_MM)) return { values, residuals: system.residuals, iterations: iteration }; if (iteration === DRAWING_COMPONENT_SOLVER_MAX_ITERATIONS || !values.length) break; const n = values.length, normal = Array.from({ length: n }, () => Array(n).fill(0)), rhs = Array(n).fill(0); for (let r = 0; r < system.residuals.length; r += 1) for (let i = 0; i < n; i += 1) { rhs[i] -= system.jacobian[r][i] * system.residuals[r]; for (let j = 0; j < n; j += 1) normal[i][j] += system.jacobian[r][i] * system.jacobian[r][j]; } for (let i = 0; i < n; i += 1) normal[i][i] += damping * (movementWeights?.get(variableIds[Math.floor(i / 2)]) ?? 1); const delta = solveLinear(normal, rhs); if (!delta?.every(Number.isFinite)) break; const candidate = values.map((v, i) => v + delta[i]), next = evaluateSystem(sketch, component, variableIds, candidate); if (next && norm(next.residuals) < norm(system.residuals)) { values = candidate; damping = Math.max(1e-12, damping * .25); } else damping = Math.min(1e12, damping * 10); } return null; };

/**
 * Projects live direct-manipulation targets onto the canonical Driving
 * equations.  The first pass varies only dragged points, which is the strong
 * target/weak-stay policy: untouched points remain exact stays whenever that
 * sub-problem has a solution.  Only then may the local constraint component
 * participate.  This deliberately reuses the Dimension component equations,
 * gradients, nonlinear solve, and final tolerance verification.
 */
export const solveDrawingComponentDrag = (
  sketch: DrawingSketchV2,
  targets: Readonly<Record<string, DrawingPoint>>,
  intent?: Readonly<{ directPointIds?: readonly string[]; directLineIds?: readonly string[] }>,
): DrawingSketchV2 | null => {
  const targetIds = Object.keys(targets).filter((id) => Boolean(sketch.points[id]));
  if (targetIds.length !== Object.keys(targets).length || !targetIds.length) return null;
  const analysis = analyzeDrawingConstraints(sketch);
  const touchedComponents = [...new Set(targetIds.map((id) => analysis.componentByPointId.get(id)).filter((component) => component && component.dimensionIds.length))];
  let working: DrawingSketchV2 = { ...sketch, points: { ...sketch.points } };
  for (const id of targetIds) working.points[id] = { ...working.points[id], ...targets[id] };

  // A Line selected by the user already receives rigid endpoint targets. For
  // every other length-constrained Line reached through that selection, seed
  // its opposite endpoint with the same displacement. This is deliberately
  // transient: the ordinary hard-equation solve below may correct (or entirely
  // discard) the seed when another Driving constraint prevents translation.
  // Starting the underdetermined solve at this coherent pose makes translation
  // the stay solution without introducing an angular equation in the model.
  const directPointIds = new Set(intent?.directPointIds ?? []);
  const directLineIds = new Set(intent?.directLineIds ?? []);
  if (directLineIds.size) {
    const displacement = new Map<string, DrawingPoint>(targetIds.map((id) => [id, {
      x: targets[id].x - sketch.points[id].x,
      y: targets[id].y - sketch.points[id].y,
    }]));
    const propagatedLines = Object.values(sketch.dimensions).flatMap((dimension) => {
      if (dimension.role !== 'driving' || dimension.kind !== 'ALIGNED_DISTANCE') return [];
      const equation = constraintEquation(sketch, dimension);
      if (!equation || equation.pointKeys.length !== 2 || equation.pointKeys.includes(DRAWING_ORIGIN_CONSTRAINT_KEY)) return [];
      const [a, b] = equation.pointKeys;
      const line = Object.values(sketch.entities).find((entity) =>
        (entity.startPointId === a && entity.endPointId === b) || (entity.startPointId === b && entity.endPointId === a));
      return line && !directLineIds.has(line.id) && !directPointIds.has(a) && !directPointIds.has(b) ? [{ line, a, b }] : [];
    });
    for (let changed = true; changed;) {
      changed = false;
      for (const { a, b } of propagatedLines) {
        const da = displacement.get(a), db = displacement.get(b);
        if (da && !db) { displacement.set(b, da); changed = true; }
        else if (db && !da) { displacement.set(a, db); changed = true; }
      }
    }
    for (const [id, delta] of displacement) if (!targetIds.includes(id) && working.points[id]) {
      const original = sketch.points[id];
      working.points[id] = { ...original, x: original.x + delta.x, y: original.y + delta.y };
    }
  }

  for (const analyzed of touchedComponents) {
    const component: ComponentState = {
      pointIds: [...analyzed!.pointIds],
      equations: analyzed!.dimensionIds.map((id) => {
        const dimension = sketch.dimensions[id], equation = dimension && constraintEquation(sketch, dimension);
        return equation ? { ...equation, target: dimension.value } : null;
      }).filter((equation): equation is Equation => Boolean(equation)),
    };
    if (component.equations.length !== analyzed!.dimensionIds.length) return null;
    const draggedIds = targetIds.filter((id) => analyzed!.pointIds.has(id));
    // An exact rigid translation (or a target along remaining DOF) wins without
    // numerical adjustment.
    if (verifyDrawingDrivingDimensions(working, analyzed!.dimensionIds)) continue;
    let variableIds: readonly string[] = draggedIds;
    let solved = solveComponent(working, component, variableIds);
    if (!solved) {
      variableIds = component.pointIds;
      solved = solveComponent(working, component, variableIds, new Map(variableIds.map((id) => [id, draggedIds.includes(id) ? 1_000 : 1])));
    }
    if (!solved) return null;
    const points = { ...working.points };
    variableIds.forEach((id, index) => {
      points[id] = { ...points[id], x: solved!.values[index * 2], y: solved!.values[index * 2 + 1] };
    });
    working = { ...working, points };
    if (!verifyDrawingDrivingDimensions(working, analyzed!.dimensionIds)) return null;
  }
  return working;
};

const measurement = (sketch: DrawingSketchV2, dimension: DrawingDimension): number | null => { if (dimension.kind === 'LINE_TO_LINE_ANGLE') { const equation = constraintEquation(sketch, dimension); if (!equation) return null; const [a0, a1, b0, b1] = equation.pointKeys, sector = dimension.angleSector; return lineToLineAngleAndGradient(sketch.points[a0], sketch.points[a1], sketch.points[b0], sketch.points[b1], sector.sideA * sector.sideB as -1 | 1)?.angleDegrees ?? null; } if (dimension.kind === 'POINT_TO_LINE_DISTANCE') { const p = resolveDrawingPointReference(sketch, dimension.references[0]), l = resolveDimensionLineReference(sketch, dimension.references[1]); return p && l ? measurePointToLine(p, l) : null; } if (dimension.kind === 'LINE_TO_LINE_DISTANCE') { const a = resolveDimensionLineReference(sketch, dimension.references[0]), b = resolveDimensionLineReference(sketch, dimension.references[1]); return a && b ? measureLineToLineDistance(a, b) : null; } const a = resolveDrawingPointReference(sketch, dimension.references[0]), b = resolveDrawingPointReference(sketch, dimension.references[1]); return a && b ? measureDimension(dimension.kind, a, b) : null; };
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

/** Topology-weighted, selection-order-independent ownership for either measured Line. */
export const resolveLineToLineMovementIntent = (sketch: DrawingSketchV2, dimension: DrawingDimension): PointToLineMovementIntent | null => {
  if (dimension.kind !== 'LINE_TO_LINE_DISTANCE') return null;
  const measured = dimension.references.map((reference) => sketch.entities[reference.entityId]);
  if (!measured[0] || !measured[1]) return null;
  const lines = sketch.entityOrder.map((id) => sketch.entities[id]).filter((line): line is NonNullable<typeof line> => Boolean(line));
  const analysis = analyzeDrawingConstraints(sketch);
  const component = (seed: string) => {
    const lineIds = new Set([seed]), pointIds = new Set<string>();
    for (let changed = true; changed;) { changed = false; for (const line of lines) if (lineIds.has(line.id) || pointIds.has(line.startPointId) || pointIds.has(line.endPointId)) {
      if (!lineIds.has(line.id)) { lineIds.add(line.id); changed = true; }
      if (!pointIds.has(line.startPointId)) { pointIds.add(line.startPointId); changed = true; }
      if (!pointIds.has(line.endPointId)) { pointIds.add(line.endPointId); changed = true; }
    } }
    return { lineIds: [...lineIds], pointIds: [...pointIds] };
  };
  const candidates = measured.map((line): PointToLineMovementCandidate => {
    const topology = component(line.id), isolated = topology.lineIds.length === 1;
    const dimensionIds = new Set(topology.pointIds.flatMap((id) => analysis.componentByPointId.get(id)?.dimensionIds ?? []).filter((id) => id !== dimension.id));
    return { kind: isolated ? 'ISOLATED_LINE_RIGID_TRANSLATION' : 'CONNECTED_GEOMETRY_LOCAL_DEFORMATION', topologyClass: isolated ? 'ISOLATED_LINE' : 'CONNECTED_COMPONENT', pointIds: topology.pointIds, lineIds: topology.lineIds, entityCount: topology.lineIds.length, pointCount: topology.pointIds.length, sharedPointCount: topology.pointIds.filter((id) => lines.filter((item) => item.startPointId === id || item.endPointId === id).length > 1).length, drivingConstraintCount: dimensionIds.size, degreesOfFreedom: drawingConstraintDegreesOfFreedomForPoints(sketch, topology.pointIds, dimension.id), creationOrder: Math.min(...topology.lineIds.map((id) => sketch.entityOrder.indexOf(id))) };
  }).filter((candidate, index, all) => all.findIndex((item) => item.lineIds.slice().sort().join('|') === candidate.lineIds.slice().sort().join('|')) === index);
  candidates.sort((a, b) => (a.degreesOfFreedom <= 0 ? 1 : 0) - (b.degreesOfFreedom <= 0 ? 1 : 0) || (a.topologyClass === 'ISOLATED_LINE' ? 0 : 1) - (b.topologyClass === 'ISOLATED_LINE' ? 0 : 1) || a.entityCount - b.entityCount || a.pointCount - b.pointCount || a.sharedPointCount - b.sharedPointCount || a.drivingConstraintCount - b.drivingConstraintCount || a.creationOrder - b.creationOrder);
  if (!candidates.length) return null;
  const [preferred, ...alternatives] = candidates;
  return { preferred, alternatives, reason: !alternatives.length ? 'ONLY_MOVABLE_CANDIDATE' : preferred.topologyClass !== alternatives[0].topologyClass || preferred.entityCount !== alternatives[0].entityCount ? 'LOWER_TOPOLOGY_COST' : preferred.drivingConstraintCount !== alternatives[0].drivingConstraintCount ? 'LOWER_CONSTRAINT_INTERFERENCE' : 'STABLE_CREATION_ORDER' };
};

/**
 * Chooses the Line which should absorb a Driving Angle edit.  Unlike the
 * distance intent, the candidates remain side-local: a shared endpoint is
 * held by the stable side while the other endpoint rotates around it.  The
 * component solver is still responsible for satisfying every hard equation.
 */
export const resolveLineToLineAngleMovementIntent = (sketch: DrawingSketchV2, dimension: DrawingDimension): PointToLineMovementIntent | null => {
  if (dimension.kind !== 'LINE_TO_LINE_ANGLE') return null;
  const measured = dimension.references.map((reference) => sketch.entities[reference.entityId]);
  if (!measured[0] || !measured[1]) return null;
  const analysis = analyzeDrawingConstraints(sketch);
  const candidates = measured.map((line, index): PointToLineMovementCandidate => {
    const other = measured[index === 0 ? 1 : 0]!;
    const pointIds = [line.startPointId, line.endPointId].filter((id) => id !== other.startPointId && id !== other.endPointId);
    const localPointIds = pointIds.length ? pointIds : [line.startPointId, line.endPointId];
    const drivingConstraintCount = new Set(localPointIds.flatMap((id) => analysis.componentByPointId.get(id)?.dimensionIds ?? []).filter((id) => id !== dimension.id)).size;
    return {
      kind: 'CONNECTED_GEOMETRY_LOCAL_DEFORMATION', topologyClass: 'CONNECTED_COMPONENT', pointIds: localPointIds, lineIds: [line.id],
      entityCount: 1, pointCount: localPointIds.length, sharedPointCount: [line.startPointId, line.endPointId].filter((id) => id === other.startPointId || id === other.endPointId).length,
      drivingConstraintCount, degreesOfFreedom: drawingConstraintDegreesOfFreedomForPoints(sketch, localPointIds, dimension.id), creationOrder: sketch.entityOrder.indexOf(line.id),
    };
  });
  // Hard feasibility is tried by solveComponent below. A positive local DOF
  // keeps a partially constrained side eligible; among eligible measured
  // Lines, persisted creation order is the ownership rule. Reference/selection
  // order never participates.
  candidates.sort((a, b) => (a.degreesOfFreedom <= 0 ? 1 : 0) - (b.degreesOfFreedom <= 0 ? 1 : 0)
    || a.creationOrder - b.creationOrder);
  const [preferred, ...alternatives] = candidates;
  return { preferred, alternatives, reason: preferred.degreesOfFreedom > 0 && alternatives[0]?.degreesOfFreedom <= 0 ? 'ONLY_MOVABLE_CANDIDATE' : 'STABLE_CREATION_ORDER' };
};

const rigidLinePairTranslationCandidate = (sketch: DrawingSketchV2, edited: DrawingDimension, targetValue: number, intent: PointToLineMovementCandidate): DrawingSketchV2 | null => {
  if (edited.kind !== 'LINE_TO_LINE_DISTANCE' || intent.degreesOfFreedom <= 0) return null;
  const a = resolveDimensionLineReference(sketch, edited.references[0]), b = resolveDimensionLineReference(sketch, edited.references[1]); if (!a || !b) return null;
  let dx = a.end.x - a.start.x, dy = a.end.y - a.start.y; const length = Math.hypot(dx, dy); if (length <= DRAWING_CONSTRAINT_TOLERANCE_MM) return null;
  dx /= length; dy /= length; if (dx < 0 || (Math.abs(dx) <= 1e-9 && dy < 0)) { dx = -dx; dy = -dy; }
  const normal = { x: -dy, y: dx }, signed = (b.start.x - a.start.x) * normal.x + (b.start.y - a.start.y) * normal.y, desired = edited.signedSide * targetValue;
  const movingA = intent.lineIds.includes(a.id), movingB = intent.lineIds.includes(b.id); if (movingA === movingB) return null;
  const scalar = movingA ? signed - desired : desired - signed, points = { ...sketch.points };
  for (const id of intent.pointIds) { const point = points[id]; if (!point) return null; points[id] = { ...point, x: point.x + normal.x * scalar, y: point.y + normal.y * scalar }; }
  const candidate = { ...sketch, points, dimensions: { ...sketch.dimensions, [edited.id]: { ...edited, value: targetValue } } };
  return verifyDrawingDrivingDimensions(candidate, Object.values(candidate.dimensions).filter(({ role }) => role === 'driving').map(({ id }) => id)) ? candidate : null;
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
  if (edited.kind === 'LINE_TO_LINE_ANGLE' && (targetValue <= 0 || targetValue >= 180)) return fail('INVALID_ANGLE_TARGET');
  if (edited.kind === 'LINE_TO_LINE_ANGLE') { const equation = constraintEquation(sketch, edited); if (!equation || !measurement(sketch, edited)) return fail('UNSUPPORTED_DEGENERATE_GEOMETRY'); }
  if (edited.kind === 'LINE_TO_LINE_DISTANCE') { const a = resolveDimensionLineReference(sketch, edited.references[0]), b = resolveDimensionLineReference(sketch, edited.references[1]); if (!a || !b || measureLineToLineDistance(a, b) === null) return fail('UNSUPPORTED_DEGENERATE_GEOMETRY'); }
  if (edited.kind === 'POINT_TO_LINE_DISTANCE') { const line = resolveDimensionLineReference(sketch, edited.references[1]); if (!line || measurePointToLine(resolveDrawingPointReference(sketch, edited.references[0])!, line) === null) return fail('UNSUPPORTED_DEGENERATE_GEOMETRY'); }
  else if (edited.kind !== 'LINE_TO_LINE_DISTANCE' && edited.kind !== 'LINE_TO_LINE_ANGLE') { const a = resolveDrawingPointReference(sketch, edited.references[0]), b = resolveDrawingPointReference(sketch, edited.references[1]); if (!a || !b) return fail('MISSING_REFERENCE'); const dx = b.x - a.x, dy = b.y - a.y; if (edited.kind === 'ALIGNED_DISTANCE' && (targetValue <= DRAWING_CONSTRAINT_TOLERANCE_MM || Math.hypot(dx, dy) <= DRAWING_CONSTRAINT_TOLERANCE_MM)) return fail('UNSUPPORTED_DEGENERATE_GEOMETRY'); if (edited.kind === 'HORIZONTAL_DISTANCE' && Math.abs(dx) <= DRAWING_CONSTRAINT_TOLERANCE_MM && targetValue > DRAWING_CONSTRAINT_TOLERANCE_MM) return fail('UNDERDETERMINED_ORIENTATION'); if (edited.kind === 'VERTICAL_DISTANCE' && Math.abs(dy) <= DRAWING_CONSTRAINT_TOLERANCE_MM && targetValue > DRAWING_CONSTRAINT_TOLERANCE_MM) return fail('UNDERDETERMINED_ORIENTATION'); }
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
  if (edited.kind === 'LINE_TO_LINE_DISTANCE') {
    const lineIntent = resolveLineToLineMovementIntent(sketch, edited); if (!lineIntent) return fail('MISSING_REFERENCE');
    for (const candidateIntent of [lineIntent.preferred, ...lineIntent.alternatives]) { const candidate = rigidLinePairTranslationCandidate(sketch, edited, targetValue, candidateIntent); if (candidate) return finish(candidate, 0); }
    return fail('UNSATISFIABLE_DIMENSION_SET');
  }
  if (edited.kind === 'LINE_TO_LINE_ANGLE') {
    const angleIntent = resolveLineToLineAngleMovementIntent(sketch, edited); if (!angleIntent) return fail('MISSING_REFERENCE');
    for (const candidateIntent of [angleIntent.preferred, ...angleIntent.alternatives]) {
      if (candidateIntent.degreesOfFreedom <= 0) continue;
      const variableIds = candidateIntent.pointIds.filter((id) => component.pointIds.includes(id)), local = solveComponent(sketch, component, variableIds);
      if (!local) continue;
      const points = { ...sketch.points }; variableIds.forEach((id, i) => { points[id] = { ...points[id], x: local.values[i * 2], y: local.values[i * 2 + 1] }; });
      const candidate = { ...sketch, points, dimensions: { ...sketch.dimensions, [dimensionId]: { ...edited, value: targetValue } } };
      if (verifyDrawingDrivingDimensions(candidate, component.equations.map((equation) => equation.dimension.id))) return finish(candidate, local.iterations);
    }
    // Coupled constraints can leave neither side independently movable while
    // retaining legitimate component DOF.  Preserve the established generic
    // component solve as the final deterministic fallback.
  }
  if (edited.kind === 'POINT_TO_LINE_DISTANCE') {
    if (!movementIntent) return fail('MISSING_REFERENCE');
    preferred = movementIntent.preferred.pointIds;
  }
  else if (edited.kind === 'LINE_TO_LINE_ANGLE') preferred = component.pointIds;
  else { const first = constraintPointKey(sketch, edited.references[0]); preferred = component.pointIds.filter((id) => id !== first); }
  let variableIds: readonly string[] = preferred.filter((id) => component.pointIds.includes(id)), solved = solveComponent(sketch, component, variableIds); if (!solved && variableIds.length !== component.pointIds.length) { variableIds = component.pointIds; solved = solveComponent(sketch, component, variableIds); } if (!solved) return fail('UNSATISFIABLE_DIMENSION_SET');
  const points = { ...sketch.points }; variableIds.forEach((id, i) => { points[id] = { ...points[id], x: solved!.values[i * 2], y: solved!.values[i * 2 + 1] }; }); const dimensions = { ...sketch.dimensions, [dimensionId]: { ...edited, value: targetValue } }; let solvedSketch = { ...sketch, points, dimensions };
  if (edited.kind !== 'POINT_TO_LINE_DISTANCE' && edited.kind !== 'LINE_TO_LINE_ANGLE') {
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
