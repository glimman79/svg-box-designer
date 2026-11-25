import { reconcileChronology } from './operationChronology';
import { createProjectHistory, recordWorkspaceNavigation, redoProjectHistory, transactProjectHistory, undoProjectHistory,
  type ProjectHistory, type ProjectTransaction, type ProjectTransactionAction,
  type ProjectTransactionMetadata, type ProjectTransactionResult } from './projectHistory';
import { getBoxScope, IMPORTED_SOURCE, hasImportedSource, reconcileDrawingSources, sameSketchRequired, validateSourceEdit } from './boxSources';
import type { BoxProjectData, BoxSources } from './projectState';
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

const chronologyDefinitions = (frame: ProjectStateCapture) => ({
  constructionOperations: frame.constructionOperations,
  box: frame.box.data as BoxProjectData,
  boxSources: frame.boxSources as BoxSources | undefined,
});

function initialHistoryFor({ chronology, drawingDocument, constructionOperations, box, boxSources }: ProjectStateSource) {
  return createProjectHistory({ chronology, drawingDocument, constructionOperations, ...(boxSources && { boxSources }), box: boxStateFields(box) });
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
        || !restorableContext(frame.box.context)
        || (frame.boxSources !== publication.history.current.boxSources && Object.entries(frame.boxSources?.sketches ?? {}).some(([id, box]) => {
          const prior = publication.history.current.boxSources?.sketches[id];
          return box !== prior && (!restorableBox(box, prior) || !restorableContext(box));
        }))) throw new TypeError('Incomplete project frame');
      let box = boxes.get(frame.box);
      if (!box) {
        box = { ...frame.box.data, ...frame.box.context } as BoxStateSource;
        boxes.set(frame.box, box);
      }
      root = { chronology: frame.chronology, ...(frame.boxSources && { boxSources: frame.boxSources as BoxSources }), drawingDocument: frame.drawingDocument as ProjectDrawingDocument, constructionOperations: frame.constructionOperations, box };
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
      || before.project.box.svgModel !== root.box.svgModel
      || (activeWorkspace === 'construction' && (getBoxScope(before.project).box.svgModel !== getBoxScope(root).box.svgModel
        || getBoxScope(before.project).working !== getBoxScope(root).working));
    const position = Object.freeze({ project: root, history: next, activeWorkspace, editingSketchId, revision: before.revision + 1,
      epoch: before.epoch + Number(invalidate), session: operation === 'reset' ? Object.freeze({ startRevision: before.revision + 1 }) : before.session });
    // New position identity also wakes React when two same-event traversals
    // return to the same project root before a component can render.
    return owner.publishFrame(before.project, root, () => {
      publication = position;
      if (invalidate) owner.invalidateBoxImports();
    });
  }

  // Maintain each staged update in order, including nested updates. The transaction
  // engine discards these references together with the definitions on rollback.
  function maintainFrame(before: ProjectStateCapture, after: ProjectStateCapture): ProjectStateCapture {
    if (after.chronology !== before.chronology || after.constructionOperations !== before.constructionOperations) {
      throw new TypeError('Operation maintenance belongs to the project');
    }
    if (after.boxSources !== before.boxSources) {
      validateSourceEdit(publication.project, after.boxSources?.sketches as BoxSources['sketches'] | undefined);
    }
    if (after.box.data.edgeAssignments !== before.box.data.edgeAssignments
      && Object.keys(after.box.data.edgeAssignments).some(id => id.startsWith('sketch-'))) throw new Error(sameSketchRequired);
    let candidate = after;
    if (after.drawingDocument !== before.drawingDocument) {
      const drawing = after.drawingDocument as ProjectDrawingDocument;
      const operations = updateSketchOperations(before.constructionOperations, before.drawingDocument as ProjectDrawingDocument, drawing);
      if (operations !== before.constructionOperations) {
        const boxSources = reconcileDrawingSources(before.boxSources as BoxSources | undefined, drawing, operations);
        candidate = { ...after, constructionOperations: operations, boxSources };
      }
    }
    const chronology = reconcileChronology(before.chronology!, chronologyDefinitions(candidate), chronologyDefinitions(before));
    return chronology === before.chronology ? candidate : { ...candidate, chronology };
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
      try { return action(tx); }
      finally { staging = undefined; }
    }, maintainFrame);
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

  /** Resolve an opaque lifetime against the current frame, including after navigation. */
  function openSketchOperation(operationId: string, leave?: (source: SupportedWorkspace) => void) {
    const resolve = () => publication.project.constructionOperations.find(op => op.id === operationId);
    if (staging || publication.editingSketchId !== null || !resolve()) return false;
    if (publication.activeWorkspace !== 'drawing' && !navigate('drawing', leave)) return false;
    const operation = resolve();
    return operation !== undefined && openSketch(operation.sketchId);
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

  function selectBoxSource(id: string) {
    const { project: root, history } = publication;
    const sources = root.boxSources;
    if (staging || publication.activeWorkspace !== 'construction') return false;
    if (id === IMPORTED_SOURCE && !hasImportedSource(root.box)) return false;
    if (!sources) return id === IMPORTED_SOURCE;
    const box = id === IMPORTED_SOURCE ? root.box : sources.sketches[id];
    if (!box || (id !== IMPORTED_SOURCE && box.svgModel?.drawingSource?.operationId !== id)) return false;
    if (sources.selection?.id === id) return true;
    const current = Object.freeze({ ...history.current, boxSources: Object.freeze({ ...sources, selection: Object.freeze({ id }) }) });
    return publish(Object.freeze({ ...history, current }), project(current), 'context');
  }

  function setBoxContext(patch: Partial<BoxRestorationContext>) {
    const history = publication.history;
    const frame = history.current;
    const scope = getBoxScope(publication.project);
    const previous = scope.id === IMPORTED_SOURCE ? frame.box.context : scope.box;
    const { selectedEdgeId = previous.selectedEdgeId, displayConnectionId = previous.displayConnectionId,
      assignmentTargetConnectionId = previous.assignmentTargetConnectionId } = patch;
    if (selectedEdgeId === previous.selectedEdgeId && displayConnectionId === previous.displayConnectionId
      && assignmentTargetConnectionId === previous.assignmentTargetConnectionId) return;
    const context = { selectedEdgeId, displayConnectionId, assignmentTargetConnectionId };
    // Only three primitive interaction IDs change. Both stacks and all data are shared.
    const sources = publication.project.boxSources;
    const current = sources && scope.id !== IMPORTED_SOURCE
      ? Object.freeze({ ...frame, boxSources: { ...sources, sketches: { ...sources.sketches, [scope.id]: { ...scope.box, ...context } } } })
      : Object.freeze({ ...frame, box: Object.freeze({ data: frame.box.data, context: Object.freeze(context) }) });
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
    getEpoch: () => publication.epoch, getAttempt, isCurrent, transact, navigate, newSketch, openSketch, openSketchOperation, finishSketch, traverse, clearProject, setBoxContext, selectBoxSource, getBoxScope: () => getBoxScope(publication.project),
    beginBoxImport: owner.beginBoxImport, isCurrentBoxImport: (token: ReturnType<typeof owner.beginBoxImport>) => publication.activeWorkspace === 'construction' && owner.isCurrentBoxImport(token), invalidateBoxImports: owner.invalidateBoxImports };
}
export type GlobalProjectHistory = ReturnType<typeof createGlobalProjectHistory>;
