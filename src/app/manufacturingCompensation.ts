import type { ClassifiedContour, FinalContour } from './contourClassification';
import { classifyFinalContours } from './contourClassification';
import { cloneManufacturingMetadata, getManufacturingPipelineForGeometryType } from './manufacturingMetadata';
import { buildContourSides, cornerTouchTolerance, getContourSignedArea, lineIntersection, offsetContourSide, pointsMatch, pointsToClosedPathD } from './sharedGeometry';
import type { PanelContour } from './sharedGeometry';
import type { Point } from '../svgUtils';

export type ManufacturingGeometry = {
  finalContourList: FinalContour[];
  contours: ClassifiedContour[];
};

export type KerfCompensationResult = ManufacturingGeometry;

export const getKerfCompensationMm = (kerfMm: number) => Math.max(0, kerfMm) / 2;

const cloneContourPoints = (points: PanelContour): PanelContour => points.map((point) => ({ ...point }));

const areCollinear = (previous: Point, current: Point, next: Point) => {
  const previousDx = current.x - previous.x;
  const previousDy = current.y - previous.y;
  const nextDx = next.x - current.x;
  const nextDy = next.y - current.y;
  return Math.abs((previousDx * nextDy) - (previousDy * nextDx)) <= cornerTouchTolerance;
};

export const cleanContourPointsForOffset = (points: PanelContour): PanelContour => {
  const cleaned: PanelContour = [];

  points.forEach((point) => {
    if (cleaned.length === 0 || !pointsMatch(cleaned[cleaned.length - 1], point)) {
      cleaned.push({ ...point });
    }
  });

  while (cleaned.length > 1 && pointsMatch(cleaned[0], cleaned[cleaned.length - 1])) {
    cleaned.pop();
  }

  let removedPoint = true;
  while (removedPoint && cleaned.length >= 3) {
    removedPoint = false;

    for (let pointIndex = 0; pointIndex < cleaned.length; pointIndex += 1) {
      const previous = cleaned[(pointIndex + cleaned.length - 1) % cleaned.length];
      const current = cleaned[pointIndex];
      const next = cleaned[(pointIndex + 1) % cleaned.length];

      if (pointsMatch(previous, current) || pointsMatch(current, next) || areCollinear(previous, current, next)) {
        cleaned.splice(pointIndex, 1);
        removedPoint = true;
        break;
      }
    }
  }

  return cleaned;
};


export const pathDToClosedContour = (pathD: string): PanelContour | null => {
  const tokens = pathD.match(/[a-zA-Z]|[-+]?\d*\.?\d+(?:e[-+]?\d+)?/gi) ?? [];
  const points: Point[] = [];
  let index = 0;
  let command = '';

  while (index < tokens.length) {
    const token = tokens[index];

    if (/^[a-zA-Z]$/.test(token)) {
      command = token;
      index += 1;
      if (command.toUpperCase() === 'Z') {
        break;
      }
      continue;
    }

    if (command.toUpperCase() !== 'M' && command.toUpperCase() !== 'L') {
      return null;
    }

    const x = Number(token);
    const y = Number(tokens[index + 1]);

    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      return null;
    }

    points.push({ x, y });
    index += 2;
  }

  if (points.length > 1) {
    const first = points[0];
    const last = points[points.length - 1];
    if (Math.abs(first.x - last.x) <= cornerTouchTolerance && Math.abs(first.y - last.y) <= cornerTouchTolerance) {
      points.pop();
    }
  }

  return points.length >= 3 ? points : null;
};

export const compensateContourPoints = (points: PanelContour, contourKind: ClassifiedContour['kind'], compensationMm: number): PanelContour => {
  if (compensationMm <= cornerTouchTolerance) {
    return cloneContourPoints(points);
  }

  const cleanedPoints = cleanContourPointsForOffset(points);

  if (cleanedPoints.length < 3) {
    return cloneContourPoints(points);
  }

  const windingSign = getContourSignedArea(cleanedPoints) >= 0 ? 1 : -1;
  const direction = contourKind === 'OUTER' ? -1 : 1;
  const signedOffset = direction * windingSign * compensationMm;
  const offsetSides = buildContourSides(cleanedPoints).map((side) => offsetContourSide(side, signedOffset));

  if (offsetSides.some((side) => !side)) {
    return cloneContourPoints(points);
  }

  const rebuilt = (offsetSides as NonNullable<(typeof offsetSides)[number]>[]).map((side, sideIndex, sides) => {
    const previousSide = sides[(sideIndex + sides.length - 1) % sides.length];
    return lineIntersection(previousSide, side);
  });

  if (rebuilt.some((point) => !point)) {
    return cloneContourPoints(points);
  }

  return rebuilt as PanelContour;
};

export const compensateClassifiedContours = (contours: ClassifiedContour[], kerfMm: number): ClassifiedContour[] => {
  const compensationMm = getKerfCompensationMm(kerfMm);

  if (compensationMm <= cornerTouchTolerance) {
    return contours.map((contour) => ({ ...contour, manufacturing: cloneManufacturingMetadata(contour.manufacturing), points: contour.points?.map((point) => ({ ...point })) }));
  }

  return contours.map((contour) => {
    const points = contour.points ?? (contour.pathD ? pathDToClosedContour(contour.pathD) ?? undefined : undefined);

    if (!points) {
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
    const isSlotClearanceEligible = getManufacturingPipelineForGeometryType(contour.geometryType).slotClearance;

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

export const buildKerfCompensatedPreviewFromFinalContours = (
  finalContourList: FinalContour[],
  kerfMm: number,
  slotClearanceMm = 0,
): ManufacturingGeometry => {
  const clearedFinalContourList = applySlotClearance(finalContourList, slotClearanceMm);
  const contours = compensateClassifiedContours(classifyFinalContours(clearedFinalContourList), kerfMm);

  return {
    finalContourList: clearedFinalContourList,
    contours,
  };
};
