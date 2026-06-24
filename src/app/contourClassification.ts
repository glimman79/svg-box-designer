import type { AppliedEPanelPath, AppliedSGeometry } from './connectionTypes';
import { pointsToClosedPathD } from './sharedGeometry';
import type { Point, SvgDocumentModel, SvgPanel } from '../svgUtils';

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

const containsPanel = (outerPanel: SvgPanel, innerPanel: SvgPanel) => {
  if (outerPanel.id === innerPanel.id || innerPanel.contour.length === 0) {
    return false;
  }

  return innerPanel.contour.every((point) => pointInContour(point, outerPanel.contour));
};

const kindForDepth = (depth: number): ContourKind => (depth % 2 === 0 ? 'OUTER' : 'INNER');

export const classifyImportedPanelContours = (svgModel: SvgDocumentModel): ClassifiedContour[] => (
  svgModel.panels.map((panel) => {
    const depth = svgModel.panels.filter((candidate) => containsPanel(candidate, panel)).length;

    return {
      id: panel.id,
      kind: kindForDepth(depth),
      source: 'imported-panel',
      panelId: panel.id,
      pathD: pointsToClosedPathD(panel.contour),
      points: panel.contour.map((point) => ({ ...point })),
      depth,
    };
  })
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
