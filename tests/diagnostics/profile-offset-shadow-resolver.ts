import type { GeneratedProfile, GeneratedProfileElement, GeometryProjection } from '../../src/app/generatedProfiles';

export type ShadowProfileOffsetDecision = Readonly<{
  element: GeneratedProfileElement;
  projection: GeometryProjection;
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
): ReadonlyArray<ShadowProfileOffsetDecision> => profile.orderedElements.map((element) => {
  const projection = profile.geometryProjections.find((candidate) => candidate.id === element.geometryProjectionId);
  if (!projection) throw new Error(`Missing geometry projection ${element.geometryProjectionId}`);
  return { element, projection, eligible: true };
});
