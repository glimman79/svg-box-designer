import type { ClassifiedContour, FinalContour } from './contourClassification';
import { classifyFinalContours } from './contourClassification';
import { cloneManufacturingMetadata } from './manufacturingMetadata';
import { getManufacturingPolicy } from './manufacturingPolicy';
import { cornerTouchTolerance } from './sharedGeometry';
import { geometryServices } from './geometryServices';
import type { GeometryServices } from './geometryServices';
import { createManufacturingGeometry } from './manufacturingGeometry';
import type { ManufacturingGeometry } from './manufacturingGeometry';
import type { FinalGeometry } from './finalGeometry';

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

export const applyClearance = (manufacturingGeometry: ManufacturingGeometry, clearanceMm = 0, services: GeometryServices = geometryServices): ManufacturingGeometry => {
  manufacturingGeometry.finalContourList.forEach((contour) => {
    const strategy = getManufacturingPolicy(contour.geometryType).compensationStrategy;
    strategy.execute({ geometry: manufacturingGeometry, contour, clearanceMm, services });
  });
  return manufacturingGeometry;
};

/** @deprecated Compatibility wrapper; use applyClearance(ManufacturingGeometry). */
export const applyClearanceStage = (finalContourList: FinalContour[]): FinalContour[] => finalContourList;

export const applySlotClearance = (
  finalContourList: FinalContour[],
  slotClearanceMm: number,
  services: GeometryServices = geometryServices,
): FinalContour[] => {
  if (slotClearanceMm <= cornerTouchTolerance) {
    return finalContourList.map((contour) => ({ ...services.clone(contour), manufacturing: cloneManufacturingMetadata(contour.manufacturing) }));
  }

  return finalContourList.map((contour) => {
    const isSlotClearanceEligible = getManufacturingPolicy(contour.geometryType).allowSlotClearance;

    if (!isSlotClearanceEligible) {
      return { ...services.clone(contour), manufacturing: cloneManufacturingMetadata(contour.manufacturing) };
    }

    const cleared = services.parallelProfile(contour, slotClearanceMm, 'OUTWARD');
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

// Manufacturing pipeline order: future clearance -> slot clearance -> final kerf.
// Kerf is intentionally the terminal stage; preview/export consume this result directly.
export const processManufacturingGeometry = (
  finalGeometry: FinalGeometry,
  kerfMm: number,
  slotClearanceMm = 0,
  clearanceMm = 0,
): ManufacturingGeometry => {
  const manufacturingGeometry = applyClearance(createManufacturingGeometry(finalGeometry), clearanceMm);
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
  clearanceMm = 0,
): ManufacturingGeometry => processManufacturingGeometry(
  { contours: finalContourList, diagnostics: [] },
  kerfMm,
  slotClearanceMm,
  clearanceMm,
);
