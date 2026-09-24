import { DRAWING_CONSTRAINT_TOLERANCE_MM, minimizeDrawingVariableObjective, solveDrawingComponentDrag, solveDrawingVariableTarget } from './drawingConstraintSolver.js';
import { resolveArcFromBulge } from './drawingArcGeometry.js';
import { arcBulgeSolverVariable, circleRadiusSolverVariable } from './drawingSolverVariables.js';
import { displayedDimensionMeasurement, measureDimension, resolveDrawingPointReference, sketchPointIdFromReference } from './drawingDimension.js';
import { pointIdForLineEndpoint } from './drawingTopology.js';
import type { DrawingDimension, DrawingDocumentV2, DrawingEntity, DrawingPoint } from './drawingTypes.js';

export const DRAWING_DRAG_THRESHOLD_PX = 4;

export type DrawingGeometryTarget =
  | Readonly<{ kind: 'point'; pointId: string }>
  | Readonly<{ kind: 'line'; lineId: string }>
  | Readonly<{ kind: 'arc-endpoint'; entityId: string; draggedPointId: string; pivotPointId: string; initialBulge: number }>
  | Readonly<{ kind: 'arc-radius'; entityId: string; radialGrabOffset: number }>
  | Readonly<{ kind: 'rigid-translation'; entityId: string; pointIds: readonly string[]; preservedScalar: 'arc-bulge' }>
  | Readonly<{ kind: 'entity-scalar'; entityId: string; scalar: 'circle-radius'; radialGrabOffset: number }>;

/** Converts a circumference hit into a semantic scalar target. The stored
 * offset makes the pointer-down pose an identity mapping despite hit slop. */
export const createCircleRadiusDragTarget = (document: DrawingDocumentV2, circleId: string, pointer: DrawingPoint): DrawingGeometryTarget | null => {
  const sketch = document.sketches[document.activeSketchId];
  const circle = sketch ? (sketch.entities as unknown as Record<string, DrawingEntity>)[circleId] : undefined;
  if (circle?.type !== 'circle') return null;
  const center = sketch.points[circle.centerPointId];
  return center ? { kind: 'entity-scalar', entityId: circle.id, scalar: 'circle-radius', radialGrabOffset: Math.hypot(pointer.x - center.x, pointer.y - center.y) - circle.radius } : null;
};

/** The center is a derived control; its manipulation target is the Arc's two
 * authoritative endpoints plus the scalar authority which must remain fixed. */
export const createArcCenterDragTarget = (document: DrawingDocumentV2, arcId: string): DrawingGeometryTarget | null => {
  const sketch = document.sketches[document.activeSketchId];
  const arc = sketch ? (sketch.entities as unknown as Record<string, DrawingEntity>)[arcId] : undefined;
  return arc?.type === 'arc' && sketch.points[arc.startPointId] && sketch.points[arc.endPointId]
    ? { kind: 'rigid-translation', entityId: arc.id, pointIds: [...new Set([arc.startPointId, arc.endPointId])], preservedScalar: 'arc-bulge' }
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
  return { kind: 'arc-radius', entityId: entity.id,
    radialGrabOffset: Math.hypot(pointer.x - arc.center.x, pointer.y - arc.center.y) - arc.radius };
};

export const pointIdFromHit = (document: DrawingDocumentV2, lineId: string, endpoint: 'start' | 'end'): string | null => {
  const sketch = document.sketches[document.activeSketchId];
  const line = sketch?.entities[lineId];
  return line ? pointIdForLineEndpoint(line, endpoint) : null;
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
    const pointId = sketchPointIdFromReference(sketch, reference);
    return Boolean(pointId && movedPointIds.has(pointId));
  }));
};

