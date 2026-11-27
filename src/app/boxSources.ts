import type { ConstructionOperations } from './constructionOperations';
import type { ProjectDrawingDocument } from './drawingTypes';
import { drawingPanelModel } from './drawingPanelSource';
import { createInitialBoxState } from './initialBoxState';
import { createBoxDocumentV1 } from './boxDocument';
import { validatePanelManagerState } from './panelManagerModel';
import type { BoxSources, BoxStateSource, ProjectStateSource } from './projectState';
import { evaluateAppliedGeometry } from './appliedGeometry';
import { evaluateDrawingGeometry } from './drawingGeometryDependencies';
import { assignedConnectionIds } from './assignmentBuckets';
import { connectionGroups } from './connectionGroups';
import { projectDataEqual } from './projectDataEqual';
import type { PanelCompositionAuthorityMode } from './generatedGeometryAuthority';

export const IMPORTED_SOURCE = 'imported-svg';
const emptySvg = createBoxDocumentV1().content;
export const hasImportedSource = (box: BoxStateSource) => box.svgModel.content !== emptySvg || box.svgModel.panels.length > 0;
export const sameSketchRequired = 'TB/W connections are limited to panels within the same Sketch.';

const cyclic = (a: readonly string[], b: readonly string[]) => a.length === b.length && (!a.length ||
  [b, [...b].reverse()].some(order => order.some((_, offset) => a.every((id, i) => id === order[(i + offset) % order.length]))));

export function appliedGeometryInputs(box: BoxStateSource, connections = box.connections): NonNullable<BoxStateSource['appliedGeometryInputs']> {
  return structuredClone({ edgeAssignments: box.edgeAssignments, connections,
    panels: box.panelManager.panels, activeWallGroup: box.activeWallGroup });
}

function hasUnappliedAuthoring(box: BoxStateSource, inputs: NonNullable<BoxStateSource['appliedGeometryInputs']>) {
  return !projectDataEqual(box.edgeAssignments, inputs.edgeAssignments)
    || !projectDataEqual(box.panelManager.panels, inputs.panels)
    || Object.values(box.edgeAssignments).some(bucket => assignedConnectionIds(bucket)
      .some(id => !projectDataEqual(box.connections[id], inputs.connections[id])));
}

export function needsBoxGeometryApply(box: BoxStateSource) {
  if (box.panelManager.needsGeometryApply) return true;
  const source = box.svgModel.drawingSource;
  if (!source) return false;
  if (box.generatedGeometryDrawingRevision !== undefined && box.generatedGeometryDrawingRevision !== source.geometryRevision) return true;
  return box.appliedGeometryInputs ? hasUnappliedAuthoring(box, box.appliedGeometryInputs)
    : !box.generatedGeometrySnapshot.generatedGeometry.length && Object.keys(box.edgeAssignments).length > 0;
}

export function currentBoxGeometrySnapshot(box: BoxStateSource) {
  const source = box.svgModel.drawingSource;
  if (source && !isSourceApproved(box)) return undefined;
  if (source && box.generatedGeometryDrawingRevision !== undefined) {
    return box.generatedGeometryDrawingRevision === source.geometryRevision
      && projectDataEqual(box.panelManager.panels, box.appliedGeometryInputs?.panels) ? box.generatedGeometrySnapshot : undefined;
  }
  return box.panelManager.needsGeometryApply ? undefined : box.generatedGeometrySnapshot;
}

/** Membership, winding-independent contour adjacency, nesting and assigned references. */
function compatiblePanels(prior: BoxStateSource['svgModel'], next: BoxStateSource['svgModel']) {
  if (prior.panels.length !== next.panels.length) return false;
  const old = new Map(prior.panels.map(panel => [panel.id, panel]));
  return next.panels.every(panel => {
    const before = old.get(panel.id);
    return before && before.parentPanelId === panel.parentPanelId
      && cyclic(before.outerEdgeIds, panel.outerEdgeIds)
      && before.innerEdgeIds.length === panel.innerEdgeIds.length
      && before.innerEdgeIds.every(loop => panel.innerEdgeIds.some(other => cyclic(loop, other)));
  });
}

function topologyDiagnostics(box: BoxStateSource, sourceId: string) {
  const edgeIds = Object.keys(box.edgeAssignments);
  const panelIds = [...new Set(box.svgModel.edges.filter(edge => edgeIds.includes(edge.id))
    .map(edge => edge.source))];
  const assigned = new Set(Object.values(box.edgeAssignments).flatMap(assignedConnectionIds));
  const groups = (['TB', 'W', 'S'] as const).flatMap(kind => connectionGroups(box, kind)
    .filter(group => group.connectionIds.some(id => assigned.has(id)))
    .map(group => ({ groupId: group.groupId })));
  const groupedIds = new Set((['TB', 'W', 'S'] as const).flatMap(kind => connectionGroups(box, kind)
    .flatMap(group => group.connectionIds)));
  const standalone = Object.keys(box.connections).filter(id => !groupedIds.has(id) && assigned.has(id))
    .map(connectionId => ({ connectionId }));
  return [...groups, ...standalone].map(reference => ({ code: 'DRAWING_TOPOLOGY_CHANGED' as const, severity: 'error' as const,
    sourceId, ...reference, panelIds, edgeIds, message: 'Drawing panel topology changed. Review Panel Manager and reapply geometry.' }));
}

