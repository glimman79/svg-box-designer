import { DRAWING_MODEL_SPACE_TOLERANCE, type DrawingArcEntity, type DrawingPoint, type ResolvedDrawingArc } from './drawingTypes.js';

const TAU = Math.PI * 2;
const normalizedPositive = (angle: number) => ((angle % TAU) + TAU) % TAU;

/** True when angle belongs to the directed, finite start+sweep interval. */
export const angleIsOnDrawingArc = (angle: number, startAngle: number, signedSweep: number, tolerance = 1e-10): boolean => {
  if (![angle, startAngle, signedSweep].every(Number.isFinite) || Math.abs(signedSweep) > TAU + tolerance) return false;
  const directed = signedSweep >= 0 ? normalizedPositive(angle - startAngle) : normalizedPositive(startAngle - angle);
  return directed <= Math.abs(signedSweep) + tolerance;
};

export const resolveArcFromBulge = (entity: DrawingArcEntity, start: DrawingPoint, end: DrawingPoint): ResolvedDrawingArc | null => {
  const { bulge } = entity;
  const dx = end.x - start.x, dy = end.y - start.y, chord = Math.hypot(dx, dy);
  if (![start.x, start.y, end.x, end.y, bulge].every(Number.isFinite)
    || chord <= DRAWING_MODEL_SPACE_TOLERANCE || Math.abs(bulge) <= DRAWING_MODEL_SPACE_TOLERANCE) return null;
  const offset = chord * (1 - bulge * bulge) / (4 * bulge);
  const center = { x: (start.x + end.x) / 2 - dy / chord * offset, y: (start.y + end.y) / 2 + dx / chord * offset };
  const radius = chord * (1 + bulge * bulge) / (4 * Math.abs(bulge));
  const startAngle = Math.atan2(start.y - center.y, start.x - center.x), signedSweep = 4 * Math.atan(bulge);
  if (![center.x, center.y, radius, startAngle, signedSweep].every(Number.isFinite) || radius <= DRAWING_MODEL_SPACE_TOLERANCE) return null;
  return { ...entity, start: { ...start }, end: { ...end }, center, radius, startAngle, signedSweep, endAngle: startAngle + signedSweep };
};

/** Endpoint-first exact circumcircle construction. The selected directed arc contains form. */
export const deriveArcThroughThreePoints = (start: DrawingPoint, end: DrawingPoint, form: DrawingPoint,
  id = 'preview', startPointId = 'preview:start', endPointId = 'preview:end'): ResolvedDrawingArc | null => {
  if (![start.x, start.y, end.x, end.y, form.x, form.y].every(Number.isFinite)) return null;
  const abx = end.x - start.x, aby = end.y - start.y, apx = form.x - start.x, apy = form.y - start.y;
  const chord = Math.hypot(abx, aby), formScale = Math.max(chord, Math.hypot(apx, apy), Math.hypot(form.x - end.x, form.y - end.y));
  const cross = abx * apy - aby * apx;
  // Dimensionless sine conditioning prevents huge, unstable near-collinear circles.
  if (chord <= DRAWING_MODEL_SPACE_TOLERANCE || formScale <= DRAWING_MODEL_SPACE_TOLERANCE
    || Math.abs(cross) <= 1e-9 * chord * formScale) return null;
  const a2 = start.x * start.x + start.y * start.y, b2 = end.x * end.x + end.y * end.y, p2 = form.x * form.x + form.y * form.y;
  const determinant = 2 * (start.x * (end.y - form.y) + end.x * (form.y - start.y) + form.x * (start.y - end.y));
  if (!Number.isFinite(determinant) || Math.abs(determinant) <= Number.EPSILON * formScale * formScale * 16) return null;
  const center = {
    x: (a2 * (end.y - form.y) + b2 * (form.y - start.y) + p2 * (start.y - end.y)) / determinant,
    y: (a2 * (form.x - end.x) + b2 * (start.x - form.x) + p2 * (end.x - start.x)) / determinant,
  };
  const startAngle = Math.atan2(start.y - center.y, start.x - center.x);
  const endAngle = Math.atan2(end.y - center.y, end.x - center.x), formAngle = Math.atan2(form.y - center.y, form.x - center.x);
  const ccwSweep = normalizedPositive(endAngle - startAngle), formCcw = normalizedPositive(formAngle - startAngle);
  const signedSweep = formCcw <= ccwSweep + 1e-10 ? ccwSweep : ccwSweep - TAU;
  const bulge = Math.tan(signedSweep / 4);
  return resolveArcFromBulge({ id, type: 'arc', startPointId, endPointId, bulge }, start, end);
};

export const projectPointToArc = (point: DrawingPoint, arc: ResolvedDrawingArc): DrawingPoint => {
  const dx = point.x - arc.center.x, dy = point.y - arc.center.y, length = Math.hypot(dx, dy);
  const radial = length > 1e-12 ? { x: arc.center.x + arc.radius * dx / length, y: arc.center.y + arc.radius * dy / length }
    : { x: arc.center.x + arc.radius, y: arc.center.y };
  if (angleIsOnDrawingArc(Math.atan2(radial.y - arc.center.y, radial.x - arc.center.x), arc.startAngle, arc.signedSweep)) return radial;
  const ds = Math.hypot(point.x - arc.start.x, point.y - arc.start.y), de = Math.hypot(point.x - arc.end.x, point.y - arc.end.y);
  return ds <= de ? arc.start : arc.end;
};

export const distanceToArc = (point: DrawingPoint, arc: ResolvedDrawingArc): number => {
  const nearest = projectPointToArc(point, arc);
  return Math.hypot(point.x - nearest.x, point.y - nearest.y);
};

/** Signed equation used by the shared constraint solver. Outside the directed
 * finite domain it deliberately becomes endpoint distance, never support-circle
 * distance. */
export const finiteArcConstraintResidual = (point: DrawingPoint, entity: DrawingArcEntity, start: DrawingPoint, end: DrawingPoint): number | null => {
  const arc = resolveArcFromBulge(entity, start, end);
  if (!arc) return null;
  const angle = Math.atan2(point.y - arc.center.y, point.x - arc.center.x);
  return angleIsOnDrawingArc(angle, arc.startAngle, arc.signedSweep)
    ? Math.hypot(point.x - arc.center.x, point.y - arc.center.y) - arc.radius
    : Math.min(Math.hypot(point.x - start.x, point.y - start.y), Math.hypot(point.x - end.x, point.y - end.y));
};

export const drawingArcPath = (arc: ResolvedDrawingArc): string =>
  `M ${arc.start.x} ${arc.start.y} A ${arc.radius} ${arc.radius} 0 ${Math.abs(arc.signedSweep) > Math.PI ? 1 : 0} ${arc.signedSweep > 0 ? 1 : 0} ${arc.end.x} ${arc.end.y}`;
