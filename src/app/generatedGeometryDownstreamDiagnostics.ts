import type { SvgDocumentModel } from '../svgUtils';
import type { ContourDiagnostic } from './contourClassification';
import { buildFinalGeometry } from './finalGeometry';
import type { FinalGeometry } from './finalGeometry';
import type { PanelAssemblyComparisonStatus } from './generatedGeometryAssembly';
import { packageComposedPanelGeometry } from './generatedGeometryDualRun';
import type { GeneratedGeometryItem } from './generatedGeometryTypes';
import { processManufacturingGeometry } from './manufacturingCompensation';
import type { ManufacturingGeometry } from './manufacturingCompensation';
import type { PanelCandidate } from './panelComposer';

export type DownstreamFirstFailure = 'PACKAGING_FAILURE' | 'FINAL_GEOMETRY_EXCEPTION'
  | 'FINAL_GEOMETRY_ERROR_DIAGNOSTIC' | 'MANUFACTURING_EXCEPTION' | 'MANUFACTURING_ZERO_CONTOURS' | null;

export type DownstreamItemDiagnostic = Readonly<{ id: string; kind: GeneratedGeometryItem['kind']; panelId: string | null;
  toolType: GeneratedGeometryItem['toolType']; operationId: string; identity: 'raw' | 'composed' }>;

export type MixedDownstreamDiagnostic = Readonly<{
  panelId: string; assemblyStatus: PanelAssemblyComparisonStatus;
  packaging: Readonly<{ ok: boolean; inputItemIds: ReadonlyArray<string>; outputItemIds: ReadonlyArray<string>; error: string | null }>;
  finalGeometry: Readonly<{ ok: boolean; diagnosticCount: number; diagnostics: ReadonlyArray<ContourDiagnostic>; error: string | null }>;
  manufacturing: Readonly<{ ok: boolean; inputItemIds: ReadonlyArray<string>; contourCount: number | null;
    diagnostics: ReadonlyArray<ContourDiagnostic>; error: string | null }>;
  predicates: Readonly<{ packagingSucceeded: boolean; finalGeometryCompleted: boolean; noFinalGeometryErrors: boolean;
    manufacturingCompleted: boolean; hasManufacturingContours: boolean }>;
  projectAtomicItems: ReadonlyArray<DownstreamItemDiagnostic>; firstFailure: DownstreamFirstFailure;
}>;

type PanelInput = Readonly<{ panelId: string; status: PanelAssemblyComparisonStatus; candidate: PanelCandidate;
  replacementOperationIds: ReadonlyArray<string> }>;
export type DownstreamDiagnosticServices = Readonly<{
  packagePanel: typeof packageComposedPanelGeometry; buildFinal: typeof buildFinalGeometry;
  manufacture: typeof processManufacturingGeometry;
}>;
const productionServices: DownstreamDiagnosticServices = { packagePanel: packageComposedPanelGeometry,
  buildFinal: buildFinalGeometry, manufacture: processManufacturingGeometry };
const errorMessage = (error: unknown) => error instanceof Error ? error.message : String(error);
const describeItem = (item: GeneratedGeometryItem): DownstreamItemDiagnostic => Object.freeze({
  id: item.id, kind: item.kind, panelId: item.behaviour.replacesPanelId ?? item.behaviour.ownerPanelId ?? item.source.panelIds[0] ?? null,
  toolType: item.toolType, operationId: item.operationId,
  identity: item.id.startsWith('composed:panel:') || item.operationId.startsWith('composed:') ? 'composed' : 'raw',
});

/** Runs the production project-atomic gate while retaining every non-throwing result predicate. */
export const diagnoseMixedDownstream = (svgModel: SvgDocumentModel, initialItems: ReadonlyArray<GeneratedGeometryItem>,
  panels: ReadonlyArray<PanelInput>, services: DownstreamDiagnosticServices = productionServices,
): ReadonlyArray<MixedDownstreamDiagnostic> => {
  let items = initialItems;
  let packagingError: string | null = null;
  for (const panel of panels) {
    if (packagingError) break;
    try { items = services.packagePanel(items, panel.candidate, panel.replacementOperationIds); }
    catch (error) { packagingError = errorMessage(error); }
  }
  let finalGeometry: FinalGeometry | null = null; let finalError: string | null = null;
  if (!packagingError) try { finalGeometry = services.buildFinal(svgModel, items); }
  catch (error) { finalError = errorMessage(error); }
  let manufacturing: ManufacturingGeometry | null = null; let manufacturingError: string | null = null;
  if (finalGeometry) try { manufacturing = services.manufacture(finalGeometry, 0, 0, 0, [], 0); }
  catch (error) { manufacturingError = errorMessage(error); }
  const finalDiagnostics = finalGeometry?.diagnostics ?? [];
  const noFinalGeometryErrors = !!finalGeometry && !finalDiagnostics.some((entry) => entry.severity === 'error');
  const hasManufacturingContours = !!manufacturing && manufacturing.contours.length > 0;
  const firstFailure: DownstreamFirstFailure = packagingError ? 'PACKAGING_FAILURE' : finalError ? 'FINAL_GEOMETRY_EXCEPTION'
    : !noFinalGeometryErrors ? 'FINAL_GEOMETRY_ERROR_DIAGNOSTIC' : manufacturingError ? 'MANUFACTURING_EXCEPTION'
      : !hasManufacturingContours ? 'MANUFACTURING_ZERO_CONTOURS' : null;
  return panels.map((panel) => Object.freeze({ panelId: panel.panelId, assemblyStatus: panel.status,
    packaging: Object.freeze({ ok: !packagingError, inputItemIds: initialItems.map((item) => item.id),
      outputItemIds: items.map((item) => item.id), error: packagingError }),
    finalGeometry: Object.freeze({ ok: !!finalGeometry, diagnosticCount: finalDiagnostics.length,
      diagnostics: Object.freeze(finalDiagnostics.map((entry) => Object.freeze({ ...entry }))), error: finalError }),
    manufacturing: Object.freeze({ ok: !!manufacturing, inputItemIds: items.map((item) => item.id),
      contourCount: manufacturing?.contours.length ?? null,
      diagnostics: Object.freeze((manufacturing?.diagnostics ?? []).map((entry) => Object.freeze({ ...entry }))), error: manufacturingError }),
    predicates: Object.freeze({ packagingSucceeded: !packagingError, finalGeometryCompleted: !!finalGeometry,
      noFinalGeometryErrors, manufacturingCompleted: !!manufacturing, hasManufacturingContours }),
    projectAtomicItems: Object.freeze(items.map(describeItem)), firstFailure,
  }));
};
