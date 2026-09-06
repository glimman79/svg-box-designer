import type { DrawingDocumentV2, DrawingSketchV2 } from './drawingTypes';
import { resolveLine } from './drawingTopology.js';

export const GEOMETRIC_CONSTRAINT_MARKER_OFFSET_PX = 12;
export type DrawingParallelMarker = Readonly<{
  id: string;
  constraintId: string;
  lineId: string;
  x: number;
  y: number;
  label: '∥' | 'H' | 'V';
}>;

/** Derive presentation-only markers beside their finite Lines. */
export const deriveGeometricConstraintMarkers = (sketch: DrawingSketchV2, pixelsPerModelUnit = 1): DrawingParallelMarker[] =>
  Object.values(sketch.geometricConstraints ?? {}).flatMap((constraint) => {
    return constraint.references.flatMap(({ entityId }, index) => {
      const entity = sketch.entities[entityId];
      const line = entity?.type === 'line' ? resolveLine(sketch, entity) : null;
      if (!line) return [];
      const dx = line.end.x - line.start.x, dy = line.end.y - line.start.y, length = Math.hypot(dx, dy);
      if (length === 0) return [];
      const offset = GEOMETRIC_CONSTRAINT_MARKER_OFFSET_PX / pixelsPerModelUnit;
      return [{
        id: `${constraint.id}:${index}`,
        constraintId: constraint.id,
        lineId: entityId,
        x: (line.start.x + line.end.x) / 2 - dy / length * offset,
        y: (line.start.y + line.end.y) / 2 + dx / length * offset,
        label: constraint.kind === 'PARALLEL' ? '∥' : constraint.kind === 'HORIZONTAL' ? 'H' : 'V',
      }];
    });
  });

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
