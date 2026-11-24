import { createProjectHistory, recordWorkspaceNavigation, redoProjectHistory, transactProjectHistory, undoProjectHistory,
  type ProjectHistory, type ProjectTransaction, type ProjectTransactionAction,
  type ProjectTransactionMetadata, type ProjectTransactionResult } from './projectHistory';
import { newIdentityToken, updateSketchOperations } from './constructionOperations';
import { createInitialProjectState, createProjectOwner, type InitialProject } from './projectOwner';
import { boxStateFields, type BoxRestorationContext, type BoxStateCapture, type BoxStateSource,
  type ProjectStateCapture, type ProjectStateSource } from './projectState';
import { createEmptySketch, DEFAULT_WORKSPACE, selectWorkspace, type ProjectDrawingDocument, type SupportedWorkspace, type WorkspaceId } from './drawingTypes';

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
    && Array.isArray(doc.sketchOrder) && (doc.sketchOrder.length === 0 ? doc.activeSketchId === null : doc.activeSketchId !== null && Object.hasOwn(doc.sketches, doc.activeSketchId))
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

function initialHistoryFor({ drawingDocument, constructionOperations, box }: ProjectStateSource) {
  return createProjectHistory({ drawingDocument, constructionOperations, box: boxStateFields(box) });
}

/** Only this facade can write the mounted project owner. All roots reachable
 * from the tape have already passed admission and are immutable. */
