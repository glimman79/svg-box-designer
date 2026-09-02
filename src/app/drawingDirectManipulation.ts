import { DRAWING_CONSTRAINT_TOLERANCE_MM } from './drawingConstraintSolver.js';
import { measureDimension, resolveDrawingPointReference } from './drawingDimension.js';
import { pointIdForLineEndpoint, updateSketchPoint } from './drawingTopology.js';
import type { DrawingDocumentV2, DrawingPoint } from './drawingTypes.js';

export const DRAWING_DRAG_THRESHOLD_PX = 4;

export type DrawingGeometryTarget =
  | Readonly<{ kind: 'point'; pointId: string }>
  | Readonly<{ kind: 'line'; lineId: string }>;

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

/** A conservative constraint boundary: every driving target must still measure exactly. */
export const validateDrivingDimensions = (document: DrawingDocumentV2): boolean => {
  const sketch = document.sketches[document.activeSketchId];
  if (!sketch) return false;
  return Object.values(sketch.dimensions).every((dimension) => {
    if (dimension.role === 'reference') return true;
    const a = resolveDrawingPointReference(sketch, dimension.references[0]);
    const b = resolveDrawingPointReference(sketch, dimension.references[1]);
    return Boolean(a && b && Math.abs(measureDimension(dimension.kind, a!, b!) - dimension.value) <= DRAWING_CONSTRAINT_TOLERANCE_MM);
  });
};

/** Derive each preview from the drag-start document and total pointer delta. */
export const solveDrawingDragCandidate = (document: DrawingDocumentV2, target: DrawingGeometryTarget, delta: DrawingPoint): DrawingDocumentV2 | null => {
  const sketch = document.sketches[document.activeSketchId];
  if (!sketch || !Number.isFinite(delta.x) || !Number.isFinite(delta.y)) return null;
  const ids = target.kind === 'point'
    ? [target.pointId]
    : (() => { const line = sketch.entities[target.lineId]; return line ? [...new Set([line.startPointId, line.endPointId])] : []; })();
  if (!ids.length || ids.some((id) => !sketch.points[id])) return null;
  const moves = Object.fromEntries(ids.map((id) => {
    const point = sketch.points[id];
    return [id, { x: point.x + delta.x, y: point.y + delta.y }];
  }));
  const candidate = applyDrawingPointMoves(document, moves);
  return validateDrivingDimensions(candidate) ? candidate : null;
};
