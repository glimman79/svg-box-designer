import type { ConstructionOperations } from './constructionOperations';
import type { ProjectDrawingDocument } from './drawingTypes';
import { drawingPanelModel } from './drawingPanelSource';
import { createInitialBoxState } from './initialBoxState';
import { createBoxDocumentV1 } from './boxDocument';
import { validatePanelManagerState } from './panelManagerModel';
import type { BoxSources, BoxStateSource, ProjectStateSource } from './projectState';

export const IMPORTED_SOURCE = 'imported-svg';
const emptySvg = createBoxDocumentV1().content;
export const hasImportedSource = (box: BoxStateSource) => box.svgModel.content !== emptySvg || box.svgModel.panels.length > 0;
export const sameSketchRequired = 'TB/W connections are limited to panels within the same Sketch.';

/** Run inside the accepted Drawing edit. Untouched source authorities retain their identity. */
export function reconcileDrawingSources(previous: BoxSources | undefined,
  after: ProjectDrawingDocument, operations: ConstructionOperations): BoxSources | undefined {
  if (!operations.length) return undefined;
  let changed = operations.length !== Object.keys(previous?.sketches ?? {}).length;
  const sketches: BoxSources['sketches'] = {};
  for (const op of operations) {
    const current = previous?.sketches[op.id];
    const sketch = after.sketches[op.sketchId];
    if (current && current.svgModel.drawingSource?.geometryRevision === (op.geometryRevision ?? op.definitionRevision)) {
      sketches[op.id] = current;
      continue;
    }
    const base = current ?? createInitialBoxState();
    const svgModel = drawingPanelModel(sketch, op);
    const panels = Object.fromEntries(svgModel.panels.map(p => [p.id, base.panelManager.panels[p.id] ?? { panelId: p.id, thicknessMm: 0 }]));
    sketches[op.id] = { ...base, svgModel, panelManager: { ...base.panelManager, panels, isApplied: false,
      needsGeometryApply: Boolean(Object.keys(base.edgeAssignments).length || base.panelManager.needsGeometryApply || base.generatedGeometrySnapshot.generatedGeometry.length) } };
    changed = true;
  }
  if (!changed) return previous;
  let selection = previous?.selection;
  if (selection && selection.id !== IMPORTED_SOURCE) {
    if (!sketches[selection.id]) selection = undefined;
  }
  return { sketches, selection };
}

export function isSourceApproved(box: BoxStateSource) {
  const source = box.svgModel.drawingSource;
  return box.panelManager.isApplied && (!source || source.geometryRevision === box.panelManager.approvedGeometryRevision);
}

export function getBoxScope(project: Pick<ProjectStateSource, 'box' | 'boxSources'>) {
  const sources = project.boxSources;
  const sketches = Object.entries(sources?.sketches ?? {});
  const eligible = sketches.filter(([, box]) => box.svgModel.panels.length);
  const imported = hasImportedSource(project.box);
  const firstDrawing = eligible[0] ?? sketches.find(([, box]) => box.svgModel.drawingSource?.excludedMembers);
  const defaultId = imported || !firstDrawing ? IMPORTED_SOURCE : firstDrawing[0];
  const selected = sources?.selection?.id;
  const id = selected && (selected === IMPORTED_SOURCE ? imported : sources?.sketches[selected]?.svgModel?.drawingSource?.operationId === selected)
    ? selected : defaultId;
  const box = sources?.sketches[id] ?? project.box;
  const working = isSourceApproved(box);
  return { id, box, working };
}

export function sourceStatus(box: BoxStateSource) {
  if (isSourceApproved(box)) return 'Approved';
  if (box.panelManager.approvedGeometryRevision) return 'Changed · needs review';
  if (!box.svgModel.panels.length) return 'No supported closed Line panels';
  return 'Needs Panel Manager';
}

export function validateDrawingApproval(box: BoxStateSource) {
  const ids = box.svgModel.panels.map(p => p.id);
  if (Object.keys(box.panelManager.panels).length !== ids.length || ids.some(id => box.panelManager.panels[id]?.panelId !== id))
    throw new Error('Panel membership changed. Review the current Sketch.');
  const error = validatePanelManagerState(box.panelManager);
  if (error) throw new Error(error);
  const edges = new Set(box.svgModel.panels.flatMap(panel => panel.outerEdgeIds));
  if (Object.keys(box.edgeAssignments).some(id => !edges.has(id)))
    throw new Error('A construction edge is missing. Restore the Sketch geometry before reapplying Panel Manager.');
}

/** Check writes at the project boundary, including direct transactions and delayed callbacks. */
export function validateSourceEdit(before: ProjectStateSource, sketches: BoxSources['sketches'] | undefined) {
  const previous = before.boxSources?.sketches;
  if (previous === sketches) return;
  const scope = getBoxScope(before);
  if (!sketches || !previous || Object.keys(sketches).length !== Object.keys(previous).length)
    throw new Error('Drawing owns the Sketch source list.');
  for (const [id, prior] of Object.entries(previous)) {
    const next = sketches[id];
    if (next === prior) continue;
    if (id !== scope.id || !next || next.svgModel !== prior.svgModel)
      throw new Error(sameSketchRequired);
    if (next.edgeAssignments !== prior.edgeAssignments) {
      const edges = new Set(prior.svgModel.panels.flatMap(panel => panel.outerEdgeIds));
      if (Object.keys(next.edgeAssignments).some(edge => !edges.has(edge))) throw new Error(sameSketchRequired);
    }
    if (!scope.working) {
      // Only Panel Manager and inspection may change before a working Sketch is chosen.
      const allowed = ['panelManager', 'selectedEdgeId', 'displayConnectionId', 'assignmentTargetConnectionId'];
      if ((Object.keys(prior) as (keyof BoxStateSource)[]).some(key => !allowed.includes(key) && next[key] !== prior[key]))
        throw new Error('Choose an approved Sketch before construction.');
    }
    if (next.panelManager.isApplied && next.panelManager !== prior.panelManager) {
      validateDrawingApproval(next);
      if (!isSourceApproved(next)) throw new Error('Review the current Sketch geometry in Panel Manager.');
    }
  }
}
