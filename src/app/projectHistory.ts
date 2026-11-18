import type { ProjectStateCapture } from './projectState';

export const PROJECT_HISTORY_LIMIT = 30;

/** Caller-supplied action identity; never a permanent construction-operation ID. */
export type ProjectTransactionMetadata = Readonly<{
  id: string;
  module: 'drawing' | 'box';
  label: string;
}>;

export type ProjectHistoryEntry = Readonly<{
  frame: ProjectStateCapture;
  transaction: ProjectTransactionMetadata;
}>;

/** Stacks are oldest first. undo.length + redo.length never exceeds 30. */
export type ProjectHistory = Readonly<{
  current: ProjectStateCapture;
  undo: readonly ProjectHistoryEntry[];
  redo: readonly ProjectHistoryEntry[];
}>;

export type ProjectTransactionDecision = 'accept' | 'reject' | 'noop';
export type ProjectTransactionOutcome = Readonly<{
  outcome: 'accepted' | 'rejected' | 'noop';
  error?: unknown;
}>;

export type ProjectTransaction = Readonly<{
  getCandidate: () => ProjectStateCapture;
  /** Supply complete data, usually sharing unchanged captured module subtrees. */
  update: (change: (current: ProjectStateCapture) => ProjectStateCapture) => void;
  /** Child acceptance stages data only; rejection poisons the entire outer action. */
  nest: (action: ProjectTransactionAction) => ProjectTransactionOutcome;
}>;
export type ProjectTransactionAction = (transaction: ProjectTransaction) => ProjectTransactionDecision;

export type ProjectTransactionResult = ProjectTransactionOutcome & Readonly<{
  history: ProjectHistory;
  frame: ProjectStateCapture;
}>;

export type ProjectHistoryRestore = Readonly<{
  history: ProjectHistory;
  frame: ProjectStateCapture;
  changed: boolean;
  transaction: ProjectTransactionMetadata | null;
}>;

// Only proven deeply frozen nodes enter this weak cache. Object.isFrozen alone
// cannot establish ownership: factories may freeze a root with mutable children.
// Mutable candidates are copied, never frozen in place or cached by source identity.
const immutableNodes = new WeakSet<object>();
const snapshot = <T>(value: T, copies = new WeakMap<object, unknown>()): T => {
  if (value === null || typeof value !== 'object' || immutableNodes.has(value)) return value;
  if (copies.has(value)) return copies.get(value) as T;
  const prototype = Object.getPrototypeOf(value);
  if (!Array.isArray(value) && prototype !== Object.prototype && prototype !== null) {
    throw new TypeError('Project history accepts plain project data only');
  }
  const copy = Array.isArray(value) ? new Array(value.length) : Object.create(prototype);
  copies.set(value, copy);
  let canShare = Object.isFrozen(value);
  for (const [key, child] of Object.entries(value)) {
    const captured = snapshot(child, copies);
    Object.defineProperty(copy, key, { value: captured, enumerable: true, writable: true, configurable: true });
    if (captured !== child) canShare = false;
  }
  const result: object = canShare ? value : Object.freeze(copy);
  copies.set(value, result);
  immutableNodes.add(result);
  return result as T;
};

const historyState = (
  current: ProjectStateCapture,
  undo: readonly ProjectHistoryEntry[],
  redo: readonly ProjectHistoryEntry[],
): ProjectHistory => Object.freeze({ current, undo: Object.freeze(undo), redo: Object.freeze(redo) });

/** Explicit capture is supplied by the caller; no owner, parser or generator is read. */
export const createProjectHistory = (initial: ProjectStateCapture): ProjectHistory => (
  historyState(snapshot(initial), [], [])
);

/** A fresh timeline, even for the same frame. Clear/Open lifecycle policy stays outside. */
export const resetProjectHistory = (baseline: ProjectStateCapture): ProjectHistory => createProjectHistory(baseline);

const appendBounded = (stack: readonly ProjectHistoryEntry[], entry: ProjectHistoryEntry) => (
  [...stack, Object.freeze(entry)].slice(-PROJECT_HISTORY_LIMIT)
);

/**
 * Synchronous staging only. No publication or external side effects can be rolled
 * back here. Domain adapters explicitly decide semantic change; no deep equality.
 * An accept with the identical frame is also a no-op. Returning noop discards all
 * changes in that scope. Any nested reject/exception rejects the whole outer action,
 * even if its result is ignored. Exceptions are returned, not thrown to the caller.
 */
export const transactProjectHistory = (
  history: ProjectHistory,
  metadata: ProjectTransactionMetadata,
  action: ProjectTransactionAction,
): ProjectTransactionResult => {
  let candidate = history.current;
  let failure: ProjectTransactionOutcome | undefined;
  const run = (operation: ProjectTransactionAction): ProjectTransactionOutcome => {
    const before = candidate;
    let active = true;
    const assertActive = () => {
      if (!active) throw new Error('Project transaction scope is closed');
      if (failure) throw new Error('Project transaction has been rejected');
    };
    const transaction: ProjectTransaction = Object.freeze({
      getCandidate: () => { assertActive(); return candidate; },
      update: (change) => {
        assertActive();
        try {
          const next = change(candidate);
          // A reentrant child failure must not allow its caller to stage new data.
          assertActive();
          candidate = snapshot(next);
        } catch (error) {
          failure ??= Object.freeze({ outcome: 'rejected', error });
          throw error;
        }
      },
      nest: (child) => { assertActive(); return run(child); },
    });
    try {
      const decision = operation(transaction);
      if (failure) { candidate = before; return failure; }
      if (decision === 'reject') {
        candidate = before;
        failure = Object.freeze({ outcome: 'rejected' });
        return failure;
      }
      if (decision !== 'accept' && decision !== 'noop') {
        throw new TypeError('Project transactions must return a synchronous accept, reject or noop decision');
      }
      if (decision === 'noop') candidate = before;
      return { outcome: candidate === before ? 'noop' : 'accepted' };
    } catch (error) {
      candidate = before;
      failure ??= Object.freeze({ outcome: 'rejected', error });
      return failure;
    } finally {
      active = false;
    }
  };

  const outcome = run(action);
  if (outcome.outcome !== 'accepted') return { ...outcome, history, frame: history.current };
  // Keep only explicit value metadata, never candidate closures or UI handles.
  const transaction = Object.freeze({ id: metadata.id, module: metadata.module, label: metadata.label });
  const next = historyState(candidate, appendBounded(history.undo, { frame: history.current, transaction }), []);
  return { outcome: 'accepted', history: next, frame: next.current };
};

export const undoProjectHistory = (history: ProjectHistory): ProjectHistoryRestore => {
  const entry = history.undo.at(-1);
  if (!entry) return { history, frame: history.current, changed: false, transaction: null };
  const next = historyState(entry.frame, history.undo.slice(0, -1),
    [...history.redo, Object.freeze({ frame: history.current, transaction: entry.transaction })]);
  return { history: next, frame: next.current, changed: true, transaction: entry.transaction };
};

export const redoProjectHistory = (history: ProjectHistory): ProjectHistoryRestore => {
  const entry = history.redo.at(-1);
  if (!entry) return { history, frame: history.current, changed: false, transaction: null };
  const next = historyState(entry.frame, appendBounded(history.undo, { frame: history.current, transaction: entry.transaction }),
    history.redo.slice(0, -1));
  return { history: next, frame: next.current, changed: true, transaction: entry.transaction };
};
