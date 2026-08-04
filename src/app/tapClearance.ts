import type { FinalContour } from './contourClassification';
import type { GeneratedProfile, GeneratedProfileElementId } from './generatedProfiles';

/**
 * Resolves manufacturing intent before looking at projected contour geometry.
 *
 * A one-tap profile deliberately has no eligible elements.  Keeping both of
 * its terminal walls (and its tip) fixed is a product decision, not a geometry
 * fallback.
 */
export const resolveTapClearanceElementIds = (profile: GeneratedProfile): ReadonlySet<GeneratedProfileElementId> => {
  const eligible = new Set<GeneratedProfileElementId>();
  const tapCount = profile.orderedTaps.length;
  if (tapCount <= 1) return eligible;

  profile.orderedTaps.forEach((tap, tapIndex) => {
    if (tap.tapIndex !== tapIndex || tap.totalTapCount !== tapCount) {
      throw new Error(`${profile.id}: inconsistent generator-authored tap order`);
    }
    if (tapIndex > 0) eligible.add(tap.leadingWallElementId);
    if (tapIndex < tapCount - 1) eligible.add(tap.trailingWallElementId);
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
