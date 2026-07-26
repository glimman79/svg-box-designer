import type { GeneratedGeometrySnapshot } from './generatedGeometrySnapshot';
import type { GeneratedGeometryItem } from './generatedGeometryTypes';
import { manufacturingMetadataForGeometryType } from './manufacturingMetadata';
import { pointsToClosedPathD } from './sharedGeometry';
import type { ContourDiagnostic, FinalContour, FinalContourSource } from './contourClassification';
import type { FinalGeometryType } from './finalGeometryTypes';
import { cornerTouchTolerance, getContourSignedArea } from './sharedGeometry';
import type { Point, SvgDocumentModel } from '../svgUtils';

export type FinalGeometryContour = FinalContour;

export type FinalGeometry = {
  readonly contours: ReadonlyArray<FinalGeometryContour>;
  readonly diagnostics: ReadonlyArray<ContourDiagnostic>;
};

const clonePoints = (points: Point[]) => points.map((point) => ({ ...point }));

const pointOnImportedSegment = (point: Point, start: Point, end: Point) => {
  const cross = (point.x - start.x) * (end.y - start.y) - (point.y - start.y) * (end.x - start.x);
  return Math.abs(cross) <= cornerTouchTolerance
    && point.x >= Math.min(start.x, end.x) - cornerTouchTolerance
    && point.x <= Math.max(start.x, end.x) + cornerTouchTolerance
    && point.y >= Math.min(start.y, end.y) - cornerTouchTolerance
    && point.y <= Math.max(start.y, end.y) + cornerTouchTolerance;
};

const identifyModifiedProfile = (generated: Point[], imported: Point[]): boolean[] => generated.map((start, index) => {
  const end = generated[(index + 1) % generated.length];
  return !imported.some((importedStart, importedIndex) => {
    const importedEnd = imported[(importedIndex + 1) % imported.length];
    return pointOnImportedSegment(start, importedStart, importedEnd) && pointOnImportedSegment(end, importedStart, importedEnd);
  });
});


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
  generatedGeometryOrSnapshot: ReadonlyArray<GeneratedGeometryItem> | GeneratedGeometrySnapshot,
): FinalGeometry => {
  const generatedGeometry: ReadonlyArray<GeneratedGeometryItem> = 'generatedGeometry' in generatedGeometryOrSnapshot
    ? generatedGeometryOrSnapshot.generatedGeometry
    : generatedGeometryOrSnapshot;
  const replacementByPanelId = new Map<string, { pathD: string; finalSource: FinalContourSource; geometryType: FinalGeometryType }>();
  generatedGeometry
    .filter((item) => item.behaviour.assembly === 'panel-boundary' && !!item.behaviour.replacesPanelId)
    .forEach((item) => replacementByPanelId.set(item.behaviour.replacesPanelId!, { pathD: item.geometry.pathD, finalSource: 'applied-panel', geometryType: item.manufacturingClassification }));

  const contours: FinalGeometryContour[] = svgModel.panels.flatMap((panel) => {
    const replacement = replacementByPanelId.get(panel.id);
    const outerPanelContour = panel.outerContour ?? panel.contour;
    const pathD = replacement?.pathD ?? pointsToClosedPathD(outerPanelContour);
    const generatedPoints = replacement ? pathDToClosedContourForFinalGeometry(pathD) ?? undefined : undefined;
    const outerContour: FinalGeometryContour = {
      id: `final-panel:${panel.id}`,
      source: 'final-contour',
      finalSource: replacement?.finalSource ?? 'original-panel',
      kind: 'OUTER',
      panelId: panel.id,
      ownerPanelId: panel.id,
      pathD,
      points: generatedPoints ?? clonePoints(outerPanelContour),
      ...(generatedPoints ? { compensationProfile: identifyModifiedProfile(generatedPoints, outerPanelContour) } : {}),
      ...(replacement ? { profileMaterialSide: 'GENERATED_MATING' as const } : {}),
      geometryType: replacement?.geometryType ?? 'IMPORTED_OUTER',
      manufacturing: manufacturingMetadataForGeometryType(replacement?.geometryType ?? 'IMPORTED_OUTER'),
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
      geometryType: 'IMPORTED_HOLE',
      manufacturing: manufacturingMetadataForGeometryType('IMPORTED_HOLE'),
    }));

    return [outerContour, ...innerContours];
  });

  generatedGeometry.filter((item) => item.behaviour.assembly === 'slot-cutout').forEach((item) => {
    const slotPoints = pathDToClosedContourForFinalGeometry(item.geometry.pathD) ?? undefined;
    contours.push({
      id: item.id.replace(/^generated:/, 'final-'),
      source: 'final-contour',
      finalSource: 's-slot',
      kind: 'INNER',
      ownerPanelId: item.behaviour.ownerPanelId,
      pathD: item.geometry.pathD,
      points: slotPoints,
      ...(slotPoints ? { compensationProfile: slotPoints.map(() => true) } : {}),
      profileMaterialSide: 'FEMALE',
      geometryType: item.manufacturingClassification,
      manufacturing: manufacturingMetadataForGeometryType(item.manufacturingClassification),
    });
  });

  const diagnostics = contours.flatMap(validateFinalGeometryContour);
  contours.forEach((contour) => {
    contour.points?.forEach(Object.freeze);
    if (contour.points) Object.freeze(contour.points);
    if (contour.manufacturing) Object.freeze(contour.manufacturing);
    Object.freeze(contour);
  });
  diagnostics.forEach(Object.freeze);
  return Object.freeze({ contours: Object.freeze(contours), diagnostics: Object.freeze(diagnostics) });
};
