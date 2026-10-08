import { DRAWING_MODEL_SPACE_TOLERANCE, type DrawingArcEntity, type DrawingPoint, type LegacyDrawingArcEntity, type ResolvedDrawingArc } from './drawingTypes.js';
import { circularSupportResidual, projectPointToCircularSupport } from './drawingCircularGeometry.js';

const TAU = Math.PI * 2;
const normalizedPositive = (angle: number) => ((angle % TAU) + TAU) % TAU;

/** True when angle belongs to the directed, finite start+sweep interval. */
export const angleIsOnDrawingArc = (angle: number, startAngle: number, signedSweep: number, tolerance = 1e-10): boolean => {
  if (![angle, startAngle, signedSweep].every(Number.isFinite) || Math.abs(signedSweep) > TAU + tolerance) return false;
  const directed = signedSweep >= 0 ? normalizedPositive(angle - startAngle) : normalizedPositive(startAngle - angle);
  return directed <= Math.abs(signedSweep) + tolerance;
};

export const migrateLegacyArc = (entity: LegacyDrawingArcEntity, start: DrawingPoint, end: DrawingPoint) => {
  const { bulge } = entity;
  const dx = end.x - start.x, dy = end.y - start.y, chord = Math.hypot(dx, dy);
  if (![start.x, start.y, end.x, end.y, bulge].every(Number.isFinite)
    || chord <= DRAWING_MODEL_SPACE_TOLERANCE || Math.abs(bulge) <= DRAWING_MODEL_SPACE_TOLERANCE) return null;
  const offset = chord * (1 - bulge * bulge) / (4 * bulge);
  const center = { x: (start.x + end.x) / 2 - dy / chord * offset, y: (start.y + end.y) / 2 + dx / chord * offset };
  const radius = chord * (1 + bulge * bulge) / (4 * Math.abs(bulge));
  const startAngle = Math.atan2(start.y - center.y, start.x - center.x), signedSweep = 4 * Math.atan(bulge);
  if (![center.x, center.y, radius, startAngle, signedSweep].every(Number.isFinite) || radius <= DRAWING_MODEL_SPACE_TOLERANCE) return null;
  return { center, radius, orientation: (signedSweep > 0 ? 'CCW' : 'CW') as DrawingArcEntity['orientation'], signedSweep };
};

/** Canonical finite directed-Arc resolver. Orientation, never shortest-path logic, owns the branch. */
export const resolveDrawingArc = (entity: DrawingArcEntity, center: DrawingPoint, start: DrawingPoint, end: DrawingPoint): ResolvedDrawingArc | null => {
  if (![center?.x, center?.y, start?.x, start?.y, end?.x, end?.y, entity.radius].every(Number.isFinite)
    || entity.radius <= DRAWING_MODEL_SPACE_TOLERANCE || !['CW', 'CCW'].includes(entity.orientation)
    || start.x === end.x && start.y === end.y) return null;
  // Eight machine epsilons at the geometry's coordinate scale allow for
  // coordinate/vector subtraction and cross/dot roundoff. This
  // is a representability guard, not a model-space or radial-equation cutoff.
  const coordinateScale = Math.max(entity.radius, ...[center, start, end].flatMap((point) => [Math.abs(point.x), Math.abs(point.y)]));
  if (Math.hypot(start.x - end.x, start.y - end.y) <= 8 * Number.EPSILON * coordinateScale) return null;
  const radialTolerance = Math.max(1e-7, entity.radius * 1e-7);
  if (Math.abs(Math.hypot(start.x - center.x, start.y - center.y) - entity.radius) > radialTolerance
    || Math.abs(Math.hypot(end.x - center.x, end.y - center.y) - entity.radius) > radialTolerance) return null;
  const sx = (start.x - center.x) / entity.radius, sy = (start.y - center.y) / entity.radius;
  const ex = (end.x - center.x) / entity.radius, ey = (end.y - center.y) / entity.radius;
  const startAngle = Math.atan2(sy, sx);
  // atan2(cross, dot) avoids cancellation from subtracting absolute angles
  // and from adding/subtracting TAU for a small positive sweep.
  const relative = Math.atan2(sx * ey - sy * ex, sx * ex + sy * ey);
  const directed = entity.orientation === 'CCW' ? relative : -relative;
  const magnitude = directed > 0 ? directed : TAU + directed;
  // Distinct radial-tolerance poses can still have the same direction. A sweep
  // rounded to zero/full TAU has no representable finite directed extent.
  if (!(magnitude > 0 && magnitude < TAU)) return null;
  const signedSweep = entity.orientation === 'CCW' ? magnitude : -magnitude;
  return { ...entity, center: { ...center }, start: { ...start }, end: { ...end }, startAngle, signedSweep, endAngle: startAngle + signedSweep };
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
  // Solve in a translated, uniformly scaled frame. Squaring absolute world
  // coordinates loses the small circumcircle in their cancellation.
  const bx = abx / formScale, by = aby / formScale;
  const px = apx / formScale, py = apy / formScale;
  const determinant = 2 * (bx * py - by * px);
  const b2 = bx * bx + by * by, p2 = px * px + py * py;
  const center = {
    x: start.x + formScale * (b2 * py - p2 * by) / determinant,
    y: start.y + formScale * (bx * p2 - px * b2) / determinant,
  };
  const radius = Math.hypot(start.x - center.x, start.y - center.y);
  // The chord/form cross sign chooses the branch containing P3 without
  // subtracting absolute angles or erasing small representable sweeps.
  return resolveDrawingArc({ id, type: 'arc', centerPointId: 'preview:center', radius, startPointId, endPointId,
    orientation: cross > 0 ? 'CW' : 'CCW' }, center, start, end);
};

export const projectPointToArc = (point: DrawingPoint, arc: ResolvedDrawingArc): DrawingPoint => {
  const radial = projectPointToCircularSupport(point, arc);
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
export const finiteArcConstraintResidual = (point: DrawingPoint, entity: DrawingArcEntity, center: DrawingPoint, start: DrawingPoint, end: DrawingPoint): number | null => {
  const arc = resolveDrawingArc(entity, center, start, end);
  if (!arc) return null;
  const angle = Math.atan2(point.y - arc.center.y, point.x - arc.center.x);
  return angleIsOnDrawingArc(angle, arc.startAngle, arc.signedSweep)
    ? circularSupportResidual(point, arc)
    : Math.min(Math.hypot(point.x - start.x, point.y - start.y), Math.hypot(point.x - end.x, point.y - end.y));
};

export const drawingArcPath = (arc: ResolvedDrawingArc): string =>
  `M ${arc.start.x} ${arc.start.y} A ${arc.radius} ${arc.radius} 0 ${Math.abs(arc.signedSweep) > Math.PI ? 1 : 0} ${arc.signedSweep > 0 ? 1 : 0} ${arc.end.x} ${arc.end.y}`;