export function createGlobalProjectHistory(initial?: InitialProject) {
  const owner = createProjectOwner(initial);
  const first = owner.getSnapshot();
  const initialHistory = initialHistoryFor(first);
  const baseline = initialHistory.current;
  if (!restorableDrawing(baseline.drawingDocument) || !restorableBox(baseline.box.data)
    || !restorableContext(baseline.box.context)) throw new TypeError('Incomplete initial project');
  const roots = new WeakMap<ProjectStateCapture, ProjectStateSource>([[baseline, first]]);
  const boxes = new WeakMap<BoxStateCapture, BoxStateSource>([[baseline.box, first.box]]);
  let publication: Readonly<{ project: ProjectStateSource; history: ProjectHistory; activeWorkspace: SupportedWorkspace; editingSketchId: string | null; epoch: number; revision: number; session: Readonly<{ startRevision: number }> }>
    = Object.freeze({ project: first, history: initialHistory, activeWorkspace: DEFAULT_WORKSPACE, editingSketchId: null, epoch: 0, revision: 0, session: Object.freeze({ startRevision: 0 }) });
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
      root = { drawingDocument: frame.drawingDocument as ProjectDrawingDocument, constructionOperations: frame.constructionOperations, box };
      roots.set(frame, root);
    }
    return root;
  }

  function publish(next: ProjectHistory, root: ProjectStateSource, operation: 'edit' | 'context' | 'navigation' | 'restore' | 'reset',
    activeWorkspace = publication.activeWorkspace, requestedSketch = publication.editingSketchId) {
    const before = publication;
    // Context follows an operation lifetime through restores, even if local IDs are reused.
    let editingSketchId = activeWorkspace === 'drawing' ? requestedSketch : null;
    if (editingSketchId !== null && (operation === 'restore' || !Object.hasOwn(root.drawingDocument.sketches, editingSketchId))) {
      const previous = before.project.constructionOperations.find(op => op.sketchId === editingSketchId);
      if (!previous || !root.constructionOperations.some(op => op.id === previous.id)) editingSketchId = null;
    }
    const invalidate = editingSketchId !== before.editingSketchId || operation === 'restore' || operation === 'reset'
      || before.project.box.svgModel !== root.box.svgModel;
    const position = Object.freeze({ project: root, history: next, activeWorkspace, editingSketchId, revision: before.revision + 1,
      epoch: before.epoch + Number(invalidate), session: operation === 'reset' ? Object.freeze({ startRevision: before.revision + 1 }) : before.session });
    // New position identity also wakes React when two same-event traversals
    // return to the same project root before a component can render.
    return owner.publishFrame(before.project, root, () => {
      publication = position;
      if (invalidate) owner.invalidateBoxImports();
    });
  }

  function commit(module: Module, label: string, action: ProjectTransactionAction,
    admit = () => true, editTarget = publication.editingSketchId): GlobalEditResult {
    if (staging) {
      staging.nest(() => 'reject');
      return { outcome: 'rejected' };
    }
    const attempt = getAttempt();
    const result = transactProjectHistory(publication.history, { module, label, id: String(++sequence) }, tx => {
      staging = tx;
      try {
        const before = tx.getCandidate();
        const decision = action(tx);
        if (decision !== 'accept') return decision;
        const after = tx.getCandidate();
        if (after.constructionOperations !== before.constructionOperations) {
          throw new TypeError('Operation maintenance belongs to the project');
        }
        if (after.drawingDocument !== before.drawingDocument) {
          const operations = updateSketchOperations(before.constructionOperations, before.drawingDocument, after.drawingDocument);
          if (operations !== before.constructionOperations) tx.update(frame => ({ ...frame, constructionOperations: operations }));
        }
        return decision;
      } finally { staging = undefined; }
    });
    if (result.outcome !== 'accepted') return result;
    if (!admit() || !isCurrent(attempt)) return { outcome: 'rejected' };
    let root: ProjectStateSource;
    try {
      root = project(result.frame);
    } catch (error) { return { outcome: 'rejected', error }; }
    return publish(result.history, root, 'edit', publication.activeWorkspace, editTarget) ? result : { outcome: 'rejected' };
  }

  function transact(module: Module, label: string, action: ProjectTransactionAction, admit?: () => boolean) {
    return commit(module, label, action, admit);
  }

  function navigate(requested: WorkspaceId, leave?: (source: SupportedWorkspace) => void) {
    const { activeWorkspace: source, session } = publication;
    const destination = selectWorkspace(source, requested);
    if (staging || source === destination || publication.editingSketchId !== null) return false;
    leave?.(source);
    // Settlement may have committed a Profile edit. Append after its publication.
    if (publication.session !== session || publication.activeWorkspace !== source || publication.editingSketchId !== null) return false;
    const next = recordWorkspaceNavigation(publication.history, source, destination);
    return publish(next, publication.project, 'navigation', destination);
  }

  function openSketch(id: string) {
    const { project, history, activeWorkspace, editingSketchId } = publication;
    if (staging || activeWorkspace !== 'drawing' || editingSketchId !== null || !Object.hasOwn(project.drawingDocument.sketches, id)) return false;
    return publish(history, project, 'context', 'drawing', id);
  }

  function finishSketch() {
    if (staging || publication.editingSketchId === null) return false;
    return publish(publication.history, publication.project, 'context', 'drawing', null);
  }

  function newSketch() {
    if (staging || publication.activeWorkspace !== 'drawing' || publication.editingSketchId !== null) return false;
    const id = 'sketch-' + newIdentityToken();
    const result = commit('drawing', 'New Sketch', tx => {
      const doc = tx.getCandidate().drawingDocument;
      const names = new Set(Object.values(doc.sketches).map(s => s.name));
      let number = doc.sketchOrder.length + 1;
      while (names.has(`Sketch ${number}`)) number++;
      const sketch = createEmptySketch(id, `Sketch ${number}`);
      tx.update(frame => ({ ...frame, drawingDocument: { ...doc, activeSketchId: id,
        sketches: { ...doc.sketches, [id]: sketch }, sketchOrder: [...doc.sketchOrder, id] } }));
      return 'accept';
    }, undefined, id);
    return result.outcome === 'accepted';
  }

  function traverse(direction: 'undo' | 'redo') {
    if (staging) return null;
    const history = publication.history;
    const result = direction === 'undo' ? undoProjectHistory(history) : redoProjectHistory(history);
    const root = roots.get(result.frame);
    const action = result.transaction;
    if (!action || !root) return null;
    const workspace = action.kind === 'edit' ? workspaceForEdit(action.module)
      : direction === 'undo' ? action.source : action.destination;
    return publish(result.history, root, 'restore', workspace) ? workspace : null;
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
    const next = initialHistoryFor(createInitialProjectState());
    return publish(next, project(next.current), 'reset', 'drawing', null);
  }

  return { getSnapshot: owner.getSnapshot, subscribe: owner.subscribe, getHistory: () => publication.history,
    getPublication: () => publication,
    drawingDocumentRef: { get current() { return owner.getSnapshot().drawingDocument; } },
    getEpoch: () => publication.epoch, getAttempt, isCurrent, transact, navigate, newSketch, openSketch, finishSketch, traverse, clearProject, setBoxContext,
    beginBoxImport: owner.beginBoxImport, isCurrentBoxImport: (token: ReturnType<typeof owner.beginBoxImport>) => publication.activeWorkspace === 'construction' && owner.isCurrentBoxImport(token), invalidateBoxImports: owner.invalidateBoxImports };
}
export type GlobalProjectHistory = ReturnType<typeof createGlobalProjectHistory>;
