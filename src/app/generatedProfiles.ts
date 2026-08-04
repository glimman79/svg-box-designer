import type { Point } from '../svgUtils';
import type { GeneratedTapGroup, GeneratedTapId } from './generatedTaps';

export type GeneratedProfileId = string & { readonly __brand: 'GeneratedProfileId' };
export type GeneratedProfileElementId = string & { readonly __brand: 'GeneratedProfileElementId' };
export type GeometryProjectionId = string & { readonly __brand: 'GeometryProjectionId' };

export type ProfileAttachmentPoint = Readonly<{ x: number; y: number }>;
export type GeneratedProfileElementKind = 'boundary-run' | 'tap-leading-wall' | 'tap-tip' | 'tap-trailing-wall';

/** A generator-authored semantic unit. It deliberately contains no contour geometry. */
export type GeneratedProfileElement = Readonly<{
  id: GeneratedProfileElementId;
  profileId: GeneratedProfileId;
  kind: GeneratedProfileElementKind;
  profileOrder: number;
  tapId?: GeneratedTapId;
  geometryProjectionId: GeometryProjectionId;
}>;

/** Metadata connecting semantic identity to today's directed contour projection. */
export type GeometryProjection = Readonly<{
  id: GeometryProjectionId;
  profileId: GeneratedProfileId;
  elementId: GeneratedProfileElementId;
  kind: 'current-contour-segment';
  profileSegmentOrder: number;
  start: ProfileAttachmentPoint;
  end: ProfileAttachmentPoint;
}>;

export type GeneratedProfileTap = Readonly<{
  id: GeneratedTapId;
  tapIndex: number;
  totalTapCount: number;
  leadingWallElementId: GeneratedProfileElementId;
  tipElementId: GeneratedProfileElementId;
  trailingWallElementId: GeneratedProfileElementId;
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
  orderedElements: ReadonlyArray<GeneratedProfileElement>;
  geometryProjections: ReadonlyArray<GeometryProjection>;
  orderedTaps: ReadonlyArray<GeneratedProfileTap>;
  leadingBoundaryRun: GeneratedProfileElementId;
  trailingBoundaryRun: GeneratedProfileElementId;
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

const elementId = (profileId: GeneratedProfileId, name: string): GeneratedProfileElementId => `${profileId}:element:${name}` as GeneratedProfileElementId;
const projectionId = (id: GeneratedProfileElementId): GeometryProjectionId => `${id}:projection:current-contour-segment` as GeometryProjectionId;

/** Called only by generators while their ordered tap emission is still available. */
export const createGeneratedProfile = (input: {
  toolType: 'TB' | 'S'; connectionId: string; operationId: string; panelId: string; sourceEdgeId: string;
  sourceEdgeStart: Point; sourceEdgeEnd: Point; attachmentStart: Point; attachmentEnd: Point;
  taps: ReadonlyArray<GeneratedTapGroup>;
}): GeneratedProfile => {
  const id = createGeneratedProfileId({ ...input });
  const taps = input.taps.filter((tap) => tap.sourceEdgeId === input.sourceEdgeId);
  const elements: GeneratedProfileElement[] = [];
  const geometryProjections: GeometryProjection[] = [];
  const append = (elementIdValue: GeneratedProfileElementId, kind: GeneratedProfileElementKind, start: Point, end: Point, tapId?: GeneratedTapId) => {
    const order = elements.length;
    const projection = projectionId(elementIdValue);
    elements.push({ id: elementIdValue, profileId: id, kind, profileOrder: order, ...(tapId ? { tapId } : {}), geometryProjectionId: projection });
    geometryProjections.push({ id: projection, profileId: id, elementId: elementIdValue, kind: 'current-contour-segment', profileSegmentOrder: order, start: { ...start }, end: { ...end } });
  };
  const leading = elementId(id, 'leading-straight');
  append(leading, 'boundary-run', input.attachmentStart, taps[0]?.points[0] ?? input.attachmentEnd);
  const orderedTaps = taps.map((tap, tapIndex): GeneratedProfileTap => {
    const leadingWallElementId = elementId(id, `tap-${tapIndex}-start-wall`);
    const tipElementId = elementId(id, `tap-${tapIndex}-tip`);
    const trailingWallElementId = elementId(id, `tap-${tapIndex}-end-wall`);
    append(leadingWallElementId, 'tap-leading-wall', tap.points[0], tap.points[1], tap.id);
    append(tipElementId, 'tap-tip', tap.points[1], tap.points[2], tap.id);
    append(trailingWallElementId, 'tap-trailing-wall', tap.points[2], tap.points[3], tap.id);
    if (tapIndex < taps.length - 1) append(elementId(id, `between-${tapIndex}-${tapIndex + 1}`), 'boundary-run', tap.points[3], taps[tapIndex + 1].points[0]);
    return { id: tap.id, tapIndex, totalTapCount: taps.length, leadingWallElementId, tipElementId, trailingWallElementId,
      isFirstTap: tapIndex === 0, isMiddleTap: tapIndex > 0 && tapIndex < taps.length - 1, isLastTap: tapIndex === taps.length - 1 };
  });
  const trailing = elementId(id, 'trailing-straight');
  append(trailing, 'boundary-run', taps.at(-1)?.points[3] ?? input.attachmentStart, input.attachmentEnd);
  elements.forEach(Object.freeze);
  geometryProjections.forEach((projection) => { Object.freeze(projection.start); Object.freeze(projection.end); Object.freeze(projection); });
  orderedTaps.forEach(Object.freeze);
  const profile: GeneratedProfile = { id, generatorType: input.toolType, operationId: input.operationId, panelId: input.panelId, sourceEdgeId: input.sourceEdgeId,
    sourceEdgeDirection: { start: { ...input.sourceEdgeStart }, end: { ...input.sourceEdgeEnd } },
    attachmentStart: { ...input.attachmentStart }, attachmentEnd: { ...input.attachmentEnd },
    orderedElements: elements, geometryProjections, orderedTaps, leadingBoundaryRun: leading, trailingBoundaryRun: trailing };
  Object.freeze(profile.sourceEdgeDirection.start); Object.freeze(profile.sourceEdgeDirection.end); Object.freeze(profile.sourceEdgeDirection);
  Object.freeze(profile.attachmentStart); Object.freeze(profile.attachmentEnd);
  Object.freeze(elements); Object.freeze(geometryProjections); Object.freeze(orderedTaps);
  return Object.freeze(profile);
};
