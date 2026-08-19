import type { Point } from '../svgUtils';

export type PanelContour = Point[];

export type ContourSide = {
  start: Point;
  end: Point;
};

export type TabSegment = {
  startDistance: number;
  endDistance: number;
};

export type DistanceInterval = {
  startDistance: number;
  endDistance: number;
};

export const cornerTouchTolerance = 0.01;

export const pointsMatch = (first: Point, second: Point) => (
  Math.abs(first.x - second.x) <= cornerTouchTolerance
  && Math.abs(first.y - second.y) <= cornerTouchTolerance
);

export const addContourPoint = (contour: PanelContour, point: Point) => {
  const previousPoint = contour[contour.length - 1];

  if (!previousPoint || !pointsMatch(previousPoint, point)) {
    contour.push(point);
  }
};

// Cleans zero-area A-B-A backtracks, including seam backtracks across the implicit SVG close path.
export const removeInteriorBacktrackSpurs = (contour: PanelContour): PanelContour => {
  const cleanedContour: PanelContour = [];

  contour.forEach((point) => {
    addContourPoint(cleanedContour, point);

    while (
      cleanedContour.length >= 3
      && pointsMatch(cleanedContour[cleanedContour.length - 3], cleanedContour[cleanedContour.length - 1])
    ) {
      cleanedContour.splice(cleanedContour.length - 2, 2);
    }
  });

  let removedClosedSpur = true;

  while (removedClosedSpur && cleanedContour.length >= 3) {
    removedClosedSpur = false;

    if (
      cleanedContour.length >= 4
      && pointsMatch(cleanedContour[cleanedContour.length - 2], cleanedContour[1])
      && pointsMatch(cleanedContour[cleanedContour.length - 1], cleanedContour[0])
    ) {
      cleanedContour.pop();
      cleanedContour.shift();
      removedClosedSpur = true;
      continue;
    }

    if (pointsMatch(cleanedContour[cleanedContour.length - 1], cleanedContour[1])) {
      cleanedContour.shift();
      removedClosedSpur = true;
    }

    if (cleanedContour.length >= 3 && pointsMatch(cleanedContour[cleanedContour.length - 2], cleanedContour[0])) {
      cleanedContour.pop();
      removedClosedSpur = true;
    }
  }

  return cleanedContour;
};

