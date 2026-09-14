import type { CoordinatePoint, AffineTransform } from './drawingTransform';
import { modelToOverlayPoint } from './drawingTransform';
import type { DrawingSnap } from './drawingSnapEngine';
import type { DrawingSketchV2 } from './drawingTypes';
import { deriveLineConstraintMarkerCandidates, deriveMidpointMarkerPresentation, layoutLineConstraintMarkers } from './drawingParallelMarker.js';

export type DrawingMidpointInferencePresentation = Readonly<{
  kind: 'midpoint';
  targetLineId: string;
  center: CoordinatePoint;
  direction: CoordinatePoint;
  start: CoordinatePoint;
  end: CoordinatePoint;
  squareSize: number;
}>;

export type DrawingInferencePresentation = DrawingMidpointInferencePresentation;

type MidpointPresentationInput = Readonly<{
  targetLineId: string;
  sketch: DrawingSketchV2;
  pixelsPerModelUnit: number;
  drawingToClientTransform: AffineTransform;
  overlayToClientTransform: AffineTransform;
}>;

/** Predicts the appended, post-commit Midpoint marker without changing the sketch. */
export const deriveMidpointInferencePresentation = (input: MidpointPresentationInput): DrawingMidpointInferencePresentation | null => {
  let virtualId = '__midpoint-inference__';
  while (input.sketch.geometricConstraints?.[virtualId]) virtualId += '_';
  // Use a virtual semantic relation so the normal ordering authority places it
  // exactly where an appended commit will appear. Coincidence markers remain
  // excluded by that same candidate derivation, matching post-normalization.
  const virtualConstraint = { id: virtualId, kind: 'MIDPOINT' as const, references: [
    { kind: 'sketchPoint' as const, pointId: '__midpoint-inference-point__' },
    { kind: 'entity' as const, entityId: input.targetLineId },
  ] as const };
  const virtualSketch = { ...input.sketch,
    geometricConstraints: { ...input.sketch.geometricConstraints, [virtualId]: virtualConstraint },
    geometricConstraintOrder: [...(input.sketch.geometricConstraintOrder ?? []), virtualId] };
  const marker = layoutLineConstraintMarkers(virtualSketch, deriveLineConstraintMarkerCandidates(virtualSketch), input.pixelsPerModelUnit)
    .find(({ constraintId }) => constraintId === virtualId);
  const geometry = marker && deriveMidpointMarkerPresentation(marker, input.pixelsPerModelUnit);
  if (!geometry) return null;
  const center = modelToOverlayPoint(geometry.center, input.drawingToClientTransform, input.overlayToClientTransform);
  const start = modelToOverlayPoint(geometry.start, input.drawingToClientTransform, input.overlayToClientTransform);
  const end = modelToOverlayPoint(geometry.end, input.drawingToClientTransform, input.overlayToClientTransform);
  if (!center || !start || !end) return null;
  const dx = end.x - start.x, dy = end.y - start.y, length = Math.hypot(dx, dy);
  if (length === 0) return null;
  return {
    kind: 'midpoint',
    targetLineId: input.targetLineId,
    center,
    direction: { x: dx / length, y: dy / length }, start, end,
    squareSize: geometry.squareSize * input.pixelsPerModelUnit,
  };
};

/** Maps accepted inference authority to presentation-only overlay items. */
export const deriveDrawingInferencePresentations = (
  snap: DrawingSnap,
  sketch: DrawingSketchV2 | null,
  pixelsPerModelUnit: number,
  drawingToClientTransform: AffineTransform,
  overlayToClientTransform: AffineTransform,
): readonly DrawingInferencePresentation[] => {
  if (snap.type !== 'midpoint') return [];
  if (!sketch) return [];
  const presentation = deriveMidpointInferencePresentation({
    targetLineId: snap.entityId,
    sketch,
    pixelsPerModelUnit,
    drawingToClientTransform,
    overlayToClientTransform,
  });
  return presentation ? [presentation] : [];
};
