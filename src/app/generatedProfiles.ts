export type GeneratedProfileId = string & { readonly __brand: 'GeneratedProfileId' };

export type ProfileAttachmentPoint = Readonly<{ x: number; y: number }>;

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
  id: createGeneratedProfileId(input),
  sourceOperationId: input.sourceOperationId,
  connectionId: input.connectionId,
  panelId: input.panelId,
  sourceEdgeId: input.sourceEdgeId,
  ...(input.attachmentStart ? { attachmentStart: { ...input.attachmentStart } } : {}),
  ...(input.attachmentEnd ? { attachmentEnd: { ...input.attachmentEnd } } : {}),
  kind: 'BOUNDARY_PROFILE',
});
