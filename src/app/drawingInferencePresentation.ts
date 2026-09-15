import type { CoordinatePoint, AffineTransform } from './drawingTransform.js';
import { modelToOverlayPoint } from './drawingTransform.js';
import type { DrawingSnap } from './drawingSnapEngine';
import type { DrawingSketchV2 } from './drawingTypes';
import type { LineToolInteraction } from './drawingLineTool';
import { deriveLineConstraintMarkerCandidates, deriveMidpointMarkerPresentation, layoutLineConstraintMarkers } from './drawingParallelMarker.js';
import { derivePerpendicularPresentation, type DrawingPerpendicularPresentation } from './drawingParallelMarker.js';
import { resolveLine } from './drawingTopology.js';

export type DrawingMidpointInferencePresentation = Readonly<{
  kind: 'midpoint';
  targetLineId: string;
  center: CoordinatePoint;
  direction: CoordinatePoint;
  start: CoordinatePoint;
  end: CoordinatePoint;
  squareSize: number;
}>;

export type DrawingParallelInferencePresentation = Readonly<{
  kind: 'parallel';
  targetLineId: string;
  markers: readonly Readonly<{ lineId: string; center: CoordinatePoint }>[];
  strokeHalfLength: number;
  strokeHalfGap: number;
}>;

export type DrawingPerpendicularInferencePresentation = Readonly<{
  kind: 'perpendicular';
  targetLineId: string;
  geometry: DrawingPerpendicularPresentation;
}>;

export type DrawingInferencePresentation = DrawingMidpointInferencePresentation | DrawingParallelInferencePresentation | DrawingPerpendicularInferencePresentation;

/** Projects plural accepted semantic truth into live feedback. Geometric-demand
 * equivalence is intentionally not a presentation filter: persistence has a
 * separate transaction-scoped minimizer. */
export const selectAcceptedLineInferenceRepresentations = (interaction?: LineToolInteraction) => {
  if (!interaction) return new Set<'parallel' | 'perpendicular'>();
  return new Set<'parallel' | 'perpendicular'>([
    ...(interaction.parallelLineId ? ['parallel' as const] : []),
    ...(interaction.perpendicularLineId ? ['perpendicular' as const] : []),
  ]);
};

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

type ParallelPresentationInput = MidpointPresentationInput & Readonly<{
  authoredStart: CoordinatePoint;
  authoredEnd: CoordinatePoint;
}>;

/** Predicts both post-commit Parallel markers through the persistent layout authority. */
export const deriveParallelInferencePresentation = (input: ParallelPresentationInput): DrawingParallelInferencePresentation | null => {
  let virtualId = '__parallel-inference__', lineId = '__parallel-inference-line__';
  while (input.sketch.geometricConstraints?.[virtualId]) virtualId += '_';
  while (input.sketch.entities[lineId]) lineId += '_';
  const startPointId = `${lineId}:start`, endPointId = `${lineId}:end`;
  const virtualConstraint = { id: virtualId, kind: 'PARALLEL' as const, references: [
    { kind: 'entity' as const, entityId: lineId }, { kind: 'entity' as const, entityId: input.targetLineId },
  ] as const };
  const virtualSketch: DrawingSketchV2 = { ...input.sketch,
    points: { ...input.sketch.points,
      [startPointId]: { id: startPointId, ...input.authoredStart }, [endPointId]: { id: endPointId, ...input.authoredEnd } },
    entities: { ...input.sketch.entities, [lineId]: { id: lineId, type: 'line', startPointId, endPointId } },
    entityOrder: [...input.sketch.entityOrder, lineId],
    geometricConstraints: { ...input.sketch.geometricConstraints, [virtualId]: virtualConstraint },
    geometricConstraintOrder: [...(input.sketch.geometricConstraintOrder ?? []), virtualId] };
  const markers = layoutLineConstraintMarkers(virtualSketch, deriveLineConstraintMarkerCandidates(virtualSketch), input.pixelsPerModelUnit)
    .filter(({ constraintId }) => constraintId === virtualId)
    .map(({ lineId: markerLineId, x, y }) => ({ lineId: markerLineId === lineId ? '__authored__' : markerLineId,
      center: modelToOverlayPoint({ x, y }, input.drawingToClientTransform, input.overlayToClientTransform) }))
    .filter((marker): marker is { lineId: string; center: CoordinatePoint } => marker.center !== null);
  return markers.length === 2 ? { kind: 'parallel', targetLineId: input.targetLineId, markers,
    strokeHalfLength: 6, strokeHalfGap: 2 } : null;
};

/** Maps accepted inference authority to presentation-only overlay items. */
export const deriveDrawingInferencePresentations = (
  snap: DrawingSnap,
  sketch: DrawingSketchV2 | null,
  pixelsPerModelUnit: number,
  drawingToClientTransform: AffineTransform,
  overlayToClientTransform: AffineTransform,
  interaction?: LineToolInteraction,
): readonly DrawingInferencePresentation[] => {
  if (!sketch) return [];
  const presentations: DrawingInferencePresentation[] = [];
  const acceptedRepresentations = selectAcceptedLineInferenceRepresentations(interaction);
  if (snap.type === 'midpoint') {
    const presentation = deriveMidpointInferencePresentation({
    targetLineId: snap.entityId,
    sketch,
    pixelsPerModelUnit,
    drawingToClientTransform,
    overlayToClientTransform,
    });
    if (presentation) presentations.push(presentation);
  }
  if (acceptedRepresentations.has('parallel') && interaction?.parallelLineId && interaction.start && interaction.effectivePreviewPoint) {
    const presentation = deriveParallelInferencePresentation({ targetLineId: interaction.parallelLineId, sketch,
      authoredStart: interaction.start, authoredEnd: interaction.effectivePreviewPoint, pixelsPerModelUnit,
      drawingToClientTransform, overlayToClientTransform });
    if (presentation) presentations.push(presentation);
  }
  if (acceptedRepresentations.has('perpendicular') && interaction?.perpendicularLineId && interaction.start && interaction.effectivePreviewPoint) {
    const target = sketch.entities[interaction.perpendicularLineId];
    const targetLine = target?.type === 'line' ? resolveLine(sketch, target) : null;
    const authoredStart = modelToOverlayPoint(interaction.start, drawingToClientTransform, overlayToClientTransform);
    const authoredEnd = modelToOverlayPoint(interaction.effectivePreviewPoint, drawingToClientTransform, overlayToClientTransform);
    const targetStart = targetLine && modelToOverlayPoint(targetLine.start, drawingToClientTransform, overlayToClientTransform);
    const targetEnd = targetLine && modelToOverlayPoint(targetLine.end, drawingToClientTransform, overlayToClientTransform);
    const geometry = authoredStart && authoredEnd && targetStart && targetEnd
      ? derivePerpendicularPresentation({ start: authoredStart, end: authoredEnd }, { start: targetStart, end: targetEnd }, 9) : null;
    if (geometry) presentations.push({ kind: 'perpendicular', targetLineId: interaction.perpendicularLineId, geometry });
  }
  return presentations;
};
