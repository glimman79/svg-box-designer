import type { ClassifiedContour, FinalContour } from './contourClassification';
import { classifyFinalContours } from './contourClassification';
import { buildContourSides, cornerTouchTolerance, getContourSignedArea, lineIntersection, offsetContourSide, pointsToClosedPathD } from './sharedGeometry';
import type { PanelContour } from './sharedGeometry';
import type { Point } from '../svgUtils';

export type KerfCompensationResult = {
  finalContourList: FinalContour[];
  contours: ClassifiedContour[];
};

export const getKerfCompensationMm = (kerfMm: number) => Math.max(0, kerfMm) / 2;

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
    return points.map((point) => ({ ...point }));
  }

  const windingSign = getContourSignedArea(points) >= 0 ? 1 : -1;
  const direction = contourKind === 'OUTER' ? -1 : 1;
  const signedOffset = direction * windingSign * compensationMm;
  const offsetSides = buildContourSides(points).map((side) => offsetContourSide(side, signedOffset));

  if (offsetSides.some((side) => !side)) {
    return points.map((point) => ({ ...point }));
  }

  const rebuilt = (offsetSides as NonNullable<(typeof offsetSides)[number]>[]).map((side, sideIndex, sides) => {
    const previousSide = sides[(sideIndex + sides.length - 1) % sides.length];
    return lineIntersection(previousSide, side);
  });

  if (rebuilt.some((point) => !point)) {
    return points.map((point) => ({ ...point }));
  }

  return rebuilt as PanelContour;
};

export const compensateClassifiedContours = (contours: ClassifiedContour[], kerfMm: number): ClassifiedContour[] => {
  const compensationMm = getKerfCompensationMm(kerfMm);

  if (compensationMm <= cornerTouchTolerance) {
    return contours.map((contour) => ({ ...contour, points: contour.points?.map((point) => ({ ...point })) }));
  }

  return contours.map((contour) => {
    const points = contour.points ?? (contour.pathD ? pathDToClosedContour(contour.pathD) ?? undefined : undefined);

    if (!points) {
      return { ...contour };
    }

    const compensatedPoints = compensateContourPoints(points, contour.kind, compensationMm);

    return {
      ...contour,
      points: compensatedPoints,
      pathD: pointsToClosedPathD(compensatedPoints),
    };
  });
};

export const buildKerfCompensatedPreviewFromFinalContours = (
  finalContourList: FinalContour[],
  kerfMm: number,
): KerfCompensationResult => {
  const contours = compensateClassifiedContours(classifyFinalContours(finalContourList), kerfMm);

  return {
    finalContourList,
    contours,
  };
};
