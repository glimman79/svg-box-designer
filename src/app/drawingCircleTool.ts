import { DRAWING_MODEL_SPACE_TOLERANCE, type DrawingPoint } from './drawingTypes.js';

export type CircleToolInteraction = Readonly<{
  center: DrawingPoint | null;
  centerPointId: string | null;
  midpointLineId: string | null;
  previewPoint: DrawingPoint | null;
}>;
export type DrawingCircleDraft = Readonly<{ id: string; type: 'circle'; center: DrawingPoint; centerPointId?: string; radius: number }>;
export const EMPTY_CIRCLE_INTERACTION: CircleToolInteraction = { center: null, centerPointId: null, midpointLineId: null, previewPoint: null };

export const updateCirclePreview = (state: CircleToolInteraction, point: DrawingPoint): CircleToolInteraction =>
  state.center ? { ...state, previewPoint: point } : state;

export const circlePreviewRadius = (state: CircleToolInteraction): number | null => {
  if (!state.center || !state.previewPoint) return null;
  const radius = Math.hypot(state.previewPoint.x - state.center.x, state.previewPoint.y - state.center.y);
  return Number.isFinite(radius) && radius > DRAWING_MODEL_SPACE_TOLERANCE ? radius : null;
};

export const applyResolvedCircleClick = (state: CircleToolInteraction, point: DrawingPoint, createId: () => string,
  pointId: string | null = null, midpointLineId: string | null = null): Readonly<{ interaction: CircleToolInteraction; entity: DrawingCircleDraft | null }> => {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return { interaction: state, entity: null };
  if (!state.center) return { interaction: { center: point, centerPointId: pointId, midpointLineId, previewPoint: null }, entity: null };
  const radius = Math.hypot(point.x - state.center.x, point.y - state.center.y);
  if (!Number.isFinite(radius) || radius <= DRAWING_MODEL_SPACE_TOLERANCE) return { interaction: state, entity: null };
  return { interaction: EMPTY_CIRCLE_INTERACTION, entity: { id: createId(), type: 'circle', center: state.center,
    ...(state.centerPointId ? { centerPointId: state.centerPointId } : {}), radius } };
};
