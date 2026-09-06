import type { DrawingDocumentV2, DrawingSketchV2 } from './drawingTypes';
import { resolveLine } from './drawingTopology.js';

export type DrawingParallelMarker = Readonly<{
  id: string;
  constraintId: string;
  lineId: string;
  x: number;
  y: number;
}>;

/** Derive the two presentational markers for each single semantic Parallel constraint. */
export const deriveParallelMarkers = (sketch: DrawingSketchV2): DrawingParallelMarker[] =>
  Object.values(sketch.geometricConstraints ?? {}).flatMap((constraint) => {
    if (constraint.kind !== 'PARALLEL') return [];
    return constraint.references.flatMap(({ entityId }, index) => {
      const entity = sketch.entities[entityId];
      const line = entity?.type === 'line' ? resolveLine(sketch, entity) : null;
      return line ? [{
        id: `${constraint.id}:${index}`,
        constraintId: constraint.id,
        lineId: entityId,
        x: (line.start.x + line.end.x) / 2,
        y: (line.start.y + line.end.y) / 2,
      }] : [];
    });
  });

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