function previouslyAppliedInputs(box: BoxStateSource, mode: PanelCompositionAuthorityMode) {
  if (box.appliedGeometryInputs) return box.appliedGeometryInputs;
  // A legacy in-memory frame has no Apply stamp. Require evidence of equivalent accepted output.
  if (box.panelManager.needsGeometryApply || !box.generatedGeometrySnapshot.generatedGeometry.length) return undefined;
  try {
    if (evaluateAppliedGeometry(box, mode).snapshot === box.generatedGeometrySnapshot) return appliedGeometryInputs(box);
  } catch { /* The existing output cannot establish approval if validation fails. */ }
  return undefined;
}

/** Run inside the accepted Drawing edit. Untouched source authorities retain their identity. */
export function reconcileDrawingSources(previous: BoxSources | undefined,
  after: ProjectDrawingDocument, operations: ConstructionOperations, mode: PanelCompositionAuthorityMode = 'mixed'): BoxSources | undefined {
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
    const compatible = current && compatiblePanels(current.svgModel, svgModel) && hasAllConstructionEdges(svgModel, base.edgeAssignments);
    const geometryChanged = !current || !projectDataEqual(current.svgModel.edges, svgModel.edges)
      || !projectDataEqual(current.svgModel.panels, svgModel.panels);
    const panelManager = { ...base.panelManager, panels,
      isApplied: Boolean(compatible && base.panelManager.isApplied),
      ...(compatible && base.panelManager.isApplied && { approvedGeometryRevision: svgModel.drawingSource!.geometryRevision }),
      needsGeometryApply: Boolean(base.panelManager.needsGeometryApply || (!compatible &&
        (Object.keys(base.edgeAssignments).length || base.generatedGeometrySnapshot.generatedGeometry.length))) };
    let next: BoxStateSource = { ...base, svgModel, panelManager };
    if (!compatible) {
      next.dependencyDiagnostics = topologyDiagnostics(next, op.id);
    } else if (!geometryChanged && current.generatedGeometryDrawingRevision !== undefined
      && current.generatedGeometryDrawingRevision === current.svgModel.drawingSource?.geometryRevision) {
      next.generatedGeometryDrawingRevision = svgModel.drawingSource!.geometryRevision;
    } else if (geometryChanged && panelManager.isApplied
      && !base.dependencyDiagnostics?.some(d => d.code === 'DRAWING_TOPOLOGY_CHANGED')) {
      const inputs = previouslyAppliedInputs(base, mode);
      if (inputs && projectDataEqual(inputs.panels, panels)) {
        const approved = { ...next, edgeAssignments: inputs.edgeAssignments, connections: inputs.connections,
          activeWallGroup: inputs.activeWallGroup };
        const { snapshot, diagnostics } = evaluateDrawingGeometry(approved, op.id, mode);
        next = { ...next, generatedGeometrySnapshot: snapshot, dependencyDiagnostics: diagnostics,
          generatedGeometryDrawingRevision: svgModel.drawingSource!.geometryRevision, appliedGeometryInputs: inputs,
          panelManager: { ...panelManager, needsGeometryApply: hasUnappliedAuthoring(next, inputs) } };
      } else if (base.generatedGeometrySnapshot.generatedGeometry.length || needsBoxGeometryApply(base)) {
        next = { ...next, panelManager: { ...panelManager, needsGeometryApply: true } };
      }
    }
    sketches[op.id] = next;
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
  if (box.dependencyDiagnostics?.some(d => d.severity === 'error')) return 'Blocked · needs repair';
  if (box.panelManager.needsGeometryApply && isSourceApproved(box)) return 'BOX changes · needs Apply';
  if (isSourceApproved(box)) return 'Approved';
  if (box.panelManager.approvedGeometryRevision) return 'Changed · needs review';
  if (!box.svgModel.panels.length) return 'No supported closed Line panels';
  return 'Needs Panel Manager';
}

function hasAllConstructionEdges(model: BoxStateSource['svgModel'], assignments: BoxStateSource['edgeAssignments']) {
  const edges = new Set(model.panels.flatMap(panel => panel.outerEdgeIds));
  return Object.keys(assignments).every(id => edges.has(id));
}

export function validateDrawingApproval(box: BoxStateSource) {
  const ids = box.svgModel.panels.map(p => p.id);
  if (Object.keys(box.panelManager.panels).length !== ids.length || ids.some(id => box.panelManager.panels[id]?.panelId !== id))
    throw new Error('Panel membership changed. Review the current Sketch.');
  const error = validatePanelManagerState(box.panelManager);
  if (error) throw new Error(error);
  if (!hasAllConstructionEdges(box.svgModel, box.edgeAssignments))
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
