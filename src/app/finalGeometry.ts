import type { AppliedEPanelPath, AppliedSGeometry } from './connectionTypes';
import { pointsToClosedPathD } from './sharedGeometry';
import type { ContourDiagnostic, FinalContour, FinalContourSource } from './contourClassification';
import { cornerTouchTolerance, getContourSignedArea } from './sharedGeometry';
import type { Point, SvgDocumentModel } from '../svgUtils';

export type FinalGeometryContour = FinalContour;

export type FinalGeometry = {
  contours: FinalGeometryContour[];
  diagnostics: ContourDiagnostic[];
};

const clonePoints = (points: Point[]) => points.map((point) => ({ ...point }));


const pathDToClosedContourForFinalGeometry = (pathD: string): Point[] | null => {
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

const validateFinalGeometryContour = (contour: FinalGeometryContour): ContourDiagnostic[] => {
  const diagnostics: ContourDiagnostic[] = [];
  if (!contour.points || contour.points.length < 3) diagnostics.push({ id: contour.id, message: 'Contour must be closed and contain at least 3 points.' });
  if (contour.points && contour.points.length >= 3 && Math.abs(getContourSignedArea(contour.points)) <= cornerTouchTolerance) diagnostics.push({ id: contour.id, message: 'Contour polygon area is invalid.' });
  return diagnostics;
};

export const buildFinalGeometry = (
  svgModel: SvgDocumentModel,
  appliedEPanelPaths: AppliedEPanelPath[],
  appliedSGeometry: AppliedSGeometry[],
): FinalGeometry => {
  const replacementByPanelId = new Map<string, { pathD: string; finalSource: FinalContourSource }>();
  appliedEPanelPaths.forEach((path) => replacementByPanelId.set(path.panelId, { pathD: path.pathD, finalSource: 'applied-panel' }));
  appliedSGeometry.flatMap((geometry) => geometry.panelPaths).forEach((path) => replacementByPanelId.set(path.panelId, { pathD: path.pathD, finalSource: 'applied-panel' }));

  const contours: FinalGeometryContour[] = svgModel.panels.flatMap((panel) => {
    const replacement = replacementByPanelId.get(panel.id);
    const outerPanelContour = panel.outerContour ?? panel.contour;
    const pathD = replacement?.pathD ?? pointsToClosedPathD(outerPanelContour);
    const outerContour: FinalGeometryContour = {
      id: `final-panel:${panel.id}`,
      source: 'final-contour',
      finalSource: replacement?.finalSource ?? 'original-panel',
      kind: 'OUTER',
      panelId: panel.id,
      ownerPanelId: panel.id,
      pathD,
      points: replacement ? pathDToClosedContourForFinalGeometry(pathD) ?? undefined : clonePoints(outerPanelContour),
    };

    const innerContours = (panel.innerContours ?? []).map((innerContour, index): FinalGeometryContour => ({
      id: `final-panel-hole:${panel.id}:${index}`,
      source: 'final-contour',
      finalSource: 'original-panel',
      kind: 'INNER',
      panelId: panel.id,
      ownerPanelId: panel.id,
      pathD: pointsToClosedPathD(innerContour),
      points: clonePoints(innerContour),
    }));

    return [outerContour, ...innerContours];
  });

  appliedSGeometry.flatMap((geometry) => geometry.slotPaths).forEach((slotPath, index) => {
    contours.push({
      id: `final-s-slot:${slotPath.connectionId}:${index}`,
      source: 'final-contour',
      finalSource: 's-slot',
      kind: 'INNER',
      ownerPanelId: slotPath.sourceBEdgeId,
      pathD: slotPath.pathD,
      points: pathDToClosedContourForFinalGeometry(slotPath.pathD) ?? undefined,
    });
  });

  return { contours, diagnostics: contours.flatMap(validateFinalGeometryContour) };
};
