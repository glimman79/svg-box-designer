import { DRAWING_CONSTRAINT_TOLERANCE_MM, solveDrawingComponentDrag, solveDrawingGeometricIntent } from './drawingConstraintSolver.js';
import { analyzeDrawingConstraints } from './drawingConstraintAnalysis.js';
import { circularRadiusSolverVariable, pointSolverVariables } from './drawingSolverVariables.js';
import { displayedDimensionMeasurement, drawingPointReferenceDependencies, measureDimension, resolveDrawingPointReference, sketchPointIdFromReference } from './drawingDimension.js';
import { pointIdForLineEndpoint } from './drawingTopology.js';
import type { DrawingDimension, DrawingDocumentV2, DrawingEntity, DrawingPoint, DrawingSketchV2 } from './drawingTypes.js';

export const DRAWING_DRAG_THRESHOLD_PX = 4;

export type DrawingGeometryTarget =
  | Readonly<{ kind: 'point'; pointId: string }>
  | Readonly<{ kind: 'line'; lineId: string; segmentParameter?: number; grabOffset?: DrawingPoint }>
  | Readonly<{ kind: 'arc-endpoint'; entityId: string; draggedPointId: string; pivotPointId: string }>
  | Readonly<{ kind: 'arc-radius'; entityId: string; sweepParameter: number; radialDirection: DrawingPoint; grabOffset: DrawingPoint }>
  | Readonly<{ kind: 'arc-center'; entityId: string }>
  | Readonly<{ kind: 'entity-scalar'; entityId: string; scalar: 'circular-radius'; radialDirection: DrawingPoint; grabOffset: DrawingPoint }>;

/** Converts a circumference hit into a semantic scalar target. The stored
 * offset makes the pointer-down pose an identity mapping despite hit slop. */
export const createCircleRadiusDragTarget = (document: DrawingDocumentV2, circleId: string, pointer: DrawingPoint): DrawingGeometryTarget | null => {
  const sketch = document.sketches[document.activeSketchId];
  const circle = sketch ? (sketch.entities as unknown as Record<string, DrawingEntity>)[circleId] : undefined;
  if (circle?.type !== 'circle') return null;
  const center = sketch.points[circle.centerPointId];
  if (!center) return null;
  const dx = pointer.x - center.x, dy = pointer.y - center.y, length = Math.hypot(dx, dy);
  if (length <= DRAWING_CONSTRAINT_TOLERANCE_MM) return null;
  const radialDirection = { x: dx / length, y: dy / length };
  const resolved = { x: center.x + circle.radius * radialDirection.x, y: center.y + circle.radius * radialDirection.y };
  return { kind: 'entity-scalar', entityId: circle.id, scalar: 'circular-radius', radialDirection,
    grabOffset: { x: pointer.x - resolved.x, y: pointer.y - resolved.y } };
};

/** Stage 4 will define direct manipulation of the persistent Arc center. */
export const createArcCenterDragTarget = (_document: DrawingDocumentV2, _arcId: string): DrawingGeometryTarget | null => null;

/** Creates an endpoint session referenced exclusively to the drag-start Arc. */
export const createArcEndpointDragTarget = (_document: DrawingDocumentV2, _arcId: string, _draggedPointId: string): DrawingGeometryTarget | null => null;

/** Resolves semantic ownership after the physical point hit. A unique selected
 * incident Arc disambiguates a shared endpoint; otherwise multiple Arc owners
 * intentionally fall back to ordinary point manipulation. */
