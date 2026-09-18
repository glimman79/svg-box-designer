/** Line commits remain briefly pending so a native double-click can finish the
 * construction without creating its second segment. A pending accepted click
 * owns its callback until it commits or an explicit cancellation clears it. */
export const DRAWING_LINE_COMMIT_DELAY_MS = 220;

export type DrawingLineCommitScheduler = Readonly<{
  setTimeout(callback: () => void, delayMs: number): number;
  clearTimeout(handle: number): void;
}>;

export type PendingDrawingLineCommit = Readonly<{
  handle: number;
  commit: () => void;
}>;

export type PendingDrawingLineCommitRef = { current: PendingDrawingLineCommit | null };

export const scheduleDrawingLineCommit = (
  pending: PendingDrawingLineCommitRef,
  scheduler: DrawingLineCommitScheduler,
  commitAcceptedClick: () => void,
) => {
  if (pending.current) throw new Error('Accepted Line click already owns the pending commit');
  let transaction: PendingDrawingLineCommit;
  const handle = scheduler.setTimeout(() => {
    if (pending.current !== transaction) return;
    pending.current = null;
    commitAcceptedClick();
  }, DRAWING_LINE_COMMIT_DELAY_MS);
  transaction = { handle, commit: commitAcceptedClick };
  pending.current = transaction;
};

/** Commit the accepted prior segment before resolving a new same-tool click. */
export const flushDrawingLineCommit = (pending: PendingDrawingLineCommitRef, scheduler: DrawingLineCommitScheduler) => {
  const transaction = pending.current;
  if (!transaction) return false;
  pending.current = null;
  scheduler.clearTimeout(transaction.handle);
  transaction.commit();
  return true;
};

/** Explicit tool cancellation is the only path that discards accepted work. */
export const cancelDrawingLineCommit = (pending: PendingDrawingLineCommitRef, scheduler: DrawingLineCommitScheduler) => {
  const transaction = pending.current;
  if (!transaction) return false;
  pending.current = null;
  scheduler.clearTimeout(transaction.handle);
  return true;
};