export const pointsToClosedPathD = (points: Point[]) => (
  `${points
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`)
    .join(' ')} Z`
);

export const getContourSignedArea = (contour: PanelContour) => (
  contour.reduce((area, point, index) => {
    const nextPoint = contour[(index + 1) % contour.length];
    return area + ((point.x * nextPoint.y) - (nextPoint.x * point.y));
  }, 0) / 2
);

export const buildContourSides = (contour: PanelContour): ContourSide[] => (
  contour.map((point, index) => ({
    start: { x: point.x, y: point.y },
    end: {
      x: contour[(index + 1) % contour.length].x,
      y: contour[(index + 1) % contour.length].y,
    },
  }))
);

export const offsetContourSide = (side: ContourSide, offsetDistance: number): ContourSide | null => {
  const sideLength = Math.hypot(side.end.x - side.start.x, side.end.y - side.start.y);

  if (sideLength <= cornerTouchTolerance) {
    return null;
  }

  const offsetX = (-(side.end.y - side.start.y) / sideLength) * offsetDistance;
  const offsetY = ((side.end.x - side.start.x) / sideLength) * offsetDistance;

  return {
    start: {
      x: side.start.x + offsetX,
      y: side.start.y + offsetY,
    },
    end: {
      x: side.end.x + offsetX,
      y: side.end.y + offsetY,
    },
  };
};

export const lineIntersection = (firstSide: ContourSide, secondSide: ContourSide): Point | null => {
  const firstDx = firstSide.end.x - firstSide.start.x;
  const firstDy = firstSide.end.y - firstSide.start.y;
  const secondDx = secondSide.end.x - secondSide.start.x;
  const secondDy = secondSide.end.y - secondSide.start.y;
  const denominator = (firstDx * secondDy) - (firstDy * secondDx);

  if (Math.abs(denominator) <= cornerTouchTolerance) {
    return null;
  }

  const startDx = secondSide.start.x - firstSide.start.x;
  const startDy = secondSide.start.y - firstSide.start.y;
  const firstScale = ((startDx * secondDy) - (startDy * secondDx)) / denominator;

  return {
    x: firstSide.start.x + (firstScale * firstDx),
    y: firstSide.start.y + (firstScale * firstDy),
  };
};

export const getContourSideLength = (side: ContourSide) => (
  Math.hypot(side.end.x - side.start.x, side.end.y - side.start.y)
);

export const interpolateSidePoint = (side: ContourSide, distance: number): Point => {
  const sideLength = getContourSideLength(side);

  if (sideLength <= cornerTouchTolerance) {
    return { x: side.start.x, y: side.start.y };
  }

  const distanceRatio = distance / sideLength;

  return {
    x: side.start.x + (side.end.x - side.start.x) * distanceRatio,
    y: side.start.y + (side.end.y - side.start.y) * distanceRatio,
  };
};

export const projectPointDistanceOnSide = (side: ContourSide, point: Point): number => {
  const sideLength = getContourSideLength(side);

  if (sideLength <= cornerTouchTolerance) {
    return 0;
  }

  const sideUnitX = (side.end.x - side.start.x) / sideLength;
  const sideUnitY = (side.end.y - side.start.y) / sideLength;

  return ((point.x - side.start.x) * sideUnitX) + ((point.y - side.start.y) * sideUnitY);
};

/**
 * Clips intervals measured from sourceSide.start along the source direction to a
 * parallel, same-direction target side, then rebases survivors to the projected
 * target start. Survivor order is preserved, and zero-length intersections are
 * discarded exactly without tolerance.
 */
export const clipAndRebaseDistanceIntervalsToProjectedSide = (
  sourceSide: ContourSide,
  targetSide: ContourSide,
  intervals: DistanceInterval[],
): DistanceInterval[] => {
  const trimStart = projectPointDistanceOnSide(sourceSide, targetSide.start);
  const trimEnd = projectPointDistanceOnSide(sourceSide, targetSide.end);

  return intervals.flatMap((interval) => {
    const clippedStart = Math.max(interval.startDistance, trimStart);
    const clippedEnd = Math.min(interval.endDistance, trimEnd);

    if (clippedEnd <= clippedStart) {
      return [];
    }

    return [{
      startDistance: clippedStart - trimStart,
      endDistance: clippedEnd - trimStart,
    }];
  });
};

export const getContourSideCanonicalOrientation = (side: ContourSide): 'horizontal' | 'vertical' => {
  const dx = side.end.x - side.start.x;
  const dy = side.end.y - side.start.y;

  return Math.abs(dx) >= Math.abs(dy) ? 'horizontal' : 'vertical';
};

export const isContourSideReversedFromCanonical = (side: ContourSide): boolean => (
  getContourSideCanonicalOrientation(side) === 'horizontal'
    ? side.start.x > side.end.x
    : side.start.y > side.end.y
);

export const mirrorSegments = (
  segments: TabSegment[],
  sideLength: number,
): TabSegment[] => (
  segments
    .map((segment) => ({
      startDistance: sideLength - segment.endDistance,
      endDistance: sideLength - segment.startDistance,
    }))
    .sort((first, second) => first.startDistance - second.startDistance)
);

export const createTabSegmentPlan = (
  insetLength: number,
  fingerWidthMm: number,
): TabSegment[] => {
  const safeInsetLength = Math.max(0, insetLength);
  const safeFingerWidth = Math.max(0, fingerWidthMm);

  if (safeInsetLength <= cornerTouchTolerance) {
    return [];
  }

  if (safeFingerWidth <= cornerTouchTolerance || safeInsetLength < safeFingerWidth) {
    return [{ startDistance: 0, endDistance: safeInsetLength }];
  }

  const maxInteriorSegmentCount = Math.floor((safeInsetLength - (2 * safeFingerWidth)) / safeFingerWidth);
  let interiorSegmentCount = maxInteriorSegmentCount % 2 === 0
    ? maxInteriorSegmentCount - 1
    : maxInteriorSegmentCount;

  while (interiorSegmentCount >= 1) {
    const outerLength = (safeInsetLength - (interiorSegmentCount * safeFingerWidth)) / 2;

    if (outerLength + cornerTouchTolerance >= safeFingerWidth) {
      const segments: TabSegment[] = [
        { startDistance: 0, endDistance: outerLength },
      ];

      for (let index = 0; index < interiorSegmentCount; index += 1) {
        const startDistance = outerLength + (index * safeFingerWidth);

        segments.push({
          startDistance,
          endDistance: startDistance + safeFingerWidth,
        });
      }

      segments.push({
        startDistance: safeInsetLength - outerLength,
        endDistance: safeInsetLength,
      });

      return segments;
    }

    interiorSegmentCount -= 2;
  }

  return [{ startDistance: 0, endDistance: safeInsetLength }];
};
