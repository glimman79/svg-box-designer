import type { AppliedEPanelPath, AppliedSGeometry } from './connectionTypes';
import { buildFinalGeometry } from './finalGeometry';
import { cornerTouchTolerance, getContourSignedArea, pointsToClosedPathD } from './sharedGeometry';
import type { Point, SvgDocumentModel } from '../svgUtils';

export type ContourKind = 'OUTER' | 'INNER';

export type ClassifiedContourSource = 'final-contour';

export type FinalContourSource = 'original-panel' | 'applied-panel' | 's-slot';

export type ClassifiedContour = {
  id: string;
  kind: ContourKind;
  source: ClassifiedContourSource;
  ownerPanelId?: string;
  panelId?: string;
  pathD?: string;
  points?: Point[];
  depth?: number;
  finalSource?: FinalContourSource;
  diagnostics?: string[];
};

export type FinalContour = Omit<ClassifiedContour, 'source' | 'depth'> & {
  source: 'final-contour';
  finalSource: FinalContourSource;
};

export type ContourDiagnostic = {
  id: string;
  message: string;
};

export type FinalContourListResult = {
  contours: FinalContour[];
  diagnostics: ContourDiagnostic[];
};

const clonePoints = (points: Point[]) => points.map((point) => ({ ...point }));

const pointOnSegment = (point: Point, start: Point, end: Point) => {
  const cross = (point.y - start.y) * (end.x - start.x) - (point.x - start.x) * (end.y - start.y);
  if (Math.abs(cross) > 0.000001) return false;
  const dot = (point.x - start.x) * (end.x - start.x) + (point.y - start.y) * (end.y - start.y);
  if (dot < 0) return false;
  const lengthSquared = (end.x - start.x) ** 2 + (end.y - start.y) ** 2;
  return dot <= lengthSquared;
};

const pointInContour = (point: Point, contour: Point[]) => {
  if (contour.length < 3) return false;
  let inside = false;
  for (let index = 0, previousIndex = contour.length - 1; index < contour.length; previousIndex = index, index += 1) {
    const current = contour[index];
    const previous = contour[previousIndex];
    if (pointOnSegment(point, previous, current)) return true;
    const intersects = (current.y > point.y) !== (previous.y > point.y)
      && point.x < ((previous.x - current.x) * (point.y - current.y)) / (previous.y - current.y) + current.x;
    if (intersects) inside = !inside;
  }
  return inside;
};

const contourContainsContour = (outerId: string, outerContour: Point[], innerId: string, innerContour: Point[]) => {
  if (outerId === innerId || outerContour.length < 3 || innerContour.length < 3) return false;
  return innerContour.every((point) => pointInContour(point, outerContour));
};

