/** Observable scheduling boundary for an accepted Line click. Inference and
 * persistence remain owned by the caller; this only preserves the production
 * delay and the immutable accepted-click callback. */
export const DRAWING_LINE_COMMIT_DELAY_MS = 220;

export type DrawingLineCommitScheduler = Readonly<{
  setTimeout(callback: () => void, delayMs: number): number;
  clearTimeout(handle: number): void;
}>;

export const scheduleDrawingLineCommit = (
  pending: { current: number | null },
  scheduler: DrawingLineCommitScheduler,
  commitAcceptedClick: () => void,
) => {
  if (pending.current !== null) scheduler.clearTimeout(pending.current);
  pending.current = scheduler.setTimeout(() => {
    pending.current = null;
    commitAcceptedClick();
  }, DRAWING_LINE_COMMIT_DELAY_MS);
};
