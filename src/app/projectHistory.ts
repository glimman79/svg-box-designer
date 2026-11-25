import type { SupportedWorkspace } from './drawingTypes';
import type { ProjectStateCapture } from './projectState';

export const PROJECT_HISTORY_LIMIT = 30;

/** Caller-supplied action identity; never a permanent construction-operation ID. */
export type ProjectTransactionMetadata = Readonly<{
  id: string;
  module: 'drawing' | 'box';
  label: string;
}>;

type ProjectEdit = ProjectTransactionMetadata & Readonly<{ kind: 'edit' }>;
type WorkspaceNavigation = Readonly<{
  kind: 'navigation';
  source: SupportedWorkspace;
  destination: SupportedWorkspace;
}>;

export type ProjectHistoryEntry =
  | Readonly<{ frame: ProjectStateCapture; transaction: ProjectEdit }>
  | Readonly<{ transaction: WorkspaceNavigation }>;

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
  transaction: ProjectHistoryEntry['transaction'] | null;
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
  const copy = Array.isArray(value) ? [] : Object.create(prototype);
  copies.set(value, copy); // Also provides a placeholder for cyclic references.
  let canShare = Object.isFrozen(value);
  const entries = Object.entries(value);
  const store = (key: string, child: unknown) => Object.defineProperty(copy, key,
    { value: child, enumerable: true, writable: true, configurable: true });
  for (let index = 0; index < entries.length; index++) {
    const [key, child] = entries[index];
    const captured = snapshot(child, copies);
    if (canShare) {
      // Audit owner-frozen SVG and manufacturing records without populating
      // disposable copies. A shallow-frozen input may still require detachment.
      if (captured === child) continue;
      for (let prior = 0; prior < index; prior++) store(...entries[prior]);
      canShare = false;
    }
    store(key, captured);
  }
  if (!canShare && Array.isArray(value)) copy.length = value.length;
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
  maintainFrame?: (before: ProjectStateCapture, after: ProjectStateCapture) => ProjectStateCapture,
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
          const captured = snapshot(next);
          candidate = maintainFrame && captured !== candidate ? snapshot(maintainFrame(candidate, captured)) : captured;
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
  const transaction = Object.freeze({ kind: 'edit' as const, id: metadata.id, module: metadata.module, label: metadata.label });
  const next = historyState(candidate, appendBounded(history.undo, { frame: history.current, transaction }), []);
  return { outcome: 'accepted', history: next, frame: next.current };
};

export function recordWorkspaceNavigation(history: ProjectHistory, source: SupportedWorkspace, destination: SupportedWorkspace): ProjectHistory {
  if (source === destination) return history;
  const transaction = Object.freeze({ kind: 'navigation' as const, source, destination });
  return historyState(history.current, appendBounded(history.undo, { transaction }), []);
}

function traverseProjectHistory(history: ProjectHistory, direction: 'undo' | 'redo'): ProjectHistoryRestore {
  const stack = history[direction];
  const entry = stack.at(-1);
  if (!entry) return { history, frame: history.current, changed: false, transaction: null };
  // BOX inspection can replace the current restoration context between actions.
  // A navigation entry must carry that live frame through in both directions.
  const frame = 'frame' in entry ? entry.frame : history.current;
  const inverse = 'frame' in entry ? Object.freeze({ frame: history.current, transaction: entry.transaction }) : entry;
  const remaining = stack.slice(0, -1);
  const next = direction === 'undo'
    ? historyState(frame, remaining, [...history.redo, inverse])
    : historyState(frame, [...history.undo, inverse], remaining);
  return { history: next, frame, changed: true, transaction: entry.transaction };
}

export const undoProjectHistory = (history: ProjectHistory) => traverseProjectHistory(history, 'undo');
export const redoProjectHistory = (history: ProjectHistory) => traverseProjectHistory(history, 'redo');
