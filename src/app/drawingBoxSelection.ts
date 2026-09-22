import type { DrawingPoint, ResolvedDrawingCircle, ResolvedDrawingLine } from './drawingTypes.js';
import type { DrawingSelectionRef } from './drawingConstraintsTool.js';

export type DrawingSelectionMode = 'window' | 'crossing';
export type DrawingSelectionRect = Readonly<{ minX: number; maxX: number; minY: number; maxY: number }>;
type DrawingLineSelectionRef = Extract<DrawingSelectionRef, { kind: 'line' }>;
type DrawingCircleSelectionRef = Extract<DrawingSelectionRef, { kind: 'circle' }>;

const SELECTION_EPSILON = 1e-9;

export const drawingSelectionMode = (originClientX: number, currentClientX: number): DrawingSelectionMode =>
  currentClientX >= originClientX ? 'window' : 'crossing';

export const normalizeDrawingSelectionRect = (a: DrawingPoint, b: DrawingPoint): DrawingSelectionRect => ({
  minX: Math.min(a.x, b.x), maxX: Math.max(a.x, b.x), minY: Math.min(a.y, b.y), maxY: Math.max(a.y, b.y),
});

const strictlyInside = (point: DrawingPoint, rect: DrawingSelectionRect) =>
  point.x > rect.minX + SELECTION_EPSILON && point.x < rect.maxX - SELECTION_EPSILON
  && point.y > rect.minY + SELECTION_EPSILON && point.y < rect.maxY - SELECTION_EPSILON;

const insideInclusive = (point: DrawingPoint, rect: DrawingSelectionRect) =>
  point.x >= rect.minX - SELECTION_EPSILON && point.x <= rect.maxX + SELECTION_EPSILON
  && point.y >= rect.minY - SELECTION_EPSILON && point.y <= rect.maxY + SELECTION_EPSILON;

const orientation = (a: DrawingPoint, b: DrawingPoint, c: DrawingPoint) =>
  (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
const onSegment = (a: DrawingPoint, b: DrawingPoint, point: DrawingPoint) =>
  Math.abs(orientation(a, b, point)) <= SELECTION_EPSILON
  && point.x >= Math.min(a.x, b.x) - SELECTION_EPSILON && point.x <= Math.max(a.x, b.x) + SELECTION_EPSILON
  && point.y >= Math.min(a.y, b.y) - SELECTION_EPSILON && point.y <= Math.max(a.y, b.y) + SELECTION_EPSILON;
const segmentsIntersect = (a: DrawingPoint, b: DrawingPoint, c: DrawingPoint, d: DrawingPoint) => {
  const abC = orientation(a, b, c), abD = orientation(a, b, d), cdA = orientation(c, d, a), cdB = orientation(c, d, b);
  if (((abC > SELECTION_EPSILON && abD < -SELECTION_EPSILON) || (abC < -SELECTION_EPSILON && abD > SELECTION_EPSILON))
    && ((cdA > SELECTION_EPSILON && cdB < -SELECTION_EPSILON) || (cdA < -SELECTION_EPSILON && cdB > SELECTION_EPSILON))) return true;
  return onSegment(a, b, c) || onSegment(a, b, d) || onSegment(c, d, a) || onSegment(c, d, b);
};

export const drawingLineQualifiesForRect = (line: ResolvedDrawingLine, rect: DrawingSelectionRect, mode: DrawingSelectionMode) => {
  if (mode === 'window') return strictlyInside(line.start, rect) && strictlyInside(line.end, rect);
  if (insideInclusive(line.start, rect) || insideInclusive(line.end, rect)) return true;
  const topLeft = { x: rect.minX, y: rect.minY }, topRight = { x: rect.maxX, y: rect.minY };
  const bottomRight = { x: rect.maxX, y: rect.maxY }, bottomLeft = { x: rect.minX, y: rect.maxY };
  return [[topLeft, topRight], [topRight, bottomRight], [bottomRight, bottomLeft], [bottomLeft, topLeft]]
    .some(([a, b]) => segmentsIntersect(line.start, line.end, a, b));
};
export const drawingCircleQualifiesForRect = (circle: ResolvedDrawingCircle, rect: DrawingSelectionRect, mode: DrawingSelectionMode) => {
  const { center, radius } = circle;
  if (mode === 'window') return center.x - radius > rect.minX + SELECTION_EPSILON && center.x + radius < rect.maxX - SELECTION_EPSILON
    && center.y - radius > rect.minY + SELECTION_EPSILON && center.y + radius < rect.maxY - SELECTION_EPSILON;
  const closestX = Math.max(rect.minX, Math.min(center.x, rect.maxX));
  const closestY = Math.max(rect.minY, Math.min(center.y, rect.maxY));
  const nearest = Math.hypot(center.x - closestX, center.y - closestY);
  const farthest = Math.max(...[
    Math.hypot(center.x - rect.minX, center.y - rect.minY), Math.hypot(center.x - rect.maxX, center.y - rect.minY),
    Math.hypot(center.x - rect.maxX, center.y - rect.maxY), Math.hypot(center.x - rect.minX, center.y - rect.maxY),
  ]);
  return nearest <= radius + SELECTION_EPSILON && farthest >= radius - SELECTION_EPSILON;
};

/** Input order is retained, so callers can pass active-sketch entityOrder resolution. */
export const selectDrawingGeometryInRect = (lines: readonly ResolvedDrawingLine[], rect: DrawingSelectionRect, mode: DrawingSelectionMode): readonly DrawingLineSelectionRef[] =>
  lines.filter((line) => drawingLineQualifiesForRect(line, rect, mode)).map((line) => ({ kind: 'line', lineId: line.id }));

export const selectDrawingEntitiesInRect = (entities: readonly (ResolvedDrawingLine | ResolvedDrawingCircle)[], rect: DrawingSelectionRect, mode: DrawingSelectionMode): readonly (DrawingLineSelectionRef | DrawingCircleSelectionRef)[] =>
  entities.reduce<(DrawingLineSelectionRef | DrawingCircleSelectionRef)[]>((selected, entity) => {
    if (entity.type === 'line' && drawingLineQualifiesForRect(entity, rect, mode)) selected.push({ kind: 'line', lineId: entity.id });
    if (entity.type === 'circle' && drawingCircleQualifiesForRect(entity, rect, mode)) selected.push({ kind: 'circle', circleId: entity.id });
    return selected;
  }, []);

export const applyDrawingBoxSelection = (current: readonly DrawingSelectionRef[], qualifying: readonly (DrawingLineSelectionRef | DrawingCircleSelectionRef)[], ctrlKey: boolean) => {
  if (!ctrlKey) return qualifying;
  return qualifying.reduce<readonly DrawingSelectionRef[]>((selection, target) => {
    const key = target.kind === 'line' ? `line:${target.lineId}` : `circle:${target.circleId}`;
    const exists = selection.some((ref) => (ref.kind === 'line' ? `line:${ref.lineId}` : ref.kind === 'circle' ? `circle:${ref.circleId}` : '') === key);
    return exists ? selection.filter((ref) => (ref.kind === 'line' ? `line:${ref.lineId}` : ref.kind === 'circle' ? `circle:${ref.circleId}` : '') !== key) : [...selection, target];
  }, current);
};
