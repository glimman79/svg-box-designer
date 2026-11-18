import type { DrawingDocumentV2 } from './drawingTypes';
import { createDrawingDocumentV2 } from './drawingTypes';
import { createBoxDocumentV1 } from './boxDocument';
import { defaultPanelManagerState } from './panelManagerModel';
import { DEFAULT_PROJECT_SETTINGS } from './projectDefaults';
import { createGeneratedGeometrySnapshot } from './generatedGeometrySnapshot';
import type { BoxStateSource, ProjectStateSource } from './projectState';

export type ProjectUpdate<T> = T | ((current: T) => T);
const resolveUpdate = <T>(update: ProjectUpdate<T>, current: T): T => (
  typeof update === 'function' ? (update as (current: T) => T)(current) : update
);

export const createInitialBoxState = (): BoxStateSource => ({
  svgModel: createBoxDocumentV1(), edgeAssignments: {}, connections: {},
  panelManager: structuredClone(defaultPanelManagerState),
  projectSettings: { ...DEFAULT_PROJECT_SETTINGS, selectedProfileOffsetIds: [] },
  lastAppliedManufacturingSettings: null,
  generatedGeometrySnapshot: createGeneratedGeometrySnapshot({ generatedGeometry: [] }),
  activeSGroup: null, activeTBGroup: null, completedTBGroups: [],
  activeWallGroup: null, completedWallGroups: [], workflowGroupOrder: {},
  assignmentTargetConnectionId: null, displayConnectionId: null, selectedEdgeId: null,
});

export const createInitialProjectState = (): ProjectStateSource => ({
  drawingDocument: createDrawingDocumentV2(), box: createInitialBoxState(),
});

/**
 * One per mounted App. Domain values transfer to this owner and must be updated
 * immutably. Freezing enforces that rule without cloning SVG/generated output on
 * Drawing edits. Previously visited branches are skipped. Shallow-frozen factory
 * roots still receive an initial visit to protect their nested children.
 * No execution history, solver, generator or React state lives here.
 */
export const createProjectOwner = (initial: ProjectStateSource = createInitialProjectState()) => {
  const frozen = new WeakSet<object>();
  const freeze = <T>(value: T): T => {
    if (value && typeof value === 'object' && !frozen.has(value)) {
      frozen.add(value);
      Object.values(value).forEach(freeze);
      Object.freeze(value);
    }
    return value;
  };
  let committed = freeze(initial);
  let candidate = committed;
  let depth = 0;
  let importSequence = 0;
  let boxRevision = 0;
  const listeners = new Set<() => void>();
  const getSnapshot = () => committed;
  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  };

  /** Nested batches are savepoints; exceptions publish no partial project root. */
  const batch = <T>(action: () => T): T => {
    const previous = candidate;
    depth++;
    let result: T;
    try {
      result = action();
      if (depth === 1 && candidate !== committed) freeze(candidate);
    } catch (error) {
      candidate = previous;
      throw error;
    } finally {
      depth--;
    }
    if (depth === 0 && candidate !== committed) {
      if (committed.box !== candidate.box) boxRevision++;
      committed = candidate;
      // React and other consumers only see a complete, immutable committed root.
      [...listeners].forEach((listener) => listener());
    }
    return result;
  };
  // A prepared action may publish only at the outer boundary it observed. Even an
  // empty enclosing batch could subsequently roll back an apparent successful commit.
  const batchIfCurrent = (expected: ProjectStateSource, publish: () => void): boolean => {
    if (depth !== 0 || expected !== committed) return false;
    batch(publish);
    return true;
  };
  const update = (mutation: (current: ProjectStateSource) => ProjectStateSource) => batch(() => {
    candidate = mutation(candidate);
  });
  const setDrawingDocument = (change: ProjectUpdate<DrawingDocumentV2>) => update((current) => {
    const drawingDocument = resolveUpdate(change, current.drawingDocument);
    return drawingDocument === current.drawingDocument ? current : { ...current, drawingDocument };
  });
  const setBoxField = <Key extends keyof BoxStateSource>(key: Key, change: ProjectUpdate<BoxStateSource[Key]>) => update((current) => {
    const value = resolveUpdate(change, current.box[key]);
    return Object.is(value, current.box[key]) ? current : { ...current, box: { ...current.box, [key]: value } };
  });

  // This is an accessor into the same owner, never a second writable document.
  const drawingDocumentRef = {
    get current() { return committed.drawingDocument; },
    set current(document: DrawingDocumentV2) { setDrawingDocument(document); },
  };

  // Narrow import guard, not the future global pending-action protocol. Drawing
  // edits are independent; any newer BOX publication invalidates an in-flight read.
  const beginBoxImport = () => ({ sequence: ++importSequence, revision: boxRevision, box: committed.box });
  type ImportToken = ReturnType<typeof beginBoxImport>;
  const isCurrentBoxImport = (token: ImportToken) => token.sequence === importSequence && token.revision === boxRevision;
  const invalidateBoxImports = () => { importSequence++; };
  const publishBoxImport = (token: ImportToken, box: BoxStateSource) => {
    if (!isCurrentBoxImport(token)) return false;
    update((current) => ({ ...current, box }));
    return true;
  };

  return { getSnapshot, subscribe, update, batch, batchIfCurrent, setDrawingDocument, setBoxField, drawingDocumentRef,
    beginBoxImport, isCurrentBoxImport, invalidateBoxImports, publishBoxImport };
};

export type ProjectOwner = ReturnType<typeof createProjectOwner>;
