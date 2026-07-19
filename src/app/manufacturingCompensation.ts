import type { ClassifiedContour, FinalContour } from './contourClassification';
import { classifyFinalContours } from './contourClassification';
import { cloneManufacturingMetadata } from './manufacturingMetadata';
import { getManufacturingPolicy } from './manufacturingPolicy';
import { cornerTouchTolerance, pointsToClosedPathD } from './sharedGeometry';
import type { PanelContour } from './sharedGeometry';
import { cleanContourPointsForOffset, offsetContourPoints, pathDToClosedContour } from './compensationStrategies';
import { createManufacturingGeometry } from './manufacturingGeometry';
import type { ManufacturingGeometry } from './manufacturingGeometry';
import type { FinalGeometry } from './finalGeometry';

export type { ManufacturingGeometry } from './manufacturingGeometry';

export type KerfCompensationResult = ManufacturingGeometry;

export const getKerfCompensationMm = (kerfMm: number) => Math.max(0, kerfMm) / 2;

export { cleanContourPointsForOffset, pathDToClosedContour } from './compensationStrategies';

export const compensateContourPoints = (points: PanelContour, contourKind: ClassifiedContour['kind'], compensationMm: number): PanelContour => {
  if (compensationMm <= cornerTouchTolerance) {
    return points.map((point) => ({ ...point }));
  }

  return offsetContourPoints(points, contourKind === 'OUTER', compensationMm)
    ?? points.map((point) => ({ ...point }));
};

export const compensateClassifiedContours = (contours: ClassifiedContour[], kerfMm: number): ClassifiedContour[] => {
  const compensationMm = getKerfCompensationMm(kerfMm);

  if (compensationMm <= cornerTouchTolerance) {
    return contours.map((contour) => ({ ...contour, manufacturing: cloneManufacturingMetadata(contour.manufacturing), points: contour.points?.map((point) => ({ ...point })) }));
  }

  return contours.map((contour) => {
    const policy = getManufacturingPolicy(contour.geometryType);
    const points = contour.points ?? (contour.pathD ? pathDToClosedContour(contour.pathD) ?? undefined : undefined);

    if (!policy.allowKerf || !points) {
      return { ...contour, manufacturing: cloneManufacturingMetadata(contour.manufacturing) };
    }

    const compensatedPoints = compensateContourPoints(points, contour.kind, compensationMm);

    return {
      ...contour,
      manufacturing: cloneManufacturingMetadata(contour.manufacturing),
      points: compensatedPoints,
      pathD: pointsToClosedPathD(compensatedPoints),
    };
  });
};

export const applyClearance = (manufacturingGeometry: ManufacturingGeometry, clearanceMm = 0): ManufacturingGeometry => {
  manufacturingGeometry.finalContourList.forEach((contour) => {
    const strategy = getManufacturingPolicy(contour.geometryType).compensationStrategy;
    strategy.execute({ geometry: manufacturingGeometry, contour, clearanceMm });
  });
  return manufacturingGeometry;
};

/** @deprecated Compatibility wrapper; use applyClearance(ManufacturingGeometry). */
export const applyClearanceStage = (finalContourList: FinalContour[]): FinalContour[] => finalContourList;

export const applySlotClearance = (
  finalContourList: FinalContour[],
  slotClearanceMm: number,
): FinalContour[] => {
  if (slotClearanceMm <= cornerTouchTolerance) {
    return finalContourList.map((contour) => ({
      ...contour,
      manufacturing: cloneManufacturingMetadata(contour.manufacturing),
      ...(contour.points ? { points: contour.points.map((point) => ({ ...point })) } : {}),
    }));
  }

  return finalContourList.map((contour) => {
    const isSlotClearanceEligible = getManufacturingPolicy(contour.geometryType).allowSlotClearance;

    if (!isSlotClearanceEligible) {
      return {
        ...contour,
        manufacturing: cloneManufacturingMetadata(contour.manufacturing),
        ...(contour.points ? { points: contour.points.map((point) => ({ ...point })) } : {}),
      };
    }

    const points = contour.points ?? (contour.pathD ? pathDToClosedContour(contour.pathD) ?? undefined : undefined);

    if (!points) {
      return { ...contour, manufacturing: cloneManufacturingMetadata(contour.manufacturing) };
    }

    const clearedPoints = compensateContourPoints(points, 'OUTER', slotClearanceMm);

    return {
      ...contour,
      manufacturing: cloneManufacturingMetadata(contour.manufacturing),
      points: clearedPoints,
      pathD: pointsToClosedPathD(clearedPoints),
    };
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
