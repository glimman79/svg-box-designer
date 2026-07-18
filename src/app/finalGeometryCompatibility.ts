import type { SvgDocumentModel } from '../svgUtils';
import type { AppliedEPanelPath, AppliedSGeometry } from './connectionTypes';
import { buildFinalGeometry as buildNativeFinalGeometry } from './finalGeometry';
import type { FinalGeometry } from './finalGeometry';
import { createGeneratedGeometrySnapshot } from './generatedGeometrySnapshot';
import type { GeneratedGeometrySnapshot } from './generatedGeometrySnapshot';
import type { GeneratedGeometryItem } from './generatedGeometryTypes';

/**
 * Compatibility-only public facade for V1 callers. Runtime code calls the native
 * Final Geometry assembler directly with generated items or a generated snapshot.
 */
export const buildFinalGeometry = (
  svgModel: SvgDocumentModel,
  generatedOrLegacy: GeneratedGeometrySnapshot | ReadonlyArray<GeneratedGeometryItem> | AppliedEPanelPath[],
  appliedSGeometry?: AppliedSGeometry[],
): FinalGeometry => (
  Array.isArray(generatedOrLegacy) && (generatedOrLegacy.length === 0 || !('geometry' in generatedOrLegacy[0]))
    ? buildNativeFinalGeometry(svgModel, createGeneratedGeometrySnapshot({
      appliedEPanelPaths: generatedOrLegacy as AppliedEPanelPath[],
      appliedSGeometry,
    }))
    : buildNativeFinalGeometry(svgModel, generatedOrLegacy as GeneratedGeometrySnapshot | ReadonlyArray<GeneratedGeometryItem>)
);
