import { DRAWING_MODEL_SPACE_TOLERANCE, type DrawingCoincidentConstraint, type DrawingDocumentV2, type DrawingSketchV2 } from './drawingTypes.js';
import { deriveLineConstraintMarkerCandidates, layoutLineConstraintMarkers } from './drawingParallelMarker.js';

export const canonicalCoincidentPointPair = (pointAId: string, pointBId: string): readonly [string, string] | null =>
  pointAId === pointBId ? null : [...([pointAId, pointBId] as const)].sort((a, b) => a.localeCompare(b)) as [string, string];

export const createCoincidentConstraint = (sketch: DrawingSketchV2, pointAId: string, pointBId: string): DrawingCoincidentConstraint | null => {
  const pair = canonicalCoincidentPointPair(pointAId, pointBId);
  if (!pair || !sketch.points[pair[0]] || !sketch.points[pair[1]]) return null;
  const duplicate = Object.values(sketch.geometricConstraints ?? {}).some((constraint) => constraint.kind === 'COINCIDENT' && constraint.variant !== 'point-linear-support'
    && canonicalCoincidentPointPair(constraint.references[0].pointId, constraint.references[1].pointId)?.join('\0') === pair.join('\0'));
  return duplicate ? null : {
    id: `coincident:${pair[0]}:${pair[1]}`,
    kind: 'COINCIDENT',
    variant: 'point-point',
    references: [{ kind: 'sketchPoint', pointId: pair[0] }, { kind: 'sketchPoint', pointId: pair[1] }],
  };
};

export const createPointOnLinearSupportConstraint = (sketch: DrawingSketchV2, pointId: string, entityId: string): DrawingCoincidentConstraint | null => {
  const point = sketch.points[pointId], edge = sketch.entities[entityId];
  const a = edge && sketch.points[edge.startPointId], b = edge && sketch.points[edge.endPointId];
  if (!point || !edge || edge.type !== 'line' || !a || !b || Math.hypot(b.x - a.x, b.y - a.y) <= DRAWING_MODEL_SPACE_TOLERANCE) return null;
  const duplicate = Object.values(sketch.geometricConstraints ?? {}).some((constraint) => constraint.kind === 'COINCIDENT'
    && constraint.variant === 'point-linear-support' && constraint.references[0].pointId === pointId && constraint.references[1].entityId === entityId);
  return duplicate ? null : { id: `coincident:${pointId}:support:${entityId}`, kind: 'COINCIDENT', variant: 'point-linear-support',
    references: [{ kind: 'sketchPoint', pointId }, { kind: 'entity', entityId }] };
};

/** Adds one validated semantic relation; coordinate equality is never consulted. */
export const addCoincidentConstraint = (document: DrawingDocumentV2, pointAId: string, pointBId: string): DrawingDocumentV2 => {
  const sketch = document.sketches[document.activeSketchId];
  if (!sketch) return document;
  const constraint = createCoincidentConstraint(sketch, pointAId, pointBId);
  if (!constraint) return document;
  return { ...document, sketches: { ...document.sketches, [sketch.id]: { ...sketch,
    geometricConstraints: { ...(sketch.geometricConstraints ?? {}), [constraint.id]: constraint },
    geometricConstraintOrder: [...(sketch.geometricConstraintOrder ?? []), constraint.id],
  } } };
};

export const addPointOnLinearSupportConstraint = (document: DrawingDocumentV2, pointId: string, entityId: string): DrawingDocumentV2 => {
  const sketch = document.sketches[document.activeSketchId];
  if (!sketch) return document;
  const constraint = createPointOnLinearSupportConstraint(sketch, pointId, entityId);
  if (!constraint) return document;
  return { ...document, sketches: { ...document.sketches, [sketch.id]: { ...sketch,
    geometricConstraints: { ...(sketch.geometricConstraints ?? {}), [constraint.id]: constraint },
    geometricConstraintOrder: [...(sketch.geometricConstraintOrder ?? []), constraint.id],
  } } };
};

export const POINT_CONSTRAINT_MARKER_SIZE_PX = 8;
export const POINT_CONSTRAINT_MARKER_HIT_RADIUS_PX = 9;
export const POINT_CONSTRAINT_MARKER_OFFSET_PX = 12;
export type DrawingPointConstraintMarker = Readonly<{ id: string; constraintId: string; pointIds: readonly string[]; x: number; y: number }>;
export type DrawingCoincidentReferenceMarker = Readonly<{ constraintId: string; x: number; y: number }>;

/** Generic point-associated placement keeps glyph dimensions and offset stable on screen. */
export const deriveCoincidentMarkers = (sketch: DrawingSketchV2, pixelsPerModelUnit = 1): DrawingPointConstraintMarker[] =>
  Object.values(sketch.geometricConstraints ?? {}).flatMap((constraint) => {
    if (constraint.kind !== 'COINCIDENT') return [];
    const pointIds = constraint.variant === 'point-linear-support'
      ? [constraint.references[0].pointId] : constraint.references.map(({ pointId }) => pointId);
    const points = pointIds.map((id) => sketch.points[id]);
    if (points.some((point) => !point)) return [];
    const offset = POINT_CONSTRAINT_MARKER_OFFSET_PX / pixelsPerModelUnit;
    return [{ id: constraint.id, constraintId: constraint.id, pointIds, x: points[0].x + offset, y: points[0].y - offset }];
  });

/** Presentation-only target for inspecting one selected Coincident relation. */
export const deriveSelectedCoincidentReferenceMarker = (sketch: DrawingSketchV2, constraintId: string | null, pixelsPerModelUnit = 1): DrawingCoincidentReferenceMarker | null => {
  if (!constraintId) return null;
  const constraint = (sketch.geometricConstraints ?? {})[constraintId];
  if (!constraint || constraint.kind !== 'COINCIDENT') return null;
  if (constraint.variant !== 'point-linear-support') {
    const point = sketch.points[constraint.references[1].pointId];
    return point ? { constraintId, x: point.x, y: point.y } : null;
  }
  const lineId = constraint.references[1].entityId;
  const candidate = { id: `${constraintId}:selected-reference`, constraintId, lineId, label: '' };
  const markers = layoutLineConstraintMarkers(sketch, [...deriveLineConstraintMarkerCandidates(sketch), candidate], pixelsPerModelUnit);
  const marker = markers.find(({ id }) => id === candidate.id);
  return marker ? { constraintId, x: marker.x, y: marker.y } : null;
};
