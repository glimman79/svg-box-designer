import { transactDrawingDocument, type DrawingHistory, type DrawingMutation } from './drawingHistory';
import type { DrawingDocumentV2 } from './drawingTypes';
import { createProjectHistory, transactProjectHistory, type ProjectTransaction, type ProjectTransactionDecision,
  type ProjectTransactionResult } from './projectHistory';
import type { ProjectOwner } from './projectOwner';
import { boxStateFields, type BoxStateCapture, type BoxStateSource, type DrawingStateCapture } from './projectState';

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
  transaction.update(() => ({ drawingDocument: next, box: frame.box }));
  return 'accept';
};

type DrawingCommitResult = ProjectTransactionResult | { outcome: 'rejected' };

/** App-lifetime bridge. The caller owns the existing local stack. A complete global
 * transition is returned for inspection and released by the UI after each action. */
export const createDrawingTransactionAdapter = (owner: ProjectOwner) => {
  const boxes = new WeakMap<BoxStateSource, BoxStateCapture>();
  let sequence = 0;
  let staging: ProjectTransaction | undefined;

  const transact = (local: { current: DrawingHistory }, label: string, action: DrawingAction): DrawingCommitResult => {
    // Reentering the public publisher from a mutation would use the wrong baseline.
    // Reject its containing operation. Group nested domain edits explicitly instead.
    if (staging) {
      staging.nest(() => 'reject');
      return { outcome: 'rejected' };
    }
    const before = owner.getSnapshot();
    let box = boxes.get(before.box);
    if (!box) {
      const fields = boxStateFields(before.box);
      box = Object.freeze({ data: Object.freeze(fields.data), context: Object.freeze(fields.context) });
      boxes.set(before.box, box);
    }
    const baseline = createProjectHistory({ drawingDocument: before.drawingDocument, box });
    const result = transactProjectHistory(baseline, { id: String(++sequence), label, module: 'drawing' }, transaction => {
      staging = transaction;
      try {
        const decision = stage(transaction, action);
        if (decision === 'accept' && transaction.getCandidate().drawingDocument === before.drawingDocument) return 'noop';
        return decision;
      }
      finally { staging = undefined; }
    });
    if (result.outcome !== 'accepted') return result;
    const next = domainDocument(result.frame.drawingDocument);
    const published = owner.batchIfCurrent(before, () => {
      const change = transactDrawingDocument(local.current, before.drawingDocument, () => next);
      owner.setDrawingDocument(next);
      local.current = change.history;
    });
    return published ? result : { outcome: 'rejected' };
  };

  return { transact };
};
