import type { DrawingDimension, DrawingDocumentV2, DrawingLineEntity, DrawingPoint, DrawingSketchPoint, DrawingSketchV2, ResolvedDrawingCircle, ResolvedDrawingLine } from './drawingTypes';

export type DrawingTopologyValidation = Readonly<{ ok: true } | { ok: false; errors: readonly string[] }>;

export const resolveSketchPoint = (sketch: DrawingSketchV2, id: string): DrawingSketchPoint | null => sketch.points[id] ?? null;

export const resolveLine = (sketch: DrawingSketchV2, line: DrawingLineEntity): ResolvedDrawingLine | null => {
  const start = resolveSketchPoint(sketch, line.startPointId), end = resolveSketchPoint(sketch, line.endPointId);
  return start && end ? { ...line, start: { x: start.x, y: start.y }, end: { x: end.x, y: end.y } } : null;
};
export const resolveCircle = (sketch: DrawingSketchV2, circle: import('./drawingTypes').DrawingCircleEntity): ResolvedDrawingCircle | null => {
  const center = resolveSketchPoint(sketch, circle.centerPointId);
  return center && Number.isFinite(circle.radius) && circle.radius > 0 ? { ...circle, center: { x: center.x, y: center.y } } : null;
};

/** Resolves the active sketch's committed Lines from the supplied document snapshot. */
export const resolveActiveSketchLines = (document: DrawingDocumentV2): readonly ResolvedDrawingLine[] => {
  const sketch = document.sketches[document.activeSketchId];
  if (!sketch) return [];
  return sketch.entityOrder.flatMap((id) => {
    const entity = sketch.entities[id];
    const line = entity?.type === 'line' ? resolveLine(sketch, entity) : null;
    return line ? [line] : [];
  });
};

export const pointIdForLineEndpoint = (line: DrawingLineEntity, endpoint: 'start' | 'end'): string => endpoint === 'start' ? line.startPointId : line.endPointId;

/** Derived presentation roles for persistent points that define semantic entities. */
export const deriveEntityDefiningPointIds = (sketch: DrawingSketchV2): ReadonlySet<string> => new Set(
  Object.values(sketch.entities as unknown as Record<string, import('./drawingTypes').DrawingEntity>)
    .flatMap((entity) => entity.type === 'circle' ? [entity.centerPointId] : []),
);

export const updateSketchPoint = (sketch: DrawingSketchV2, id: string, point: DrawingPoint): DrawingSketchV2 => {
  const current = sketch.points[id];
  if (!current || current.x === point.x && current.y === point.y) return sketch;
  return { ...sketch, points: { ...sketch.points, [id]: { id, ...point } } };
};

export const removeEntityAndOrphans = (sketch: DrawingSketchV2, entityId: string): DrawingSketchV2 => {
  if (!sketch.entities[entityId]) return sketch;
  const entities = { ...sketch.entities } as unknown as Record<string, import('./drawingTypes').DrawingEntity>; delete entities[entityId];
  const referenced = new Set(Object.values(entities).flatMap((entity) => entity.type === 'line'
    ? [entity.startPointId, entity.endPointId] : [entity.centerPointId]));
  const points = Object.fromEntries(Object.entries(sketch.points).filter(([id]) => referenced.has(id)));
  const removedPointIds = new Set(Object.keys(sketch.points).filter((id) => !points[id]));
  const dimensions = Object.fromEntries(Object.entries(sketch.dimensions).filter(([, dimension]) => dimension.references.every((reference) =>
    reference.kind === 'datum' || reference.kind === 'sketchPoint' ? reference.kind === 'datum' || !removedPointIds.has(reference.pointId) : reference.entityId !== entityId)));
  const geometricConstraints = Object.fromEntries(Object.entries(sketch.geometricConstraints ?? {}).filter(([, constraint]) => constraint.kind === 'MIDPOINT'
    ? !removedPointIds.has(constraint.references[0].pointId) && constraint.references[1].entityId !== entityId
    : constraint.kind === 'COINCIDENT'
    ? constraint.variant !== 'point-point'
      ? !removedPointIds.has(constraint.references[0].pointId) && constraint.references[1].entityId !== entityId
      : constraint.references.every(({ pointId }) => !removedPointIds.has(pointId))
    : constraint.references.every(({ entityId: referencedEntityId }) => referencedEntityId !== entityId)));
  return { ...sketch, points, entities: entities as DrawingSketchV2['entities'], entityOrder: sketch.entityOrder.filter((id) => id !== entityId), dimensions, dimensionOrder: sketch.dimensionOrder.filter((id) => Boolean(dimensions[id])),
    geometricConstraints, geometricConstraintOrder: (sketch.geometricConstraintOrder ?? []).filter((id) => Boolean(geometricConstraints[id])) };
};
export const removeLineAndOrphans = removeEntityAndOrphans;