/** Validate the supplied equation set (all driving equations by default). */
export const validateDrivingDimensions = (document: DrawingDocumentV2, dimensions?: readonly DrawingDimension[]): boolean => {
  const sketch = document.sketches[document.activeSketchId];
  if (!sketch) return false;
  return (dimensions ?? Object.values(sketch.dimensions).filter(({ role }) => role === 'driving')).every((dimension) => {
    if (dimension.kind === 'LINE_TO_LINE_ANGLE' || dimension.kind === 'LINE_TO_LINE_DISTANCE') {
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
    const pointer = { x: startPointer.x + delta.x, y: startPointer.y + delta.y };
    const desiredRadius = Math.hypot(pointer.x - arc.center.x, pointer.y - arc.center.y) - target.radialGrabOffset;
    if (!Number.isFinite(desiredRadius) || desiredRadius <= 0) return null;
    const scale = desiredRadius / arc.radius;
    const desiredStart = { x: arc.center.x + (arc.start.x - arc.center.x) * scale, y: arc.center.y + (arc.start.y - arc.center.y) * scale };
    const desiredEnd = { x: arc.center.x + (arc.end.x - arc.center.x) * scale, y: arc.center.y + (arc.end.y - arc.center.y) * scale };
    if (Math.hypot(desiredEnd.x - desiredStart.x, desiredEnd.y - desiredStart.y) <= DRAWING_CONSTRAINT_TOLERANCE_MM) return null;
    const solved = solveDrawingComponentDrag(sketch, {
      [entity.startPointId]: desiredStart,
      [entity.endPointId]: desiredEnd,
    }, { directPointIds: [entity.startPointId, entity.endPointId] });
    return solved ? { ...document, sketches: { ...document.sketches, [sketch.id]: solved } } : null;
  }
  if (target.kind === 'arc-endpoint') {
    if (delta.x === 0 && delta.y === 0) return document;
    const entity = (sketch.entities as unknown as Record<string, DrawingEntity>)[target.entityId];
    const dragged = sketch.points[target.draggedPointId], pivot = sketch.points[target.pivotPointId];
    if (entity?.type !== 'arc' || !dragged || !pivot) return null;
    const positioned = solveDrawingComponentDrag(sketch, {
      [target.draggedPointId]: { x: dragged.x + delta.x, y: dragged.y + delta.y },
      [target.pivotPointId]: { x: pivot.x, y: pivot.y },
    }, { directPointIds: [target.draggedPointId, target.pivotPointId], directPointWeights: {
      [target.draggedPointId]: 1_000_000,
      [target.pivotPointId]: 1_000,
    } });
    if (!positioned) return null;
    const originalArc = resolveArcFromBulge(entity, sketch.points[entity.startPointId], sketch.points[entity.endPointId]);
    if (!originalArc) return null;
    const scale = Math.max(Math.hypot(originalArc.end.x - originalArc.start.x, originalArc.end.y - originalArc.start.y), originalArc.radius, DRAWING_CONSTRAINT_TOLERANCE_MM);
    const sampleTs = [1 / 8, 1 / 4, 3 / 8, 1 / 2, 5 / 8, 3 / 4, 7 / 8] as const;
    const originalSamples = sampleTs.map((t) => arcPointAt(originalArc, t));
    const sign = Math.sign(target.initialBulge) || 1, edge = Math.PI / 2 - 1e-6;
    const endpointTargets = [target.draggedPointId, target.pivotPointId].flatMap((pointId) => ([
      { variable: { kind: 'point-axis' as const, pointId, axis: 'x' as const }, value: positioned.points[pointId].x },
      { variable: { kind: 'point-axis' as const, pointId, axis: 'y' as const }, value: positioned.points[pointId].y },
    ]));
    const solved = minimizeDrawingVariableObjective(positioned, {
      variable: arcBulgeSolverVariable(entity.id),
      coordinateRange: sign > 0 ? [1e-6, edge] : [-edge, -1e-6],
      valueFromCoordinate: Math.tan,
      exactTargets: endpointTargets,
      evaluate: (candidateSketch) => {
        const candidateEntity = (candidateSketch.entities as unknown as Record<string, DrawingEntity>)[entity.id];
        if (candidateEntity?.type !== 'arc') return Infinity;
        const candidateArc = resolveArcFromBulge(candidateEntity, candidateSketch.points[entity.startPointId], candidateSketch.points[entity.endPointId]);
        if (!candidateArc) return Infinity;
        return sampleTs.reduce((sum, t, index) => {
          const point = arcPointAt(candidateArc, t), original = originalSamples[index];
          return sum + ((point.x - original.x) ** 2 + (point.y - original.y) ** 2) / (scale * scale);
        }, 0) / sampleTs.length;
      },
    });
    return solved ? { ...document, sketches: { ...document.sketches, [sketch.id]: solved } } : null;
  }
  if (target.kind === 'entity-scalar') {
    if (!startPointer) return null;
    const pointer = { x: startPointer.x + delta.x, y: startPointer.y + delta.y };
    const entity = (sketch.entities as unknown as Record<string, DrawingEntity>)[target.entityId];
    const center = entity?.type === 'circle' ? sketch.points[entity.centerPointId] : null;
    if (!center) return null;
    const variable = circleRadiusSolverVariable(entity.id);
    const desired = Math.hypot(pointer.x - center.x, pointer.y - center.y) - target.radialGrabOffset;
    const solved = solveDrawingVariableTarget(sketch, { variable, value: desired });
    return solved ? { ...document, sketches: { ...document.sketches, [sketch.id]: solved } } : null;
  }
  const ids = target.kind === 'point'
    ? [target.pointId]
    : target.kind === 'rigid-translation' ? [...target.pointIds]
    : (() => { const line = sketch.entities[target.lineId]; return line ? [...new Set([line.startPointId, line.endPointId])] : []; })();
  if (!ids.length || ids.some((id) => !sketch.points[id])) return null;
  const moves = Object.fromEntries(ids.map((id) => {
    const point = sketch.points[id];
    return [id, { x: point.x + delta.x, y: point.y + delta.y }];
  }));
  const solvedSketch = solveDrawingComponentDrag(sketch, moves, target.kind === 'point'
    ? { directPointIds: [target.pointId] }
    : target.kind === 'line' ? { directLineIds: [target.lineId] }
    : { directPointIds: target.pointIds });
  if (!solvedSketch) return null;
  const candidate = { ...document, sketches: { ...document.sketches, [sketch.id]: solvedSketch } };
  const affectedPointIds = new Set(Object.keys(sketch.points).filter((id) => {
    const before = sketch.points[id], after = solvedSketch.points[id];
    return Math.hypot(before.x - after.x, before.y - after.y) > DRAWING_CONSTRAINT_TOLERANCE_MM;
  }));
  if (!affectedPointIds.size) return document;
  return validateDrivingDimensions(candidate, collectAffectedDrivingDimensions(document, affectedPointIds)) ? candidate : null;
};
