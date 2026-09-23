import { deriveArcThroughThreePoints } from './drawingArcGeometry.js';
import { DRAWING_MODEL_SPACE_TOLERANCE, type DrawingPoint, type ResolvedDrawingArc } from './drawingTypes.js';

export type AcceptedArcEndpoint = Readonly<{
  point: DrawingPoint; pointId: string | null; midpointLineId: string | null;
  lineBodyId: string | null; curveId: string | null;
}>;
export type ArcToolInteraction = Readonly<{
  start: AcceptedArcEndpoint | null;
  end: AcceptedArcEndpoint | null;
  /** The authoritative current placement, used as P2 before end acceptance and P3 afterwards. */
  preview: DrawingPoint | null;
  form: DrawingPoint | null;
}>;
export const EMPTY_ARC_INTERACTION: ArcToolInteraction = { start: null, end: null, preview: null, form: null };
export type DrawingArcDraft = Readonly<{
  id: string; type: 'arc'; start: AcceptedArcEndpoint; end: AcceptedArcEndpoint; bulge: number; formPointId: string | null;
}>;

export const updateArcPreview = (state: ArcToolInteraction, point: DrawingPoint): ArcToolInteraction =>
  state.start ? state.end ? { ...state, preview: point, form: point } : { ...state, preview: point } : state;

export const resolveArcEndpointReference = (state: ArcToolInteraction): Readonly<{ start: DrawingPoint; end: DrawingPoint }> | null =>
  state.start && !state.end && state.preview ? { start: state.start.point, end: state.preview } : null;

export const resolveArcPreview = (state: ArcToolInteraction): ResolvedDrawingArc | null =>
  state.start && state.end && state.form ? deriveArcThroughThreePoints(state.start.point, state.end.point, state.form) : null;

export const acceptArcEndpoint = (state: ArcToolInteraction, endpoint: AcceptedArcEndpoint): ArcToolInteraction => {
  if (!Number.isFinite(endpoint.point.x) || !Number.isFinite(endpoint.point.y)) return state;
  if (!state.start) return { start: endpoint, end: null, preview: endpoint.point, form: null };
  if (state.end || endpoint.pointId && endpoint.pointId === state.start.pointId
    || Math.hypot(endpoint.point.x - state.start.point.x, endpoint.point.y - state.start.point.y) <= DRAWING_MODEL_SPACE_TOLERANCE) return state;
  return { ...state, end: endpoint, preview: null, form: null };
};

export const commitArcForm = (state: ArcToolInteraction, form: DrawingPoint, id: string, formPointId: string | null = null) => {
  if (!state.start || !state.end) return { interaction: state, entity: null } as const;
  const geometry = deriveArcThroughThreePoints(state.start.point, state.end.point, form, id);
  if (!geometry) return { interaction: { ...state, form } as ArcToolInteraction, entity: null } as const;
  return { interaction: EMPTY_ARC_INTERACTION, entity: { id, type: 'arc', start: state.start, end: state.end,
    bulge: geometry.bulge, formPointId } satisfies DrawingArcDraft } as const;
};
