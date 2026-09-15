/** Temporary browser-only trace for the unresolved live Parallel/Perpendicular loss.
 * This module observes already-computed production values and never participates in inference. */
export type DrawingDirectionDiagnosticFrame = Readonly<{
  sequence: number;
  phase: 'hover' | 'click';
  pointer: unknown;
  context: unknown;
  candidates: Readonly<{ parallel: readonly unknown[]; perpendicular: readonly unknown[]; [key: string]: unknown }>;
  previousSnap: unknown;
  snapResult: Readonly<{ type: string; channels: Readonly<{ parallel: unknown; perpendicular: unknown; [key: string]: unknown }>; [key: string]: unknown }>;
  lineResolution: Readonly<{ after: Readonly<{ parallelLineId: string | null; perpendicularLineId: string | null; [key: string]: unknown }>; [key: string]: unknown }>;
  hv: unknown;
  presentation: Readonly<{ parallel: boolean; perpendicular: boolean; kinds: readonly string[] }>;
}>;

const present = (value: unknown) => value !== null && value !== undefined && value !== false;

const stagePresence = (frame: DrawingDirectionDiagnosticFrame) => ({
  parallelCandidate: frame.candidates.parallel.length > 0,
  parallelChannel: present(frame.snapResult.channels.parallel),
  parallelLineId: present(frame.lineResolution.after.parallelLineId),
  parallelPresentation: frame.presentation.parallel,
  perpendicularCandidate: frame.candidates.perpendicular.length > 0,
  perpendicularChannel: present(frame.snapResult.channels.perpendicular),
  perpendicularLineId: present(frame.lineResolution.after.perpendicularLineId),
  perpendicularPresentation: frame.presentation.perpendicular,
});

const transitionLabels = (previous: DrawingDirectionDiagnosticFrame, current: DrawingDirectionDiagnosticFrame) => {
  const before = stagePresence(previous), after = stagePresence(current);
  const labels: string[] = [];
  for (const key of Object.keys(before) as Array<keyof typeof before>) {
    if (before[key] !== after[key]) labels.push(`${key}: ${before[key] ? 'PRESENT' : 'ABSENT'} -> ${after[key] ? 'PRESENT' : 'ABSENT'}`);
  }
  if (previous.snapResult.type !== current.snapResult.type) labels.push(`snap.type: ${previous.snapResult.type} -> ${current.snapResult.type}`);
  return labels;
};

export const createDrawingDirectionDiagnosticRecorder = () => {
  let history: DrawingDirectionDiagnosticFrame[] = [];
  return {
    record(frame: DrawingDirectionDiagnosticFrame) {
      const previous = history.at(-1);
      const transitions = previous ? transitionLabels(previous, frame) : [];
      history = [...history, frame].slice(-6);
      if (transitions.length) console.info('DRAWING_DIRECTION_DIAGNOSTIC transition', { transitions, frame });
      if (frame.phase === 'click') {
        const comparison = { marker: 'DRAWING_DIRECTION_DIAGNOSTIC_CLICK', lastHoverFrame: previous, clickResolvePlacementFrame: frame };
        console.info('DRAWING_DIRECTION_DIAGNOSTIC click comparison', comparison);
        console.info('DRAWING_DIRECTION_DIAGNOSTIC_CLICK_COPY', JSON.stringify(comparison));
      }
      if (!previous) return;
      const before = stagePresence(previous), after = stagePresence(frame);
      const perpendicularAcquired = !before.perpendicularChannel && after.perpendicularChannel
        || !before.perpendicularLineId && after.perpendicularLineId;
      const parallelLost = before.parallelCandidate && !after.parallelCandidate
        || before.parallelChannel && !after.parallelChannel
        || before.parallelLineId && !after.parallelLineId
        || before.parallelPresentation && !after.parallelPresentation;
      if ((before.parallelLineId || before.parallelPresentation) && perpendicularAcquired || parallelLost) {
        const snapshot = { marker: 'DRAWING_DIRECTION_DIAGNOSTIC', transitions, previousFrame: previous, currentFrame: frame, history };
        console.warn('*** DRAWING_DIRECTION_DIAGNOSTIC INTERESTING TRANSITION ***', snapshot);
        console.info('DRAWING_DIRECTION_DIAGNOSTIC_COPY', JSON.stringify(snapshot));
      }
    },
    reset() { history = []; },
    last() { return history.at(-1) ?? null; },
  };
};
