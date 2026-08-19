import { buildContourSides, cornerTouchTolerance, getContourSignedArea, pointsMatch, pointsToClosedPathD } from './sharedGeometry';
import type { PanelContour, TabSegment } from './sharedGeometry';
import type { EdgeRole, Point, SvgEdge, SvgPanel } from '../svgUtils';

export type PanelValidationResult =
  | { valid: true }
  | { valid: false; reason: string };

export type PanelGeometryBuildResult =
  | { ok: true; contour: PanelContour }
  | { ok: false; reason: string };

export const clonePanelContour = (panel: SvgPanel): PanelContour => (
  panel.contour.map((point) => ({ x: point.x, y: point.y }))
);

export const segmentLiesOnPanelBoundary = (panel: SvgPanel, start: Point, end: Point) => (
  buildContourSides(panel.contour).some((boundarySide) => {
    const sideX = boundarySide.end.x - boundarySide.start.x;
    const sideY = boundarySide.end.y - boundarySide.start.y;
    const sideLength = Math.hypot(sideX, sideY);

    if (sideLength <= cornerTouchTolerance) {
      return false;
    }

    return [start, end].every((point) => {
      const pointX = point.x - boundarySide.start.x;
      const pointY = point.y - boundarySide.start.y;
      const crossDistance = Math.abs((pointX * sideY) - (pointY * sideX)) / sideLength;
      const projectedDistance = ((pointX * sideX) + (pointY * sideY)) / sideLength;
      return crossDistance <= cornerTouchTolerance
        && projectedDistance >= -cornerTouchTolerance
        && projectedDistance <= sideLength + cornerTouchTolerance;
    });
  })
);

export const validatePanelContour = (contour: PanelContour): PanelGeometryBuildResult => {
  if (contour.length < 3) {
    return { ok: false, reason: 'Panel contour must contain at least 3 points.' };
  }

  for (let contourIndex = 0; contourIndex < contour.length; contourIndex += 1) {
    const point = contour[contourIndex];

    if (!point) {
      return { ok: false, reason: `Panel contour point ${contourIndex} is undefined.` };
    }

    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
      return { ok: false, reason: `Panel contour point ${contourIndex} must have finite coordinates.` };
    }

    const nextPoint = contour[(contourIndex + 1) % contour.length];

    if (!nextPoint) {
      return { ok: false, reason: 'Panel contour closed path cannot be generated because a side endpoint is missing.' };
    }

    if (Math.hypot(nextPoint.x - point.x, nextPoint.y - point.y) <= cornerTouchTolerance) {
      return { ok: false, reason: `Panel contour point ${contourIndex} duplicates the next consecutive point.` };
    }
  }

  if (Math.abs(getContourSignedArea(contour)) <= cornerTouchTolerance) {
    return { ok: false, reason: 'Panel contour polygon area must be greater than tolerance.' };
  }

  const closedPathD = pointsToClosedPathD(contour);

  if (!closedPathD.endsWith(' Z')) {
    return { ok: false, reason: 'Panel contour closed path cannot be generated.' };
  }

  return { ok: true, contour };
};

export const getTabSegmentsForRole = (
  segments: TabSegment[],
  role: EdgeRole,
): TabSegment[] => (
  segments.filter((_, segmentIndex) => (
    role === 'B'
      ? segmentIndex % 2 === 0
      : segmentIndex % 2 === 1
  ))
);

export const getContourEdgePoints = (panel: SvgPanel, contourIndex: number) => ({
  start: panel.contour[contourIndex],
  end: panel.contour[(contourIndex + 1) % panel.contour.length],
});

export const edgeMatchesContourSide = (edge: SvgEdge, start: Point, end: Point) => {
  const normalMatch = pointsMatch(edge.start, start) && pointsMatch(edge.end, end);
  const reversedMatch = pointsMatch(edge.start, end) && pointsMatch(edge.end, start);

  return {
    matches: normalMatch || reversedMatch,
    reversedMatch,
  };
};

export const validateClosedPanel = (
  panel: SvgPanel,
  edgesById: Map<string, SvgEdge>,
): PanelValidationResult => {
  if (panel.contour.length < 3) {
    return { valid: false, reason: 'Panel contour must contain at least 3 points.' };
  }

  if (panel.edgeIds.length !== panel.contour.length) {
    return { valid: false, reason: 'Panel edge count must match contour point count.' };
  }

  for (let contourIndex = 0; contourIndex < panel.contour.length; contourIndex += 1) {
    const point = panel.contour[contourIndex];

    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
      return { valid: false, reason: `Panel contour point ${contourIndex} must have finite coordinates.` };
    }
  }

  for (let contourIndex = 0; contourIndex < panel.edgeIds.length; contourIndex += 1) {
    const edgeId = panel.edgeIds[contourIndex];
    const edge = edgesById.get(edgeId);

    if (!edge) {
      return { valid: false, reason: `Panel edge ${edgeId} does not exist.` };
    }

    const { start, end } = getContourEdgePoints(panel, contourIndex);
    const contourSideMatch = edgeMatchesContourSide(edge, start, end);

    if (!contourSideMatch.matches) {
      return { valid: false, reason: `Panel edge ${edgeId} does not match contour side ${contourIndex}.` };
    }
  }

  const finalEdgeId = panel.edgeIds[panel.edgeIds.length - 1];
  const finalEdge = edgesById.get(finalEdgeId);
  const finalStart = panel.contour[panel.contour.length - 1];
  const finalEnd = panel.contour[0];

  if (!finalEdge || !edgeMatchesContourSide(finalEdge, finalStart, finalEnd).matches) {
    return { valid: false, reason: 'Panel final contour segment must close from last point to first point.' };
  }

  return { valid: true };
};
