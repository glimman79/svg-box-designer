import { type DrawingMutation } from './drawingHistory';
import type { DrawingDocumentV2, ProjectDrawingDocument } from './drawingTypes';
import type { ProjectTransaction, ProjectTransactionDecision } from './projectHistory';
import type { GlobalProjectHistory } from './globalProjectHistory';
import type { DrawingStateCapture } from './projectState';
/** A group stages its children in order, including nested groups, under one user intent. */
export type DrawingAction = DrawingMutation | readonly DrawingAction[];

// The existing mutation APIs use mutable container types but consume frozen owner
// documents through immutable updates. The core returns that same domain schema.
const domainDocument = (document: DrawingStateCapture) => document as DrawingDocumentV2;

/** Prepare a project-level Drawing action inside an already-open transaction. */
export const stageDrawingAction = (transaction: ProjectTransaction, action: DrawingAction,
  apply: (document: DrawingDocumentV2, edit: DrawingMutation) => DrawingDocumentV2 | null = (doc, edit) => edit(doc),
): ProjectTransactionDecision => {
  if (typeof action !== 'function') {
    const before = transaction.getCandidate().drawingDocument;
    for (const child of action) {
      if (transaction.nest(scope => stageDrawingAction(scope, child, apply)).outcome === 'rejected') return 'reject';
    }
    return transaction.getCandidate().drawingDocument === before ? 'noop' : 'accept';
  }
  const frame = transaction.getCandidate();
  if (frame.drawingDocument.activeSketchId === null) return 'reject';
  const current = domainDocument(frame.drawingDocument);
  const next = apply(current, action);
  if (next === null) return 'reject';
  if (next === current) return 'noop';
  transaction.update(() => ({ ...frame, drawingDocument: next }));
  return 'accept';
};

/** Bind mounted CAD commands to this editing session. Older handlers cannot retarget a later session. */
export function createDrawingTransactionAdapter(owner: GlobalProjectHistory) {
  const { editingSketchId: id, epoch } = owner.getPublication();
  const views = new WeakMap<ProjectDrawingDocument, DrawingDocumentV2>();
  function view(document: ProjectDrawingDocument): DrawingDocumentV2 | null {
    if (id === null || owner.getEpoch() !== epoch || !Object.hasOwn(document.sketches, id)) return null;
    if (document.activeSketchId === id) return document as DrawingDocumentV2;
    let targeted = views.get(document);
    if (!targeted) {
      targeted = Object.freeze({ ...document, activeSketchId: id });
      views.set(document, targeted);
    }
    return targeted;
  }
  function editMember(document: DrawingDocumentV2, edit: DrawingMutation) {
    const source = view(document);
    if (!source || id === null) return null;
    const next = edit(source);
    if (!next || next.activeSketchId !== id || !Object.hasOwn(next.sketches, id)) return null;
    const sketch = next.sketches[id];
    if (sketch === source.sketches[id]) return document;
    // Keep other definitions and the stored V2 pointer even when a solver returns a complete document.
    return { ...document, sketches: { ...document.sketches, [id]: sketch } };
  }

  return {
    documentRef: { get current() { return view(owner.drawingDocumentRef.current); } },
    transact(label: string, action: DrawingAction) {
      if (id === null || owner.getEpoch() !== epoch || owner.getPublication().editingSketchId !== id) {
        return { outcome: 'rejected' as const };
      }
      return owner.transact('drawing', label, tx => {
        const original = tx.getCandidate().drawingDocument.sketches[id];
        const decision = stageDrawingAction(tx, action, editMember);
        return decision === 'accept' && tx.getCandidate().drawingDocument.sketches[id] === original ? 'noop' : decision;
      });
    },
  };
}
