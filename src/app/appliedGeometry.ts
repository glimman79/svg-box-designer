import type { BoxStateSource } from './projectState';
import type { PanelCompositionAuthorityMode } from './generatedGeometryAuthority';
import { selectGeneratedGeometryAuthority } from './generatedGeometryAuthority';
import { createGeneratedGeometrySnapshot, retainEquivalentSnapshot } from './generatedGeometrySnapshot';
import { validateGeometryAuthoring } from './authoringRelationships';
import { validateWallAuthoringForApply } from './wallAuthoring';
import { recalculateAutomaticSSlotLengths, buildGeneratedSGeometryItems } from './sGeometry';
import { recalculateAutomaticTBFingerWidths, buildGeneratedTBGeometryItems, validateCurrentTBEdgeCompatibility, validateGeneratedTBContributions } from './tbGeometry';
import { buildGeneratedWGeometryItems } from './wallGeometry';
import type { GeneratedGeometrySnapshot } from './generatedGeometrySnapshot';
import type { SvgDocumentModel } from '../svgUtils';
import type { GeneratedGeometryItem } from './generatedGeometryTypes';

/** The same complete, same-panel batches are evaluated for Apply and Drawing continuation. */
export function evaluateAppliedGeometry(box: BoxStateSource, mode: PanelCompositionAuthorityMode,
  selectSnapshot?: (model: SvgDocumentModel, items: GeneratedGeometryItem[], previous: GeneratedGeometrySnapshot) => GeneratedGeometrySnapshot) {
  const { svgModel, edgeAssignments, panelManager } = box;
  const slots = recalculateAutomaticSSlotLengths(svgModel, edgeAssignments, box.connections, panelManager);
  const connections = recalculateAutomaticTBFingerWidths(svgModel, edgeAssignments, slots, panelManager);
  validateGeometryAuthoring(svgModel, edgeAssignments, connections, mode);
  validateWallAuthoringForApply(svgModel, edgeAssignments, connections, box.activeWallGroup);
  validateCurrentTBEdgeCompatibility(svgModel, edgeAssignments, connections);
  const tbGeneratedItems = buildGeneratedTBGeometryItems(svgModel, edgeAssignments, connections, panelManager);
  validateGeneratedTBContributions(edgeAssignments, connections, tbGeneratedItems);
  const wGeneratedItems = buildGeneratedWGeometryItems(svgModel, edgeAssignments, connections, panelManager);
  const sGeneratedItems = buildGeneratedSGeometryItems(svgModel, edgeAssignments, connections, panelManager);
  const items = [...tbGeneratedItems, ...wGeneratedItems, ...sGeneratedItems];
  const authority = selectSnapshot ? undefined : selectGeneratedGeometryAuthority(svgModel, items, mode);
  if (authority && !authority.ok) {
    const reasons = authority.blockingDecisions.map(decision => `${decision.panelId}: ${decision.reason}`).join('; ');
    throw new Error(`Unable to compose panel geometry: ${reasons}`);
  }
  const snapshot = selectSnapshot ? selectSnapshot(svgModel, items, box.generatedGeometrySnapshot)
    : retainEquivalentSnapshot(box.generatedGeometrySnapshot, createGeneratedGeometrySnapshot({
      generatedGeometry: [...authority!.generatedGeometry], panelCompositionModel: authority!.panelCompositionModel,
    }));
  return { connections, tbGeneratedItems, wGeneratedItems, sGeneratedItems, items, authority, snapshot };
}
