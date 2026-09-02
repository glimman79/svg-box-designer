import type { DrawingDimension, DrawingDocumentV2, DrawingLineEntity, DrawingPoint, DrawingSketchPoint, DrawingSketchV2, ResolvedDrawingLine } from './drawingTypes';

export type DrawingTopologyValidation = Readonly<{ ok: true } | { ok: false; errors: readonly string[] }>;

export const resolveSketchPoint = (sketch: DrawingSketchV2, id: string): DrawingSketchPoint | null => sketch.points[id] ?? null;

export const resolveLine = (sketch: DrawingSketchV2, line: DrawingLineEntity): ResolvedDrawingLine | null => {
  const start = resolveSketchPoint(sketch, line.startPointId), end = resolveSketchPoint(sketch, line.endPointId);
  return start && end ? { ...line, start: { x: start.x, y: start.y }, end: { x: end.x, y: end.y } } : null;
};

export const pointIdForLineEndpoint = (line: DrawingLineEntity, endpoint: 'start' | 'end'): string => endpoint === 'start' ? line.startPointId : line.endPointId;

export const updateSketchPoint = (sketch: DrawingSketchV2, id: string, point: DrawingPoint): DrawingSketchV2 => {
  const current = sketch.points[id];
  if (!current || current.x === point.x && current.y === point.y) return sketch;
  return { ...sketch, points: { ...sketch.points, [id]: { id, ...point } } };
};

export const removeLineAndOrphans = (sketch: DrawingSketchV2, lineId: string): DrawingSketchV2 => {
  if (!sketch.entities[lineId]) return sketch;
  const entities = { ...sketch.entities }; delete entities[lineId];
  const referenced = new Set(Object.values(entities).flatMap((entity) => [entity.startPointId, entity.endPointId]));
  const points = Object.fromEntries(Object.entries(sketch.points).filter(([id]) => referenced.has(id)));
  const removedPointIds = new Set(Object.keys(sketch.points).filter((id) => !points[id]));
  const dimensions = Object.fromEntries(Object.entries(sketch.dimensions).filter(([, dimension]) => dimension.references.every((reference) =>
    reference.kind === 'datum' || reference.kind === 'sketchPoint' ? reference.kind === 'datum' || !removedPointIds.has(reference.pointId) : reference.entityId !== lineId)));
  return { ...sketch, points, entities, entityOrder: sketch.entityOrder.filter((id) => id !== lineId), dimensions, dimensionOrder: sketch.dimensionOrder.filter((id) => Boolean(dimensions[id])) };
};

const finitePoint = (point: DrawingSketchPoint) => Number.isFinite(point.x) && Number.isFinite(point.y);
export const validateDrawingTopology = (document: DrawingDocumentV2): DrawingTopologyValidation => {
  const errors: string[] = [];
  for (const sketch of Object.values(document.sketches)) {
    for (const [id, point] of Object.entries(sketch.points)) {
      if (point.id !== id) errors.push(`Point key/id mismatch: ${id}`);
      if (!finitePoint(point)) errors.push(`Malformed point coordinate: ${id}`);
    }
    for (const line of Object.values(sketch.entities)) {
      if (!sketch.points[line.startPointId] || !sketch.points[line.endPointId]) errors.push(`Line references missing point: ${line.id}`);
      if (line.startPointId === line.endPointId) errors.push(`Line references one point twice: ${line.id}`);
    }
    for (const dimension of Object.values(sketch.dimensions) as DrawingDimension[]) for (const reference of dimension.references) {
      if (reference.kind === 'datum') { if (reference.datum !== 'ORIGIN') errors.push(`Unsupported datum reference: ${dimension.id}`); continue; }
      if (reference.kind === 'sketchPoint') { if (!sketch.points[reference.pointId]) errors.push(`Dimension reference cannot resolve: ${dimension.id}`); continue; }
      const line = sketch.entities[reference.entityId]; if (!line || (reference.kind === 'point' && !sketch.points[pointIdForLineEndpoint(line, reference.point)])) errors.push(`Dimension reference cannot resolve: ${dimension.id}`);
    }
    const referenced = new Set(Object.values(sketch.entities).flatMap((line) => [line.startPointId, line.endPointId]));
    for (const id of Object.keys(sketch.points)) if (!referenced.has(id)) errors.push(`Orphan point: ${id}`);
  }
  return errors.length ? { ok: false, errors } : { ok: true };
};
