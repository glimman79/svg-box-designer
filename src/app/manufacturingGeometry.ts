import type { ClassifiedContour, ContourDiagnostic, FinalContour } from './contourClassification';
import type { FinalGeometry } from './finalGeometry';
import { cloneManufacturingMetadata } from './manufacturingMetadata';

/** Temporary, rebuildable workspace owned exclusively by the manufacturing pipeline. */
export type ManufacturingGeometry = {
  finalContourList: FinalContour[];
  contours: ClassifiedContour[];
  diagnostics: ContourDiagnostic[];
};

const cloneFinalContour = (contour: FinalContour): FinalContour => ({
  ...contour,
  manufacturing: cloneManufacturingMetadata(contour.manufacturing),
  ...(contour.points ? { points: contour.points.map((point) => ({ ...point })) } : {}),
  ...(contour.diagnostics ? { diagnostics: [...contour.diagnostics] } : {}),
});

/** Starts manufacturing with an independent copy of design-intent geometry. */
export const createManufacturingGeometry = (finalGeometry: FinalGeometry): ManufacturingGeometry => ({
  finalContourList: finalGeometry.contours.map(cloneFinalContour),
  contours: [],
  diagnostics: finalGeometry.diagnostics.map((diagnostic) => ({ ...diagnostic })),
});
