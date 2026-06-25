import type { AppliedEPanelPath, AppliedSGeometry } from './connectionTypes';
import { buildFinalGeometry } from './finalGeometry';
import { exportFinalGeometrySvg } from './exportFinalGeometrySvg';
import type { SvgDocumentModel } from '../svgUtils';

/**
 * @deprecated Legacy adapter for callers that still hold per-tool applied geometry.
 * Build FinalGeometry with buildFinalGeometry() and export via exportFinalGeometrySvg() instead.
 */
export const exportAppliedSvg = (
  svgModel: SvgDocumentModel,
  appliedEPanelPaths: AppliedEPanelPath[],
  appliedSGeometry: AppliedSGeometry[] = [],
): string => exportFinalGeometrySvg(svgModel, buildFinalGeometry(svgModel, appliedEPanelPaths, appliedSGeometry));
