import type { DrawingDocumentV2, DrawingSketchV2 } from './drawingTypes';
import { resolveLine } from './drawingTopology.js';

export const GEOMETRIC_CONSTRAINT_MARKER_OFFSET_PX = 12;
export const GEOMETRIC_CONSTRAINT_MARKER_SPACING_PX = 22;
export const GEOMETRIC_CONSTRAINT_MARKER_SIZE_PX = 12;
export type DrawingGeometricConstraintMarker = Readonly<{
  id: string;
  constraintId: string;
  lineId: string;
  x: number;
  y: number;
  label: string;
}>;

/** Compatibility type retained for existing marker consumers. */
export type DrawingParallelMarker = DrawingGeometricConstraintMarker;

type LineMarkerCandidate = Readonly<{
  id: string;
  constraintId: string;
  lineId: string;
  label: string;
}>;

const symmetricSlot = (index: number) => index === 0 ? 0 : (index % 2 === 1 ? 1 : -1) * Math.ceil(index / 2);

/**
 * One presentation authority lays out every Line-associated marker. Candidates
 * only identify their Line and glyph; adding another kind does not add another
 * collision rule.
 */
export const layoutLineConstraintMarkers = (
  sketch: DrawingSketchV2,
  candidates: readonly LineMarkerCandidate[],
  pixelsPerModelUnit = 1,
): DrawingGeometricConstraintMarker[] => {
  const lineSlotCounts = new Map<string, number>();
  return candidates.flatMap((candidate) => {
    const entity = sketch.entities[candidate.lineId];
    const line = entity?.type === 'line' ? resolveLine(sketch, entity) : null;
    if (!line) return [];
    const dx = line.end.x - line.start.x, dy = line.end.y - line.start.y, length = Math.hypot(dx, dy);
    if (length === 0) return [];
    const slotIndex = lineSlotCounts.get(candidate.lineId) ?? 0;
    lineSlotCounts.set(candidate.lineId, slotIndex + 1);
    const perpendicularOffset = GEOMETRIC_CONSTRAINT_MARKER_OFFSET_PX / pixelsPerModelUnit;
    const alongLineOffset = symmetricSlot(slotIndex) * GEOMETRIC_CONSTRAINT_MARKER_SPACING_PX / pixelsPerModelUnit;
    return [{
      ...candidate,
      x: (line.start.x + line.end.x) / 2 - dy / length * perpendicularOffset + dx / length * alongLineOffset,
      y: (line.start.y + line.end.y) / 2 + dx / length * perpendicularOffset + dy / length * alongLineOffset,
    }];
  });
};

/** Derive presentation-only markers beside their finite Lines. */
export const deriveGeometricConstraintMarkers = (sketch: DrawingSketchV2, pixelsPerModelUnit = 1): DrawingGeometricConstraintMarker[] => {
  const order = new Map((sketch.geometricConstraintOrder ?? []).map((id, index) => [id, index]));
  const constraints = Object.values(sketch.geometricConstraints ?? {}).sort((a, b) =>
    (order.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (order.get(b.id) ?? Number.MAX_SAFE_INTEGER) || a.id.localeCompare(b.id));
  const candidates = constraints.flatMap((constraint) =>
    constraint.references.map(({ entityId }, index) => ({
        id: `${constraint.id}:${index}`,
        constraintId: constraint.id,
        lineId: entityId,
        label: constraint.kind === 'PARALLEL' ? '∥' : constraint.kind === 'PERPENDICULAR' ? '⟂' : constraint.kind === 'HORIZONTAL' ? 'H' : 'V',
    })));
  return layoutLineConstraintMarkers(sketch, candidates, pixelsPerModelUnit);
};

/** Compatibility name retained for existing marker consumers and tests. */
export const deriveParallelMarkers = deriveGeometricConstraintMarkers;

/** Remove one semantic constraint; every marker derived from its ID disappears together. */
export const deleteGeometricConstraint = (document: DrawingDocumentV2, constraintId: string): DrawingDocumentV2 => {
  const sketch = document.sketches[document.activeSketchId];
  if (!sketch?.geometricConstraints?.[constraintId]) return document;
  const geometricConstraints = { ...sketch.geometricConstraints };
  delete geometricConstraints[constraintId];
  return {
    ...document,
    sketches: {
      ...document.sketches,
      [sketch.id]: {
        ...sketch,
        geometricConstraints,
        geometricConstraintOrder: (sketch.geometricConstraintOrder ?? []).filter((id) => id !== constraintId),
      },
    },
  };
};
