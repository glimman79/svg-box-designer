import type { AppliedEPanelPath, AppliedSGeometry } from './connectionTypes';
import { cornerTouchTolerance, pointsToClosedPathD } from './sharedGeometry';
import type { Point, SvgDocumentModel } from '../svgUtils';

export type ContourKind = 'OUTER' | 'INNER';

export type ClassifiedContourSource =
  | 'imported-panel'
  | 'applied-e-panel'
  | 'applied-s-panel'
  | 'applied-s-slot';

export type ClassifiedContour = {
  id: string;
  kind: ContourKind;
  source: ClassifiedContourSource;
  ownerPanelId?: string;
  panelId?: string;
  pathD?: string;
  points?: Point[];
  depth?: number;
};

const pointOnSegment = (point: Point, start: Point, end: Point) => {
  const cross = (point.y - start.y) * (end.x - start.x) - (point.x - start.x) * (end.y - start.y);
  if (Math.abs(cross) > 0.000001) {
    return false;
  }

  const dot = (point.x - start.x) * (end.x - start.x) + (point.y - start.y) * (end.y - start.y);
  if (dot < 0) {
    return false;
  }

  const lengthSquared = (end.x - start.x) ** 2 + (end.y - start.y) ** 2;
  return dot <= lengthSquared;
};

const pointInContour = (point: Point, contour: Point[]) => {
  if (contour.length < 3) {
    return false;
  }

  let inside = false;
  for (let index = 0, previousIndex = contour.length - 1; index < contour.length; previousIndex = index, index += 1) {
    const current = contour[index];
    const previous = contour[previousIndex];

    if (pointOnSegment(point, previous, current)) {
      return true;
    }

    const intersects = (current.y > point.y) !== (previous.y > point.y)
      && point.x < ((previous.x - current.x) * (point.y - current.y)) / (previous.y - current.y) + current.x;

    if (intersects) {
      inside = !inside;
    }
  }

  return inside;
};

const contourContainsContour = (outerId: string, outerContour: Point[], innerId: string, innerContour: Point[]) => {
  if (outerId === innerId || outerContour.length < 3 || innerContour.length < 3) {
    return false;
  }

  return innerContour.every((point) => pointInContour(point, outerContour));
};

const pathDToClosedContourForClassification = (pathD: string): Point[] | null => {
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

const hasSemanticAppliedContourRole = (contour: ClassifiedContour) => (
  contour.source === 'applied-e-panel'
  || contour.source === 'applied-s-panel'
  || contour.source === 'applied-s-slot'
);

export const classifyContoursByContainment = (contours: ClassifiedContour[]): ClassifiedContour[] => {
  const contoursWithPoints = contours.map((contour) => ({
    ...contour,
    points: contour.points?.map((point) => ({ ...point })) ?? (contour.pathD ? pathDToClosedContourForClassification(contour.pathD) ?? undefined : undefined),
  }));

  return contoursWithPoints.map((contour) => {
    if (hasSemanticAppliedContourRole(contour)) {
      return {
        ...contour,
        depth: undefined,
      };
    }

    const containingContour = contour.points
      ? contoursWithPoints.find((candidate) => (
        candidate.points
          ? contourContainsContour(candidate.id, candidate.points, contour.id, contour.points as Point[])
          : false
      ))
      : undefined;

    return {
      ...contour,
      kind: containingContour ? 'INNER' : 'OUTER',
      depth: containingContour ? 1 : 0,
    };
  });
};


export const classifyImportedPanelContours = (svgModel: SvgDocumentModel): ClassifiedContour[] => classifyContoursByContainment(
  svgModel.panels.map((panel) => ({
    id: panel.id,
    kind: 'OUTER',
    source: 'imported-panel',
    panelId: panel.id,
    pathD: pointsToClosedPathD(panel.contour),
    points: panel.contour.map((point) => ({ ...point })),
  })),
);

export const classifyAppliedContours = (
  appliedEPanelPaths: AppliedEPanelPath[],
  appliedSGeometry: AppliedSGeometry[],
): ClassifiedContour[] => [
  ...appliedEPanelPaths.map((path): ClassifiedContour => ({
    id: `applied-e:${path.panelId}`,
    kind: 'OUTER',
    source: 'applied-e-panel',
    panelId: path.panelId,
    ownerPanelId: path.panelId,
    pathD: path.pathD,
  })),
  ...appliedSGeometry.flatMap((geometry) => [
    ...geometry.panelPaths.map((path): ClassifiedContour => ({
      id: `applied-s-panel:${geometry.connectionId}:${path.panelId}`,
      kind: 'OUTER',
      source: 'applied-s-panel',
      panelId: path.panelId,
      ownerPanelId: path.panelId,
      pathD: path.pathD,
    })),
    ...geometry.slotPaths.map((path, index): ClassifiedContour => ({
      id: `applied-s-slot:${geometry.connectionId}:${index}`,
      kind: 'INNER',
      source: 'applied-s-slot',
      ownerPanelId: path.sourceBEdgeId,
      pathD: path.pathD,
    })),
  ]),
];
