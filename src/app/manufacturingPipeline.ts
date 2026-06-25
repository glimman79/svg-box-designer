import type { ClassifiedContour, FinalContour } from './contourClassification';
import { classifyFinalContours } from './contourClassification';
import { compensateClassifiedContours, compensateContourPoints, pathDToClosedContour } from './manufacturingCompensation';
import { cornerTouchTolerance, pointsToClosedPathD } from './sharedGeometry';
import type { Point } from '../svgUtils';

export type ManufacturingSettings = {
  kerfMm: number;
  clearanceMm: number;
};

export type ManufacturingContour = ClassifiedContour & {
  clearanceApplied: boolean;
};

export type ManufacturingGeometry = {
  finalContourList: FinalContour[];
  contours: ManufacturingContour[];
};

const clonePoints = (points: Point[]) => points.map((point) => ({ ...point }));

const getPoints = (contour: ClassifiedContour): Point[] | undefined => (
  contour.points ? clonePoints(contour.points) : (contour.pathD ? pathDToClosedContour(contour.pathD) ?? undefined : undefined)
);

const getBounds = (points: Point[]) => points.reduce((bounds, point) => ({
  minX: Math.min(bounds.minX, point.x),
  maxX: Math.max(bounds.maxX, point.x),
  minY: Math.min(bounds.minY, point.y),
  maxY: Math.max(bounds.maxY, point.y),
}), { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity });

const isBoundingBoxCorner = (point: Point, bounds: ReturnType<typeof getBounds>) => (
  (Math.abs(point.x - bounds.minX) <= cornerTouchTolerance || Math.abs(point.x - bounds.maxX) <= cornerTouchTolerance)
  && (Math.abs(point.y - bounds.minY) <= cornerTouchTolerance || Math.abs(point.y - bounds.maxY) <= cornerTouchTolerance)
);

const clampToBounds = (point: Point, bounds: ReturnType<typeof getBounds>): Point => ({
  x: Math.min(bounds.maxX, Math.max(bounds.minX, point.x)),
  y: Math.min(bounds.maxY, Math.max(bounds.minY, point.y)),
});

const hasOuterMatingFeatures = (points: Point[]) => {
  if (points.length <= 4) return false;
  const bounds = getBounds(points);
  return points.some((point) => !isBoundingBoxCorner(point, bounds));
};

const applyOuterFeatureClearance = (points: Point[], clearanceMm: number): Point[] => {
  if (clearanceMm <= cornerTouchTolerance || !hasOuterMatingFeatures(points)) return clonePoints(points);

  const bounds = getBounds(points);
  return compensateContourPoints(points, 'OUTER', clearanceMm).map((point, index) => (
    isBoundingBoxCorner(points[index] ?? point, bounds) ? { ...points[index] } : clampToBounds(point, bounds)
  ));
};

export const applyClearance = (contours: ClassifiedContour[], clearanceMm: number): ManufacturingContour[] => {
  const normalizedClearanceMm = Math.max(0, clearanceMm);

  return contours.map((contour) => {
    const points = getPoints(contour);
    if (!points || normalizedClearanceMm <= cornerTouchTolerance) {
      return { ...contour, points, clearanceApplied: false };
    }

    const clearancePoints = contour.kind === 'INNER'
      ? compensateContourPoints(points, 'OUTER', normalizedClearanceMm)
      : applyOuterFeatureClearance(points, normalizedClearanceMm);
    const clearanceApplied = JSON.stringify(clearancePoints) !== JSON.stringify(points);

    return {
      ...contour,
      points: clearancePoints,
      pathD: pointsToClosedPathD(clearancePoints),
      clearanceApplied,
    };
  });
};

export const buildManufacturingGeometry = (
  finalContourList: FinalContour[],
  settings: ManufacturingSettings,
): ManufacturingGeometry => {
  const clearanceContours = applyClearance(classifyFinalContours(finalContourList), settings.clearanceMm);
  const kerfContours = compensateClassifiedContours(clearanceContours, settings.kerfMm) as ManufacturingContour[];

  return {
    finalContourList,
    contours: kerfContours.map((contour, index) => ({
      ...contour,
      clearanceApplied: clearanceContours[index]?.clearanceApplied ?? false,
    })),
  };
};
