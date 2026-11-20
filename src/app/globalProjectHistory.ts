import { createProjectHistory, redoProjectHistory, transactProjectHistory, undoProjectHistory,
  type ProjectHistory, type ProjectTransaction, type ProjectTransactionAction,
  type ProjectTransactionMetadata, type ProjectTransactionResult } from './projectHistory';
import { createInitialProjectState, createProjectOwner } from './projectOwner';
import { boxStateFields, type BoxRestorationContext, type BoxStateCapture, type BoxStateSource,
  type ProjectStateCapture, type ProjectStateSource } from './projectState';
import type { DrawingDocumentV2 } from './drawingTypes';

type Module = ProjectTransactionMetadata['module'];
export const workspaceForEdit = (module: Module) => module === 'box' ? 'construction' : 'drawing';
export type GlobalEditResult = ProjectTransactionResult | { outcome: 'rejected'; error?: unknown };

const record = (value: unknown) => value !== null && typeof value === 'object' && !Array.isArray(value);

// Domain mutations validate CAD intent. This boundary checks that the installed
// frame can supply both workspace projections, including stored output/context.
const orderedRecords = (values: Readonly<Record<string, unknown>>, order: readonly string[]) =>
  record(values) && Array.isArray(order) && order.every(id => Object.hasOwn(values, id) && record(values[id]));

function restorableDrawing(doc: ProjectStateCapture['drawingDocument']) {
  return doc.schemaVersion === 2 && doc.unit === 'mm' && record(doc.sketches)
    && Array.isArray(doc.sketchOrder) && Object.hasOwn(doc.sketches, doc.activeSketchId)
    && doc.sketchOrder.every(id => Object.hasOwn(doc.sketches, id))
    && Object.values(doc.sketches).every(s => record(s.points) && orderedRecords(s.entities, s.entityOrder)
      && orderedRecords(s.dimensions, s.dimensionOrder) && orderedRecords(s.geometricConstraints, s.geometricConstraintOrder));
}

function restorableSettings(settings: BoxStateCapture['data']['projectSettings']) {
  return [settings.kerfMm, settings.profileOffsetMm, settings.slotClearanceMm, settings.tapClearanceMm].every(Number.isFinite)
    && Array.isArray(settings.selectedProfileOffsetIds);
}

function restorableBox(data: BoxStateCapture['data'], previous?: BoxStateCapture['data']) {
  const svg = data.svgModel, output = data.generatedGeometrySnapshot;
  return typeof svg.content === 'string' && typeof svg.innerMarkup === 'string' && typeof svg.viewBox === 'string'
    && Number.isFinite(svg.width) && Number.isFinite(svg.height)
    && record(svg.rootAttributes) && (svg === previous?.svgModel || (Array.isArray(svg.edges)
      && svg.edges.every(e => record(e.start) && record(e.end))
      && Array.isArray(svg.panels) && svg.panels.every(p => record(p.bounds) && Array.isArray(p.contour)
        && Array.isArray(p.edgeIds) && Array.isArray(p.innerContours))))
    && record(data.connections) && record(data.edgeAssignments) && record(data.workflowGroupOrder)
    && [data.activeTBGroup, data.activeWallGroup, data.activeSGroup].every(g => g === null || Array.isArray(g.connectionIds))
    && Array.isArray(data.completedTBGroups) && Array.isArray(data.completedWallGroups)
    && record(data.panelManager.panels) && typeof data.panelManager.isApplied === 'boolean'
    && Number.isFinite(data.panelManager.defaultThicknessMm) && typeof data.panelManager.isDirty === 'boolean'
    && restorableSettings(data.projectSettings)
    && (data.lastAppliedManufacturingSettings === null || restorableSettings(data.lastAppliedManufacturingSettings))
    && (output === previous?.generatedGeometrySnapshot || (typeof output.metadata.createdTimestamp === 'string'
      && typeof output.metadata.snapshotId === 'string' && Array.isArray(output.operations) && Array.isArray(output.generatedGeometry)
      && output.generatedGeometry.every(item => record(item.geometry) && record(item.source) && record(item.behaviour))));
}

function restorableContext(context: BoxStateCapture['context']) {
  return [context.selectedEdgeId, context.displayConnectionId, context.assignmentTargetConnectionId]
    .every(value => value === null || typeof value === 'string');
}

/** Only this facade can write the mounted project owner. All roots reachable
 * from the tape have already passed admission and are immutable. */
