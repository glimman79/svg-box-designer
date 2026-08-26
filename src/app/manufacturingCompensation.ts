import type { ClassifiedContour, FinalContour } from './contourClassification';
import type { GeneratedProfileId } from './generatedProfiles';
import type { ProfileOffsetSelectionTargetId } from './profileOffsetSelection';
import { createOrdinaryProfileOffsetTargetId, parseProfileOffsetSelectionTarget } from './profileOffsetSelection';
import { classifyFinalContours } from './contourClassification';
import { cloneManufacturingMetadata } from './manufacturingMetadata';
import { getManufacturingPolicy } from './manufacturingPolicy';
import { cornerTouchTolerance } from './sharedGeometry';
import { geometryServices } from './geometryServices';
import type { GeometryServices } from './geometryServices';
import { createManufacturingGeometry } from './manufacturingGeometry';
import type { ManufacturingGeometry } from './manufacturingGeometry';
import type { FinalGeometry } from './finalGeometry';
import { projectTapClearanceMask } from './tapClearance';

export type { ManufacturingGeometry } from './manufacturingGeometry';

export type KerfCompensationResult = ManufacturingGeometry;

export const getKerfCompensationMm = (kerfMm: number) => Math.max(0, kerfMm) / 2;

export { cleanContourPointsForOffset, pathDToClosedContour } from './geometryServices';
import { compensateContourPoints as compensatePolygonPoints } from './geometryServices';
import type { PanelContour } from './sharedGeometry';

/** @deprecated Polygon compatibility helper. Manufacturing stages use GeometryServices. */
export const compensateContourPoints = (points: PanelContour, contourKind: ClassifiedContour['kind'], compensationMm: number): PanelContour => (
  compensatePolygonPoints(points, contourKind === 'OUTER', compensationMm)
);

export const compensateClassifiedContours = (contours: ClassifiedContour[], kerfMm: number, services: GeometryServices = geometryServices): ClassifiedContour[] => {
  const compensationMm = getKerfCompensationMm(kerfMm);

  if (compensationMm <= cornerTouchTolerance) {
    return contours.map((contour) => ({ ...services.clone(contour as FinalContour), manufacturing: cloneManufacturingMetadata(contour.manufacturing) }));
  }

  return contours.map((contour) => {
    const policy = getManufacturingPolicy(contour.geometryType);
    if (!policy.allowKerf) {
      return { ...services.clone(contour as FinalContour), manufacturing: cloneManufacturingMetadata(contour.manufacturing) };
    }
    const compensated = services.parallelProfile(contour as FinalContour, compensationMm, contour.kind === 'OUTER' ? 'OUTWARD' : 'INWARD');
    return { ...(compensated ?? services.clone(contour as FinalContour)), manufacturing: cloneManufacturingMetadata(contour.manufacturing) };
  });
};

export const applyProfileOffset = (manufacturingGeometry: ManufacturingGeometry, profileOffsetMm = 0, services: GeometryServices = geometryServices): ManufacturingGeometry => {
  manufacturingGeometry.finalContourList.forEach((contour) => {
    if (!contour.compensationProfile?.some(Boolean)) return;
    const strategy = getManufacturingPolicy(contour.geometryType).compensationStrategy;
    strategy.execute({ geometry: manufacturingGeometry, contour, profileOffsetMm, services });
  });
  return manufacturingGeometry;
};

/** Tap Clearance eligibility comes only from semantic GeneratedProfile elements. */
export const applyTapClearance = (
  manufacturingGeometry: ManufacturingGeometry,
  tapClearanceMm = -0.10,
  services: GeometryServices = geometryServices,
): ManufacturingGeometry => {
  manufacturingGeometry.finalContourList.forEach((contour) => {
    const tapMask = projectTapClearanceMask(contour, manufacturingGeometry.generatedProfiles);
    if (!tapMask.some(Boolean)) return;
    contour.compensationProfile = tapMask;
    getManufacturingPolicy(contour.geometryType).compensationStrategy.execute({ geometry: manufacturingGeometry, contour, profileOffsetMm: tapClearanceMm, services });
  });
  return manufacturingGeometry;
};

