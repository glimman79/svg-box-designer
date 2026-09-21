import type { DrawingPoint } from './drawingTypes.js';
import { EMPTY_LINE_SEGMENT_INTERACTION, createResolvedLineDraft, initializeLineSegmentAt,
  type DrawingLineDraft, type LineSegmentInteractionState } from './drawingLineSegmentSupport.js';

export type LineToolInteraction = LineSegmentInteractionState;
export const EMPTY_LINE_INTERACTION = EMPTY_LINE_SEGMENT_INTERACTION;
export type LineClickResult = Readonly<{ interaction: LineToolInteraction; entity: DrawingLineDraft | null }>;

/** Standalone Line owns only its two-click lifetime; segment geometry is shared. */
export const applyResolvedLineClick = (interaction: LineToolInteraction, point: DrawingPoint,
  createId: () => string, pointId: string | null = null, lineId: string | null = null,
  midpointLineId: string | null = null): LineClickResult => {
  if (!interaction.start) return { interaction: initializeLineSegmentAt(point, pointId, lineId, midpointLineId), entity: null };
  const entity = createResolvedLineDraft(interaction, point, createId, pointId);
  return entity ? { interaction: EMPTY_LINE_INTERACTION, entity } : { interaction, entity: null };
};