const finitePoint = (point: DrawingSketchPoint) => Number.isFinite(point.x) && Number.isFinite(point.y);
export const validateDrawingTopology = (document: DrawingDocumentV2): DrawingTopologyValidation => {
  const errors: string[] = [];
  for (const sketch of Object.values(document.sketches)) {
    const coincidentPairs = new Set<string>();
    for (const [id, point] of Object.entries(sketch.points)) {
      if (point.id !== id) errors.push(`Point key/id mismatch: ${id}`);
      if (!finitePoint(point)) errors.push(`Malformed point coordinate: ${id}`);
    }
    for (const entity of Object.values(sketch.entities as unknown as Record<string, import('./drawingTypes').DrawingEntity>)) {
      if (entity.type === 'circle') {
        if (!sketch.points[entity.centerPointId] || !Number.isFinite(entity.radius) || entity.radius <= 0) errors.push(`Malformed Circle: ${entity.id}`);
        continue;
      }
      if (!sketch.points[entity.startPointId] || !sketch.points[entity.endPointId]) errors.push(`Line references missing point: ${entity.id}`);
      if (entity.startPointId === entity.endPointId) errors.push(`Line references one point twice: ${entity.id}`);
    }
    for (const dimension of Object.values(sketch.dimensions) as DrawingDimension[]) for (const reference of dimension.references) {
      if (reference.kind === 'datum') { if (reference.datum !== 'ORIGIN') errors.push(`Unsupported datum reference: ${dimension.id}`); continue; }
      if (reference.kind === 'sketchPoint') { if (!sketch.points[reference.pointId]) errors.push(`Dimension reference cannot resolve: ${dimension.id}`); continue; }
      const line = sketch.entities[reference.entityId]; if (!line || reference.kind === 'point' && (line.type !== 'line' || !sketch.points[pointIdForLineEndpoint(line, reference.point)])) errors.push(`Dimension reference cannot resolve: ${dimension.id}`);
    }
    for (const constraint of Object.values(sketch.geometricConstraints ?? {})) {
      if (constraint.kind === 'MIDPOINT') {
        const [point, edge] = constraint.references, line = sketch.entities[edge.entityId];
        const a = line?.type === 'line' && sketch.points[line.startPointId], b = line?.type === 'line' && sketch.points[line.endPointId];
        if (!sketch.points[point.pointId] || line?.type !== 'line' || !a || !b || point.pointId === line.startPointId || point.pointId === line.endPointId || Math.hypot(b.x - a.x, b.y - a.y) <= 1e-9) errors.push(`Geometric constraint reference cannot resolve: ${constraint.id}`);
        continue;
      }
      if (constraint.kind === 'COINCIDENT') {
        if (constraint.variant === 'point-linear-support') {
          const [point, edge] = constraint.references;
          const line = sketch.entities[edge.entityId], a = line?.type === 'line' && sketch.points[line.startPointId], b = line?.type === 'line' && sketch.points[line.endPointId];
          const key = `${point.pointId}\0${edge.entityId}`;
          if (!sketch.points[point.pointId] || line?.type !== 'line' || !a || !b || Math.hypot(b.x - a.x, b.y - a.y) <= 1e-9) errors.push(`Geometric constraint reference cannot resolve: ${constraint.id}`);
          else if (coincidentPairs.has(key)) errors.push(`Duplicate Coincident constraint: ${constraint.id}`); else coincidentPairs.add(key);
          continue;
        }
        if (constraint.variant === 'point-curve') {
          const [point, curve] = constraint.references, circle = (sketch.entities as unknown as Record<string, import('./drawingTypes').DrawingEntity>)[curve.entityId];
          if (!sketch.points[point.pointId] || circle?.type !== 'circle') errors.push(`Geometric constraint reference cannot resolve: ${constraint.id}`);
          continue;
        }
        const [a, b] = constraint.references;
        if (constraint.references.length !== 2 || a.kind !== 'sketchPoint' || b.kind !== 'sketchPoint' || a.pointId === b.pointId || !sketch.points[a.pointId] || !sketch.points[b.pointId]) errors.push(`Geometric constraint reference cannot resolve: ${constraint.id}`);
        else { const key = [a.pointId, b.pointId].sort().join('\0'); if (coincidentPairs.has(key)) errors.push(`Duplicate Coincident constraint: ${constraint.id}`); coincidentPairs.add(key); }
        continue;
      }
      const expectedReferences = constraint.kind === 'PARALLEL' || constraint.kind === 'PERPENDICULAR' ? 2 : 1;
      if (constraint.references.length !== expectedReferences || constraint.references.some(({ entityId }) => !sketch.entities[entityId])
        || expectedReferences === 2 && constraint.references[0]?.entityId === constraint.references[1]?.entityId) errors.push(`Geometric constraint reference cannot resolve: ${constraint.id}`);
    }
    const referenced = new Set(Object.values(sketch.entities as unknown as Record<string, import('./drawingTypes').DrawingEntity>).flatMap((entity) => entity.type === 'line' ? [entity.startPointId, entity.endPointId] : [entity.centerPointId]));
    for (const id of Object.keys(sketch.points)) if (!referenced.has(id)) errors.push(`Orphan point: ${id}`);
  }
  return errors.length ? { ok: false, errors } : { ok: true };
};
