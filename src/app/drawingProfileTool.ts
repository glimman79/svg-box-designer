import type { DrawingPoint } from './drawingTypes.js';
import {
  LINE_ZERO_LENGTH_TOLERANCE_MM,
  resolveLinePreviewPoint,
  updateLinePreviewAtSpatialPoint as updateLineSegmentPreviewAtSpatialPoint,
  type DrawingLineDraft,
  type LineSegmentInteractionState,
} from './drawingLineSegmentSupport.js';

export type ProfileToolInteraction = LineSegmentInteractionState;

export const EMPTY_PROFILE_INTERACTION: ProfileToolInteraction = {
  start: null,
  startPointId: null,
  startLineId: null,
  startMidpointLineId: null,
  rawPointerPoint: null,
  effectivePreviewPoint: null,
  snappedAngleDegrees: null,
  perpendicularLineId: null,
  parallelLineId: null,
  midpointLineId: null,
  lineBodyId: null,
};

/** Manual starts and committed continuations share one fresh Profile segment state. */
export const initializeProfileSegmentAt = (point: DrawingPoint, pointId: string | null = null,
  lineId: string | null = null, midpointLineId: string | null = null): ProfileToolInteraction => ({
  ...EMPTY_PROFILE_INTERACTION, start: point, startPointId: pointId, startLineId: lineId,
  startMidpointLineId: midpointLineId, rawPointerPoint: point, effectivePreviewPoint: point,
});

export const updateProfilePreview = (interaction: ProfileToolInteraction, pointer: DrawingPoint): ProfileToolInteraction => (
  interaction.start ? (() => {
    const preview = resolveLinePreviewPoint(interaction.start!, pointer);
    return { ...interaction, rawPointerPoint: preview.rawPointerPoint, effectivePreviewPoint: preview.effectivePreviewPoint,
      snappedAngleDegrees: preview.snappedAngleDegrees, perpendicularLineId: null, parallelLineId: null, midpointLineId: null, lineBodyId: null };
  })() : interaction
);


export const updateProfilePreviewAtSpatialPoint = (interaction: ProfileToolInteraction, rawPointerPoint: DrawingPoint, effectivePreviewPoint: DrawingPoint): ProfileToolInteraction =>
  updateLineSegmentPreviewAtSpatialPoint(interaction, rawPointerPoint, effectivePreviewPoint);

export const cancelProfileInteraction = (): ProfileToolInteraction => EMPTY_PROFILE_INTERACTION;

export type ProfileClickResult = Readonly<{ interaction: ProfileToolInteraction; entity: DrawingLineDraft | null }>;

export const applyProfileClick = (interaction: ProfileToolInteraction, point: DrawingPoint, createId: () => string): ProfileClickResult => {
  if (!interaction.start) return { interaction: initializeProfileSegmentAt(point), entity: null };
  const preview = resolveLinePreviewPoint(interaction.start, point);
  const effectivePoint = preview.effectivePreviewPoint;
  if (Math.hypot(effectivePoint.x - interaction.start.x, effectivePoint.y - interaction.start.y) <= LINE_ZERO_LENGTH_TOLERANCE_MM) {
    return { interaction: { ...interaction, ...preview }, entity: null };
  }
  return { interaction: initializeProfileSegmentAt(effectivePoint), entity: { id: createId(), type: 'line', start: interaction.start, end: effectivePoint } };
};

/** Commits a point already resolved by shared Line-segment arbitration without reapplying angular inference. */
export const applyResolvedProfileClick = (interaction: ProfileToolInteraction, point: DrawingPoint, createId: () => string,
  pointId: string | null = null, lineId: string | null = null, midpointLineId: string | null = null): ProfileClickResult => {
  if (!interaction.start) return { interaction: initializeProfileSegmentAt(point, pointId, lineId, midpointLineId), entity: null };
  if (Math.hypot(point.x - interaction.start.x, point.y - interaction.start.y) <= LINE_ZERO_LENGTH_TOLERANCE_MM) return { interaction, entity: null };
  return { interaction: initializeProfileSegmentAt(point, pointId), entity: { id: createId(), type: 'line', start: interaction.start, end: point,
    startPointId: interaction.startPointId ?? undefined, endPointId: pointId ?? undefined } };
};

// Shared straight-segment resolution remains independently reusable by Profile and a future Line tool.
export {
  automaticAxisConstraintKind,
  diagnoseLineCommonDirection,
  hasAngularPresentationTruth,
  resolveLineEffectivePoint,
  resolveLinePreviewPoint,
  selectMinimalLineSemanticConstraints,
  updateLinePreviewAtSpatialPoint,
} from './drawingLineSegmentSupport.js';
export { appendEntityToActiveSketch } from './drawingDocumentMutation.js';
