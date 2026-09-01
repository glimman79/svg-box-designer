import type { DrawingDimension, DrawingDimensionKind, DrawingDimensionRole, DrawingDocumentV2, DrawingGeometryReference, DrawingLineEntity, DrawingPoint, DrawingSketchV2 } from './drawingTypes';

export const DIMENSION_AXIS_EPSILON_MM = 1e-7;
export const DIMENSION_INTERPRETATION_HYSTERESIS_PX = 3;
export const DIMENSION_ENDPOINT_TOLERANCE_PX = 9;
export const DIMENSION_LINE_TOLERANCE_PX = 8;
export const DIMENSION_DRAG_THRESHOLD_PX = 4;
export const DIMENSION_TEXT_SIZE_PX = 10;
// The SVG annotation's 2 px non-scaling paint halo adds 4 px to its visible
// silhouette. 17 px makes the un-stroked HTML input about 121% of that 14 px
// painted target, rather than comparing unlike 10 px SVG and 12 px CSS values.
export const DIMENSION_EDITOR_TEXT_SIZE_PX = 17;
export const DIMENSION_COLORS = { normal: '#2db65b', hover: '#2fb85f', active: '#137a3e' } as const;
export const DIMENSION_EDITOR_HEIGHT_PX = 26;
export const DIMENSION_EDITOR_HORIZONTAL_PADDING_PX = 4;
export const DIMENSION_EDITOR_VERTICAL_PADDING_PX = 2;
export const DIMENSION_EDITOR_BORDER_PX = 1;
export const DIMENSION_EDITOR_RADIUS_PX = 3;
/** Compact width in screen pixels for a numeric draft rendered at 17 px. */
export const dimensionEditorWidthPixels = (draft: string): number => Math.max(34, draft.length * 10 + 2 * DIMENSION_EDITOR_HORIZONTAL_PADDING_PX + 2 * DIMENSION_EDITOR_BORDER_PX);
export type DimensionPreselection = Readonly<{
  kind: 'point'; lineId: string; point: 'start' | 'end'; clientPoint: DrawingPoint; distancePx: number;
}> | Readonly<{ kind: 'line'; lineId: string; distancePx: number }>;
export type DimensionClientLine = Readonly<{ id: string; start: DrawingPoint; end: DrawingPoint }>;
export type DimensionToolState =
  | Readonly<{ phase: 'inactive' }>
  | Readonly<{ phase: 'acquiringReference'; reference?: Extract<DrawingGeometryReference, { kind: 'point' }> }>
  | Readonly<{ phase: 'placementPreview'; lineId: string; cursor: DrawingPoint; kind: DrawingDimensionKind }>;

export const lineDimensionReferences = (line: DrawingLineEntity): DrawingDimension['references'] => ([
  { kind: 'point', entityId: line.id, point: 'start' }, { kind: 'point', entityId: line.id, point: 'end' },
]);
export const resolveDrawingPointReference = (sketch: DrawingSketchV2, reference: DrawingGeometryReference): DrawingPoint | null => {
  if (reference.kind !== 'point') return null;
  const entity = sketch.entities[reference.entityId];
  return entity?.type === 'line' ? entity[reference.point] : null;
};
export const measureDimension = (kind: DrawingDimensionKind, a: DrawingPoint, b: DrawingPoint): number => kind === 'HORIZONTAL_DISTANCE'
  ? Math.abs(b.x - a.x) : kind === 'VERTICAL_DISTANCE' ? Math.abs(b.y - a.y) : Math.hypot(b.x - a.x, b.y - a.y);
