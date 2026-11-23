import { type DrawingMutation } from './drawingHistory';
import type { DrawingDocumentV2 } from './drawingTypes';
import type { ProjectTransaction, ProjectTransactionDecision } from './projectHistory';
import type { GlobalProjectHistory } from './globalProjectHistory';
import type { DrawingStateCapture } from './projectState';
/** A group stages its children in order, including nested groups, under one user intent. */
export type DrawingAction = DrawingMutation | readonly DrawingAction[];

// The existing mutation APIs use mutable container types but consume frozen owner
// documents through immutable updates. The core returns that same domain schema.
const domainDocument = (document: DrawingStateCapture) => document as DrawingDocumentV2;

const stage = (transaction: ProjectTransaction, action: DrawingAction): ProjectTransactionDecision => {
  if (typeof action !== 'function') {
    for (const child of action) {
      if (transaction.nest(scope => stage(scope, child)).outcome === 'rejected') return 'reject';
    }
    return 'accept';
  }
  const frame = transaction.getCandidate();
  const current = domainDocument(frame.drawingDocument);
  const next = action(current);
  if (next === null) return 'reject';
  if (next === current) return 'noop';
  transaction.update(() => ({ ...frame, drawingDocument: next }));
  return 'accept';
};

export const createDrawingTransactionAdapter = (owner: GlobalProjectHistory) => ({
  transact: (label: string, action: DrawingAction) => owner.transact('drawing', label, transaction => {
    const before = transaction.getCandidate().drawingDocument;
    const decision = stage(transaction, action);
    return decision === 'accept' && transaction.getCandidate().drawingDocument === before ? 'noop' : decision;
  }),
});
