import { pointsMatch } from './sharedGeometry';
import type { TabSegment } from './sharedGeometry';
import type { EdgeRole, Point, SvgEdge, SvgPanel } from '../svgUtils';

export type PanelValidationResult =
  | { valid: true }
  | { valid: false; reason: string };

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