export const availableLineDimensionKinds = (line: DrawingLineEntity): DrawingDimensionKind[] => {
  const dx = Math.abs(line.end.x - line.start.x), dy = Math.abs(line.end.y - line.start.y);
  if (dx <= DIMENSION_AXIS_EPSILON_MM && dy <= DIMENSION_AXIS_EPSILON_MM) return [];
  // Aligned is the canonical axis-line length. Zero projections and duplicate families are omitted.
  if (dy <= DIMENSION_AXIS_EPSILON_MM || dx <= DIMENSION_AXIS_EPSILON_MM) return ['ALIGNED_DISTANCE'];
  return ['ALIGNED_DISTANCE', 'HORIZONTAL_DISTANCE', 'VERTICAL_DISTANCE'];
};
/** Converts a fixed screen-space annotation size to SVG model units. */
export const dimensionScreenPixelsToModelUnits = (screenPixels: number, pixelsPerModelUnit: number): number => screenPixels / pixelsPerModelUnit;
/** Resolve one semantic target in client space. Endpoints intentionally form the first priority tier. */
export const collectDimensionReferenceCandidates = (lines: readonly DimensionClientLine[], cursor: DrawingPoint): DimensionPreselection[] => {
  const points: DimensionPreselection[] = [], bodies: DimensionPreselection[] = [];
  for (const line of lines) {
    for (const point of ['start', 'end'] as const) {
      const distancePx = Math.hypot(cursor.x - line[point].x, cursor.y - line[point].y);
      if (distancePx <= DIMENSION_ENDPOINT_TOLERANCE_PX) points.push({ kind: 'point', lineId: line.id, point, clientPoint: line[point], distancePx });
    }
    const dx = line.end.x - line.start.x, dy = line.end.y - line.start.y;
    const t = Math.max(0, Math.min(1, ((cursor.x - line.start.x) * dx + (cursor.y - line.start.y) * dy) / (dx * dx + dy * dy || 1)));
    const distancePx = Math.hypot(cursor.x - line.start.x - t * dx, cursor.y - line.start.y - t * dy);
    if (distancePx <= DIMENSION_LINE_TOLERANCE_PX) bodies.push({ kind: 'line', lineId: line.id, distancePx });
  }
  return [...points.sort((a, b) => a.distancePx - b.distancePx), ...bodies.sort((a, b) => a.distancePx - b.distancePx)];
};
export const resolveDimensionPreselection = (lines: readonly DimensionClientLine[], cursor: DrawingPoint): DimensionPreselection | null => collectDimensionReferenceCandidates(lines, cursor)[0] ?? null;
export const preselectionReference = (candidate: DimensionPreselection): DrawingGeometryReference => candidate.kind === 'point'
  ? { kind: 'point', entityId: candidate.lineId, point: candidate.point }
  : { kind: 'entity', entityId: candidate.lineId };

/** Scores distance to each family's natural placement locus; a 3 px advantage switches families. */
export const chooseLineDimensionKind = (line: DrawingLineEntity, cursor: DrawingPoint, previous?: DrawingDimensionKind, pixelsPerModelUnit = 1): DrawingDimensionKind => {
  const kinds = availableLineDimensionKinds(line);
  const mid = { x: (line.start.x + line.end.x) / 2, y: (line.start.y + line.end.y) / 2 };
  const dx = line.end.x - line.start.x, dy = line.end.y - line.start.y, length = Math.hypot(dx, dy) || 1;
  const qx = cursor.x - mid.x, qy = cursor.y - mid.y;
  // Loci are rays normal to the candidate dimension line through its midpoint.
  const scores: Record<DrawingDimensionKind, number> = { ALIGNED_DISTANCE: Math.abs(qx * dx / length + qy * dy / length) * pixelsPerModelUnit, HORIZONTAL_DISTANCE: Math.abs(qx) * pixelsPerModelUnit, VERTICAL_DISTANCE: Math.abs(qy) * pixelsPerModelUnit };
  const winner = kinds.reduce((best, kind) => scores[kind] < scores[best] ? kind : best, kinds[0]);
  return previous && kinds.includes(previous) && scores[previous] <= scores[winner] + DIMENSION_INTERPRETATION_HYSTERESIS_PX ? previous : winner;
};
export const dimensionOffset = (line: DrawingLineEntity, cursor: DrawingPoint, kind: DrawingDimensionKind): number => {
  const mid = { x: (line.start.x + line.end.x) / 2, y: (line.start.y + line.end.y) / 2 };
  if (kind === 'HORIZONTAL_DISTANCE') return cursor.y - mid.y;
  if (kind === 'VERTICAL_DISTANCE') return cursor.x - mid.x;
  const dx = line.end.x - line.start.x, dy = line.end.y - line.start.y, length = Math.hypot(dx, dy) || 1;
  return (cursor.x - mid.x) * (-dy / length) + (cursor.y - mid.y) * (dx / length);
};
export const createLineDimension = (line: DrawingLineEntity, kind: DrawingDimensionKind, cursor: DrawingPoint, id: string): DrawingDimension => ({ id, kind, role: 'driving', references: lineDimensionReferences(line), value: measureDimension(kind, line.start, line.end), placement: { kind: 'linear', offset: dimensionOffset(line, cursor, kind) } });
export const formatLinearDimension = (value: number): string => `${new Intl.NumberFormat('en-US', { useGrouping: false, maximumFractionDigits: 3 }).format(value)} mm`;
/** User-facing edit draft: the authoritative stored target, rounded only to the display policy. */
export const formatDimensionEditValue = (value: number): string => new Intl.NumberFormat('en-US', { useGrouping: false, maximumFractionDigits: 3 }).format(value);
export const formatDimensionValue = (value: number, role: DrawingDimensionRole): string => role === 'reference'
  ? `(${formatLinearDimension(value)})`
  : formatLinearDimension(value);
export const parseLinearDimension = (input: string): number | null => {
  const match = input.trim().match(/^(?:\d+(?:\.\d*)?|\.\d+)\s*(?:mm)?$/i);
  if (!match) return null;
  const value = Number.parseFloat(match[0]);
  return Number.isFinite(value) && value >= 0 ? value : null;
};

