import { DRAWING_CONSTRAINT_TOLERANCE_MM, solveDrawingComponentDrag, solveDrawingVariableTarget } from './drawingConstraintSolver.js';
import { circleRadiusSolverVariable } from './drawingSolverVariables.js';
import { displayedDimensionMeasurement, measureDimension, resolveDrawingPointReference, sketchPointIdFromReference } from './drawingDimension.js';
import { pointIdForLineEndpoint, updateSketchPoint } from './drawingTopology.js';
import type { DrawingDimension, DrawingDocumentV2, DrawingEntity, DrawingPoint } from './drawingTypes.js';

export const DRAWING_DRAG_THRESHOLD_PX = 4;

export type DrawingGeometryTarget =
  | Readonly<{ kind: 'point'; pointId: string }>
  | Readonly<{ kind: 'line'; lineId: string }>
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

export const pointIdFromHit = (document: DrawingDocumentV2, lineId: string, endpoint: 'start' | 'end'): string | null => {
  const sketch = document.sketches[document.activeSketchId];
  const line = sketch?.entities[lineId];
  return line ? pointIdForLineEndpoint(line, endpoint) : null;
};

/** Apply absolute point positions without replacing their stable identities. */
export const applyDrawingPointMoves = (document: DrawingDocumentV2, moves: Readonly<Record<string, DrawingPoint>>): DrawingDocumentV2 => {
  const sketch = document.sketches[document.activeSketchId];
  if (!sketch) return document;
  const moved = Object.entries(moves).reduce((next, [id, point]) => updateSketchPoint(next, id, point), sketch);
  return moved === sketch ? document : { ...document, sketches: { ...document.sketches, [sketch.id]: moved } };
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
  if (target.kind === 'entity-scalar') {
    if (!startPointer) return null;
    const circle = (sketch.entities as unknown as Record<string, DrawingEntity>)[target.entityId];
    const center = circle?.type === 'circle' ? sketch.points[circle.centerPointId] : null;
    if (!center) return null;
    const pointer = { x: startPointer.x + delta.x, y: startPointer.y + delta.y };
    const desired = Math.hypot(pointer.x - center.x, pointer.y - center.y) - target.radialGrabOffset;
    const solved = solveDrawingVariableTarget(sketch, { variable: circleRadiusSolverVariable(circle.id), value: desired });
    return solved ? { ...document, sketches: { ...document.sketches, [sketch.id]: solved } } : null;
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
