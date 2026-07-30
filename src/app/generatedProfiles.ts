import type { Point } from '../svgUtils';
import type { GeneratedTapGroup, GeneratedTapId } from './generatedTaps';

export type GeneratedProfileId = string & { readonly __brand: 'GeneratedProfileId' };
export type GeneratedElementId = string & { readonly __brand: 'GeneratedElementId' };

export type ProfileAttachmentPoint = Readonly<{ x: number; y: number }>;
export type GeneratedSegmentReference = Readonly<{
  id: GeneratedElementId;
  kind: 'straight' | 'tap-start-wall' | 'tap-tip' | 'tap-end-wall';
  start: ProfileAttachmentPoint;
  end: ProfileAttachmentPoint;
}>;

export type GeneratedProfileTap = Readonly<{
  id: GeneratedTapId;
  tapIndex: number;
  totalTapCount: number;
  startWallReference: GeneratedElementId;
  tipReference: GeneratedElementId;
  endWallReference: GeneratedElementId;
  isFirstTap: boolean;
  isMiddleTap: boolean;
  isLastTap: boolean;
}>;

/** Generator-owned, non-authoritative shadow of one directed edge replacement. */
export type GeneratedProfile = Readonly<{
  id: GeneratedProfileId;
  generatorType: 'TB' | 'S';
  operationId: string;
  panelId: string;
  sourceEdgeId: string;
  sourceEdgeDirection: Readonly<{ start: ProfileAttachmentPoint; end: ProfileAttachmentPoint }>;
  attachmentStart: ProfileAttachmentPoint;
  attachmentEnd: ProfileAttachmentPoint;
  orderedElements: ReadonlyArray<GeneratedSegmentReference>;
  orderedTaps: ReadonlyArray<GeneratedProfileTap>;
  leadingStraightSection: GeneratedElementId;
  trailingStraightSection: GeneratedElementId;
}>;

export type GeneratedProfileGroup = Readonly<{
  id: GeneratedProfileId;
  sourceOperationId: string;
  connectionId: string;
  panelId: string;
  sourceEdgeId: string;
  /** Generator-authored boundaries of the complete source-edge replacement. */
  attachmentStart?: ProfileAttachmentPoint;
  attachmentEnd?: ProfileAttachmentPoint;
  kind: 'BOUNDARY_PROFILE';
}>;

/** The single construction boundary for opaque, persistent profile identities. */
export const createGeneratedProfileId = (input: {
  toolType: 'TB' | 'S'; connectionId: string; panelId: string; sourceEdgeId: string; discriminator?: string;
}): GeneratedProfileId => [
  'profile', input.toolType, input.connectionId, input.panelId, input.sourceEdgeId,
  input.discriminator ?? 'boundary-profile',
].map(encodeURIComponent).join(':') as GeneratedProfileId;

export const createBoundaryProfileGroup = (input: Omit<GeneratedProfileGroup, 'id' | 'kind'> & { toolType: 'TB' | 'S' }): GeneratedProfileGroup => ({
  id: createGeneratedProfileId(input), sourceOperationId: input.sourceOperationId, connectionId: input.connectionId,
  panelId: input.panelId, sourceEdgeId: input.sourceEdgeId,
  ...(input.attachmentStart ? { attachmentStart: { ...input.attachmentStart } } : {}),
  ...(input.attachmentEnd ? { attachmentEnd: { ...input.attachmentEnd } } : {}), kind: 'BOUNDARY_PROFILE',
});

const elementId = (profileId: GeneratedProfileId, name: string): GeneratedElementId => `${profileId}:element:${name}` as GeneratedElementId;
const segment = (id: GeneratedElementId, kind: GeneratedSegmentReference['kind'], start: Point, end: Point): GeneratedSegmentReference => ({ id, kind, start: { ...start }, end: { ...end } });

/** Called only by generators while their ordered tap emission is still available. */
export const createGeneratedProfile = (input: {
  toolType: 'TB' | 'S'; connectionId: string; operationId: string; panelId: string; sourceEdgeId: string;
  sourceEdgeStart: Point; sourceEdgeEnd: Point; attachmentStart: Point; attachmentEnd: Point;
  taps: ReadonlyArray<GeneratedTapGroup>;
}): GeneratedProfile => {
  const id = createGeneratedProfileId({ ...input });
  const taps = input.taps.filter((tap) => tap.sourceEdgeId === input.sourceEdgeId);
  const elements: GeneratedSegmentReference[] = [];
  const leading = elementId(id, 'leading-straight');
  elements.push(segment(leading, 'straight', input.attachmentStart, taps[0]?.points[0] ?? input.attachmentEnd));
  const orderedTaps = taps.map((tap, tapIndex): GeneratedProfileTap => {
    const startWallReference = elementId(id, `tap-${tapIndex}-start-wall`);
    const tipReference = elementId(id, `tap-${tapIndex}-tip`);
    const endWallReference = elementId(id, `tap-${tapIndex}-end-wall`);
    elements.push(segment(startWallReference, 'tap-start-wall', tap.points[0], tap.points[1]));
    elements.push(segment(tipReference, 'tap-tip', tap.points[1], tap.points[2]));
    elements.push(segment(endWallReference, 'tap-end-wall', tap.points[2], tap.points[3]));
    if (tapIndex < taps.length - 1) elements.push(segment(elementId(id, `between-${tapIndex}-${tapIndex + 1}`), 'straight', tap.points[3], taps[tapIndex + 1].points[0]));
    return { id: tap.id, tapIndex, totalTapCount: taps.length, startWallReference, tipReference, endWallReference,
      isFirstTap: tapIndex === 0, isMiddleTap: tapIndex > 0 && tapIndex < taps.length - 1, isLastTap: tapIndex === taps.length - 1 };
  });
  const trailing = elementId(id, 'trailing-straight');
  elements.push(segment(trailing, 'straight', taps.at(-1)?.points[3] ?? input.attachmentStart, input.attachmentEnd));
  return { id, generatorType: input.toolType, operationId: input.operationId, panelId: input.panelId, sourceEdgeId: input.sourceEdgeId,
    sourceEdgeDirection: { start: { ...input.sourceEdgeStart }, end: { ...input.sourceEdgeEnd } },
    attachmentStart: { ...input.attachmentStart }, attachmentEnd: { ...input.attachmentEnd },
    orderedElements: elements, orderedTaps, leadingStraightSection: leading, trailingStraightSection: trailing };
};
