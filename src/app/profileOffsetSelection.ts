import type { GeneratedProfileId } from './generatedProfiles';

export type ProfileOffsetSelectionTargetId = string & { readonly __brand: 'ProfileOffsetSelectionTargetId' };

export type ProfileOffsetSelectionTarget = Readonly<
  | { kind: 'generated-profile'; id: ProfileOffsetSelectionTargetId; generatedProfileId: GeneratedProfileId }
  | { kind: 'ordinary-source-edge'; id: ProfileOffsetSelectionTargetId; panelId: string; sourceEdgeId: string }
>;

const ordinaryPrefix = 'ordinary-source-edge:';

export const createOrdinaryProfileOffsetTargetId = (panelId: string, sourceEdgeId: string): ProfileOffsetSelectionTargetId => (
  `${ordinaryPrefix}${encodeURIComponent(panelId)}:${encodeURIComponent(sourceEdgeId)}` as ProfileOffsetSelectionTargetId
);

/** Generated profiles deliberately retain their historical serialized ids. */
export const createGeneratedProfileOffsetTargetId = (id: GeneratedProfileId): ProfileOffsetSelectionTargetId => id as unknown as ProfileOffsetSelectionTargetId;

export const parseProfileOffsetSelectionTarget = (id: ProfileOffsetSelectionTargetId | GeneratedProfileId | string): ProfileOffsetSelectionTarget | null => {
  if (!id) return null;
  if (!id.startsWith(ordinaryPrefix)) return { kind: 'generated-profile', id: id as ProfileOffsetSelectionTargetId, generatedProfileId: id as GeneratedProfileId };
  const parts = id.slice(ordinaryPrefix.length).split(':');
  if (parts.length !== 2) return null;
  try {
    const panelId = decodeURIComponent(parts[0]);
    const sourceEdgeId = decodeURIComponent(parts[1]);
    return panelId && sourceEdgeId ? { kind: 'ordinary-source-edge', id: id as ProfileOffsetSelectionTargetId, panelId, sourceEdgeId } : null;
  } catch {
    return null;
  }
};