export const resolveArcEndpointOwner = (document: DrawingDocumentV2, pointId: string, selectedEntityIds: readonly string[]): string | null => {
  const sketch = document.sketches[document.activeSketchId];
  if (!sketch?.points[pointId]) return null;
  const incident = Object.values(sketch.entities as unknown as Record<string, DrawingEntity>).filter((entity): entity is Extract<DrawingEntity, { type: 'arc' }> =>
    entity.type === 'arc' && (entity.startPointId === pointId || entity.endPointId === pointId));
  const selectedIncident = incident.filter(({ id }) => selectedEntityIds.includes(id));
  if (selectedIncident.length === 1) return selectedIncident[0].id;
  if (selectedIncident.length > 1 || incident.length !== 1) return null;
  // A selected non-Arc entity is an explicit conflicting context.
  return selectedEntityIds.length === 0 ? incident[0].id : null;
};

/** Converts an Arc body hit into a radial interaction. The hit-slop offset
 * makes the pointer-down pose an identity while the endpoints remain canonical. */
export const createArcRadiusDragTarget = (_document: DrawingDocumentV2, _arcId: string, _pointer: DrawingPoint): DrawingGeometryTarget | null => null;

export const pointIdFromHit = (document: DrawingDocumentV2, lineId: string, endpoint: 'start' | 'end'): string | null => {
  const sketch = document.sketches[document.activeSketchId];
  const line = sketch?.entities[lineId];
  return line ? pointIdForLineEndpoint(line, endpoint) : null;
};

/** Captures the finite Line location under the pointer without adding topology. */
export const createLineBodyDragTarget = (document: DrawingDocumentV2, lineId: string, pointer: DrawingPoint): DrawingGeometryTarget | null => {
  const sketch = document.sketches[document.activeSketchId], line = sketch?.entities[lineId];
  if (line?.type !== 'line') return null;
  const start = sketch.points[line.startPointId], end = sketch.points[line.endPointId];
  if (!start || !end) return null;
  const dx = end.x - start.x, dy = end.y - start.y, lengthSquared = dx * dx + dy * dy;
  if (lengthSquared <= DRAWING_CONSTRAINT_TOLERANCE_MM ** 2) return null;
  const segmentParameter = Math.max(0, Math.min(1, ((pointer.x - start.x) * dx + (pointer.y - start.y) * dy) / lengthSquared));
  const resolved = { x: start.x + dx * segmentParameter, y: start.y + dy * segmentParameter };
  return { kind: 'line', lineId, segmentParameter, grabOffset: { x: pointer.x - resolved.x, y: pointer.y - resolved.y } };
};

/** Collect equations touching the authoritative points moved by a candidate. */
export const collectAffectedDrivingDimensions = (
  document: DrawingDocumentV2,
  movedPointIds: ReadonlySet<string>,
): readonly DrawingDimension[] => {
  const sketch = document.sketches[document.activeSketchId];
  if (!sketch) return [];
  return Object.values(sketch.dimensions).filter((dimension) => dimension.role === 'driving' && dimension.references.some((reference) => {
    if (reference.kind === 'entity') { const line = sketch.entities[reference.entityId]; return Boolean(line && (movedPointIds.has(line.startPointId) || movedPointIds.has(line.endPointId))); }
    return drawingPointReferenceDependencies(sketch, reference).some((variable) => variable.kind === 'point-axis' && movedPointIds.has(variable.pointId));
  }));
};

