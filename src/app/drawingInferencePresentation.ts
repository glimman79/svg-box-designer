import type { CoordinatePoint, AffineTransform } from './drawingTransform';
import { modelToOverlayPoint } from './drawingTransform';
import type { DrawingSnap } from './drawingSnapEngine';

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
  acceptedPoint: CoordinatePoint;
  targetStart: CoordinatePoint;
  targetEnd: CoordinatePoint;
  drawingToClientTransform: AffineTransform;
  overlayToClientTransform: AffineTransform;
}>;

/** Derives a fixed-pixel Midpoint glyph from an already accepted semantic target. */
export const deriveMidpointInferencePresentation = (
  input: MidpointPresentationInput,
  halfLength = 7,
  squareSize = 4,
): DrawingMidpointInferencePresentation | null => {
  const center = modelToOverlayPoint(input.acceptedPoint, input.drawingToClientTransform, input.overlayToClientTransform);
  const targetStart = modelToOverlayPoint(input.targetStart, input.drawingToClientTransform, input.overlayToClientTransform);
  const targetEnd = modelToOverlayPoint(input.targetEnd, input.drawingToClientTransform, input.overlayToClientTransform);
  if (!center || !targetStart || !targetEnd) return null;

  const dx = targetEnd.x - targetStart.x;
  const dy = targetEnd.y - targetStart.y;
  const length = Math.hypot(dx, dy);
  if (length === 0) return null;
  const direction = { x: dx / length, y: dy / length };
  return {
    kind: 'midpoint',
    targetLineId: input.targetLineId,
    center,
    direction,
    start: { x: center.x - direction.x * halfLength, y: center.y - direction.y * halfLength },
    end: { x: center.x + direction.x * halfLength, y: center.y + direction.y * halfLength },
    squareSize,
  };
};

/** Maps accepted inference authority to presentation-only overlay items. */
export const deriveDrawingInferencePresentations = (
  snap: DrawingSnap,
  resolvedLines: readonly Readonly<{ id: string; start: CoordinatePoint; end: CoordinatePoint }>[],
  drawingToClientTransform: AffineTransform,
  overlayToClientTransform: AffineTransform,
): readonly DrawingInferencePresentation[] => {
  if (snap.type !== 'midpoint') return [];
  const target = resolvedLines.find(({ id }) => id === snap.entityId);
  if (!target) return [];
  const presentation = deriveMidpointInferencePresentation({
    targetLineId: snap.entityId,
    acceptedPoint: snap.effectivePoint,
    targetStart: target.start,
    targetEnd: target.end,
    drawingToClientTransform,
    overlayToClientTransform,
  });
  return presentation ? [presentation] : [];
};
