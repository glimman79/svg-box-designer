import type { DrawingDimension, DrawingDimensionKind, DrawingDocumentV2, DrawingLineEntity, DrawingPoint } from './drawingTypes';

export const DRAWING_CONSTRAINT_TOLERANCE_MM = 1e-7;

export type DrawingDimensionSolveFailureReason =
  | 'INVALID_TARGET'
  | 'MISSING_REFERENCE'
  | 'UNSUPPORTED_DEGENERATE_GEOMETRY'
  | 'UNDERDETERMINED_ORIENTATION'
  | 'UNSATISFIABLE_DIMENSION_SET'
  | 'SOLUTION_VERIFICATION_FAILED';

export type DrawingDimensionSolveResult =
  | Readonly<{ ok: true; document: DrawingDocumentV2; diagnostics: Readonly<{ constraintCount: number; residuals: readonly number[] }> }>
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
const nearZero = (value: number): boolean => Math.abs(value) <= DRAWING_CONSTRAINT_TOLERANCE_MM;
const referencePairKey = (dimension: DrawingDimension): string => dimension.references
  .map((reference) => `${reference.entityId}:${reference.point}`)
  .sort()
  .join('|');
const evaluate = (kind: DrawingDimensionKind, a: DrawingPoint, b: DrawingPoint): number => kind === 'HORIZONTAL_DISTANCE'
  ? Math.abs(b.x - a.x)
  : kind === 'VERTICAL_DISTANCE'
    ? Math.abs(b.y - a.y)
    : Math.hypot(b.x - a.x, b.y - a.y);
const signedMagnitude = (current: number, magnitude: number): number | null => {
  if (nearZero(magnitude)) return 0;
  if (nearZero(current)) return null;
  return Math.sign(current) * magnitude;
};

type ConstraintTargets = Partial<Record<DrawingDimensionKind, number>>;

/**
 * Pure analytic boundary for the current Line dimension equations. The Line's
 * semantic start is the fixed variable and its semantic end is the only solved
 * variable. Coordinate-equal points in other entities are deliberately ignored.
 */