type PointReference = DrawingDimension['references'][number];
export const semanticPointReferenceKey = (reference: PointReference): string => `${reference.entityId}:${reference.point}`;
export const canonicalDimensionReferencePairKey = (references: DrawingDimension['references']): string => references
  .map(semanticPointReferenceKey)
  .sort()
  .join('|');

export type DimensionRoleClassification = Readonly<
  | { role: 'driving'; reason: 'independent' }
  | { role: 'reference'; reason: 'redundant' }
  | { role: 'reference'; reason: 'duplicate' }
>;

/**
 * Limited D2.5a3 rule for the three current linear families on one semantic
 * unordered point pair. This is intentionally not a general rank/DOF solver.
 */
export const classifyNewDimensionRole = (sketch: DrawingSketchV2, candidate: DrawingDimension): DimensionRoleClassification => {
  const pairKey = canonicalDimensionReferencePairKey(candidate.references);
  const samePair = Object.values(sketch.dimensions).filter((dimension) =>
    canonicalDimensionReferencePairKey(dimension.references) === pairKey);
  if (samePair.some((dimension) => dimension.kind === candidate.kind)) return { role: 'reference', reason: 'duplicate' };
  const drivingFamilies = new Set(samePair.filter((dimension) => dimension.role === 'driving').map((dimension) => dimension.kind));
  return drivingFamilies.size >= 2
    ? { role: 'reference', reason: 'redundant' }
    : { role: 'driving', reason: 'independent' };
};

/** Reference measurement is always resolved from current geometry, never stale `value`. */
export const displayedDimensionMeasurement = (sketch: DrawingSketchV2, dimension: DrawingDimension): number | null => {
  if (dimension.role === 'driving') return dimension.value;
  const a = resolveDrawingPointReference(sketch, dimension.references[0]);
  const b = resolveDrawingPointReference(sketch, dimension.references[1]);
  return a && b ? measureDimension(dimension.kind, a, b) : null;
};

/** Future solver contract: reference dimensions add zero scalar equations. */
export const dimensionConstraintEquationCount = (dimension: DrawingDimension): 0 | 1 => dimension.role === 'driving' ? 1 : 0;

export const appendDimension = (document: DrawingDocumentV2, dimension: DrawingDimension): DrawingDocumentV2 => {
  const sketch = document.sketches[document.activeSketchId];
  if (!sketch || sketch.dimensions[dimension.id] || dimension.references.some((r) => !resolveDrawingPointReference(sketch, r))) return document;
  const classification = classifyNewDimensionRole(sketch, dimension);
  if (classification.reason === 'duplicate') return document;
  const classified = { ...dimension, role: classification.role };
  return { ...document, sketches: { ...document.sketches, [sketch.id]: { ...sketch, dimensions: { ...sketch.dimensions, [dimension.id]: classified }, dimensionOrder: [...sketch.dimensionOrder, dimension.id] } } };
};
export const deleteDimension = (document: DrawingDocumentV2, id: string): DrawingDocumentV2 => {
  const sketch = document.sketches[document.activeSketchId]; if (!sketch?.dimensions[id]) return document;
  const dimensions = { ...sketch.dimensions }; delete dimensions[id];
  return { ...document, sketches: { ...document.sketches, [sketch.id]: { ...sketch, dimensions, dimensionOrder: sketch.dimensionOrder.filter((item) => item !== id) } } };
};
export const moveDimensionPlacement = (document: DrawingDocumentV2, id: string, offset: number): DrawingDocumentV2 => {
  const sketch = document.sketches[document.activeSketchId], dimension = sketch?.dimensions[id];
  if (!sketch || !dimension || dimension.placement.offset === offset) return document;
  return { ...document, sketches: { ...document.sketches, [sketch.id]: { ...sketch, dimensions: { ...sketch.dimensions, [id]: { ...dimension, placement: { ...dimension.placement, offset } } } } } };
};
export const deleteEntityWithDependentDimensions = (document: DrawingDocumentV2, entityId: string): DrawingDocumentV2 => {
  const sketch = document.sketches[document.activeSketchId]; if (!sketch?.entities[entityId]) return document;
  const entities = { ...sketch.entities }; delete entities[entityId];
  const dimensions = Object.fromEntries(Object.entries(sketch.dimensions).filter(([, d]) => d.references.every((r) => r.entityId !== entityId)));
  return { ...document, sketches: { ...document.sketches, [sketch.id]: { ...sketch, entities, entityOrder: sketch.entityOrder.filter((id) => id !== entityId), dimensions, dimensionOrder: sketch.dimensionOrder.filter((id) => Boolean(dimensions[id])) } } };
};
export const createDimensionId = (): string => `dimension-${crypto.randomUUID()}`;