/** Validate the supplied equation set (all driving equations by default). */
export const validateDrivingDimensions = (document: DrawingDocumentV2, dimensions?: readonly DrawingDimension[]): boolean => {
  const sketch = document.sketches[document.activeSketchId];
  if (!sketch) return false;
  return (dimensions ?? Object.values(sketch.dimensions).filter(({ role }) => role === 'driving')).every((dimension) => {
    if (dimension.kind === 'LINE_TO_LINE_ANGLE' || dimension.kind === 'LINE_TO_LINE_DISTANCE' || dimension.kind === 'CIRCULAR_SIZE') {
      const value = displayedDimensionMeasurement(sketch, dimension);
      return value !== null && Math.abs(value - dimension.value) <= DRAWING_CONSTRAINT_TOLERANCE_MM;
    }
    if (dimension.kind === 'POINT_TO_LINE_DISTANCE') {
      const point = resolveDrawingPointReference(sketch, dimension.references[0]);
      const line = sketch.entities[dimension.references[1].entityId];
      if (!point || !line) return false;
      const a = sketch.points[line.startPointId], b = sketch.points[line.endPointId], length = Math.hypot(b.x - a.x, b.y - a.y);
      return length > 0 && Math.abs(Math.abs((b.x - a.x) * (point.y - a.y) - (b.y - a.y) * (point.x - a.x)) / length - dimension.value) <= DRAWING_CONSTRAINT_TOLERANCE_MM;
    }
    const a = resolveDrawingPointReference(sketch, dimension.references[0]);
    const b = resolveDrawingPointReference(sketch, dimension.references[1]);
    return Boolean(a && b && Math.abs(measureDimension(dimension.kind, a!, b!) - dimension.value) <= DRAWING_CONSTRAINT_TOLERANCE_MM);
  });
};

