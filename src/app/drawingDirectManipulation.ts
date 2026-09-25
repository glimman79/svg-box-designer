import { DRAWING_CONSTRAINT_TOLERANCE_MM, solveDrawingComponentDrag, solveDrawingGeometricIntent } from './drawingConstraintSolver.js';
import { resolveArcFromBulge } from './drawingArcGeometry.js';
import { arcBulgeSolverVariable, circleRadiusSolverVariable, pointSolverVariables } from './drawingSolverVariables.js';
import { displayedDimensionMeasurement, drawingPointReferenceDependencies, measureDimension, resolveDrawingPointReference, sketchPointIdFromReference } from './drawingDimension.js';
import { pointIdForLineEndpoint } from './drawingTopology.js';
import type { DrawingDimension, DrawingDocumentV2, DrawingEntity, DrawingPoint } from './drawingTypes.js';

export const DRAWING_DRAG_THRESHOLD_PX = 4;

export type DrawingGeometryTarget =
  | Readonly<{ kind: 'point'; pointId: string }>
  | Readonly<{ kind: 'line'; lineId: string; segmentParameter?: number; grabOffset?: DrawingPoint }>
  | Readonly<{ kind: 'arc-endpoint'; entityId: string; draggedPointId: string; pivotPointId: string; initialBulge: number }>
  | Readonly<{ kind: 'arc-radius'; entityId: string; sweepParameter: number; radialDirection: DrawingPoint; grabOffset: DrawingPoint; initialBulge: number }>
  | Readonly<{ kind: 'arc-center'; entityId: string }>
  | Readonly<{ kind: 'entity-scalar'; entityId: string; scalar: 'circle-radius'; radialDirection: DrawingPoint; grabOffset: DrawingPoint }>;

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
  return { kind: 'entity-scalar', entityId: circle.id, scalar: 'circle-radius', radialDirection,
    grabOffset: { x: pointer.x - resolved.x, y: pointer.y - resolved.y } };
};

/** The Arc center is derived; its target retains only semantic ownership. */
export const createArcCenterDragTarget = (document: DrawingDocumentV2, arcId: string): DrawingGeometryTarget | null => {
  const sketch = document.sketches[document.activeSketchId];
  const arc = sketch ? (sketch.entities as unknown as Record<string, DrawingEntity>)[arcId] : undefined;
  return arc?.type === 'arc' && sketch.points[arc.startPointId] && sketch.points[arc.endPointId]
    ? { kind: 'arc-center', entityId: arc.id }
    : null;
};

/** Creates an endpoint session referenced exclusively to the drag-start Arc. */
export const createArcEndpointDragTarget = (document: DrawingDocumentV2, arcId: string, draggedPointId: string): DrawingGeometryTarget | null => {
  const sketch = document.sketches[document.activeSketchId];
  const entity = sketch ? (sketch.entities as unknown as Record<string, DrawingEntity>)[arcId] : undefined;
  if (entity?.type !== 'arc' || draggedPointId !== entity.startPointId && draggedPointId !== entity.endPointId) return null;
  const arc = resolveArcFromBulge(entity, sketch.points[entity.startPointId], sketch.points[entity.endPointId]);
  if (!arc) return null;
  return { kind: 'arc-endpoint', entityId: entity.id, draggedPointId,
    pivotPointId: draggedPointId === entity.startPointId ? entity.endPointId : entity.startPointId,
    initialBulge: entity.bulge };
};

