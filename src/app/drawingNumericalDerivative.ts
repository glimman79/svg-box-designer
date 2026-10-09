import type { DrawingEntity, DrawingSketchV2 } from './drawingTypes.js';
import { drawingEntityDefiningPointIds } from './drawingEntityDefinition.js';
import { readDrawingSolverVariable, type DrawingSolverVariable } from './drawingSolverVariables.js';

/** Local geometric length, independent of the drawing's world translation. */
export const drawingVariableLengthScale = (sketch: DrawingSketchV2, variable: DrawingSolverVariable): number => {
  if (variable.kind === 'entity-scalar') return Math.abs(readDrawingSolverVariable(sketch, variable) ?? 1);
  const lengths: number[] = [];
  for (const entity of Object.values(sketch.entities as Record<string, DrawingEntity>)) {
    const ids = drawingEntityDefiningPointIds(entity);
    if (!ids.includes(variable.pointId)) continue;
    if (entity.type === 'arc' || entity.type === 'circle') lengths.push(entity.radius);
    else {
      const a = sketch.points[ids[0]], b = sketch.points[ids[1]];
      if (a && b) lengths.push(Math.hypot(b.x - a.x, b.y - a.y));
    }
  }
  const valid = lengths.filter(length => Number.isFinite(length) && length > 0);
  return valid.length ? Math.min(...valid) : 1;
};

/** Central differences use actual representable displacements. At a domain
 * boundary a valid one-sided sample is used; missing samples never become zeros.
 * Refinement handles an evaluator whose local domain excludes both trials. */
export const drawingNumericalDerivative = (
  value: number, lengthScale: number, current: readonly number[],
  evaluate: (value: number) => readonly number[] | null,
  forwardAtStationaryCusp = false,
): number[] | null => {
  const floor = Math.max(Number.MIN_VALUE, 8 * Number.EPSILON * Math.abs(value));
  let step = Math.max(floor, 1e-6 * lengthScale);
  const valid = (sample: readonly number[] | null): sample is readonly number[] =>
    sample !== null && sample.length === current.length && sample.every(Number.isFinite);
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const upper = value + step, lower = value - step;
    const plus = upper !== value ? evaluate(upper) : null, minus = lower !== value ? evaluate(lower) : null;
    if (valid(plus) && valid(minus)) return plus.map((v, row) => {
      const central = (v - minus[row]) / (upper - lower), forward = (v - current[row]) / (upper - value);
      return forwardAtStationaryCusp && Math.abs(central) <= 1e-12 && Math.abs(forward) > 1e-12 ? forward : central;
    });
    if (valid(plus)) return plus.map((v, row) => (v - current[row]) / (upper - value));
    if (valid(minus)) return minus.map((v, row) => (current[row] - v) / (value - lower));
    if (step <= floor) break;
    step = Math.max(floor, step / 2);
  }
  return null;
};
