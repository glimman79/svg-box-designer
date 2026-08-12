import type { ClassifiedContour, ContourDiagnostic, FinalContour } from './contourClassification';
import type { FinalGeometry } from './finalGeometry';
import { cloneManufacturingMetadata } from './manufacturingMetadata';
import type { GeneratedProfile } from './generatedProfiles';

/** Temporary, rebuildable workspace owned exclusively by the manufacturing pipeline. */
export type ManufacturingGeometry = {
  finalContourList: FinalContour[];
  contours: ClassifiedContour[];
  diagnostics: ContourDiagnostic[];
  /** Transport-only generator shadow. Manufacturing algorithms must not read it. */
  generatedProfiles: ReadonlyArray<GeneratedProfile>;
};

const cloneFinalContour = (contour: FinalContour): FinalContour => ({
  ...contour,
  manufacturing: cloneManufacturingMetadata(contour.manufacturing),
  ...(contour.points ? { points: contour.points.map((point) => ({ ...point })) } : {}),
  ...(contour.compensationProfile ? { compensationProfile: [...contour.compensationProfile] } : {}),
  ...(contour.segmentProfileIds ? { segmentProfileIds: [...contour.segmentProfileIds] } : {}),
  ...(contour.segmentSourceEdgeIds ? { segmentSourceEdgeIds: [...contour.segmentSourceEdgeIds] } : {}),
  ...(contour.segmentTapIds ? { segmentTapIds: [...contour.segmentTapIds] } : {}),
  ...(contour.segmentTapRoles ? { segmentTapRoles: [...contour.segmentTapRoles] } : {}),
  ...(contour.diagnostics ? { diagnostics: [...contour.diagnostics] } : {}),
});

/** Starts manufacturing with an independent copy of design-intent geometry. */
export const createManufacturingGeometry = (finalGeometry: FinalGeometry): ManufacturingGeometry => ({
  finalContourList: finalGeometry.contours.map(cloneFinalContour),
  contours: [],
  diagnostics: finalGeometry.diagnostics.map((diagnostic) => ({ ...diagnostic })),
  generatedProfiles: structuredClone(finalGeometry.generatedProfiles ?? []),
});