export function createGlobalProjectHistory(initial?: ProjectStateSource) {
  const owner = createProjectOwner(initial);
  const first = owner.getSnapshot();
  const initialHistory = createProjectHistory({ drawingDocument: first.drawingDocument, box: boxStateFields(first.box) });
  const baseline = initialHistory.current;
  if (!restorableDrawing(baseline.drawingDocument) || !restorableBox(baseline.box.data)
    || !restorableContext(baseline.box.context)) throw new TypeError('Incomplete initial project');
  const roots = new WeakMap<ProjectStateCapture, ProjectStateSource>([[baseline, first]]);
  const boxes = new WeakMap<BoxStateCapture, BoxStateSource>([[baseline.box, first.box]]);
  let publication: Readonly<{ project: ProjectStateSource; history: ProjectHistory; epoch: number; revision: number; session: Readonly<{ startRevision: number }> }>
    = Object.freeze({ project: first, history: initialHistory, epoch: 0, revision: 0, session: Object.freeze({ startRevision: 0 }) });
  let sequence = 0;
  let staging: ProjectTransaction | undefined;
  const getAttempt = () => ({ session: publication.session, revision: publication.revision });
  const isCurrent = (attempt: ReturnType<typeof getAttempt>) =>
    attempt.session === publication.session && attempt.revision === publication.revision;

  function project(frame: ProjectStateCapture) {
    let root = roots.get(frame);
    if (!root) {
      if ((frame.drawingDocument !== publication.history.current.drawingDocument && !restorableDrawing(frame.drawingDocument))
        || (frame.box.data !== publication.history.current.box.data && !restorableBox(frame.box.data, publication.history.current.box.data))
        || !restorableContext(frame.box.context)) throw new TypeError('Incomplete project frame');
      let box = boxes.get(frame.box);
      if (!box) {
        box = { ...frame.box.data, ...frame.box.context } as BoxStateSource;
        boxes.set(frame.box, box);
      }
      root = { drawingDocument: frame.drawingDocument as DrawingDocumentV2, box };
      roots.set(frame, root);
    }
    return root;
  }

  function publish(next: ProjectHistory, root: ProjectStateSource, operation: 'edit' | 'context' | 'restore' | 'reset') {
    const before = publication;
    const invalidate = operation === 'restore' || operation === 'reset'
      || before.project.box.svgModel !== root.box.svgModel;
    const position = Object.freeze({ project: root, history: next, revision: before.revision + 1,
      epoch: before.epoch + Number(invalidate), session: operation === 'reset' ? Object.freeze({ startRevision: before.revision + 1 }) : before.session });
    // New position identity also wakes React when two same-event traversals
    // return to the same project root before a component can render.
    return owner.publishFrame(before.project, root, () => {
      publication = position;
      if (invalidate) owner.invalidateBoxImports();
    });
  }

  function transact(module: Module, label: string, action: ProjectTransactionAction,
    admit = () => true): GlobalEditResult {
    if (staging) {
      staging.nest(() => 'reject');
      return { outcome: 'rejected' };
    }
    const attempt = getAttempt();
    const result = transactProjectHistory(publication.history, { module, label, id: String(++sequence) }, tx => {
      staging = tx;
      try { return action(tx); } finally { staging = undefined; }
    });
    if (result.outcome !== 'accepted') return result;
    if (!admit() || !isCurrent(attempt)) return { outcome: 'rejected' };
    let root: ProjectStateSource;
    try {
      root = project(result.frame);
    } catch (error) { return { outcome: 'rejected', error }; }
    return publish(result.history, root, 'edit') ? result : { outcome: 'rejected' };
  }

  function traverse(direction: 'undo' | 'redo') {
    if (staging) return null;
    const history = publication.history;
    const result = direction === 'undo' ? undoProjectHistory(history) : redoProjectHistory(history);
    const root = roots.get(result.frame);
    if (!result.transaction || !root || !publish(result.history, root, 'restore')) return null;
    return workspaceForEdit(result.transaction.module);
  }

  function setBoxContext(patch: Partial<BoxRestorationContext>) {
    const history = publication.history;
    const frame = history.current;
    const previous = frame.box.context;
    const { selectedEdgeId = previous.selectedEdgeId, displayConnectionId = previous.displayConnectionId,
      assignmentTargetConnectionId = previous.assignmentTargetConnectionId } = patch;
    if (selectedEdgeId === previous.selectedEdgeId && displayConnectionId === previous.displayConnectionId
      && assignmentTargetConnectionId === previous.assignmentTargetConnectionId) return;
    const context = { selectedEdgeId, displayConnectionId, assignmentTargetConnectionId };
    // Only three primitive interaction IDs change. Both stacks and all data are shared.
    const current = Object.freeze({ ...frame, box: Object.freeze({ data: frame.box.data, context: Object.freeze(context) }) });
    publish(Object.freeze({ ...history, current }), project(current), 'context');
  }

  function clearProject(expectedSession = publication.session) {
    if (staging || expectedSession !== publication.session) return false;
    const { drawingDocument, box } = createInitialProjectState();
    const next = createProjectHistory({ drawingDocument, box: boxStateFields(box) });
    return publish(next, project(next.current), 'reset');
  }

  return { getSnapshot: owner.getSnapshot, subscribe: owner.subscribe, getHistory: () => publication.history,
    getPublication: () => publication,
    drawingDocumentRef: { get current() { return owner.getSnapshot().drawingDocument; } },
    getEpoch: () => publication.epoch, getAttempt, isCurrent, transact, traverse, clearProject, setBoxContext,
    beginBoxImport: owner.beginBoxImport, isCurrentBoxImport: owner.isCurrentBoxImport, invalidateBoxImports: owner.invalidateBoxImports };
}
export type GlobalProjectHistory = ReturnType<typeof createGlobalProjectHistory>;
