import type { FinalContour } from './contourClassification';
import type { GeneratedProfile, GeneratedProfileElementId } from './generatedProfiles';
import { isTapClearanceEligibleRole } from './generatedTaps';

/**
 * Resolves manufacturing intent before looking at projected contour geometry.
 *
 * Eligibility is generator-authored segment semantics, independent of a tap's
 * position in the profile. Boundary and tip semantics remain fixed.
 */
export const resolveTapClearanceElementIds = (profile: GeneratedProfile): ReadonlySet<GeneratedProfileElementId> => {
  const eligible = new Set<GeneratedProfileElementId>();
  profile.orderedElements.forEach((element) => {
    if (isTapClearanceEligibleRole(element.segmentTapRole ?? null)) eligible.add(element.id);
  });
  return eligible;
};

const samePoint = (left: { x: number; y: number }, right: { x: number; y: number }) => (
  Math.abs(left.x - right.x) <= 0.000001 && Math.abs(left.y - right.y) <= 0.000001
);

/** Maps an already-resolved semantic decision through GeometryProjection. */
export const projectTapClearanceMask = (
  contour: FinalContour,
  profiles: ReadonlyArray<GeneratedProfile>,
): boolean[] => {
  const mask = contour.points?.map(() => false) ?? [];
  if (!contour.points || contour.points.length === 0) return mask;

  profiles.filter((profile) => profile.panelId === (contour.panelId ?? contour.ownerPanelId)).forEach((profile) => {
    const eligibleElementIds = resolveTapClearanceElementIds(profile);
    profile.geometryProjections.forEach((projection) => {
      if (!eligibleElementIds.has(projection.elementId)) return;
      contour.points!.forEach((start, index) => {
        const end = contour.points![(index + 1) % contour.points!.length];
        if ((samePoint(start, projection.start) && samePoint(end, projection.end))
          || (samePoint(start, projection.end) && samePoint(end, projection.start))) mask[index] = true;
      });
    });
  });
  return mask;
};
