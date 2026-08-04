import type {
  GeneratedProfile, GeneratedProfileElement, GeneratedProfileElementKind,
  GeneratedProfileElementId, GeometryProjection,
} from '../../src/app/generatedProfiles';

export type TapPosition = 'first' | 'middle' | 'last' | 'only';
export type WallPosition = 'leading' | 'tip' | 'trailing';
export type ProfileRelationship = 'profile-exterior' | 'profile-interior' | 'tip';
export type ShadowReason =
  | 'FIRST_TAP_OUTER_WALL_FIXED' | 'FIRST_TAP_INNER_WALL_ELIGIBLE'
  | 'MIDDLE_TAP_WALL_ELIGIBLE' | 'LAST_TAP_INNER_WALL_ELIGIBLE'
  | 'LAST_TAP_OUTER_WALL_FIXED' | 'SINGLE_TAP_TERMINAL_WALL_FIXED'
  | 'TAP_TIP_FIXED';
export type ProjectionStatus = 'ZERO_PROJECTED_PRIMITIVES' | 'ONE_PROJECTED_PRIMITIVE'
  | 'MULTIPLE_PROJECTED_PRIMITIVES' | 'AMBIGUOUS_PROJECTION' | 'SHARED_PROJECTED_PRIMITIVE';

export type TapClearanceShadowDecision = Readonly<{
  profileId: string; tapId: string; tapIndex: number; tapCount: number;
  tapPosition: TapPosition; elementId: GeneratedProfileElementId;
  elementKind: GeneratedProfileElementKind; wallPosition: WallPosition;
  profileRelationship: ProfileRelationship; eligible: boolean; reason: ShadowReason;
  projections: ReadonlyArray<GeometryProjection>; projectionStatus: ProjectionStatus;
}>;

const position = (index: number, count: number): TapPosition => count === 1 ? 'only'
  : index === 0 ? 'first' : index === count - 1 ? 'last' : 'middle';

/**
 * Validation-only semantic resolver.  Eligibility is completely decided before
 * projection lookup and uses only tap order and the tap's direct child refs.
 * It is intentionally located under tests/diagnostics so production cannot
 * import it through the application module graph.
 */
export const resolveTapClearanceShadow = (profile: GeneratedProfile): ReadonlyArray<TapClearanceShadowDecision> => {
  const elements = new Map(profile.orderedElements.map((element) => [element.id, element]));
  const projectionOwners = new Map<number, Set<GeneratedProfileElementId>>();
  profile.geometryProjections.forEach((projection) => {
    const owners = projectionOwners.get(projection.profileSegmentOrder) ?? new Set();
    owners.add(projection.elementId); projectionOwners.set(projection.profileSegmentOrder, owners);
  });
  const decorate = (element: GeneratedProfileElement, base: Omit<TapClearanceShadowDecision, 'elementId' | 'elementKind' | 'projections' | 'projectionStatus'>): TapClearanceShadowDecision => {
    const projections = profile.geometryProjections.filter((projection) => projection.elementId === element.id);
    const invalid = projections.some((projection) => projection.profileId !== profile.id || projection.id !== element.geometryProjectionId);
    const shared = projections.some((projection) => (projectionOwners.get(projection.profileSegmentOrder)?.size ?? 0) > 1);
    const projectionStatus: ProjectionStatus = invalid ? 'AMBIGUOUS_PROJECTION' : projections.length === 0 ? 'ZERO_PROJECTED_PRIMITIVES'
      : projections.length > 1 ? 'MULTIPLE_PROJECTED_PRIMITIVES' : shared ? 'SHARED_PROJECTED_PRIMITIVE' : 'ONE_PROJECTED_PRIMITIVE';
    return { ...base, elementId: element.id, elementKind: element.kind, projections, projectionStatus };
  };
  return profile.orderedTaps.flatMap((tap, actualIndex) => {
    const tapCount = profile.orderedTaps.length;
    if (tap.tapIndex !== actualIndex || tap.totalTapCount !== tapCount) throw new Error(`${profile.id}: inconsistent generator-authored tap order`);
    const leading = elements.get(tap.leadingWallElementId); const tip = elements.get(tap.tipElementId); const trailing = elements.get(tap.trailingWallElementId);
    if (!leading || !tip || !trailing || leading.kind !== 'tap-leading-wall' || tip.kind !== 'tap-tip' || trailing.kind !== 'tap-trailing-wall') throw new Error(`${tap.id}: invalid child-element references`);
    const tapPosition = position(actualIndex, tapCount);
    const common = { profileId: profile.id, tapId: tap.id, tapIndex: actualIndex, tapCount, tapPosition };
    if (tapPosition === 'only') return [
      decorate(leading, { ...common, wallPosition: 'leading', profileRelationship: 'profile-exterior', eligible: false, reason: 'SINGLE_TAP_TERMINAL_WALL_FIXED' }),
      decorate(tip, { ...common, wallPosition: 'tip', profileRelationship: 'tip', eligible: false, reason: 'TAP_TIP_FIXED' }),
      decorate(trailing, { ...common, wallPosition: 'trailing', profileRelationship: 'profile-exterior', eligible: false, reason: 'SINGLE_TAP_TERMINAL_WALL_FIXED' }),
    ];
    const leadingEligible = tapPosition !== 'first'; const trailingEligible = tapPosition !== 'last';
    return [
      decorate(leading, { ...common, wallPosition: 'leading', profileRelationship: leadingEligible ? 'profile-interior' : 'profile-exterior', eligible: leadingEligible, reason: tapPosition === 'first' ? 'FIRST_TAP_OUTER_WALL_FIXED' : tapPosition === 'middle' ? 'MIDDLE_TAP_WALL_ELIGIBLE' : 'LAST_TAP_INNER_WALL_ELIGIBLE' }),
      decorate(tip, { ...common, wallPosition: 'tip', profileRelationship: 'tip', eligible: false, reason: 'TAP_TIP_FIXED' }),
      decorate(trailing, { ...common, wallPosition: 'trailing', profileRelationship: trailingEligible ? 'profile-interior' : 'profile-exterior', eligible: trailingEligible, reason: tapPosition === 'first' ? 'FIRST_TAP_INNER_WALL_ELIGIBLE' : tapPosition === 'middle' ? 'MIDDLE_TAP_WALL_ELIGIBLE' : 'LAST_TAP_OUTER_WALL_FIXED' }),
    ];
  });
};
