import type { GeneratedProfile, GeneratedSegmentReference } from '../../src/app/generatedProfiles';

export type ShadowProfileOffsetDecision = Readonly<{
  reference: GeneratedSegmentReference;
  eligible: true;
}>;

/**
 * Validation-only semantic resolver. Profile Offset owns every element emitted
 * between a GeneratedProfile's authored attachments; tap kind and position do
 * not remove any element from that ownership.
 *
 * Deliberately accepts no FinalGeometry or legacy provenance. This makes it
 * impossible for the shadow decision to consult a production mask.
 */
export const resolveShadowProfileOffsetEligibility = (
  profile: GeneratedProfile,
): ReadonlyArray<ShadowProfileOffsetDecision> => profile.orderedElements.map((reference) => ({
  reference,
  eligible: true,
}));
