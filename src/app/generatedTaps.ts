import type { Point } from '../svgUtils';
import type { PanelContributorType } from './panelContributors';

export type GeneratedTapId = string & { readonly __brand: 'GeneratedTapId' };

export type GeneratedTapSegmentRole =
  | 'tap-side-start'
  | 'tap-tip'
  | 'tap-side-end'
  | 'source-boundary-start'
  | 'source-boundary-end'
  | 'corner-closure';

export const isTapClearanceEligibleRole = (role: GeneratedTapSegmentRole | null): boolean => (
  role === 'tap-side-start' || role === 'tap-side-end'
);

/** Generator-authored provenance for one male tab. The points are the three
 * exposed contour segments, in contour order; manufacturing never discovers
 * taps from the shape itself. */
export type GeneratedTapGroup = Readonly<{
  id: GeneratedTapId;
  sourceOperationId: string;
  panelId: string;
  sourceEdgeId: string;
  points: readonly [Point, Point, Point, Point];
  /** Roles correspond to the three directed segments in `points`. */
  segmentRoles: readonly [GeneratedTapSegmentRole, GeneratedTapSegmentRole, GeneratedTapSegmentRole];
}>;

export const createGeneratedTapId = (input: {
  toolType: PanelContributorType;
  sourceOperationId: string;
  panelId: string;
  sourceEdgeId: string;
  tapIndex: number;
}): GeneratedTapId => [
  'generated-tap', input.toolType, input.sourceOperationId, input.panelId, input.sourceEdgeId, input.tapIndex,
].map(String).map(encodeURIComponent).join(':') as GeneratedTapId;
