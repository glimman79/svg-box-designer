import type { Point } from '../svgUtils';

export type GeneratedTapId = string & { readonly __brand: 'GeneratedTapId' };

/** Generator-authored provenance for one male tab. The points are the three
 * exposed contour segments, in contour order; manufacturing never discovers
 * taps from the shape itself. */
export type GeneratedTapGroup = Readonly<{
  id: GeneratedTapId;
  sourceOperationId: string;
  panelId: string;
  sourceEdgeId: string;
  points: readonly [Point, Point, Point, Point];
}>;

export const createGeneratedTapId = (input: {
  toolType: 'TB' | 'S';
  sourceOperationId: string;
  panelId: string;
  sourceEdgeId: string;
  tapIndex: number;
}): GeneratedTapId => [
  'generated-tap', input.toolType, input.sourceOperationId, input.panelId, input.sourceEdgeId, input.tapIndex,
].map(String).map(encodeURIComponent).join(':') as GeneratedTapId;
