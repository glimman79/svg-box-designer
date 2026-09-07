import type { DrawingCoincidentConstraint, DrawingDocumentV2, DrawingSketchV2 } from './drawingTypes.js';

export const canonicalCoincidentPointPair = (pointAId: string, pointBId: string): readonly [string, string] | null =>
  pointAId === pointBId ? null : [...([pointAId, pointBId] as const)].sort((a, b) => a.localeCompare(b)) as [string, string];

export const createCoincidentConstraint = (sketch: DrawingSketchV2, pointAId: string, pointBId: string): DrawingCoincidentConstraint | null => {
  const pair = canonicalCoincidentPointPair(pointAId, pointBId);
  if (!pair || !sketch.points[pair[0]] || !sketch.points[pair[1]]) return null;
  const duplicate = Object.values(sketch.geometricConstraints ?? {}).some((constraint) => constraint.kind === 'COINCIDENT'
    && canonicalCoincidentPointPair(constraint.references[0].pointId, constraint.references[1].pointId)?.join('\0') === pair.join('\0'));
  return duplicate ? null : {
    id: `coincident:${pair[0]}:${pair[1]}`,
    kind: 'COINCIDENT',
    references: [{ kind: 'sketchPoint', pointId: pair[0] }, { kind: 'sketchPoint', pointId: pair[1] }],
  };
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

export const POINT_CONSTRAINT_MARKER_OFFSET_PX = 10;
export const POINT_CONSTRAINT_MARKER_SIZE_PX = 8;
export const POINT_CONSTRAINT_MARKER_HIT_RADIUS_PX = 9;
export type DrawingPointConstraintMarker = Readonly<{ id: string; constraintId: string; pointIds: readonly [string, string]; x: number; y: number }>;

/** Generic point-associated placement keeps glyph dimensions and offset stable on screen. */
export const deriveCoincidentMarkers = (sketch: DrawingSketchV2, pixelsPerModelUnit = 1): DrawingPointConstraintMarker[] =>
  Object.values(sketch.geometricConstraints ?? {}).flatMap((constraint) => {
    if (constraint.kind !== 'COINCIDENT') return [];
    const [aId, bId] = constraint.references.map(({ pointId }) => pointId) as [string, string];
    const a = sketch.points[aId], b = sketch.points[bId];
    if (!a || !b) return [];
    const offset = POINT_CONSTRAINT_MARKER_OFFSET_PX / pixelsPerModelUnit;
    return [{ id: constraint.id, constraintId: constraint.id, pointIds: [aId, bId], x: (a.x + b.x) / 2 + offset, y: (a.y + b.y) / 2 - offset }];
  });