/** Derive each preview from the drag-start document and total pointer delta. */
export const solveDrawingDragCandidate = (document: DrawingDocumentV2, target: DrawingGeometryTarget, delta: DrawingPoint, startPointer?: DrawingPoint): DrawingDocumentV2 | null => {
  const sketch = document.sketches[document.activeSketchId];
  if (!sketch || !Number.isFinite(delta.x) || !Number.isFinite(delta.y)) return null;
  if (target.kind === 'arc-radius') return null;

  if (target.kind === 'arc-endpoint') return null;

  if (target.kind === 'arc-center') return null;

  if (target.kind === 'entity-scalar') {
    if (!startPointer) return null;
    const pointer = { x: startPointer.x + delta.x, y: startPointer.y + delta.y };
    const entity = (sketch.entities as unknown as Record<string, DrawingEntity>)[target.entityId];
    if (entity?.type !== 'circle') return null;
    const center = sketch.points[entity.centerPointId];
    if (!center) return null;
    const resolvedPointer = { x: pointer.x - target.grabOffset.x, y: pointer.y - target.grabOffset.y };
    const solved = solveDrawingGeometricIntent(sketch, {
      seedVariable: circularRadiusSolverVariable(entity.id), modelScale: Math.max(1, entity.radius),
      primaryResiduals: (candidate) => {
        const candidateEntity = (candidate.entities as unknown as Record<string, DrawingEntity>)[entity.id];
        const candidateCenter = candidateEntity?.type === 'circle' ? candidate.points[candidateEntity.centerPointId] : null;
        return candidateEntity?.type === 'circle' && candidateCenter ? [
          candidateCenter.x + candidateEntity.radius * target.radialDirection.x - resolvedPointer.x,
          candidateCenter.y + candidateEntity.radius * target.radialDirection.y - resolvedPointer.y,
        ] : null;
      },
      semanticResiduals: (candidate) => {
        const candidateCenter = candidate.points[entity.centerPointId];
        return candidateCenter ? [candidateCenter.x - center.x, candidateCenter.y - center.y] : null;
      },
    });
    const solvedEntity = solved ? (solved.entities as unknown as Record<string, DrawingEntity>)[entity.id] : null;
    if (solvedEntity?.type === 'circle' && solvedEntity.radius <= DRAWING_CONSTRAINT_TOLERANCE_MM * 100) return null;
    return solved === sketch ? document : solved ? { ...document, sketches: { ...document.sketches, [sketch.id]: solved } } : null;
  }
  if (target.kind === 'line' && target.segmentParameter !== undefined && target.grabOffset && startPointer) {
    if (delta.x === 0 && delta.y === 0) return document;
    const line = sketch.entities[target.lineId]; if (line?.type !== 'line') return null;
    const start = sketch.points[line.startPointId], end = sketch.points[line.endPointId]; if (!start || !end) return null;
    const pointer = { x: startPointer.x + delta.x - target.grabOffset.x, y: startPointer.y + delta.y - target.grabOffset.y };
    const solved = solveDrawingGeometricIntent(sketch, {
      seedVariable: { kind: 'point-axis', pointId: line.startPointId, axis: 'x' }, modelScale: Math.max(1, Math.hypot(end.x - start.x, end.y - start.y)),
      variables: [...pointSolverVariables(line.startPointId), ...pointSolverVariables(line.endPointId)],
      primaryResiduals: (candidate) => { const a = candidate.points[line.startPointId], b = candidate.points[line.endPointId]; return a && b ? [
        a.x + (b.x - a.x) * target.segmentParameter! - pointer.x,
        a.y + (b.y - a.y) * target.segmentParameter! - pointer.y,
      ] : null; },
      secondaryResiduals: (candidate) => { const a = candidate.points[line.startPointId], b = candidate.points[line.endPointId]; return a && b
        ? [(b.x - a.x) - (end.x - start.x), (b.y - a.y) - (end.y - start.y)] : null; },
    });
    return solved === sketch ? document : solved ? { ...document, sketches: { ...document.sketches, [sketch.id]: solved } } : null;
  }
  if (target.kind === 'point') {
    if (delta.x === 0 && delta.y === 0) return document;
    const point = sketch.points[target.pointId];
    if (!point) return null;
    const requested = { x: point.x + delta.x, y: point.y + delta.y };
    const component = analyzeDrawingConstraints(sketch).componentByPointId.get(target.pointId);
    const dimensionOnlyStays = component && !component.geometricConstraintIds.length
      ? [...component.pointIds].filter((pointId) => pointId !== target.pointId)
      : [];
    const solved = solveDrawingGeometricIntent(sketch, {
      seedVariable: pointSolverVariables(target.pointId)[0],
      modelScale: Math.max(1, Math.hypot(delta.x, delta.y)),
      primaryResiduals: (candidate) => {
        const candidatePoint = candidate.points[target.pointId];
        return candidatePoint ? [candidatePoint.x - requested.x, candidatePoint.y - requested.y] : null;
      },
      semanticResiduals: dimensionOnlyStays.length ? (candidate) => dimensionOnlyStays.flatMap((pointId) => {
        const before = sketch.points[pointId], after = candidate.points[pointId];
        return before && after ? [after.x - before.x, after.y - before.y] : [];
      }) : undefined,
    });
    if (solved && (!component || !component.dimensionIds.length && !component.geometricConstraintIds.length)) {
      const exact = { ...solved, points: { ...solved.points, [target.pointId]: { ...solved.points[target.pointId], ...requested } } };
      return { ...document, sketches: { ...document.sketches, [sketch.id]: exact } };
    }
    return solved === sketch ? document : solved ? { ...document, sketches: { ...document.sketches, [sketch.id]: solved } } : null;
  }
  const line = sketch.entities[target.lineId];
  const ids = line ? [...new Set([line.startPointId, line.endPointId])] : [];
  if (!ids.length || ids.some((id) => !sketch.points[id])) return null;
  const moves = Object.fromEntries(ids.map((id) => {
    const point = sketch.points[id];
    return [id, { x: point.x + delta.x, y: point.y + delta.y }];
  }));
  const solvedSketch = solveDrawingComponentDrag(sketch, moves, { directLineIds: [target.lineId] });
  if (!solvedSketch) return null;
  const candidate = { ...document, sketches: { ...document.sketches, [sketch.id]: solvedSketch } };
  const affectedPointIds = new Set(Object.keys(sketch.points).filter((id) => {
    const before = sketch.points[id], after = solvedSketch.points[id];
    return Math.hypot(before.x - after.x, before.y - after.y) > DRAWING_CONSTRAINT_TOLERANCE_MM;
  }));
  if (!affectedPointIds.size) return document;
  return validateDrivingDimensions(candidate, collectAffectedDrivingDimensions(document, affectedPointIds)) ? candidate : null;
};
