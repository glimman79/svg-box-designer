import type { DrawingDimension, DrawingDimensionKind, DrawingDocumentV2, DrawingGeometryReference, DrawingLineEntity, DrawingPoint, DrawingSketchV2 } from './drawingTypes';

export const DIMENSION_AXIS_EPSILON_MM = 1e-7;
export const DIMENSION_INTERPRETATION_HYSTERESIS = 0.12;
export type DimensionToolState =
  | Readonly<{ phase: 'inactive' }>
  | Readonly<{ phase: 'acquiringReference' }>
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
  // Keep aligned as the canonical equivalent; retain the non-duplicate zero projection.
  if (dy <= DIMENSION_AXIS_EPSILON_MM) return ['ALIGNED_DISTANCE', 'VERTICAL_DISTANCE'];
  if (dx <= DIMENSION_AXIS_EPSILON_MM) return ['ALIGNED_DISTANCE', 'HORIZONTAL_DISTANCE'];
  return ['ALIGNED_DISTANCE', 'HORIZONTAL_DISTANCE', 'VERTICAL_DISTANCE'];
};
/** Scores cursor direction against each annotation family's vector locus. */
export const chooseLineDimensionKind = (line: DrawingLineEntity, cursor: DrawingPoint, previous?: DrawingDimensionKind): DrawingDimensionKind => {
  const kinds = availableLineDimensionKinds(line);
  const mid = { x: (line.start.x + line.end.x) / 2, y: (line.start.y + line.end.y) / 2 };
  const dx = line.end.x - line.start.x, dy = line.end.y - line.start.y, length = Math.hypot(dx, dy) || 1;
  const qx = cursor.x - mid.x, qy = cursor.y - mid.y, radius = Math.hypot(qx, qy) || 1;
  const scores: Record<DrawingDimensionKind, number> = { ALIGNED_DISTANCE: Math.abs(qx * dx / length + qy * dy / length) / radius, HORIZONTAL_DISTANCE: Math.abs(qx) / radius, VERTICAL_DISTANCE: Math.abs(qy) / radius };
  const winner = kinds.reduce((best, kind) => scores[kind] < scores[best] ? kind : best, kinds[0]);
  return previous && kinds.includes(previous) && scores[previous] <= scores[winner] + DIMENSION_INTERPRETATION_HYSTERESIS ? previous : winner;
};
export const dimensionOffset = (line: DrawingLineEntity, cursor: DrawingPoint, kind: DrawingDimensionKind): number => {
  const mid = { x: (line.start.x + line.end.x) / 2, y: (line.start.y + line.end.y) / 2 };
  if (kind === 'HORIZONTAL_DISTANCE') return cursor.y - mid.y;
  if (kind === 'VERTICAL_DISTANCE') return cursor.x - mid.x;
  const dx = line.end.x - line.start.x, dy = line.end.y - line.start.y, length = Math.hypot(dx, dy) || 1;
  return (cursor.x - mid.x) * (-dy / length) + (cursor.y - mid.y) * (dx / length);
};
export const createLineDimension = (line: DrawingLineEntity, kind: DrawingDimensionKind, cursor: DrawingPoint, id: string): DrawingDimension => ({ id, kind, references: lineDimensionReferences(line), value: measureDimension(kind, line.start, line.end), placement: { kind: 'linear', offset: dimensionOffset(line, cursor, kind) } });
export const formatLinearDimension = (value: number): string => `${value.toString()} mm`;
export const parseLinearDimension = (input: string): number | null => {
  const match = input.trim().match(/^(?:\d+(?:\.\d*)?|\.\d+)\s*(?:mm)?$/i);
  if (!match) return null;
  const value = Number.parseFloat(match[0]);
  return Number.isFinite(value) && value >= 0 ? value : null;
};
export const appendDimension = (document: DrawingDocumentV2, dimension: DrawingDimension): DrawingDocumentV2 => {
  const sketch = document.sketches[document.activeSketchId];
  if (!sketch || sketch.dimensions[dimension.id] || dimension.references.some((r) => !resolveDrawingPointReference(sketch, r))) return document;
  return { ...document, sketches: { ...document.sketches, [sketch.id]: { ...sketch, dimensions: { ...sketch.dimensions, [dimension.id]: dimension }, dimensionOrder: [...sketch.dimensionOrder, dimension.id] } } };
};
export const deleteDimension = (document: DrawingDocumentV2, id: string): DrawingDocumentV2 => {
  const sketch = document.sketches[document.activeSketchId]; if (!sketch?.dimensions[id]) return document;
  const dimensions = { ...sketch.dimensions }; delete dimensions[id];
  return { ...document, sketches: { ...document.sketches, [sketch.id]: { ...sketch, dimensions, dimensionOrder: sketch.dimensionOrder.filter((item) => item !== id) } } };
};
export const deleteEntityWithDependentDimensions = (document: DrawingDocumentV2, entityId: string): DrawingDocumentV2 => {
  const sketch = document.sketches[document.activeSketchId]; if (!sketch?.entities[entityId]) return document;
  const entities = { ...sketch.entities }; delete entities[entityId];
  const dimensions = Object.fromEntries(Object.entries(sketch.dimensions).filter(([, d]) => d.references.every((r) => r.entityId !== entityId)));
  return { ...document, sketches: { ...document.sketches, [sketch.id]: { ...sketch, entities, entityOrder: sketch.entityOrder.filter((id) => id !== entityId), dimensions, dimensionOrder: sketch.dimensionOrder.filter((id) => Boolean(dimensions[id])) } } };
};
export const createDimensionId = (): string => `dimension-${crypto.randomUUID()}`;