export const solveDrawingDimensionEdit = ({ document, dimensionId, targetValue }: Readonly<{
  document: DrawingDocumentV2;
  dimensionId: string;
  targetValue: number;
}>): DrawingDimensionSolveResult => {
  if (!Number.isFinite(targetValue) || targetValue < 0) return fail('INVALID_TARGET');
  const sketch = document.sketches[document.activeSketchId];
  const edited = sketch?.dimensions[dimensionId];
  if (!sketch || !edited || edited.role !== 'driving') return fail('MISSING_REFERENCE');
  const sourceId = edited.references[0].entityId;
  const source = sketch.entities[sourceId];
  const referenceEntityIds = new Set(edited.references.map((reference) => reference.entityId));
  const referencePoints = new Set(edited.references.map((reference) => reference.point));
  if (source?.type !== 'line' || referenceEntityIds.size !== 1 || referencePoints.size !== 2 || !referencePoints.has('start') || !referencePoints.has('end')) {
    return fail('MISSING_REFERENCE');
  }

  const pairKey = referencePairKey(edited);
  const constraints = Object.values(sketch.dimensions).filter((dimension) =>
    dimension.role === 'driving' && referencePairKey(dimension) === pairKey);
  const targets: ConstraintTargets = {};
  for (const dimension of constraints) {
    const value = dimension.id === dimensionId ? targetValue : dimension.value;
    if (!Number.isFinite(value) || value < 0 || targets[dimension.kind] !== undefined) return fail('UNSATISFIABLE_DIMENSION_SET');
    targets[dimension.kind] = value;
  }
  if (constraints.length < 1 || constraints.length > 2) return fail('UNSATISFIABLE_DIMENSION_SET');

  const a = source.start, current = source.end;
  const dx = current.x - a.x, dy = current.y - a.y;
  const currentLength = Math.hypot(dx, dy);
  const aligned = targets.ALIGNED_DISTANCE, horizontal = targets.HORIZONTAL_DISTANCE, vertical = targets.VERTICAL_DISTANCE;
  let solvedDelta: DrawingPoint | null = null;

  if (aligned !== undefined && horizontal === undefined && vertical === undefined) {
    if (nearZero(currentLength) || nearZero(aligned)) return fail('UNSUPPORTED_DEGENERATE_GEOMETRY');
    solvedDelta = { x: dx / currentLength * aligned, y: dy / currentLength * aligned };
  } else if (horizontal !== undefined && aligned === undefined && vertical === undefined) {
    const solvedX = signedMagnitude(dx, horizontal);
    if (solvedX === null) return fail('UNDERDETERMINED_ORIENTATION');
    solvedDelta = { x: solvedX, y: dy };
  } else if (vertical !== undefined && aligned === undefined && horizontal === undefined) {
    const solvedY = signedMagnitude(dy, vertical);
    if (solvedY === null) return fail('UNDERDETERMINED_ORIENTATION');
    solvedDelta = { x: dx, y: solvedY };
  } else if (horizontal !== undefined && vertical !== undefined && aligned === undefined) {
    const solvedX = signedMagnitude(dx, horizontal), solvedY = signedMagnitude(dy, vertical);
    if (solvedX === null || solvedY === null) return fail('UNDERDETERMINED_ORIENTATION');
    solvedDelta = { x: solvedX, y: solvedY };
  } else if (aligned !== undefined && horizontal !== undefined && vertical === undefined) {
    if (nearZero(aligned)) return fail('UNSUPPORTED_DEGENERATE_GEOMETRY');
    if (horizontal > aligned + DRAWING_CONSTRAINT_TOLERANCE_MM) return fail('UNSATISFIABLE_DIMENSION_SET');
    const solvedX = signedMagnitude(dx, horizontal);
    const derivedY = Math.sqrt(Math.max(0, aligned * aligned - horizontal * horizontal));
    const solvedY = signedMagnitude(dy, derivedY);
    if (solvedX === null || solvedY === null) return fail('UNDERDETERMINED_ORIENTATION');
    solvedDelta = { x: solvedX, y: solvedY };
  } else if (aligned !== undefined && vertical !== undefined && horizontal === undefined) {
    if (nearZero(aligned)) return fail('UNSUPPORTED_DEGENERATE_GEOMETRY');
    if (vertical > aligned + DRAWING_CONSTRAINT_TOLERANCE_MM) return fail('UNSATISFIABLE_DIMENSION_SET');
    const derivedX = Math.sqrt(Math.max(0, aligned * aligned - vertical * vertical));
    const solvedX = signedMagnitude(dx, derivedX), solvedY = signedMagnitude(dy, vertical);
    if (solvedX === null || solvedY === null) return fail('UNDERDETERMINED_ORIENTATION');
    solvedDelta = { x: solvedX, y: solvedY };
  }
  if (!solvedDelta) return fail('UNSATISFIABLE_DIMENSION_SET');

  const end = { x: a.x + solvedDelta.x, y: a.y + solvedDelta.y };
  if (![end.x, end.y].every(Number.isFinite)) return fail('SOLUTION_VERIFICATION_FAILED');
  const residuals = constraints.map((dimension) => Math.abs(evaluate(dimension.kind, a, end) - targets[dimension.kind]!));
  if (residuals.some((residual) => residual > DRAWING_CONSTRAINT_TOLERANCE_MM)) return fail('SOLUTION_VERIFICATION_FAILED');

  const diagnostics = { constraintCount: constraints.length, residuals } as const;
  if (nearZero(end.x - source.end.x) && nearZero(end.y - source.end.y) && targetValue === edited.value) {
    return { ok: true, document, diagnostics };
  }

  const solvedLine: DrawingLineEntity = { ...source, end };
  const solvedDimension: DrawingDimension = { ...edited, value: targetValue };
  const solvedSketch = {
    ...sketch,
    entities: { ...sketch.entities, [source.id]: solvedLine },
    dimensions: { ...sketch.dimensions, [dimensionId]: solvedDimension },
  };
  return {
    ok: true,
    document: { ...document, sketches: { ...document.sketches, [sketch.id]: solvedSketch } },
    diagnostics,
  };
};
