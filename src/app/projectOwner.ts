import { reconcileChronology } from './operationChronology';
import { initializeSketchOperations } from './constructionOperations';
import { createEmptyDrawingDocument } from './drawingTypes';
import type { ProjectStateSource } from './projectState';
import { createInitialBoxState } from './initialBoxState';
import { reconcileDrawingSources } from './boxSources';
export { createInitialBoxState } from './initialBoxState';

/** Pre-C.2 in-memory projects supply Drawing and BOX only. */
type PreOperationProject = Pick<ProjectStateSource, 'drawingDocument' | 'box'>;
export type InitialProject = PreOperationProject | ProjectStateSource;

function admitInitialProject(initial: InitialProject): ProjectStateSource {
  if ('constructionOperations' in initial) {
    if (!Array.isArray(initial.constructionOperations)) throw new TypeError('Expected a construction operation list');
    const constructionOperations = initializeSketchOperations(initial.drawingDocument, initial.constructionOperations);
    return constructionOperations === initial.constructionOperations ? initial : { ...initial, constructionOperations };
  }
  return { ...initial, constructionOperations: initializeSketchOperations(initial.drawingDocument) };
}

export const createInitialProjectState = (): ProjectStateSource => {
  const drawingDocument = createEmptyDrawingDocument();
  return { drawingDocument, chronology: [], box: createInitialBoxState(), constructionOperations: initializeSketchOperations(drawingDocument) };
};

/**
 * One per mounted App. Domain values transfer to this owner and must be updated
 * immutably. Freezing enforces that rule without cloning SVG/generated output on
 * Drawing edits. Previously visited branches are skipped. Shallow-frozen factory
 * roots still receive an initial visit to protect their nested children.
 * No execution history, solver, generator or React state lives here.
 */
export const createProjectOwner = (initial?: InitialProject) => {
  const frozen = new WeakSet<object>();
  const freeze = <T>(value: T): T => {
    if (value && typeof value === 'object' && !frozen.has(value)) {
      frozen.add(value);
      Object.values(value).forEach(freeze);
      Object.freeze(value);
    }
    return value;
  };
  const admitted = initial === undefined ? createInitialProjectState() : admitInitialProject(initial);
  const boxSources = reconcileDrawingSources(admitted.boxSources, admitted.drawingDocument, admitted.constructionOperations);
  const sources = boxSources ? { ...admitted, boxSources } : admitted;
  const chronology = reconcileChronology(admitted.chronology ?? [], sources);
  let committed: ProjectStateSource = freeze({ ...sources, chronology });
  const importOwner = Symbol('import owner');
  let importSequence = 0;
  let boxRevision = 0;
  const listeners = new Set<() => void>();
  const getSnapshot = () => committed;
  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  };

  // Narrow import guard, not the future global pending-action protocol. Drawing
  // edits are independent; any newer BOX publication invalidates an in-flight read.
  const beginBoxImport = () => ({ owner: importOwner, sequence: ++importSequence, revision: boxRevision });
  type ImportToken = ReturnType<typeof beginBoxImport>;
  const isCurrentBoxImport = (token: ImportToken) => token.owner === importOwner && token.sequence === importSequence && token.revision === boxRevision;
  const invalidateBoxImports = () => { importSequence++; };
  // Prepare/freeze both sides before exposing either. The install callback only
  // swaps precomputed runtime metadata and runs before any observer is notified.
  const publishFrame = (expected: ProjectStateSource, next: ProjectStateSource, install: () => void) => {
    if (expected !== committed) return false;
    freeze(next);
    if (next.box !== committed.box) boxRevision++;
    committed = next;
    install();
    [...listeners].forEach(listener => listener());
    return true;
  };

  return { getSnapshot, subscribe, publishFrame, beginBoxImport, isCurrentBoxImport, invalidateBoxImports };
};

export type ProjectOwner = ReturnType<typeof createProjectOwner>;