const arcPointAt = (arc: NonNullable<ReturnType<typeof resolveArcFromBulge>>, t: number): DrawingPoint => ({
  x: arc.center.x + arc.radius * Math.cos(arc.startAngle + arc.signedSweep * t),
  y: arc.center.y + arc.radius * Math.sin(arc.startAngle + arc.signedSweep * t),
});

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
export const createArcRadiusDragTarget = (document: DrawingDocumentV2, arcId: string, pointer: DrawingPoint): DrawingGeometryTarget | null => {
  const sketch = document.sketches[document.activeSketchId];
  const entity = sketch ? (sketch.entities as unknown as Record<string, DrawingEntity>)[arcId] : undefined;
  if (entity?.type !== 'arc') return null;
  const arc = resolveArcFromBulge(entity, sketch.points[entity.startPointId], sketch.points[entity.endPointId]);
  if (!arc) return null;
  const direction = Math.atan2(pointer.y - arc.center.y, pointer.x - arc.center.x);
  const progress = arc.signedSweep >= 0
    ? ((direction - arc.startAngle) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2)
    : ((arc.startAngle - direction) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
  const sweepParameter = Math.max(0, Math.min(1, progress / Math.abs(arc.signedSweep)));
  const resolved = arcPointAt(arc, sweepParameter);
  const radialDirection = { x: (resolved.x - arc.center.x) / arc.radius, y: (resolved.y - arc.center.y) / arc.radius };
  return { kind: 'arc-radius', entityId: entity.id, sweepParameter, radialDirection,
    grabOffset: { x: pointer.x - resolved.x, y: pointer.y - resolved.y }, initialBulge: entity.bulge };
};

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
  if (target.kind === 'arc-radius') {
    if (delta.x === 0 && delta.y === 0) return document;
    if (!startPointer) return null;
    const entity = (sketch.entities as unknown as Record<string, DrawingEntity>)[target.entityId];
    if (entity?.type !== 'arc') return null;
    const arc = resolveArcFromBulge(entity, sketch.points[entity.startPointId], sketch.points[entity.endPointId]);
    if (!arc || !Number.isFinite(arc.radius) || arc.radius <= 0) return null;
    const requestedRadius = Math.max(DRAWING_CONSTRAINT_TOLERANCE_MM * 100,
      arc.radius + delta.x * target.radialDirection.x + delta.y * target.radialDirection.y);
    const angleResidual = (a: number, b: number) => Math.atan2(Math.sin(a - b), Math.cos(a - b)) * arc.radius;
    const solved = solveDrawingGeometricIntent(sketch, {
      seedVariable: arcBulgeSolverVariable(entity.id), modelScale: Math.max(1, arc.radius),
      primaryResiduals: (candidate) => {
        const candidateEntity = (candidate.entities as unknown as Record<string, DrawingEntity>)[entity.id];
        if (candidateEntity?.type !== 'arc' || Math.sign(candidateEntity.bulge) !== Math.sign(target.initialBulge)) return null;
        const candidateArc = resolveArcFromBulge(candidateEntity, candidate.points[entity.startPointId], candidate.points[entity.endPointId]);
        if (!candidateArc) return null;
        return [candidateArc.radius - requestedRadius];
      },
      semanticResiduals: (candidate) => {
        const candidateEntity = (candidate.entities as unknown as Record<string, DrawingEntity>)[entity.id];
        if (candidateEntity?.type !== 'arc' || Math.sign(candidateEntity.bulge) !== Math.sign(target.initialBulge)) return null;
        const candidateArc = resolveArcFromBulge(candidateEntity, candidate.points[entity.startPointId], candidate.points[entity.endPointId]);
        if (!candidateArc) return null;
        return [candidateArc.center.x - arc.center.x, candidateArc.center.y - arc.center.y,
          angleResidual(candidateArc.startAngle, arc.startAngle),
          (candidateEntity.bulge - target.initialBulge) * arc.radius];
      },
    });
    if (solved && Math.hypot(solved.points[entity.endPointId].x - solved.points[entity.startPointId].x,
      solved.points[entity.endPointId].y - solved.points[entity.startPointId].y) <= DRAWING_CONSTRAINT_TOLERANCE_MM * 100) return null;
    return solved === sketch ? document : solved ? { ...document, sketches: { ...document.sketches, [sketch.id]: solved } } : null;
  }
  if (target.kind === 'arc-endpoint') {
    if (delta.x === 0 && delta.y === 0) return document;
    const entity = (sketch.entities as unknown as Record<string, DrawingEntity>)[target.entityId];
    const dragged = sketch.points[target.draggedPointId], pivot = sketch.points[target.pivotPointId];
    if (entity?.type !== 'arc' || !dragged || !pivot) return null;
    const originalArc = resolveArcFromBulge(entity, sketch.points[entity.startPointId], sketch.points[entity.endPointId]);
    if (!originalArc) return null;
    const pointer = { x: dragged.x + delta.x, y: dragged.y + delta.y };
    const solved = solveDrawingGeometricIntent(sketch, {
      seedVariable: arcBulgeSolverVariable(entity.id),
      variables: [...pointSolverVariables(entity.startPointId), ...pointSolverVariables(entity.endPointId)],
      modelScale: Math.max(1, originalArc.radius),
      primaryResiduals: (candidate) => {
        const candidateEntity = (candidate.entities as unknown as Record<string, DrawingEntity>)[entity.id];
        const point = candidate.points[target.draggedPointId];
        return candidateEntity?.type === 'arc' && point && Math.sign(candidateEntity.bulge) === Math.sign(target.initialBulge)
          ? [point.x - pointer.x, point.y - pointer.y] : null;
      },
      secondaryResiduals: (candidate) => {
        const point = candidate.points[target.pivotPointId];
        return point ? [point.x - pivot.x, point.y - pivot.y] : null;
      },
    });
    if (!solved) return null;
    if (Math.hypot(solved.points[entity.endPointId].x - solved.points[entity.startPointId].x,
      solved.points[entity.endPointId].y - solved.points[entity.startPointId].y) <= DRAWING_CONSTRAINT_TOLERANCE_MM * 100) return null;
    return solved === sketch ? document : { ...document, sketches: { ...document.sketches, [sketch.id]: solved } };
  }
  if (target.kind === 'arc-center') {
    if (delta.x === 0 && delta.y === 0) return document;
    const entity = (sketch.entities as unknown as Record<string, DrawingEntity>)[target.entityId];
    if (entity?.type !== 'arc') return null;
    const before = resolveArcFromBulge(entity, sketch.points[entity.startPointId], sketch.points[entity.endPointId]); if (!before) return null;
    const initialBulge = entity.bulge;
    const pointer = { x: before.center.x + delta.x, y: before.center.y + delta.y };
    const solved = solveDrawingGeometricIntent(sketch, {
      seedVariable: arcBulgeSolverVariable(entity.id), variables: [...pointSolverVariables(entity.startPointId), ...pointSolverVariables(entity.endPointId)], modelScale: Math.max(1, before.radius),
      primaryResiduals: (candidate) => {
        const e = (candidate.entities as unknown as Record<string, DrawingEntity>)[entity.id], a = candidate.points[entity.startPointId], b = candidate.points[entity.endPointId];
        if (e?.type !== 'arc' || !a || !b || Math.sign(e.bulge) !== Math.sign(initialBulge)) return null;
        const arc = resolveArcFromBulge(e, a, b);
        return arc ? [arc.center.x - pointer.x, arc.center.y - pointer.y] : null;
      },
      semanticResiduals: (candidate) => {
        const e = (candidate.entities as unknown as Record<string, DrawingEntity>)[entity.id], a = candidate.points[entity.startPointId], b = candidate.points[entity.endPointId];
        if (e?.type !== 'arc' || !a || !b || Math.sign(e.bulge) !== Math.sign(initialBulge)) return null;
        const arc = resolveArcFromBulge(e, a, b); if (!arc) return null;
        return [(a.x - before.start.x) - (b.x - before.end.x),
          (a.y - before.start.y) - (b.y - before.end.y),
          (e.bulge - initialBulge) * before.radius];
      },
    });
    return solved === sketch ? document : solved ? { ...document, sketches: { ...document.sketches, [sketch.id]: solved } } : null;
  }
  if (target.kind === 'entity-scalar') {
    if (!startPointer) return null;
    const pointer = { x: startPointer.x + delta.x, y: startPointer.y + delta.y };
    const entity = (sketch.entities as unknown as Record<string, DrawingEntity>)[target.entityId];
    if (entity?.type !== 'circle') return null;
    const center = sketch.points[entity.centerPointId];
    if (!center) return null;
    const resolvedPointer = { x: pointer.x - target.grabOffset.x, y: pointer.y - target.grabOffset.y };
    const solved = solveDrawingGeometricIntent(sketch, {
      seedVariable: circleRadiusSolverVariable(entity.id), modelScale: Math.max(1, entity.radius),
      primaryResiduals: (candidate) => {
        const candidateEntity = (candidate.entities as unknown as Record<string, DrawingEntity>)[entity.id];
        const candidateCenter = candidateEntity?.type === 'circle' ? candidate.points[candidateEntity.centerPointId] : null;
        return candidateEntity?.type === 'circle' && candidateCenter ? [
          candidateCenter.x + candidateEntity.radius * target.radialDirection.x - resolvedPointer.x,
          candidateCenter.y + candidateEntity.radius * target.radialDirection.y - resolvedPointer.y,
        ] : null;
      },
      secondaryResiduals: (candidate) => {
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
  const ids = target.kind === 'point'
    ? [target.pointId]
    : (() => { const line = sketch.entities[target.lineId]; return line ? [...new Set([line.startPointId, line.endPointId])] : []; })();
  if (!ids.length || ids.some((id) => !sketch.points[id])) return null;
  const moves = Object.fromEntries(ids.map((id) => {
    const point = sketch.points[id];
    return [id, { x: point.x + delta.x, y: point.y + delta.y }];
  }));
  const solvedSketch = solveDrawingComponentDrag(sketch, moves, target.kind === 'point'
    ? { directPointIds: [target.pointId] }
    : { directLineIds: [target.lineId] });
  if (!solvedSketch) return null;
  const candidate = { ...document, sketches: { ...document.sketches, [sketch.id]: solvedSketch } };
  const affectedPointIds = new Set(Object.keys(sketch.points).filter((id) => {
    const before = sketch.points[id], after = solvedSketch.points[id];
    return Math.hypot(before.x - after.x, before.y - after.y) > DRAWING_CONSTRAINT_TOLERANCE_MM;
  }));
  if (!affectedPointIds.size) return document;
  return validateDrivingDimensions(candidate, collectAffectedDrivingDimensions(document, affectedPointIds)) ? candidate : null;
};