export const resolveProfileOffsetProfileSelection = (manufacturingGeometry: ManufacturingGeometry, selectedIds: ReadonlyArray<ProfileOffsetSelectionTargetId | GeneratedProfileId>): ManufacturingGeometry => {
  const authoredAmbiguousIds = new Set(manufacturingGeometry.diagnostics.filter((diagnostic) => diagnostic.code === 'CLEARANCE_PROFILE_AMBIGUOUS').map((diagnostic) => diagnostic.id));
  const locations = new Map<GeneratedProfileId, Set<string>>();
  manufacturingGeometry.finalContourList.forEach((contour) => {
    contour.segmentProfileIds?.forEach((id) => {
      if (!id) return;
      const contours = locations.get(id) ?? new Set<string>();
      contours.add(contour.id);
      locations.set(id, contours);
    });
  });
  const selected = new Set(selectedIds);
  selected.forEach((id) => {
    const target = parseProfileOffsetSelectionTarget(id);
    if (!target || target.kind === 'ordinary-source-edge') return;
    const generatedId = target.generatedProfileId;
    const matched = locations.get(generatedId);
    if (!matched) manufacturingGeometry.diagnostics.push({ id, code: 'CLEARANCE_PROFILE_MISSING', severity: 'warning', message: `Selected Profile Offset profile ${id} no longer exists.` });
    else if (matched.size > 1 || authoredAmbiguousIds.has(generatedId)) manufacturingGeometry.diagnostics.push({ id, code: 'CLEARANCE_PROFILE_AMBIGUOUS', severity: 'error', message: `Selected Profile Offset profile ${id} is ambiguous.` });
  });
  manufacturingGeometry.finalContourList.forEach((contour) => {
    // Only outer contours carry selectable ownership provenance. S-generated
    // slots therefore retain their independent Slot Clearance mask.
    if (!contour.segmentProfileIds && !contour.segmentSourceEdgeIds) return;
    const segmentCount = contour.points?.length ?? 0;
    const profileIds = contour.segmentProfileIds ?? Array.from({ length: segmentCount }, () => null);
    const sourceEdgeIds = contour.segmentSourceEdgeIds ?? Array.from({ length: segmentCount }, () => null);
    if (!contour.points || profileIds.length !== segmentCount || sourceEdgeIds.length !== segmentCount) {
      contour.compensationProfile = Array.from({ length: Math.max(profileIds.length, sourceEdgeIds.length) }, () => false);
      manufacturingGeometry.diagnostics.push({ id: contour.id, code: 'CLEARANCE_PROFILE_PROVENANCE_INVALID', severity: 'error', message: 'Profile Offset profile provenance does not align with contour segments.' });
      return;
    }
    const ambiguous = profileIds.some((id) => id && selected.has(id) && ((locations.get(id)?.size ?? 0) !== 1 || authoredAmbiguousIds.has(id)));
    contour.compensationProfile = profileIds.map((profileId, index) => {
      if (profileId) return !ambiguous && selected.has(profileId);
      const sourceEdgeId = sourceEdgeIds[index];
      return !!sourceEdgeId && !!contour.panelId && selected.has(createOrdinaryProfileOffsetTargetId(contour.panelId, sourceEdgeId));
    });
  });
  return manufacturingGeometry;
};

/** @deprecated Compatibility wrapper; use applyProfileOffset(ManufacturingGeometry). */
export const applyProfileOffsetStage = (finalContourList: FinalContour[]): FinalContour[] => finalContourList;

export const applySlotClearance = (
  finalContourList: FinalContour[],
  slotClearanceMm: number,
  services: GeometryServices = geometryServices,
): FinalContour[] => {
  if (Math.abs(slotClearanceMm) <= cornerTouchTolerance) {
    return finalContourList.map((contour) => ({ ...services.clone(contour), manufacturing: cloneManufacturingMetadata(contour.manufacturing) }));
  }

  return finalContourList.map((contour) => {
    const isSlotClearanceEligible = getManufacturingPolicy(contour.geometryType).allowSlotClearance;

    if (!isSlotClearanceEligible) {
      return { ...services.clone(contour), manufacturing: cloneManufacturingMetadata(contour.manufacturing) };
    }

    const cleared = services.compensateProfile(contour, slotClearanceMm, 'OUTWARD');
    return { ...(cleared ?? services.clone(contour)), manufacturing: cloneManufacturingMetadata(contour.manufacturing) };
  });
};

export const applySlotClearanceStage = (
  finalContourList: FinalContour[],
  slotClearanceMm: number,
): FinalContour[] => applySlotClearance(finalContourList, slotClearanceMm);

const applyKerfStage = (
  finalContourList: FinalContour[],
  kerfMm: number,
): ClassifiedContour[] => compensateClassifiedContours(classifyFinalContours(finalContourList), kerfMm);

// Manufacturing pipeline order: Profile Offset -> Tap Clearance -> Slot Clearance -> final kerf.
// Kerf is intentionally the terminal stage; preview/export consume this result directly.
export const processManufacturingGeometry = (
  finalGeometry: FinalGeometry,
  kerfMm: number,
  slotClearanceMm = 0,
  profileOffsetMm = 0,
  selectedProfileOffsetIds: ReadonlyArray<ProfileOffsetSelectionTargetId | GeneratedProfileId> = [],
  tapClearanceMm = -0.10,
): ManufacturingGeometry => {
  const manufacturingGeometry = applyProfileOffset(resolveProfileOffsetProfileSelection(createManufacturingGeometry(finalGeometry), selectedProfileOffsetIds), profileOffsetMm);
  applyTapClearance(manufacturingGeometry, tapClearanceMm);
  const slotClearanceStageFinalContourList = applySlotClearanceStage(manufacturingGeometry.finalContourList, slotClearanceMm);
  const contours = applyKerfStage(slotClearanceStageFinalContourList, kerfMm);

  return {
    ...manufacturingGeometry,
    finalContourList: slotClearanceStageFinalContourList,
    contours,
  };
};

export const buildKerfCompensatedPreviewFromFinalContours = (
  finalContourList: FinalContour[],
  kerfMm: number,
  slotClearanceMm = 0,
  profileOffsetMm = 0,
  selectedProfileOffsetIds: ReadonlyArray<ProfileOffsetSelectionTargetId | GeneratedProfileId> = [],
  tapClearanceMm = -0.10,
): ManufacturingGeometry => processManufacturingGeometry(
  { contours: finalContourList, diagnostics: [], generatedProfiles: [], clearanceProjectionTraces: [] },
  kerfMm,
  slotClearanceMm,
  profileOffsetMm,
  selectedProfileOffsetIds,
  tapClearanceMm,
);