export const pathDToClosedContourForClassification = (pathD: string): Point[] | null => {
  const tokens = pathD.match(/[a-zA-Z]|[-+]?\d*\.?\d+(?:e[-+]?\d+)?/gi) ?? [];
  const points: Point[] = [];
  let index = 0;
  let command = '';
  let sawClose = false;

  while (index < tokens.length) {
    const token = tokens[index];
    if (/^[a-zA-Z]$/.test(token)) {
      command = token;
      index += 1;
      if (command.toUpperCase() === 'Z') {
        sawClose = true;
        break;
      }
      continue;
    }
    if (command.toUpperCase() !== 'M' && command.toUpperCase() !== 'L') return null;
    const x = Number(token);
    const y = Number(tokens[index + 1]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    points.push({ x, y });
    index += 2;
  }

  if (points.length > 1) {
    const first = points[0];
    const last = points[points.length - 1];
    if (Math.abs(first.x - last.x) <= cornerTouchTolerance && Math.abs(first.y - last.y) <= cornerTouchTolerance) {
      points.pop();
      sawClose = true;
    }
  }

  return sawClose && points.length >= 3 ? points : null;
};

const validateContour = (id: string, points?: Point[]) => {
  const diagnostics: ContourDiagnostic[] = [];
  if (!points || points.length < 3) diagnostics.push({ id, message: 'Contour must be closed and contain at least 3 points.' });
  if (points && points.length >= 3 && Math.abs(getContourSignedArea(points)) <= cornerTouchTolerance) diagnostics.push({ id, message: 'Contour polygon area is invalid.' });
  return diagnostics;
};

export const buildFinalContourList = (
  svgModel: SvgDocumentModel,
  appliedEPanelPaths: AppliedEPanelPath[],
  appliedSGeometry: AppliedSGeometry[],
): FinalContourListResult => buildFinalGeometry(svgModel, appliedEPanelPaths, appliedSGeometry);

type ContourClassificationInput = Omit<ClassifiedContour, 'kind'> & Partial<Pick<ClassifiedContour, 'kind'>>;

export const classifyContoursByContainment = (contours: ContourClassificationInput[]): ClassifiedContour[] => {
  const contoursWithPoints = contours.map((contour) => ({
    ...contour,
    source: 'final-contour' as const,
    points: contour.points ? clonePoints(contour.points) : (contour.pathD ? pathDToClosedContourForClassification(contour.pathD) ?? undefined : undefined),
  }));

  return contoursWithPoints.map((contour) => {
    if (contour.kind) {
      return { ...contour, kind: contour.kind, depth: contour.kind === 'INNER' ? 1 : 0 };
    }

    const containingContour = contour.points
      ? contoursWithPoints.find((candidate) => (candidate.points ? contourContainsContour(candidate.id, candidate.points, contour.id, contour.points as Point[]) : false))
      : undefined;
    return { ...contour, kind: containingContour ? 'INNER' : 'OUTER', depth: containingContour ? 1 : 0 };
  });
};

export const classifyFinalContours = (contours: FinalContour[]): ClassifiedContour[] => classifyContoursByContainment(contours);

export const classifyImportedPanelContours = (svgModel: SvgDocumentModel): ClassifiedContour[] => classifyContoursByContainment(
  svgModel.panels.flatMap((panel) => [
    {
      id: `final-panel:${panel.id}`,
      source: 'final-contour' as const,
      finalSource: 'original-panel' as const,
      panelId: panel.id,
      ownerPanelId: panel.id,
      pathD: pointsToClosedPathD(panel.outerContour ?? panel.contour),
      points: clonePoints(panel.outerContour ?? panel.contour),
    },
    ...(panel.innerContours ?? []).map((innerContour, index) => ({
      id: `final-panel-hole:${panel.id}:${index}`,
      source: 'final-contour' as const,
      finalSource: 'original-panel' as const,
      kind: 'INNER' as const,
      panelId: panel.id,
      ownerPanelId: panel.id,
      pathD: pointsToClosedPathD(innerContour),
      points: clonePoints(innerContour),
    })),
  ]),
);

/**
 * Compatibility/test-only helper for legacy tests that still classify pre-final
 * applied E/S geometry directly. Runtime geometry should prefer
 * buildFinalContourList()/classifyFinalContours() so every contour is classified
 * from the Final Geometry contract.
 */
export const classifyAppliedContours = (
  appliedEPanelPaths: AppliedEPanelPath[],
  appliedSGeometry: AppliedSGeometry[],
): ClassifiedContour[] => classifyContoursByContainment([
  ...appliedEPanelPaths.map((path): FinalContour => ({ id: `final-applied-panel:${path.panelId}`, source: 'final-contour', finalSource: 'applied-panel', kind: 'OUTER', panelId: path.panelId, ownerPanelId: path.panelId, pathD: path.pathD, points: pathDToClosedContourForClassification(path.pathD) ?? undefined })),
  ...appliedSGeometry.flatMap((geometry) => [
    ...geometry.panelPaths.map((path): FinalContour => ({ id: `final-applied-s-panel:${geometry.connectionId}:${path.panelId}`, source: 'final-contour', finalSource: 'applied-panel', kind: 'OUTER', panelId: path.panelId, ownerPanelId: path.panelId, pathD: path.pathD, points: pathDToClosedContourForClassification(path.pathD) ?? undefined })),
    ...geometry.slotPaths.map((path, index): FinalContour => ({ id: `final-s-slot:${geometry.connectionId}:${index}`, source: 'final-contour', finalSource: 's-slot', kind: 'INNER', ownerPanelId: path.sourceBEdgeId, pathD: path.pathD, points: pathDToClosedContourForClassification(path.pathD) ?? undefined })),
  ]),
]);
